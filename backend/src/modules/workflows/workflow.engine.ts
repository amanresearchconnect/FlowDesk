import mongoose, { Types } from 'mongoose';
import { Workflow, IWorkflowNode, IWorkflowBranch } from '../../models/workflow.model.js';
import {
  WorkflowExecution,
  IWorkflowExecutionDocument
} from '../../models/workflow-execution.model.js';
import { Contact } from '../../models/contact.model.js';
import { Conversation } from '../../models/conversation.model.js';
import { Message } from '../../models/message.model.js';
import { Campaign } from '../../models/campaign.model.js';
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

    if (campaignId) {
      const alreadyStarted = await WorkflowExecution.exists({
        campaignId,
        contactId,
        _id: { $ne: execution._id }
      });
      if (!alreadyStarted) {
        await Campaign.updateOne({ _id: campaignId }, { $inc: { 'stats.startedWorkflow': 1 } });
      }
    }

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

        const templateName = node.config?.templateName ? String(node.config.templateName).trim() : undefined;
        let templateParams: any = undefined;
        if (templateName) {
          // Extract variables from template in order, interpolating from contact and runtime variables
          const matches = [...template.matchAll(/\{\{([^{}]+)\}\}/g)];
          const bodyParams = matches.map((m) => {
            const interpolatedVal = interpolateTemplate(m[0], mergeContext);
            return { type: 'text', text: interpolatedVal.trim() || ' ' };
          });

          templateParams = {
            languageCode: node.config?.templateLanguage || 'en',
            components: [
              {
                type: 'body',
                parameters: bodyParams.length > 0 ? bodyParams : [{ type: 'text', text: contact.firstName || 'there' }]
              }
            ]
          };
        }

        const provider = getMessagingProvider();
        const sendResult = await provider.sendMessage(contact.phone, {
          text: messageBody,
          buttons,
          templateName,
          templateParams
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

        const messageType = templateName ? 'template' : buttons && buttons.length > 0 ? 'interactive' : 'text';
        const messageDoc = await Message.create({
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

        // Broadcast real-time outbound bot message to active chat and team inbox
        const safeMessage = messageDoc.toSafeObject();
        emitToConversation(conversation._id.toString(), 'message:received', safeMessage);
        emitToTeam('message:received', {
          conversationId: conversation._id.toString(),
          message: safeMessage,
          contact: contact.toSafeObject()
        });

        // Whenever ANY outbound message is dispatched (interactive or text),
        // clear previous reply variable so succeeding condition / wait nodes pause
        // and wait for a fresh candidate response to this new message!
        execution.variables.lastReply = null;
        execution.markModified('variables');

        if (node.config?.waitForReply) {
          execution.status = 'waiting_for_reply';
          const timeoutHours = node.config?.timeoutHours || 24;
          execution.waitingForReplyUntil = new Date(Date.now() + timeoutHours * 3600 * 1000);
          this.logStep(
            execution,
            node,
            'started',
            { messageBody, waitingForCandidateReply: true, timeoutHours },
            { providerMessageId: sendResult.providerMessageId }
          );
          await execution.save();
          logger.info('Workflow execution paused at message step awaiting candidate reply', {
            executionId: execution._id.toString(),
            stepId: node.id
          });
          break;
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

      case 'delay': {
        const delayValue = Number(node.config?.delayValue ?? node.config?.duration ?? 12);
        const delayUnit = String(node.config?.delayUnit || 'hours').toLowerCase();

        let multiplier = 3600 * 1000; // default hours
        if (delayUnit === 'minutes' || delayUnit === 'minute' || delayUnit === 'mins') {
          multiplier = 60 * 1000;
        } else if (delayUnit === 'days' || delayUnit === 'day') {
          multiplier = 24 * 3600 * 1000;
        } else if (delayUnit === 'seconds' || delayUnit === 'second' || delayUnit === 'secs') {
          multiplier = 1000;
        }

        const delayMs = Math.max(1000, delayValue * multiplier);
        const delayUntil = new Date(Date.now() + delayMs);

        execution.status = 'delayed';
        execution.delayUntil = delayUntil;
        execution.currentStepId = node.id;

        this.logStep(execution, node, 'started', {
          delayValue,
          delayUnit,
          delayMs,
          delayUntil
        });
        await execution.save();

        const { WorkflowSchedulerService } = await import('./workflow-scheduler.service.js');
        await WorkflowSchedulerService.scheduleDelay(execution._id.toString(), node.id, delayMs);

        logger.info('Workflow execution paused for scheduled delay / follow-up', {
          executionId: execution._id.toString(),
          stepId: node.id,
          delayValue,
          delayUnit,
          delayUntil
        });
        break;
      }

      case 'condition': {
        const variableKey = node.config.variablePath || node.config.key || 'lastReply';
        let actualValue = execution.variables[variableKey];

        // If variable is not in execution variables, check contact customFields
        if (actualValue === undefined || actualValue === null) {
          const contact = await Contact.findById(execution.contactId);
          if (contact) {
            actualValue = (contact as any)[variableKey] ?? (contact.customFields as any)?.[variableKey];
          }
        }

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

        let nextStep: string | null = null;
        const actualLower = String(actualValue || '').toLowerCase().trim();

        if (node.branches && node.branches.length > 0) {
          const NEGATIVE_TERMS = ['no', 'not interested', 'decline', 'reject', 'cancel', 'reschedule', 'not available', 'not coming', 'cant', "can't", 'false', '0'];
          const AFFIRMATIVE_TERMS = ['yes', 'interested', 'apply', 'sure', 'confirm', 'available', 'coming', 'travel', 'true', '1'];

          const isAffirmativeActual =
            actualValue === true ||
            actualLower === 'true' ||
            actualLower === '1' ||
            actualLower === 'y' ||
            actualLower === 'ha' ||
            AFFIRMATIVE_TERMS.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(actualLower));
          const isNegativeActual =
            actualValue === false ||
            actualLower === 'false' ||
            actualLower === '0' ||
            actualLower === 'n' ||
            actualLower === 'na' ||
            NEGATIVE_TERMS.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(actualLower));

          for (const branch of node.branches) {
            const rawCondition = (branch.conditionValue || '').trim().toLowerCase();
            const candidateValues = rawCondition
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean);

            const isAffirmativeBranch =
              candidateValues.some((v) => AFFIRMATIVE_TERMS.includes(v)) &&
              !candidateValues.some((v) => NEGATIVE_TERMS.includes(v));
            const isNegativeBranch = candidateValues.some((v) => NEGATIVE_TERMS.includes(v));

            if (rawCondition === actualLower || candidateValues.includes(actualLower)) {
              nextStep = branch.targetStepId;
              break;
            }
            if (isAffirmativeBranch && isAffirmativeActual && !isNegativeActual) {
              nextStep = branch.targetStepId;
              break;
            }
            if (isNegativeBranch && isNegativeActual && !isAffirmativeActual) {
              nextStep = branch.targetStepId;
              break;
            }
          }
        }

        // If condition evaluates lastReply and candidate's reply matches neither branch (e.g. asked a question),
        // pause workflow execution to wait for a valid affirmative/negative reply!
        if (!nextStep && variableKey === 'lastReply') {
          execution.status = 'waiting_for_reply';
          const timeoutHours = node.config.timeoutHours || 24;
          execution.waitingForReplyUntil = new Date(Date.now() + timeoutHours * 3600 * 1000);
          this.logStep(execution, node, 'started', { waitingForContactReply: true, timeoutHours, actualValue });
          await execution.save();
          logger.info('Workflow execution paused at condition step awaiting valid decision reply', {
            executionId: execution._id.toString(),
            stepId: node.id,
            actualValue
          });
          break;
        }

        // Fallback for simple true/false config without branches
        if (!nextStep && (node.config.trueStepId || node.config.falseStepId)) {
          const operator = node.config.operator || 'equals';
          const expectedValue = String(node.config.expectedValue || '').toLowerCase().trim();
          let matched = false;
          if (operator === 'equals') matched = actualLower === expectedValue;
          else if (operator === 'contains') matched = actualLower.includes(expectedValue);
          else matched = actualLower === expectedValue || actualLower.includes(expectedValue);
          nextStep = matched ? node.config.trueStepId : node.config.falseStepId;
        }

        this.logStep(execution, node, 'completed', { actualValue }, { nextStep });
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

        const isInstantCheck = node.config?.extractionMode === 'whatsapp_phone_instant';
        const lastReplyText = String(execution.variables?.lastReply || '').trim();

        // If configured to evaluate candidate reply and candidate has not replied yet,
        // pause workflow execution to wait for their input!
        if (!isInstantCheck && !lastReplyText) {
          execution.status = 'waiting_for_reply';
          const timeoutHours = node.config?.timeoutHours || 24;
          execution.waitingForReplyUntil = new Date(Date.now() + timeoutHours * 3600 * 1000);
          this.logStep(execution, node, 'started', { waitingForCandidateReply: true, timeoutHours });
          await execution.save();
          logger.info('Workflow execution paused at verify_data step awaiting candidate reply', {
            executionId: execution._id.toString(),
            stepId: node.id
          });
          break;
        }

        const extractionMode = node.config?.extractionMode || 'auto_detect_reply';
        const matchField = node.config?.matchField || 'auto';

        // 1. Extract candidate tokens if candidate replied with formatted details
        let extractedEmail: string | undefined;
        let extractedPhone: string | undefined;
        let extractedSurveyId: string | undefined;

        if (lastReplyText) {
          // A. Email regex
          const emailMatch = lastReplyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
          if (emailMatch) extractedEmail = emailMatch[0].trim();

          // B. Explicit labelled matches for Survey ID
          const surveyMatch =
            lastReplyText.match(/(?:survey[-_\s]?id|surveyid|id|code)[:\s#]*([a-zA-Z0-9-_]+)/i) ||
            lastReplyText.match(/\b(surv[-_]?[a-zA-Z0-9]+)\b/i) ||
            lastReplyText.match(/\b([A-Z]{2,}[-_][a-zA-Z0-9]+)\b/i);
          if (surveyMatch) extractedSurveyId = (surveyMatch[1] || surveyMatch[0]).trim();

          // C. Delimited token fallback (comma, tab, newline, or pipe)
          const delimiter = [',', '\t', '\n', '|'].find((d) => lastReplyText.includes(d));
          if (delimiter) {
            const tokens = lastReplyText.split(delimiter).map((t) => t.trim()).filter(Boolean);
            for (const token of tokens) {
              if (extractedEmail && token.includes(extractedEmail)) continue;
              const cleanDigits = token.replace(/[\s\-()]/g, '');
              // Match phone number with 7 to 15 digits
              if (/^\+?\d{7,15}$/.test(cleanDigits)) {
                if (!extractedPhone) {
                  extractedPhone = cleanDigits;
                }
                continue;
              }
              // Match survey ID / code
              if (/^[a-zA-Z0-9-_]{3,25}$/.test(token) && !extractedSurveyId) {
                if (!/^[a-zA-Z\s]+$/.test(token)) {
                  extractedSurveyId = token;
                }
              }
            }
          } else {
            // Un-delimited phone match with 7 to 15 digits
            const phoneMatches = lastReplyText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+?\d{7,15}/g);
            if (phoneMatches) {
              for (const match of phoneMatches) {
                const cleanDigits = match.replace(/[\s\-()]/g, '');
                if (/^\+?\d{7,15}$/.test(cleanDigits)) {
                  extractedPhone = cleanDigits;
                  break;
                }
              }
            }
          }
        }

        // Determine validation requirement based on configured mode
        let hasRequiredIdentifier = false;
        let missingFieldType: 'phone' | 'email' | 'survey_id' | 'any' = 'phone';

        if (isInstantCheck) {
          hasRequiredIdentifier = true;
        } else if (extractionMode === 'phone_from_reply' || matchField === 'phone') {
          hasRequiredIdentifier = Boolean(extractedPhone);
          missingFieldType = 'phone';
        } else if (extractionMode === 'email_from_reply' || matchField === 'email') {
          hasRequiredIdentifier = Boolean(extractedEmail);
          missingFieldType = 'email';
        } else if (extractionMode === 'survey_id_from_reply' || matchField === 'surveyId') {
          hasRequiredIdentifier = Boolean(extractedSurveyId);
          missingFieldType = 'survey_id';
        } else {
          // auto_detect_reply or auto
          hasRequiredIdentifier = Boolean(extractedPhone || extractedEmail || extractedSurveyId);
          missingFieldType = 'phone';
        }

        const nudgeKey = `_nudge_count_${node.id}`;
        const previousNudges = Number(execution.variables[nudgeKey] || 0);

        // If candidate replied without the required identifier:
        if (!hasRequiredIdentifier) {
          // User policy: ONLY nudge ONCE. If reply is still invalid on the second try, don't bother them!
          // Proceed gracefully down the unverified/failure branch.
          if (previousNudges >= 1) {
            logger.info('Candidate did not provide required identifier after 1 AI nudge. Proceeding as unverified without further prompts.', {
              executionId: execution._id.toString(),
              stepId: node.id,
              replyText: lastReplyText,
              nudgesSent: previousNudges
            });

            execution.variables[nudgeKey] = 0;
            const resultVarName = node.config?.resultVariable || 'surveyVerified';
            execution.variables[resultVarName] = false;
            execution.variables.lastReply = null;
            execution.markModified('variables');

            this.logStep(
              execution,
              node,
              'completed',
              { query: { lastReply: lastReplyText, reason: 'unverified_after_max_nudges' } },
              { verified: false }
            );
            await execution.save();

            const targetStep = node.config?.onFailureStepId || node.branches?.[1]?.targetStepId || node.nextStepId;
            if (targetStep) {
              await this.advanceToStep(execution, targetStep);
            }
            break;
          }

          // First invalid reply: increment nudge counter, dispatch AI nudge, and pause waiting for response!
          execution.variables[nudgeKey] = 1;
          execution.markModified('variables');
          logger.info('Candidate reply does not contain required verification identifier. Intervening with AI validation nudge (Attempt 1).', {
            executionId: execution._id.toString(),
            stepId: node.id,
            replyText: lastReplyText,
            expectedField: missingFieldType
          });

          const { AIAgentService } = await import('../ai-agent/ai-agent.service.js');
          const nudgeMessage = await AIAgentService.generateValidationNudge({
            candidateName: contact.firstName,
            missingField: missingFieldType,
            userReply: lastReplyText,
            nodePrompt: node.name
          });

          // Dispatch AI nudge message over WhatsApp
          const provider = getMessagingProvider();
          const sendResult = await provider.sendMessage(contact.phone, { text: nudgeMessage });

          // Update conversation and log outbound message
          let conversation = await Conversation.findOne({ contactId: contact._id });
          if (!conversation) {
            conversation = await Conversation.create({
              contactId: contact._id,
              channel: 'whatsapp',
              status: 'bot',
              activeCampaignId: execution.campaignId || null,
              lastMessageAt: new Date(),
              lastMessagePreview: nudgeMessage.substring(0, 100),
              unreadCount: 0
            });
          } else {
            conversation.lastMessageAt = new Date();
            conversation.lastMessagePreview = nudgeMessage.substring(0, 100);
            if (execution.campaignId) conversation.activeCampaignId = execution.campaignId;
            await conversation.save();
          }

          const messageDoc = await Message.create({
            conversationId: conversation._id,
            contactId: contact._id,
            campaignId: execution.campaignId,
            workflowExecutionId: execution._id,
            direction: 'outbound',
            senderType: 'system',
            provider: env.MESSAGING_PROVIDER === 'meta' ? 'meta' : 'mock',
            providerMessageId: sendResult.providerMessageId,
            type: 'text',
            content: { body: nudgeMessage },
            status: sendResult.status,
            sentAt: sendResult.timestamp
          });

          const safeMessage = messageDoc.toSafeObject();
          emitToConversation(conversation._id.toString(), 'message:received', safeMessage);
          emitToTeam('message:received', {
            conversationId: conversation._id.toString(),
            message: safeMessage,
            contact: contact.toSafeObject()
          });

          // Reset reply variable and maintain waiting_for_reply status at this step
          execution.variables.lastReply = null;
          execution.markModified('variables');
          execution.status = 'waiting_for_reply';
          const timeoutHours = node.config?.timeoutHours || 24;
          execution.waitingForReplyUntil = new Date(Date.now() + timeoutHours * 3600 * 1000);

          this.logStep(
            execution,
            node,
            'started',
            { validationFailed: true, missingField: missingFieldType, receivedReply: lastReplyText, attempt: 1 },
            { aiNudgeSent: nudgeMessage, providerMessageId: sendResult.providerMessageId }
          );
          await execution.save();
          break;
        }

        // Successfully provided identifier: clear nudge counter
        execution.variables[nudgeKey] = 0;

        if (extractedPhone) execution.variables.candidatePhone = extractedPhone;
        if (extractedEmail) execution.variables.candidateEmail = extractedEmail;
        if (extractedSurveyId) execution.variables.candidateSurveyId = extractedSurveyId;

        const surveyId =
          interpolateTemplate(node.config?.query?.surveyId || '', {
            ...contact.toObject(),
            ...execution.variables
          }) || extractedSurveyId || execution.variables?.candidateSurveyId || execution.variables?.surveyId;

        const providerName = node.config?.integrationType;
        const sheetName = node.config?.sheetName;
        const spreadsheetUrl = node.config?.spreadsheetUrl || node.config?.spreadsheetId;

        // Use extracted phone if candidate provided it, or contact.phone only if instant check
        const searchPhone = isInstantCheck ? contact.phone : (extractedPhone || contact.phone);

        const verifyResult = await VerificationService.verifyCandidateSubmission({
          phone: searchPhone,
          surveyId: surveyId ? String(surveyId).trim() : undefined,
          email: extractedEmail,
          sheetName,
          spreadsheetUrl,
          providerName,
          skipCache: true
        });

        const resultVarName = node.config?.resultVariable || 'surveyVerified';
        execution.variables[resultVarName] = verifyResult.verified;
        if (verifyResult.surveyId) {
          execution.variables.verifiedSurveyId = verifyResult.surveyId;
        }

        execution.variables.lastReply = null;
        execution.markModified('variables');
        this.logStep(
          execution,
          node,
          'completed',
          { query: { phone: searchPhone, surveyId, email: extractedEmail } },
          verifyResult
        );
        await execution.save();

        const targetStep = verifyResult.verified
          ? (node.config?.onSuccessStepId || node.branches?.[0]?.targetStepId || node.nextStepId)
          : (node.config?.onFailureStepId || node.branches?.[1]?.targetStepId || node.nextStepId);

        if (targetStep) {
          await this.advanceToStep(execution, targetStep);
        }
        break;
      }

      case 'append_to_sheet': {
        const contact = await Contact.findById(execution.contactId);
        const sheetName = node.config?.sheetName || 'Responses';
        const providerName = node.config?.integrationType;
        const spreadsheetUrl = node.config?.spreadsheetUrl || node.config?.spreadsheetId;
        const mode = (node.config?.mode || 'upsert') as 'append' | 'update' | 'upsert';
        const lookupKey = (node.config?.lookupKey || 'phone') as 'phone' | 'email' | 'surveyId';

        const contactObj = contact ? (contact.toObject() as any) : {};
        const lastReplyText = String(execution.variables?.lastReply || '').trim();

        // Check if append_to_sheet should pause and wait for candidate reply
        const shouldWaitForReply = node.config?.waitForReply === true;
        if (shouldWaitForReply && !lastReplyText) {
          execution.status = 'waiting_for_reply';
          const timeoutHours = node.config?.timeoutHours || 24;
          execution.waitingForReplyUntil = new Date(Date.now() + timeoutHours * 3600 * 1000);
          this.logStep(execution, node, 'started', { waitingForCandidateReply: true, timeoutHours });
          await execution.save();
          logger.info('Workflow execution paused at append_to_sheet step awaiting candidate reply', {
            executionId: execution._id.toString(),
            stepId: node.id
          });
          break;
        }

        // 1. Extract details from candidate reply if present
        const extracted: Record<string, string> = {};
        if (lastReplyText) {
          const emailMatch = lastReplyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
          if (emailMatch) extracted.email = emailMatch[0].trim();

          const phoneMatch = lastReplyText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{10,13}\b/);
          if (phoneMatch) extracted.phone = phoneMatch[0].trim();

          const surveyMatch =
            lastReplyText.match(/(?:survey[-_\s]?id|surveyid|id|code)[:\s#]*([a-zA-Z0-9-_]+)/i) ||
            lastReplyText.match(/\b(surv[-_]?[a-zA-Z0-9]+)\b/i) ||
            lastReplyText.match(/\b([A-Z]{2,}[-_][a-zA-Z0-9]+)\b/i);
          if (surveyMatch) extracted.surveyId = (surveyMatch[1] || surveyMatch[0]).trim();
        }

        if (extracted.surveyId) execution.variables.candidateSurveyId = extracted.surveyId;
        if (extracted.email) execution.variables.candidateEmail = extracted.email;
        if (extracted.phone) execution.variables.candidatePhone = extracted.phone;

        // 2. AI Multi-Field Entity Extraction for Questionnaire Answers / Form Data
        const neededVariables = new Set<string>();
        const BUILTIN_VARS = new Set([
          'phone', 'email', 'candidatephone', 'candidateemail', 'firstname', 'lastname',
          'status', 'timestamp', '$timestamp', '$date', 'date', 'lastreply', 'lastreplyat',
          'surveyid', 'candidatesurveyid', 'verifiedsurveyid', 'surveyverified', 'company', 'role'
        ]);

        if (Array.isArray(node.config?.columnMappings)) {
          for (const m of node.config.columnMappings) {
            const matches = String(m.value || '').matchAll(/\{\{([^}]+)\}\}/g);
            for (const match of matches) {
              const varName = match[1].trim();
              if (!BUILTIN_VARS.has(varName.toLowerCase()) && !execution.variables[varName]) {
                neededVariables.add(varName);
              }
            }
          }
        } else if (node.config?.customColumns) {
          const rawCols = Array.isArray(node.config.customColumns)
            ? node.config.customColumns
            : typeof node.config.customColumns === 'string'
            ? node.config.customColumns.split(',')
            : [];
          for (const col of rawCols) {
            const matches = String(col).matchAll(/\{\{([^}]+)\}\}/g);
            for (const match of matches) {
              const varName = match[1].trim();
              if (!BUILTIN_VARS.has(varName.toLowerCase()) && !execution.variables[varName]) {
                neededVariables.add(varName);
              }
            }
          }
        }

        if (lastReplyText && neededVariables.size > 0) {
          try {
            const { AIAgentService } = await import('../ai-agent/ai-agent.service.js');
            const workflow = await Workflow.findById(execution.workflowId);
            let contextPrompt = '';
            if (workflow && workflow.nodes) {
              const prevNode = workflow.nodes.find(
                (n) => n.nextStepId === node.id || n.branches?.some((b) => b.targetStepId === node.id)
              );
              contextPrompt = prevNode?.config?.messageTemplate || prevNode?.config?.body || '';
            }

            logger.info('Auto-extracting questionnaire entities from candidate reply via AI', {
              executionId: execution._id.toString(),
              fields: Array.from(neededVariables),
              replyText: lastReplyText
            });

            const extraction = await AIAgentService.extractEntities({
              text: lastReplyText,
              fields: Array.from(neededVariables),
              contextPrompt
            });

            if (extraction && extraction.entities) {
              for (const [key, val] of Object.entries(extraction.entities)) {
                if (val !== undefined && val !== null && val !== '') {
                  execution.variables[key] = val;
                }
              }
            }
          } catch (aiErr: any) {
            logger.warn('AI entity extraction failed or skipped in append_to_sheet', { error: aiErr.message });
          }
        }

        execution.markModified('variables');

        const nowLocale = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
        const context = {
          ...contactObj,
          ...execution.variables,
          candidatePhone: execution.variables.candidatePhone || contact?.phone || '',
          candidateEmail: execution.variables.candidateEmail || contact?.email || '',
          phone: execution.variables.candidatePhone || contact?.phone || '',
          email: execution.variables.candidateEmail || contact?.email || '',
          verifiedSurveyId: execution.variables.verifiedSurveyId || execution.variables.candidateSurveyId || '',
          surveyVerified: execution.variables.surveyVerified ? 'Verified' : 'Completed',
          '$timestamp': nowLocale,
          '$date': nowLocale.split(',')[0]
        };

        let lookupValue = contact?.phone || '';
        if (lookupKey === 'email') lookupValue = execution.variables.candidateEmail || contact?.email || '';
        if (lookupKey === 'surveyId') lookupValue = execution.variables.verifiedSurveyId || execution.variables.candidateSurveyId || '';
        if (lookupKey === 'phone') lookupValue = execution.variables.candidatePhone || contact?.phone || '';

        // Build columnUpdates from visual columnMappings or raw columns fallback
        const columnUpdates: Array<{ sheetColumn: string; value: any }> = [];
        const rawMappings = node.config?.columnMappings;

        if (Array.isArray(rawMappings) && rawMappings.length > 0) {
          for (const m of rawMappings) {
            if (m.sheetColumn && m.sheetColumn.trim()) {
              columnUpdates.push({
                sheetColumn: m.sheetColumn.trim(),
                value: interpolateTemplate(m.value || '', context)
              });
            }
          }
        } else if (node.config?.customColumns) {
          const rawCols = node.config.customColumns;
          const customColumnsList: string[] = Array.isArray(rawCols)
            ? rawCols
            : typeof rawCols === 'string'
            ? rawCols.split(',').map((s: string) => s.trim()).filter(Boolean)
            : [];
          customColumnsList.forEach((col, idx) => {
            columnUpdates.push({
              sheetColumn: `Column ${String.fromCharCode(65 + idx)}`,
              value: interpolateTemplate(col, context)
            });
          });
        } else {
          // Sensible default columns
          const candidateName = contact ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Candidate' : 'Candidate';
          columnUpdates.push(
            { sheetColumn: 'Name', value: candidateName },
            { sheetColumn: 'Phone', value: execution.variables.candidatePhone || contact?.phone || '' },
            { sheetColumn: 'Email', value: execution.variables.candidateEmail || contact?.email || '' },
            { sheetColumn: 'Status', value: execution.variables.surveyVerified ? 'Verified' : 'Completed' },
            { sheetColumn: 'Survey-ID', value: execution.variables.verifiedSurveyId || execution.variables.candidateSurveyId || '' },
            { sheetColumn: 'Timestamp', value: nowLocale }
          );
        }

        try {
          const result = await VerificationService.upsertRowToSheet({
            sheetName,
            mode,
            lookupKey,
            lookupValue,
            columnUpdates,
            spreadsheetUrl,
            providerName
          });

          this.logStep(execution, node, 'completed', {
            sheetName,
            mode,
            lookupKey,
            lookupValue,
            columnUpdates
          }, result);
        } catch (err: any) {
          logger.warn('Failed to write/upsert row to spreadsheet', { error: err.message });
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
        if (execution.campaignId) {
          const alreadyEscalated = await WorkflowExecution.exists({
            campaignId: execution.campaignId,
            contactId: execution.contactId,
            $or: [
              { status: 'paused_for_human' },
              { 'stepLogs.stepType': 'human_escalation' }
            ],
            _id: { $ne: execution._id }
          });
          if (!alreadyEscalated) {
            await Campaign.updateOne({ _id: execution.campaignId }, { $inc: { 'stats.humanEscalated': 1 } });
          }
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

      case 'ai_parse': {
        const sourceVar = node.config?.sourceVariable || 'lastReply';
        const sourceText = String(execution.variables?.[sourceVar] || execution.variables?.lastReply || '').trim();

        // If source reply is not received yet, pause and wait for reply
        if (!sourceText) {
          execution.status = 'waiting_for_reply';
          const timeoutHours = node.config?.timeoutHours || 24;
          execution.waitingForReplyUntil = new Date(Date.now() + timeoutHours * 3600 * 1000);
          this.logStep(execution, node, 'started', { waitingForCandidateReply: true, timeoutHours });
          await execution.save();
          logger.info('Workflow execution paused at ai_parse step awaiting candidate reply', {
            executionId: execution._id.toString(),
            stepId: node.id
          });
          break;
        }

        const rawFields = node.config?.fields;
        const configuredFields: Array<{ name: string; description?: string }> = Array.isArray(rawFields)
          ? rawFields.map((f: any) => (typeof f === 'string' ? { name: f.trim() } : f))
          : typeof node.config?.fieldsRaw === 'string'
          ? node.config.fieldsRaw.split(',').map((s: string) => ({ name: s.trim() })).filter((f: any) => Boolean(f.name))
          : [];

        if (configuredFields.length > 0) {
          try {
            const { AIAgentService } = await import('../ai-agent/ai-agent.service.js');
            const extraction = await AIAgentService.extractEntities({
              text: sourceText,
              fields: configuredFields,
              contextPrompt: node.config?.instructions || node.config?.prompt
            });

            if (extraction && extraction.entities) {
              for (const [key, val] of Object.entries(extraction.entities)) {
                if (val !== undefined && val !== null && val !== '') {
                  execution.variables[key] = val;
                }
              }
              execution.markModified('variables');
              this.logStep(execution, node, 'completed', { sourceText, configuredFields }, { extracted: extraction.entities });
            }
          } catch (err: any) {
            logger.warn('ai_parse step failed', { error: err.message });
            this.logStep(execution, node, 'failed', { error: err.message });
          }
        } else {
          this.logStep(execution, node, 'completed', { skipped: true, reason: 'No fields configured' });
        }

        await execution.save();
        if (node.nextStepId) {
          await this.advanceToStep(execution, node.nextStepId);
        }
        break;
      }

      case 'terminate': {
        execution.status = node.config.outcome === 'failed' ? 'failed' : 'completed';
        this.logStep(execution, node, 'completed', node.config);
        await execution.save();
        if (execution.status === 'completed' && execution.campaignId) {
          const alreadyCompleted = await WorkflowExecution.exists({
            campaignId: execution.campaignId,
            contactId: execution.contactId,
            status: 'completed',
            _id: { $ne: execution._id }
          });
          if (!alreadyCompleted) {
            await Campaign.updateOne({ _id: execution.campaignId }, { $inc: { 'stats.completedGoal': 1 } });
          }
        }
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
    replyText: string,
    campaignId?: string
  ): Promise<{ handled: boolean; executionId?: string; targetStepId?: string }> {
    const contactObjId = new Types.ObjectId(contactId);
    const text = replyText.trim();
    let execution = null;

    if (campaignId && mongoose.isValidObjectId(campaignId)) {
      execution = await WorkflowExecution.findOne({
        contactId: contactObjId,
        campaignId: new Types.ObjectId(campaignId),
        status: { $in: ['waiting_for_reply', 'delayed'] }
      }).sort({ createdAt: -1 });
    }

    if (!execution) {
      execution = await WorkflowExecution.findOne({
        contactId: contactObjId,
        status: { $in: ['waiting_for_reply', 'delayed'] }
      }).sort({ createdAt: -1 });
    }

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

    // If execution was waiting directly at delay step:
    if (currentNode.type === 'delay') {
      // SCENARIO 1: Delay timer has ALREADY finished, follow-up message was sent, and workflow is waiting for candidate's reply
      if (execution.status === 'waiting_for_reply') {
        execution.variables.lastReply = text;
        execution.variables.lastReplyAt = new Date();
        execution.markModified('variables');
        execution.status = 'running';
        execution.waitingForReplyUntil = undefined;
        await execution.save();
        // Do not return early here - allow it to proceed to branch evaluation (lines 1194+) or sequential next step below!
      } else {
        // SCENARIO 2: Execution is actively counting down in 'delayed' status (timer is still running)
        const cancelOnReply = currentNode.config?.cancelOnReply === true;

        execution.variables.lastReply = text;
        execution.variables.lastReplyAt = new Date();
        execution.markModified('variables');

        if (cancelOnReply) {
          // Explicitly configured to abort delay timer on early reply
          try {
            const { WorkflowSchedulerService } = await import('./workflow-scheduler.service.js');
            await WorkflowSchedulerService.cancelDelay(execution._id.toString());
          } catch (err: any) {
            logger.warn('Error cancelling delay on candidate reply', { error: err.message });
          }

          execution.status = 'running';
          execution.delayUntil = undefined;

          this.logStep(execution, currentNode, 'completed', {
            replyText: text,
            delayBypassedEarly: true
          });
          await execution.save();

          logger.info('Candidate replied while at delay/follow-up step with cancelOnReply=true, cancelling timer and advancing', {
            executionId: execution._id.toString(),
            stepId: currentNode.id,
            replyText: text
          });

          if (currentNode.nextStepId) {
            await this.advanceToStep(execution, currentNode.nextStepId);
            return { handled: true, executionId: execution._id.toString(), targetStepId: currentNode.nextStepId };
          }
          return { handled: true, executionId: execution._id.toString(), targetStepId: currentNode.id };
        } else {
          // cancelOnReply is false / unchecked (or Smart Silence Guard):
          // Candidate asked a question while waiting for the timer.
          // DO NOT kill the timer! Keep the delay scheduled and let AI Assistant answer their question!
          await execution.save();
          logger.info('Candidate sent message while at delay step with cancelOnReply=false, keeping timer running and letting AI assistant reply', {
            executionId: execution._id.toString(),
            stepId: currentNode.id,
            replyText: text
          });

          // Returning handled: false allows messaging.service to invoke AIAgentService for Knowledge Base Q&A
          return { handled: false, executionId: execution._id.toString(), targetStepId: currentNode.id };
        }
      }
    }

    // If execution was waiting directly at verify_data step, store reply and execute verification
    if (currentNode.type === 'verify_data') {
      execution.variables.lastReply = text;
      execution.variables.lastReplyAt = new Date();
      execution.markModified('variables');
      execution.status = 'running';
      await execution.save();
      logger.info('Received candidate reply for verify_data step, proceeding with sheet verification', {
        executionId: execution._id.toString(),
        stepId: currentNode.id,
        replyText: text
      });
      await this.executeStep(execution._id.toString(), currentNode.id);
      return { handled: true, executionId: execution._id.toString(), targetStepId: currentNode.id };
    }

    // If execution was waiting directly at append_to_sheet step, check if reply is a side question
    if (currentNode.type === 'append_to_sheet') {
      const isQuestionOrInquiry =
        text.includes('?') ||
        /\b(can you|could you|what|when|where|why|which|how|who|whom|whose|do you|is it|is there|are you|will you|tell me|please share|share the|send me|give me|jd|job description|floor)\b/i.test(text);

      // If candidate is asking a question instead of answering survey questions, let AI reply and keep waiting
      if (isQuestionOrInquiry && text.length < 120 && !/\b(exp|experience|ctc|notice|working|age|excel)\b/i.test(text)) {
        logger.info('Candidate asked inquiry while awaiting append_to_sheet survey, letting AI assistant respond', {
          executionId: execution._id.toString(),
          stepId: currentNode.id,
          replyText: text
        });
        return { handled: false, executionId: execution._id.toString(), targetStepId: currentNode.id };
      }

      execution.variables.lastReply = text;
      execution.variables.lastReplyAt = new Date();
      execution.markModified('variables');
      execution.status = 'running';
      await execution.save();
      logger.info('Received candidate reply for append_to_sheet step, proceeding with sheet appending', {
        executionId: execution._id.toString(),
        stepId: currentNode.id,
        replyText: text
      });
      await this.executeStep(execution._id.toString(), currentNode.id);
      return { handled: true, executionId: execution._id.toString(), targetStepId: currentNode.id };
    }

    // If execution was waiting directly at ai_parse step, store reply and execute parsing
    if (currentNode.type === 'ai_parse') {
      execution.variables.lastReply = text;
      execution.variables.lastReplyAt = new Date();
      execution.markModified('variables');
      execution.status = 'running';
      await execution.save();
      logger.info('Received candidate reply for ai_parse step, proceeding with entity extraction', {
        executionId: execution._id.toString(),
        stepId: currentNode.id,
        replyText: text
      });
      await this.executeStep(execution._id.toString(), currentNode.id);
      return { handled: true, executionId: execution._id.toString(), targetStepId: currentNode.id };
    }

    // If execution was waiting at send_message / send_text_message, wait_for_reply, or delay (without branches):
    if (
      (currentNode.type === 'send_message' || currentNode.type === 'send_text_message' || currentNode.type === 'wait_for_reply' || currentNode.type === 'delay') &&
      (!currentNode.branches || currentNode.branches.length === 0) &&
      currentNode.nextStepId
    ) {
      const nextNode = workflow.nodes.find((n) => n.id === currentNode.nextStepId);
      // If next node has no branches (e.g. append_to_sheet or next sequential message), advance directly!
      if (!nextNode || !nextNode.branches || nextNode.branches.length === 0) {
        execution.variables.lastReply = text;
        execution.variables.lastReplyAt = new Date();
        execution.markModified('variables');
        execution.status = 'running';
        this.logStep(execution, currentNode, 'completed', { replyText: text }, { targetStepId: currentNode.nextStepId });
        await execution.save();
        logger.info('Received candidate reply for sequential message/wait step, advancing to next step', {
          executionId: execution._id.toString(),
          currentNodeId: currentNode.id,
          nextStepId: currentNode.nextStepId,
          replyText: text
        });
        await this.advanceToStep(execution, currentNode.nextStepId);
        return { handled: true, executionId: execution._id.toString(), targetStepId: currentNode.nextStepId };
      }
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

    let targetStepId: string | null = null;
    let defaultBranch: IWorkflowBranch | null = null;
    const textLower = text.toLowerCase().trim();

    // 1. Button exact match (interactive click or exact button text)
    const buttons = (currentNode.config?.buttons as Array<{ id?: string; title?: string }>) || [];
    const matchedBtn = buttons.find(
      (b) =>
        (b.title && b.title.trim().toLowerCase() === textLower) ||
        (b.id && b.id.trim().toLowerCase() === textLower)
    );

    const NEGATIVE_TERMS = [
      'no',
      'not interested',
      'decline',
      'reject',
      'cancel',
      'reschedule',
      'not available',
      'not coming',
      'cant',
      "can't",
      'false',
      '0'
    ];
    const AFFIRMATIVE_TERMS = [
      'yes',
      'interested',
      'apply',
      'sure',
      'confirm',
      'available',
      'coming',
      'travel',
      'true',
      '1'
    ];

    if (matchedBtn) {
      const btnTitleLower = (matchedBtn.title || '').toLowerCase();
      const btnIdLower = (matchedBtn.id || '').toLowerCase();
      const isAffirmativeBtn =
        /yes|agree|accept|travel|coming|sure|confirm/i.test(btnTitleLower + ' ' + btnIdLower) &&
        !/no|not|cant|can't/i.test(btnTitleLower);
      const isNegativeBtn = /no|not|decline|reject|reschedule|cancel|cant|can't/i.test(
        btnTitleLower + ' ' + btnIdLower
      );

      for (const branch of branchSourceNode.branches) {
        const candidateValues = (branch.conditionValue || '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        const isAffirmativeBranch =
          candidateValues.some((v) => AFFIRMATIVE_TERMS.includes(v)) &&
          !candidateValues.some((v) => NEGATIVE_TERMS.includes(v));
        const isNegativeBranch = candidateValues.some((v) => NEGATIVE_TERMS.includes(v));

        if (isAffirmativeBtn && isAffirmativeBranch) {
          targetStepId = branch.targetStepId;
          break;
        }
        if (isNegativeBtn && isNegativeBranch) {
          targetStepId = branch.targetStepId;
          break;
        }
      }
    }

    // 2. Candidate Question / Inquiry check
    // If candidate is asking a question (contains '?' or inquiry keywords) and did NOT explicitly begin with an affirmative or negative answer:
    const isQuestionOrInquiry =
      text.includes('?') ||
      /\b(can you|could you|what|when|where|why|which|how|who|whom|whose|do you|is it|is there|are you|will you|tell me|please share|share the|send me|give me|give details|timing|location|address|stipend|salary|role|job description|jd|floor)\b/i.test(
        textLower
      );

    const startsWithYes = /^(yes|yeah|yep|sure|haan|yup)\b/i.test(textLower);
    const startsWithNo = /^(no|nope|nah|nahi|not interested)\b/i.test(textLower);

    // 3. Strict Deterministic Affirmative vs Negative matching (only if not an unconfirmed question)
    if (!targetStepId && (!isQuestionOrInquiry || startsWithYes || startsWithNo)) {
      const AFFIRMATIVE_WORDS = [
        'yes',
        'yep',
        'yeah',
        'sure',
        'definitely',
        'interested',
        'agree',
        'ready',
        'proceed',
        'apply',
        'ok',
        'okay',
        'yup',
        'haan'
      ];
      const NEGATIVE_WORDS = [
        'no',
        'nope',
        'nah',
        'not really',
        'cancel',
        'not interested',
        'stop',
        'reject',
        'pass',
        'nahi',
        'not available',
        'not coming'
      ];

      const isExactSingleYes = textLower === 'y' || textLower === 'ha';
      const isExactSingleNo = textLower === 'n' || textLower === 'na';

      const isAffirmativeText =
        isExactSingleYes ||
        AFFIRMATIVE_WORDS.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(textLower));
      const isNegativeText =
        isExactSingleNo ||
        NEGATIVE_WORDS.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(textLower));

      for (const branch of branchSourceNode.branches) {
        if (branch.conditionType === 'default') {
          defaultBranch = branch;
          continue;
        }

        const rawCondition = (branch.conditionValue || '').trim().toLowerCase();
        const candidateValues = rawCondition
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean);

        const isAffirmativeBranch =
          candidateValues.some((v) => AFFIRMATIVE_TERMS.includes(v)) &&
          !candidateValues.some((v) => NEGATIVE_TERMS.includes(v));
        const isNegativeBranch = candidateValues.some((v) => NEGATIVE_TERMS.includes(v));

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
        } else if (rawCondition === textLower || candidateValues.includes(textLower)) {
          // Exact branch match
          targetStepId = branch.targetStepId;
          break;
        } else if (isAffirmativeBranch && isAffirmativeText && !isNegativeText) {
          targetStepId = branch.targetStepId;
          break;
        } else if (isNegativeBranch && isNegativeText && !isAffirmativeText) {
          targetStepId = branch.targetStepId;
          break;
        }
      }
    }

    // 2. Semantic AI Intent Classifier Fallback if deterministic matches did not resolve a branch
    if (!targetStepId && branchSourceNode.branches && branchSourceNode.branches.length > 0) {
      try {
        const { AIAgentService } = await import('../ai-agent/ai-agent.service.js');
        const classification = await AIAgentService.classifyIntentForBranches({
          stageName: branchSourceNode.name,
          stagePrompt: branchSourceNode.config?.body || branchSourceNode.config?.text || currentNode.name,
          candidateText: text,
          branches: branchSourceNode.branches.map((b) => ({
            targetStepId: b.targetStepId,
            conditionValue: b.conditionValue
          }))
        });

        if (classification.matched && classification.targetStepId) {
          targetStepId = classification.targetStepId;
          logger.info('Semantic AI successfully matched workflow branch', {
            executionId: execution._id.toString(),
            replyText: text,
            targetStepId,
            confidence: classification.confidence,
            extractedVariables: classification.extractedVariables
          });

          if (classification.extractedVariables) {
            for (const [k, v] of Object.entries(classification.extractedVariables)) {
              if (v !== undefined && v !== null && v !== '') {
                execution.variables[k] = v;
              }
            }
            execution.markModified('variables');
          }
        }
      } catch (aiErr: any) {
        logger.warn('Semantic AI intent classification failed or bypassed', { error: aiErr.message });
      }
    }

    // 3. Fallback: If contact provided phone number, email, or alphanumeric code, and a branch leads to verify_data
    if (!targetStepId && branchSourceNode.branches && branchSourceNode.branches.length > 0) {
      const cleanDigits = text.replace(/[\s\-()]/g, '');
      const hasPhone = /^\+?\d{7,15}$/.test(cleanDigits);
      const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text);

      if (hasPhone || hasEmail) {
        const verifyBranch = branchSourceNode.branches.find((b) => {
          const targetNode = workflow.nodes.find((n) => n.id === b.targetStepId);
          return targetNode?.type === 'verify_data';
        });
        if (verifyBranch) {
          targetStepId = verifyBranch.targetStepId;
          logger.info('Detected candidate identifier reply, routing to verification node', {
            executionId: execution._id.toString(),
            targetStepId
          });
        }
      }
    }

    // Fallback to default branch, or if there is only 1 branch, advance down that branch
    if (!targetStepId) {
      if (defaultBranch) {
        targetStepId = defaultBranch.targetStepId;
      } else if (branchSourceNode.branches.length === 1 && branchSourceNode.branches[0].targetStepId) {
        targetStepId = branchSourceNode.branches[0].targetStepId;
      }
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

    if (execution.campaignId) {
      const alreadyEscalated = await WorkflowExecution.exists({
        campaignId: execution.campaignId,
        contactId: execution.contactId,
        $or: [
          { status: 'paused_for_human' },
          { 'stepLogs.stepType': 'human_escalation' }
        ],
        _id: { $ne: execution._id }
      });
      if (!alreadyEscalated) {
        await Campaign.updateOne({ _id: execution.campaignId }, { $inc: { 'stats.humanEscalated': 1 } });
      }
    }

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

  /**
   * Resumes and executes a delayed workflow step when BullMQ or DB sweeper fires
   */
  public static async executeDelayedStep(
    executionId: string,
    stepId: string
  ): Promise<void> {
    if (!mongoose.isValidObjectId(executionId)) return;
    const execution = await WorkflowExecution.findById(executionId);
    if (!execution) return;

    // Only process if execution is currently delayed at this exact step
    if (execution.status !== 'delayed' || execution.currentStepId !== stepId) {
      logger.info('Delayed step execution bypassed: execution is no longer delayed at this step', {
        executionId,
        stepId,
        currentStatus: execution.status,
        currentStepId: execution.currentStepId
      });
      return;
    }

    const workflow = await Workflow.findById(execution.workflowId);
    if (!workflow) return;

    const node = workflow.nodes.find((n) => n.id === stepId);
    if (!node) return;

    const contact = await Contact.findById(execution.contactId);
    if (!contact) return;

    logger.info('Executing scheduled delay/follow-up step now', {
      executionId,
      stepId,
      nodeName: node.name
    });

    execution.status = 'running';
    execution.delayUntil = undefined;

    // Check Smart Silence Guard (Inactivity Buffer):
    // If enabled and candidate chatted recently within the guard window, skip this follow-up nudge!
    const enableInactivityGuard = node.config?.enableInactivityGuard === true;
    if (enableInactivityGuard) {
      const bufferVal = Math.max(1, Number(node.config?.inactivityBufferValue || 30));
      const bufferUnit = String(node.config?.inactivityBufferUnit || 'minutes').toLowerCase();
      const multiplier = bufferUnit === 'hours' || bufferUnit === 'hour' ? 3600 * 1000 : 60 * 1000;
      const bufferMs = bufferVal * multiplier;

      const lastReplyTime = execution.variables?.lastReplyAt
        ? new Date(execution.variables.lastReplyAt).getTime()
        : 0;
      const msSinceLastReply = lastReplyTime > 0 ? Date.now() - lastReplyTime : Infinity;

      if (lastReplyTime > 0 && msSinceLastReply < bufferMs) {
        const minsAgo = Math.round(msSinceLastReply / 60000);
        logger.info('Smart Silence Guard bypassed follow-up: candidate was active recently', {
          executionId,
          stepId,
          minsAgo,
          bufferVal,
          bufferUnit
        });

        this.logStep(execution, node, 'completed', {
          bypassedBySilenceGuard: true,
          reason: `Candidate was active ${minsAgo}m ago (guard threshold: ${bufferVal} ${bufferUnit})`
        });

        await execution.save();

        if (node.nextStepId) {
          await this.advanceToStep(execution, node.nextStepId);
        }
        return;
      }
    }

    // Check if node has a follow-up message to send
    const messageTemplate = node.config?.messageTemplate || node.config?.body || '';
    if (messageTemplate) {
      const mergeContext = {
        ...contact.toObject(),
        ...execution.variables
      };
      const messageBody = interpolateTemplate(messageTemplate, mergeContext);
      const buttons = Array.isArray(node.config.buttons) && node.config.buttons.length > 0
        ? node.config.buttons
        : undefined;

      // Check 24-hour window from candidate's last inbound reply
      const lastReplyTime = execution.variables?.lastReplyAt
        ? new Date(execution.variables.lastReplyAt).getTime()
        : 0;
      const hoursSinceReply = lastReplyTime ? (Date.now() - lastReplyTime) / (3600 * 1000) : 999;
      const isWithin24Hours = hoursSinceReply < 24;

      let templateName = node.config?.templateName ? String(node.config.templateName).trim() : undefined;
      let templateParams: any = undefined;

      // If outside 24-hour window, use approved Meta template if provided
      if (!isWithin24Hours && node.config?.templateName) {
        templateName = String(node.config.templateName).trim();
        const matches = [...messageTemplate.matchAll(/\{\{([^{}]+)\}\}/g)];
        const bodyParams = matches.map((m) => {
          const interpolatedVal = interpolateTemplate(m[0], mergeContext);
          return { type: 'text', text: interpolatedVal.trim() || ' ' };
        });

        templateParams = {
          languageCode: node.config?.templateLanguage || 'en',
          components: [
            {
              type: 'body',
              parameters: bodyParams.length > 0 ? bodyParams : [{ type: 'text', text: contact.firstName || 'there' }]
            }
          ]
        };
      }

      const provider = getMessagingProvider();
      const sendResult = await provider.sendMessage(contact.phone, {
        text: messageBody,
        buttons,
        templateName,
        templateParams
      });

      // Clear previous reply so succeeding condition / wait nodes wait for fresh reply to this follow-up
      execution.variables.lastReply = null;
      execution.markModified('variables');

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
        await conversation.save();
      }

      const messageType = templateName ? 'template' : buttons && buttons.length > 0 ? 'interactive' : 'text';
      const messageDoc = await Message.create({
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
          templateName,
          buttons: buttons ? buttons.map((b: any) => ({ id: b.id, title: b.title })) : undefined
        },
        status: sendResult.status,
        sentAt: sendResult.timestamp
      });

      const safeMessage = messageDoc.toSafeObject();
      emitToConversation(conversation._id.toString(), 'message:received', safeMessage);
      emitToTeam('message:received', {
        conversationId: conversation._id.toString(),
        message: safeMessage,
        contact: contact.toSafeObject()
      });

      this.logStep(
        execution,
        node,
        'completed',
        { messageBody, delayCompleted: true },
        { providerMessageId: sendResult.providerMessageId }
      );
    } else {
      // Pure delay completed
      this.logStep(execution, node, 'completed', { delayCompleted: true });
    }

    // If configured to wait for candidate reply to this follow-up message:
    if (node.config?.waitForReply) {
      execution.status = 'waiting_for_reply';
      const timeoutHours = node.config?.timeoutHours || 24;
      execution.waitingForReplyUntil = new Date(Date.now() + timeoutHours * 3600 * 1000);
      await execution.save();
      logger.info('Follow-up message sent, execution paused awaiting candidate reply', {
        executionId: execution._id.toString(),
        stepId: node.id
      });
      return;
    }

    await execution.save();

    if (node.nextStepId) {
      await this.advanceToStep(execution, node.nextStepId);
    }
  }
}

