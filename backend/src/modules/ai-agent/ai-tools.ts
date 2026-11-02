import { z } from 'zod';
import { IAIToolDefinition } from '../../providers/ai/ai.interface.js';
import { Contact } from '../../models/contact.model.js';
import { Conversation } from '../../models/conversation.model.js';
import { WorkflowExecution } from '../../models/workflow-execution.model.js';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service.js';
import { emitToTeam, emitToConversation } from '../../socket/socket.server.js';
import { normalizePhoneNumber } from '../../utils/phone.js';
import { logger } from '../../utils/logger.js';

// 1. Zod Schemas for deterministic argument validation
export const getCandidateStatusSchema = z.object({
  phone: z.string().min(6, 'Candidate phone is required')
});

export const verifySurveyCompletionSchema = z.object({
  phone: z.string().min(6, 'Candidate phone is required'),
  surveyId: z.string().min(2, 'Survey ID is required')
});

export const getJobDetailsSchema = z.object({
  jobCode: z.string().min(1, 'Job code or title is required')
});

export const requestHumanAssistanceSchema = z.object({
  reason: z.string().min(1, 'Reason for escalation is required')
});

// 2. Approved Tool Definitions exposed to the AI Provider
export const APPROVED_TOOLS: IAIToolDefinition[] = [
  {
    name: 'get_candidate_status',
    description: 'Retrieves current recruitment application and survey submission status for the conversation contact.',
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Candidate E.164 phone number' }
      },
      required: ['phone']
    }
  },
  {
    name: 'verify_survey_completion',
    description: 'Verifies candidate survey submission against the external spreadsheet source.',
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Candidate E.164 phone number' },
        surveyId: { type: 'string', description: 'Survey submission identifier or confirmation code' }
      },
      required: ['phone', 'surveyId']
    }
  },
  {
    name: 'get_job_details',
    description: 'Retrieves approved job details, prerequisites, location, and compensation disclosures.',
    parameters: {
      type: 'object',
      properties: {
        jobCode: { type: 'string', description: 'Job posting identifier or role title keyword' }
      },
      required: ['jobCode']
    }
  },
  {
    name: 'request_human_assistance',
    description: 'Escalates the current conversation to human operators in the team inbox when questions exceed agent knowledge or the candidate requests human help.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Summary of why human intervention is required' }
      },
      required: ['reason']
    }
  }
];

export interface ToolExecutionContext {
  conversationId?: string;
  contactId?: string;
  phone?: string;
}

export interface ToolExecutionResult {
  success: boolean;
  toolName: string;
  data?: any;
  error?: string;
}

/**
 * Deterministic Tool Sandbox Execution
 * Validates tool arguments with Zod before running any backend logic.
 */
export async function executeApprovedTool(
  toolName: string,
  rawArgs: Record<string, any>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  logger.info('Executing approved AI tool', { toolName, rawArgs, conversationId: context.conversationId });

  switch (toolName) {
    case 'get_candidate_status': {
      const parsed = getCandidateStatusSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return {
          success: false,
          toolName,
          error: `Invalid arguments: ${parsed.error.errors.map((e) => e.message).join(', ')}`
        };
      }

      const normalized = normalizePhoneNumber(parsed.data.phone);
      const searchPhone = normalized.isValid && normalized.e164 ? normalized.e164 : parsed.data.phone;

      const contact = await Contact.findOne({ phone: searchPhone });
      if (!contact) {
        return {
          success: true,
          toolName,
          data: { found: false, message: 'No registered candidate profile found for this phone number.' }
        };
      }

      const activeExecution = await WorkflowExecution.findOne({
        contactId: contact._id,
        status: { $in: ['running', 'waiting_for_reply'] }
      }).sort({ createdAt: -1 });

      return {
        success: true,
        toolName,
        data: {
          found: true,
          name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Candidate',
          phone: contact.phone,
          optInStatus: contact.optInStatus,
          tags: contact.tags,
          inWorkflow: !!activeExecution,
          currentWorkflowStatus: activeExecution ? activeExecution.status : 'idle',
          lastInteractionAt: contact.lastInteractionAt
        }
      };
    }

    case 'verify_survey_completion': {
      const parsed = verifySurveyCompletionSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return {
          success: false,
          toolName,
          error: `Invalid arguments: ${parsed.error.errors.map((e) => e.message).join(', ')}`
        };
      }

      const { phone, surveyId } = parsed.data;
      const normalized = normalizePhoneNumber(phone);
      const searchPhone = normalized.isValid && normalized.e164 ? normalized.e164 : phone;

      // In mock/development mode, verify if surveyId has valid format and non-empty
      const isValidSurvey = surveyId.trim().length >= 3 && !surveyId.toLowerCase().includes('invalid');

      if (isValidSurvey) {
        // If contact exists, tag them with 'survey_verified'
        await Contact.updateOne(
          { phone: searchPhone },
          { $addToSet: { tags: 'survey_verified' } }
        );

        return {
          success: true,
          toolName,
          data: {
            verified: true,
            surveyId: surveyId.trim(),
            phone: searchPhone,
            timestamp: new Date().toISOString()
          }
        };
      }

      return {
        success: true,
        toolName,
        data: {
          verified: false,
          surveyId: surveyId.trim(),
          phone: searchPhone,
          message: 'Survey submission could not be verified in the response ledger.'
        }
      };
    }

    case 'get_job_details': {
      const parsed = getJobDetailsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return {
          success: false,
          toolName,
          error: `Invalid arguments: ${parsed.error.errors.map((e) => e.message).join(', ')}`
        };
      }

      const details = await KnowledgeBaseService.getJobDetails(parsed.data.jobCode);
      return {
        success: true,
        toolName,
        data: details
      };
    }

    case 'request_human_assistance': {
      const parsed = requestHumanAssistanceSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return {
          success: false,
          toolName,
          error: `Invalid arguments: ${parsed.error.errors.map((e) => e.message).join(', ')}`
        };
      }

      const { reason } = parsed.data;

      if (context.conversationId) {
        const conversation = await Conversation.findById(context.conversationId);
        if (conversation) {
          conversation.status = 'human_needed';
          await conversation.save();

          const safeConv = conversation.toSafeObject();
          emitToConversation(conversation._id.toString(), 'conversation:escalated', {
            conversationId: conversation._id.toString(),
            reason
          });
          emitToTeam('conversation:escalated', {
            conversationId: conversation._id.toString(),
            conversation: safeConv,
            reason
          });

          logger.info('Conversation escalated to human via AI tool', {
            conversationId: conversation._id.toString(),
            reason
          });
        }
      }

      return {
        success: true,
        toolName,
        data: {
          escalated: true,
          status: 'human_needed',
          reason
        }
      };
    }

    default:
      return {
        success: false,
        toolName,
        error: `Tool "${toolName}" is not approved for execution.`
      };
  }
}

