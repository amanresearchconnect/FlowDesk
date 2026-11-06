import mongoose, { Types } from 'mongoose';
import { Workflow, IWorkflowNode, IWorkflowBranch } from '../../models/workflow.model.js';
import {
  WorkflowExecution,
  IWorkflowExecutionDocument
} from '../../models/workflow-execution.model.js';
import { Contact } from '../../models/contact.model.js';
import { Conversation } from '../../models/conversation.model.js';
import { Message } from '../../models/message.model.js';
import { getMessagingProvider } from '../../providers/messaging/messaging.factory.js';
import { VerificationService } from '../verification/verification.service.js';
import { emitToConversation, emitToTeam } from '../../socket/socket.server.js';
import { interpolateTemplate } from '../../utils/template.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

export class WorkflowEngine {
  public static async startExecution(
    workflowId: string,
    contactId: string,
    campaignId?: string,
    initialVariables: Record<string, any> = {},
    startStepId?: string
  ): Promise<IWorkflowExecutionDocument> {
    const workflow = await Workflow.findById(workflowId);
    if (!workflow) {
      throw new NotFoundError('Workflow not found');
    }

    const initialNode = startStepId
      ? (workflow.nodes.find((n) => n.id === startStepId) || workflow.nodes[0])
      : (workflow.nodes.find((n) => n.type === 'trigger') || workflow.nodes[0]);

    if (!initialNode) {
      throw new ValidationError('Workflow must contain at least one node');
    }

    // Cancel or complete previous executions for this contact to prevent dual processing
    await WorkflowExecution.updateMany(
      {
        contactId: new Types.ObjectId(contactId),
        status: { $in: ['running', 'waiting_for_reply', 'paused_for_human', 'delayed'] }
      },
      { $set: { status: 'completed' } }
    );

    const execution = await WorkflowExecution.create({
      workflowId: workflow._id,
      campaignId: campaignId ? new Types.ObjectId(campaignId) : null,
      contactId: new Types.ObjectId(contactId),
      status: 'running',
      currentStepId: initialNode.id,
      variables: initialVariables,
      stepLogs: [
        {
          stepId: initialNode.id,
          stepType: initialNode.type,
          status: 'started',
          inputPayload: initialVariables,
          timestamp: new Date()
        }
      ]
    });

    logger.info('Workflow execution started', {
      executionId: execution._id.toString(),
      workflowId,
      contactId,
      startStepId: initialNode.id
    });

    // Make sure conversation is in 'bot' status so automated bot processes candidate replies
    const conv = await Conversation.findOne({ contactId: new Types.ObjectId(contactId) });
    if (conv) {
      conv.status = 'bot';
      conv.assignedUserId = undefined;
      await conv.save();
      const statusPayload = { conversationId: conv._id.toString(), status: 'bot' };
      emitToConversation(conv._id.toString(), 'conversation:status_changed', statusPayload);
      emitToTeam('conversation:status_changed', statusPayload);
    }

    // Run chosen step
    await this.executeStep(execution._id.toString(), initialNode.id);

    const updated = await WorkflowExecution.findById(execution._id);
    return updated || execution;
  }

