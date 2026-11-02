import { Types } from 'mongoose';
import { getAIProvider } from '../../providers/ai/ai.factory.js';
import { IAIChatMessage } from '../../providers/ai/ai.interface.js';
import { APPROVED_TOOLS, executeApprovedTool } from './ai-tools.js';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service.js';
import { Contact } from '../../models/contact.model.js';
import { Conversation } from '../../models/conversation.model.js';
import { Message } from '../../models/message.model.js';
import { getMessagingProvider } from '../../providers/messaging/messaging.factory.js';
import { emitToConversation, emitToTeam } from '../../socket/socket.server.js';
import { logger } from '../../utils/logger.js';

export interface HandleAIMessageParams {
  conversationId: string | Types.ObjectId;
  contactId: string | Types.ObjectId;
  text: string;
}

export interface HandleAIMessageResult {
  replyText?: string;
  escalated: boolean;
  confidenceScore?: number;
  toolCallsExecuted?: string[];
}

export class AIAgentService {
  /**
   * Deterministic human escalation keywords
   */
  private static ESCALATION_KEYWORDS = [
    'human',
    'agent',
    'representative',
    'help desk',
    'operator',
    'talk to someone',
    'real person'
  ];

  public static async handleCandidateMessage(
    params: HandleAIMessageParams
  ): Promise<HandleAIMessageResult> {
    const conversationId = params.conversationId.toString();
    const contactId = params.contactId.toString();
    const text = params.text.trim();

    logger.info('AIAgentService evaluating candidate message', {
      conversationId,
      contactId,
      textPreview: text.substring(0, 50)
    });

    const contact = await Contact.findById(contactId);
    if (!contact) {
      throw new Error(`Contact ${contactId} not found`);
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // 1. Fast-path check: explicit human request
    const lowerText = text.toLowerCase();
    const explicitlyRequestsHuman = this.ESCALATION_KEYWORDS.some((kw) =>
      lowerText.includes(kw)
    );

    if (explicitlyRequestsHuman) {
      await this.escalateConversation(
        conversation,
        contact,
        `Candidate explicitly requested human assistance: "${text}"`
      );

      const replyText =
        'I have notified our team. A human specialist has been assigned and will reply to you shortly.';
      await this.sendAIResponse(conversation, contact, replyText);

      return {
        replyText,
        escalated: true,
        confidenceScore: 1.0,
        toolCallsExecuted: ['request_human_assistance']
      };
    }

    // 2. Retrieve relevant Knowledge Base context
    const kbArticles = await KnowledgeBaseService.searchRelevantArticles(text, undefined, 4);
    let kbContext = '';
    if (kbArticles.length > 0) {
      kbContext = kbArticles
        .map((art) => `[Title: ${art.title} (Category: ${art.category})]\n${art.content}`)
        .join('\n\n');
    }

    // 3. Retrieve recent conversation history (last 8 messages)
    const recentMessages = await Message.find({ conversationId: conversation._id })
      .sort({ createdAt: -1 })
      .limit(8);

    recentMessages.reverse();

    // 4. Build System Prompt & Instructions
    const systemInstruction = `You are FlowDesk's AI Assistant for company recruitment and operations.
Your job is to assist candidates and survey participants politely, clearly, and concisely.

Strict Boundaries:
- Only provide information confirmed by the Knowledge Base or approved tools below.
- Never guess or speculate regarding application statuses, deadlines, or requirements.
- If you cannot answer with high certainty or if a candidate seems distressed, call request_human_assistance.
- If the candidate asks about survey verification, check verify_survey_completion.
- If the candidate asks about job hours or requirements, check get_job_details or use knowledge context.
- Candidate Name: ${contact.firstName || 'Candidate'} ${contact.lastName || ''}
- Candidate Phone: ${contact.phone}

<knowledge_context>
${kbContext || 'No specific knowledge base articles found for this topic.'}
</knowledge_context>`;

    const messages: IAIChatMessage[] = [{ role: 'system', content: systemInstruction }];

    for (const msg of recentMessages) {
      if (msg.senderType === 'contact') {
        messages.push({ role: 'user', content: msg.content?.body || '' });
      } else if (msg.senderType === 'ai' || msg.senderType === 'agent' || msg.senderType === 'system') {
        messages.push({ role: 'assistant', content: msg.content?.body || '' });
      }
    }

    // Ensure the current user message is in the stack
    const lastMsgInStack = messages[messages.length - 1];
    if (!lastMsgInStack || lastMsgInStack.role !== 'user' || lastMsgInStack.content !== text) {
      messages.push({ role: 'user', content: text });
    }

    // 5. Invoke AI Provider with Approved Tools in execution loop
    const aiProvider = getAIProvider();
    const toolCallsExecuted: string[] = [];
    const maxRounds = 3;
    let round = 0;
    let finalReply: string | undefined;
    let finalConfidence = 0.85;

    while (round < maxRounds) {
      round++;
      const response = await aiProvider.chat({
        messages,
        tools: APPROVED_TOOLS,
        temperature: 0.2
      });

      if (response.confidenceScore !== undefined) {
        finalConfidence = response.confidenceScore;
      }

      if (response.finishReason === 'tool_calls' && response.toolCalls && response.toolCalls.length > 0) {
        // AI proposed one or more tool calls
        for (const toolCall of response.toolCalls) {
          toolCallsExecuted.push(toolCall.name);

          // Append assistant tool proposal
          messages.push({
            role: 'assistant',
            toolCalls: [toolCall]
          });

          // Execute sandboxed tool with Zod validation
          const result = await executeApprovedTool(
            toolCall.name,
            toolCall.arguments,
            {
              conversationId,
              contactId,
              phone: contact.phone
            }
          );

          // Append tool execution response
          messages.push({
            role: 'tool',
            name: toolCall.name,
            toolCallId: toolCall.id,
            content: JSON.stringify(result.data || { error: result.error })
          });
        }
        // Continue loop to let AI digest tool output
        continue;
      }

      // Received normal text reply
      finalReply = response.content;
      break;
    }

    // 6. Check Confidence & Escalation Threshold
    if (finalConfidence < 0.60) {
      logger.warn('AI Agent confidence below threshold, escalating', {
        conversationId,
        finalConfidence
      });

      await this.escalateConversation(
        conversation,
        contact,
        `AI confidence score below threshold (${finalConfidence.toFixed(2)}) for query: "${text}"`
      );

      const replyText =
        'To make sure you get the most accurate information, I have forwarded our conversation to an HR specialist who will follow up with you directly.';
      await this.sendAIResponse(conversation, contact, replyText);

      return {
        replyText,
        escalated: true,
        confidenceScore: finalConfidence,
        toolCallsExecuted
      };
    }

    const reply = finalReply || 'Thank you for reaching out. An agent will be in touch if any further details are required.';
    await this.sendAIResponse(conversation, contact, reply);

    return {
      replyText: reply,
      escalated: conversation.status === 'human_needed',
      confidenceScore: finalConfidence,
      toolCallsExecuted
    };
  }

  private static async escalateConversation(
    conversation: any,
    contact: any,
    reason: string
  ): Promise<void> {
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

    logger.info('Conversation marked as human_needed', {
      conversationId: conversation._id.toString(),
      reason
    });
  }

  private static async sendAIResponse(
    conversation: any,
    contact: any,
    bodyText: string
  ): Promise<void> {
    const messagingProvider = getMessagingProvider();
    const sendResult = await messagingProvider.sendMessage(contact.phone, {
      text: bodyText
    });

    conversation.lastMessageAt = new Date();
    conversation.lastMessagePreview = bodyText.substring(0, 100);
    await conversation.save();

    const message = await Message.create({
      conversationId: conversation._id,
      contactId: contact._id,
      campaignId: conversation.activeCampaignId || null,
      direction: 'outbound',
      senderType: 'ai',
      provider: 'mock',
      providerMessageId: sendResult.providerMessageId,
      type: 'text',
      content: { body: bodyText },
      status: sendResult.status,
      sentAt: sendResult.timestamp
    });

    const safeMessage = message.toSafeObject();
    emitToConversation(conversation._id.toString(), 'message:received', safeMessage);
    emitToTeam('message:received', {
      conversationId: conversation._id.toString(),
      message: safeMessage,
      contact: contact.toSafeObject()
    });

    logger.info('AI automated reply dispatched', {
      conversationId: conversation._id.toString(),
      phone: contact.phone,
      textPreview: bodyText.substring(0, 50)
    });
  }
}

