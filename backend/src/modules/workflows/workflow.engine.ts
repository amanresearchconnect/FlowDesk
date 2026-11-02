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
import { emitToConversation, emitToTeam } from '../../socket/socket.server.js';
import { interpolateTemplate } from '../../utils/template.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

export class WorkflowEngine {
  public static async startExecution(
    workflowId: string,
    contactId: string,
    campaignId?: string,
    initialVariables: Record<string, any> = {}
  ): Promise<IWorkflowExecutionDocument> {
    const workflow = await Workflow.findById(workflowId);
    if (!workflow) {
      throw new NotFoundError('Workflow not found');
    }

    const triggerNode = workflow.nodes.find((n) => n.type === 'trigger') || workflow.nodes[0];
    if (!triggerNode) {
      throw new ValidationError('Workflow must contain at least one node');
    }

    const execution = await WorkflowExecution.create({
      workflowId: workflow._id,
      campaignId: campaignId ? new Types.ObjectId(campaignId) : null,
      contactId: new Types.ObjectId(contactId),
      status: 'running',
      currentStepId: triggerNode.id,
      variables: initialVariables,
      stepLogs: [
        {
          stepId: triggerNode.id,
          stepType: triggerNode.type,
          status: 'started',
          inputPayload: initialVariables,
          timestamp: new Date()
        }
      ]
    });

    logger.info('Workflow execution started', {
      executionId: execution._id.toString(),
      workflowId,
      contactId
    });

    // Run first step
    await this.executeStep(execution._id.toString(), triggerNode.id);

    return execution;
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

        const provider = getMessagingProvider();
        const sendResult = await provider.sendMessage(contact.phone, { text: messageBody });

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

        await Message.create({
          conversationId: conversation._id,
          contactId: contact._id,
          campaignId: execution.campaignId,
          workflowExecutionId: execution._id,
          direction: 'outbound',
          senderType: 'system',
          provider: 'mock',
          providerMessageId: sendResult.providerMessageId,
          type: 'text',
          content: { body: messageBody },
          status: sendResult.status,
          sentAt: sendResult.timestamp
        });

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
        const variableKey = node.config.variablePath || node.config.key;
        const operator = node.config.operator || 'equals';
        const expectedValue = node.config.expectedValue;
        const actualValue = execution.variables[variableKey];

        let matched = false;
        if (operator === 'equals') {
          matched = String(actualValue).toLowerCase() === String(expectedValue).toLowerCase();
        } else if (operator === 'contains') {
          matched = String(actualValue).toLowerCase().includes(String(expectedValue).toLowerCase());
        }

        const nextStep = matched ? node.config.trueStepId : node.config.falseStepId;
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

        this.logStep(execution, node, 'completed', { operations });
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
    if (!currentNode || !currentNode.branches || currentNode.branches.length === 0) {
      return { handled: false };
    }

    const text = replyText.trim();
    let targetStepId: string | null = null;
    let defaultBranch: IWorkflowBranch | null = null;

    // Evaluate branch conditions
    for (const branch of currentNode.branches) {
      if (branch.conditionType === 'default') {
        defaultBranch = branch;
        continue;
      }

      if (branch.conditionType === 'regex' && branch.conditionValue) {
        try {
          const regex = new RegExp(branch.conditionValue, 'i');
          if (regex.test(text)) {
            targetStepId = branch.targetStepId;
            break;
          }
        } catch {
          // ignore invalid regex
        }
      } else if (branch.conditionType === 'equals' && branch.conditionValue) {
        if (text.toLowerCase() === branch.conditionValue.toLowerCase()) {
          targetStepId = branch.targetStepId;
          break;
        }
      } else if (branch.conditionType === 'contains' && branch.conditionValue) {
        if (text.toLowerCase().includes(branch.conditionValue.toLowerCase())) {
          targetStepId = branch.targetStepId;
          break;
        }
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
    execution.status = 'running';
    execution.currentStepId = targetStepId;

    this.logStep(execution, currentNode, 'completed', { replyText: text }, { targetStepId });
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
  }
}