  public static async executeStep(executionId: string, stepId: string): Promise<void> {
    const execution = await WorkflowExecution.findById(executionId);
    if (!execution || execution.status === 'completed' || execution.status === 'failed') {
      return;
    }

    const workflow = await Workflow.findById(execution.workflowId);
    if (!workflow) return;

    const node = workflow.nodes.find((n) => n.id === stepId);
    if (!node) {
      execution.status = 'failed';
      execution.errorDetails = `Step node '${stepId}' not found in workflow definition`;
      await execution.save();
      return;
    }

    execution.currentStepId = stepId;

    switch (node.type) {
      case 'trigger': {
        this.logStep(execution, node, 'completed');
        if (node.nextStepId) {
          await this.advanceToStep(execution, node.nextStepId);
        }
        break;
      }

      case 'send_text_message':
      case 'send_message': {
        const contact = await Contact.findById(execution.contactId);
        if (!contact) {
          execution.status = 'failed';
          execution.errorDetails = 'Contact record not found during send_message step';
          await execution.save();
          return;
        }

        const template = node.config.messageTemplate || node.config.body || '';
        // Merge contact properties with runtime workflow variables
        const mergeContext = {
          ...contact.toObject(),
          ...execution.variables
        };
        const messageBody = interpolateTemplate(template, mergeContext);

        const buttons = node.type === 'send_text_message'
          ? undefined
          : (Array.isArray(node.config.buttons) && node.config.buttons.length > 0
            ? node.config.buttons
            : undefined);

        const provider = getMessagingProvider();
        const sendResult = await provider.sendMessage(contact.phone, {
          text: messageBody,
          buttons
        });

        let conversation = await Conversation.findOne({ contactId: contact._id });
        if (!conversation) {
          conversation = await Conversation.create({
            contactId: contact._id,
            channel: 'whatsapp',
            status: 'bot',
            activeCampaignId: execution.campaignId || null,
            lastMessageAt: new Date(),
            lastMessagePreview: messageBody.substring(0, 100),
            unreadCount: 0
          });
        } else {
          conversation.lastMessageAt = new Date();
          conversation.lastMessagePreview = messageBody.substring(0, 100);
          if (execution.campaignId) conversation.activeCampaignId = execution.campaignId;
          await conversation.save();
        }

        const messageType = buttons && buttons.length > 0 ? 'interactive' : 'text';
        await Message.create({
          conversationId: conversation._id,
          contactId: contact._id,
          campaignId: execution.campaignId,
          workflowExecutionId: execution._id,
          direction: 'outbound',
          senderType: 'system',
          provider: env.MESSAGING_PROVIDER === 'meta' ? 'meta' : 'mock',
          providerMessageId: sendResult.providerMessageId,
          type: messageType,
          content: {
            body: messageBody,
            buttons: buttons || []
          },
          status: sendResult.status,
          sentAt: sendResult.timestamp
        });

        // When interactive buttons are dispatched, clear any previous reply variable
        // so succeeding condition nodes pause and wait for a fresh candidate response
        if (buttons && buttons.length > 0) {
          execution.variables.lastReply = null;
          execution.markModified('variables');
        }

        this.logStep(execution, node, 'completed', { messageBody }, { providerMessageId: sendResult.providerMessageId });
        await execution.save();

        if (node.nextStepId) {
          await this.advanceToStep(execution, node.nextStepId);
        }
        break;
      }

      case 'wait_for_reply': {
        execution.status = 'waiting_for_reply';
        const timeoutMinutes = node.config.timeoutMinutes || 1440;
        execution.waitingForReplyUntil = new Date(Date.now() + timeoutMinutes * 60 * 1000);

        this.logStep(execution, node, 'started', { timeoutMinutes });
        await execution.save();
        // Halts here awaiting inbound reply callback
        break;
      }

      case 'condition': {
        const variableKey = node.config.variablePath || node.config.key || 'lastReply';
        const actualValue = execution.variables[variableKey];

        // If condition evaluates contact's reply ('lastReply') and the contact has not replied yet,
        // we MUST pause workflow execution and wait for the inbound reply / button tap!
        if (variableKey === 'lastReply' && (actualValue === undefined || actualValue === null || actualValue === '')) {
          execution.status = 'waiting_for_reply';
          const timeoutHours = node.config.timeoutHours || 24;
          execution.waitingForReplyUntil = new Date(Date.now() + timeoutHours * 3600 * 1000);
          this.logStep(execution, node, 'started', { waitingForContactReply: true, timeoutHours });
          await execution.save();
          logger.info('Workflow execution paused at condition step awaiting candidate reply', {
            executionId: execution._id.toString(),
            stepId: node.id
          });
          break;
        }

        const operator = node.config.operator || 'equals';
        const expectedValue = node.config.expectedValue || (node.branches?.[0]?.conditionValue);

        let matched = false;
        const actualLower = String(actualValue || '').toLowerCase().trim();
        const expectedValues = String(expectedValue || '')
          .split(',')
          .map((v) => v.trim().toLowerCase())
          .filter(Boolean);

        if (operator === 'equals') {
          matched = expectedValues.some((val) => actualLower === val);
        } else if (operator === 'contains') {
          matched = expectedValues.some((val) => actualLower.includes(val) || val.includes(actualLower));
        } else {
          matched = expectedValues.some((val) => actualLower === val || actualLower.includes(val));
        }

        const nextStep = matched
          ? (node.config.trueStepId || node.branches?.[0]?.targetStepId)
          : (node.config.falseStepId || node.branches?.[1]?.targetStepId);
        this.logStep(execution, node, 'completed', { actualValue, operator, expectedValue }, { matched, nextStep });
        await execution.save();

        if (nextStep) {
          await this.advanceToStep(execution, nextStep);
        }
        break;
      }

      case 'update_record': {
        const operations = node.config.operations || [];
        for (const op of operations) {
          if (op.action === 'add_tag') {
            await Contact.updateOne({ _id: execution.contactId }, { $addToSet: { tags: op.value } });
          } else if (op.action === 'set_variable') {
            execution.variables[op.key] = op.value;
          }
        }

        execution.markModified('variables');
        this.logStep(execution, node, 'completed', { operations });
        await execution.save();

        if (node.nextStepId) {
          await this.advanceToStep(execution, node.nextStepId);
        }
        break;
      }

      case 'verify_data': {
        const contact = await Contact.findById(execution.contactId);
        if (!contact) {
          execution.status = 'failed';
          execution.errorDetails = 'Contact record not found during verify_data step';
          await execution.save();
          return;
        }

        const surveyId =
          interpolateTemplate(node.config?.query?.surveyId || '', {
            ...contact.toObject(),
            ...execution.variables
          }) || execution.variables?.candidateSurveyId || execution.variables?.lastReply;

        const providerName = node.config?.integrationType;

        const verifyResult = await VerificationService.verifyCandidateSubmission({
          phone: contact.phone,
          surveyId: surveyId ? String(surveyId).trim() : undefined,
          providerName
        });

        const resultVarName = node.config?.resultVariable || 'surveyVerified';
        execution.variables[resultVarName] = verifyResult.verified;
        if (verifyResult.surveyId) {
          execution.variables.verifiedSurveyId = verifyResult.surveyId;
        }

        execution.markModified('variables');
        this.logStep(execution, node, 'completed', { query: { phone: contact.phone, surveyId } }, verifyResult);
        await execution.save();

        const targetStep = verifyResult.verified
          ? (node.config?.onSuccessStepId || node.nextStepId)
          : (node.config?.onFailureStepId || node.nextStepId);

        if (targetStep) {
          await this.advanceToStep(execution, targetStep);
        }
        break;
      }

      case 'append_to_sheet': {
        const contact = await Contact.findById(execution.contactId);
        const sheetName = node.config?.sheetName || 'Responses';
        const providerName = node.config?.integrationType;

        const contactObj = contact ? (contact.toObject() as any) : {};
        const rowValues = [
          contact ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Candidate' : 'Candidate',
          contact?.phone || '',
          contactObj.roleApplied || contactObj.customAttributes?.role || execution.variables?.role || 'Applicant',
          execution.variables?.surveyVerified ? 'VERIFIED' : 'PASSED_SCREENING',
          new Date().toISOString()
        ];

        try {
          await VerificationService.appendRowToSheet({
            sheetName,
            rowValues,
            providerName
          });
          this.logStep(execution, node, 'completed', { sheetName, rowValues });
        } catch (err: any) {
          logger.warn('Failed to append row to spreadsheet', { error: err.message });
          this.logStep(execution, node, 'failed', { sheetName, error: err.message });
        }

        await execution.save();
        if (node.nextStepId) {
          await this.advanceToStep(execution, node.nextStepId);
        }
        break;
      }

      case 'human_handoff': {
        const conversation = await Conversation.findOne({ contactId: execution.contactId });
        if (conversation) {
          conversation.status = 'human_needed';
          await conversation.save();

          emitToConversation(conversation._id.toString(), 'conversation:escalated', {
            conversationId: conversation._id.toString(),
            reason: node.config?.reason || 'Workflow directed human handoff'
          });
          emitToTeam('conversation:escalated', {
            conversationId: conversation._id.toString(),
            conversation: conversation.toSafeObject(),
            reason: node.config?.reason || 'Workflow directed human handoff'
          });
        }
        this.logStep(execution, node, 'completed', { escalated: true });
        if (node.nextStepId) {
          await this.advanceToStep(execution, node.nextStepId);
        }
        break;
      }

      case 'ai_conversation': {
        if (node.config?.prompt) {
          const contact = await Contact.findById(execution.contactId);
          if (contact) {
            const provider = getMessagingProvider();
            await provider.sendMessage(contact.phone, { text: node.config.prompt });
          }
        }
        execution.status = 'waiting_for_reply';
        this.logStep(execution, node, 'completed', { waitingForAIInteraction: true });
        await execution.save();
        break;
      }

      case 'terminate': {
        execution.status = node.config.outcome === 'failed' ? 'failed' : 'completed';
        this.logStep(execution, node, 'completed', node.config);
        await execution.save();
        logger.info('Workflow execution finished', { executionId: execution._id.toString(), status: execution.status });
        break;
      }

      default: {
        this.logStep(execution, node, 'completed');
        if (node.nextStepId) {
          await this.advanceToStep(execution, node.nextStepId);
        }
      }
    }
  }

  private static async advanceToStep(
    execution: IWorkflowExecutionDocument,
    nextStepId: string
  ): Promise<void> {
    execution.currentStepId = nextStepId;
    await execution.save();
    await this.executeStep(execution._id.toString(), nextStepId);
  }

  public static async handleContactReply(
    contactId: Types.ObjectId | string,
    replyText: string
  ): Promise<{ handled: boolean; executionId?: string; targetStepId?: string }> {
    const execution = await WorkflowExecution.findOne({
      contactId: new Types.ObjectId(contactId),
      status: 'waiting_for_reply'
    });

    if (!execution) {
      return { handled: false };
    }

    const workflow = await Workflow.findById(execution.workflowId);
    if (!workflow) {
      return { handled: false };
    }

    const currentNode = workflow.nodes.find((n) => n.id === execution.currentStepId);
    if (!currentNode) {
      return { handled: false };
    }

    // Determine the node providing decision branches (either the current node or the condition node it leads to)
    let branchSourceNode = currentNode;
    if ((!branchSourceNode.branches || branchSourceNode.branches.length === 0) && branchSourceNode.nextStepId) {
      const nextNode = workflow.nodes.find((n) => n.id === branchSourceNode.nextStepId);
      if (nextNode && nextNode.branches && nextNode.branches.length > 0) {
        branchSourceNode = nextNode;
      }
    }

    if (!branchSourceNode.branches || branchSourceNode.branches.length === 0) {
      return { handled: false };
    }

    const text = replyText.trim();
    let targetStepId: string | null = null;
    let defaultBranch: IWorkflowBranch | null = null;

    // Evaluate branch conditions
    for (const branch of branchSourceNode.branches) {
      if (branch.conditionType === 'default') {
        defaultBranch = branch;
        continue;
      }

      const rawCondition = (branch.conditionValue || '').trim();
      const textLower = text.toLowerCase().trim();
      // Support comma-separated matching values (e.g. "YES, Interested, Apply, Sure")
      const candidateValues = rawCondition
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);

      const rawConditionLower = rawCondition.toLowerCase();

      if (branch.conditionType === 'regex' && rawCondition) {
        try {
          const regex = new RegExp(rawCondition, 'i');
          if (regex.test(text)) {
            targetStepId = branch.targetStepId;
            break;
          }
        } catch {
          // ignore invalid regex
        }
      } else if (
        rawConditionLower === textLower ||
        rawConditionLower.includes(textLower) ||
        textLower.includes(rawConditionLower) ||
        candidateValues.some((val) => textLower === val || textLower.includes(val) || val.includes(textLower))
      ) {
        targetStepId = branch.targetStepId;
        break;
      }
    }

    // Fallback to default branch if none matched
    if (!targetStepId && defaultBranch) {
      targetStepId = defaultBranch.targetStepId;
    }

    if (!targetStepId) {
      return { handled: false };
    }

    execution.variables.lastReply = text;
    execution.variables.lastReplyAt = new Date();
    execution.markModified('variables');
    execution.status = 'running';
    execution.currentStepId = targetStepId;

    this.logStep(execution, branchSourceNode, 'completed', { replyText: text }, { targetStepId });
    await execution.save();

    logger.info('Workflow branched on contact reply', {
      executionId: execution._id.toString(),
      replyText: text,
      targetStepId
    });

    // Advance to target branch step
    await this.executeStep(execution._id.toString(), targetStepId);

    return {
      handled: true,
      executionId: execution._id.toString(),
      targetStepId
    };
  }

  private static logStep(
    execution: IWorkflowExecutionDocument,
    node: IWorkflowNode,
    status: 'started' | 'completed' | 'failed',
    inputPayload?: any,
    outputPayload?: any
  ): void {
    execution.stepLogs.push({
      stepId: node.id,
      stepType: node.type,
      status,
      inputPayload,
      outputPayload,
      timestamp: new Date()
    });

    // Broadcast execution progress to listening conversation room & team
    Conversation.findOne({ contactId: execution.contactId }).then((conv) => {
      if (conv) {
        const payload = {
          conversationId: conv._id.toString(),
          executionId: execution._id.toString(),
          workflowId: execution.workflowId.toString(),
          currentStepId: execution.currentStepId,
          status: execution.status,
          variables: execution.variables,
          latestLog: {
            stepId: node.id,
            stepType: node.type,
            stepName: node.name,
            status,
            timestamp: new Date()
          }
        };
        emitToConversation(conv._id.toString(), 'workflow:step_progress', payload);
        emitToTeam('workflow:step_progress', payload);
      }
    }).catch(() => {});
  }

  public static async pauseExecution(executionId: string): Promise<IWorkflowExecutionDocument> {
    if (!mongoose.isValidObjectId(executionId)) {
      throw new ValidationError('Invalid execution ID format');
    }
    const execution = await WorkflowExecution.findById(executionId);
    if (!execution) {
      throw new NotFoundError('Workflow execution not found');
    }
    execution.status = 'paused_for_human';
    await execution.save();

    const conv = await Conversation.findOne({ contactId: execution.contactId });
    if (conv) {
      conv.status = 'agent_assigned';
      await conv.save();
      const payload = {
        conversationId: conv._id.toString(),
        executionId: execution._id.toString(),
        status: 'paused_for_human'
      };
      emitToConversation(conv._id.toString(), 'workflow:step_progress', payload);
      emitToTeam('workflow:step_progress', payload);
    }
    return execution;
  }

  public static async resumeExecution(executionId: string): Promise<IWorkflowExecutionDocument> {
    if (!mongoose.isValidObjectId(executionId)) {
      throw new ValidationError('Invalid execution ID format');
    }
    const execution = await WorkflowExecution.findById(executionId);
    if (!execution) {
      throw new NotFoundError('Workflow execution not found');
    }
    execution.status = 'waiting_for_reply';
    await execution.save();

    const conv = await Conversation.findOne({ contactId: execution.contactId });
    if (conv) {
      conv.status = 'bot';
      await conv.save();
      const payload = {
        conversationId: conv._id.toString(),
        executionId: execution._id.toString(),
        status: 'waiting_for_reply'
      };
      emitToConversation(conv._id.toString(), 'workflow:step_progress', payload);
      emitToTeam('workflow:step_progress', payload);
    }
    return execution;
  }

  public static async advanceExecution(
    executionId: string,
    targetStepId: string,
    simulatedReply?: string
  ): Promise<IWorkflowExecutionDocument> {
    if (!mongoose.isValidObjectId(executionId)) {
      throw new ValidationError('Invalid execution ID format');
    }
    const execution = await WorkflowExecution.findById(executionId);
    if (!execution) {
      throw new NotFoundError('Workflow execution not found');
    }

    if (simulatedReply) {
      execution.variables.lastReply = simulatedReply;
      execution.variables.lastReplyAt = new Date();
      execution.markModified('variables');
    }

    execution.status = 'running';
    execution.currentStepId = targetStepId;
    await execution.save();

    const conv = await Conversation.findOne({ contactId: execution.contactId });
    if (conv) {
      conv.status = 'bot';
      conv.assignedUserId = undefined;
      await conv.save();

      const statusPayload = { conversationId: conv._id.toString(), status: 'bot' };
      emitToConversation(conv._id.toString(), 'conversation:status_changed', statusPayload);
      emitToTeam('conversation:status_changed', statusPayload);

      const payload = {
        conversationId: conv._id.toString(),
        executionId: execution._id.toString(),
        currentStepId: targetStepId,
        status: 'running'
      };
      emitToConversation(conv._id.toString(), 'workflow:step_progress', payload);
      emitToTeam('workflow:step_progress', payload);
    }

    // Execute the advanced step asynchronously
    this.executeStep(execution._id.toString(), targetStepId).catch((err) => {
      logger.error('Failed to execute advanced step', { error: err.message, executionId, targetStepId });
    });

    return execution;
  }
}

