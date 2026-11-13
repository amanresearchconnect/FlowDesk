import { Types } from 'mongoose';
import { getAIProvider } from '../../providers/ai/ai.factory.js';
import { IAIChatMessage } from '../../providers/ai/ai.interface.js';
import { APPROVED_TOOLS, executeApprovedTool } from './ai-tools.js';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service.js';
import { Contact } from '../../models/contact.model.js';
import { Conversation } from '../../models/conversation.model.js';
import { Message } from '../../models/message.model.js';
import { Campaign } from '../../models/campaign.model.js';
import { WorkflowExecution } from '../../models/workflow-execution.model.js';
import { Workflow } from '../../models/workflow.model.js';
import { getMessagingProvider } from '../../providers/messaging/messaging.factory.js';
import { emitToConversation, emitToTeam } from '../../socket/socket.server.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

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

  /**
   * Semantic AI Intent Classifier for dynamic workflow progression
   * Evaluates natural language messages, colloquialisms, slang, and multilingual replies
   * against candidate workflow branches.
   */
  public static async classifyIntentForBranches(params: {
    stageName: string;
    stagePrompt?: string;
    candidateText: string;
    branches: Array<{
      targetStepId: string;
      conditionValue?: string;
    }>;
  }): Promise<{
    matched: boolean;
    targetStepId?: string;
    confidence: number;
    extractedVariables?: Record<string, any>;
  }> {
    const { stageName, stagePrompt, candidateText, branches } = params;

    if (!branches || branches.length === 0) {
      return { matched: false, confidence: 0 };
    }

    try {
      const aiProvider = getAIProvider();

      const branchDescriptions = branches
        .map((b, i) => `[Branch ${i + 1}] ID: "${b.targetStepId}", Intent/Condition: "${b.conditionValue || 'default'}"`)
        .join('\n');

      const systemPrompt = `You are a high-accuracy conversational intent classifier for an enterprise WhatsApp workflow engine.
Current Workflow Stage: "${stageName}"
Prompt/Question previously sent to user: "${stagePrompt || 'Awaiting customer response'}"

Available Workflow Branches:
${branchDescriptions}

User's incoming WhatsApp message:
"${candidateText}"

Analyze the user's message:
1. Is the user attempting to answer, confirm, agree, decline, or choose one of the available branches?
   (Support natural language, colloquialisms, slang, Hinglish/multilingual like "haan/nahi", abbreviations, and typos).
2. If yes, select the most appropriate Branch ID from the list above and assign a confidence score between 0.0 and 1.0.
3. If the user is asking an unrelated question, seeking company/role clarification, or their message does NOT clearly choose any branch, output "matched": false.
4. Extract any user-provided entities if present (e.g. name, email, phone, surveyId, paymentMethod, date).

Respond ONLY with valid JSON in this exact structure:
{
  "matched": true,
  "targetStepId": "<exact branch ID from above>",
  "confidence": 0.95,
  "extractedVariables": {
    "name": "<extracted or omit>",
    "email": "<extracted or omit>",
    "phone": "<extracted or omit>",
    "surveyId": "<extracted or omit>"
  }
}`;

      const res = await aiProvider.chat({
        messages: [{ role: 'user', content: systemPrompt }],
        temperature: 0.1,
        maxTokens: 250
      });

      const raw = res.content || '';
      const cleanJson = raw
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      const parsed = JSON.parse(cleanJson);

      const isValidBranch = branches.some((b) => b.targetStepId === parsed.targetStepId);

      if (parsed.matched && parsed.targetStepId && isValidBranch && (parsed.confidence || 0) >= 0.70) {
        return {
          matched: true,
          targetStepId: parsed.targetStepId,
          confidence: Number(parsed.confidence) || 0.85,
          extractedVariables: parsed.extractedVariables || {}
        };
      }

      return { matched: false, confidence: Number(parsed.confidence) || 0 };
    } catch (err: any) {
      logger.warn('AI intent branch classification encountered an error; falling back to deterministic matching', {
        error: err.message,
        candidateText: candidateText.substring(0, 50)
      });
      return { matched: false, confidence: 0 };
    }
  }

  /**
   * AI Form & Entity Extractor
   * Extracts multi-field structured data (e.g. 8 questionnaire answers, lead details, etc.)
   * from free-form natural language messages (English, Hindi, Hinglish, messy bullet points).
   */
  public static async extractEntities(params: {
    text: string;
    fields: Array<{ name: string; description?: string }> | string[];
    contextPrompt?: string;
  }): Promise<{
    entities: Record<string, any>;
    confidence: number;
    rawResponse?: string;
  }> {
    const { text, fields, contextPrompt } = params;

    if (!text || !text.trim() || !fields || fields.length === 0) {
      return { entities: {}, confidence: 0 };
    }

    const fieldList = fields.map((f) => (typeof f === 'string' ? { name: f.trim(), description: '' } : f));
    const fieldNames = fieldList.map((f) => f.name);

    try {
      const aiProvider = getAIProvider();

      const fieldDescriptions = fieldList
        .map((f) => `- "${f.name}"${f.description ? `: ${f.description}` : ''}`)
        .join('\n');

      const systemPrompt = `You are a high-accuracy multilingual Entity & Form Data Extractor for an enterprise WhatsApp business automation platform.
Your task is to extract structured values for the requested fields from a user's conversational WhatsApp reply.

Requested Fields to Extract:
${fieldDescriptions}

Original Question / Context presented to the user:
"${contextPrompt || 'Please provide your details'}"

User's incoming WhatsApp message:
"${text}"

Extraction Rules:
1. Extract answers corresponding to each requested field.
2. The user's reply may be in English, Hindi, or Hinglish (e.g. "haan", "nahi", "25 saal", "3 saal ka exp", "malad me rehta hu", "30 din notice").
3. Normalization:
   - For yes/no or boolean questions (e.g., "working", "Excel knowledge"): normalize to "Yes" or "No" if clearly affirmative/negative.
   - For numeric/currency/tenure fields: preserve relevant units (e.g., "3 years", "25", "4.5 LPA", "30 days", "Intermediate").
   - For location: extract the city/suburb/area (e.g. "Malad West", "Mumbai").
4. If a field was not mentioned, cannot be inferred, or the user declined to answer, set its value to "" (empty string). Do NOT hallucinate.
5. Return ONLY a single valid JSON object mapping each exact field name to its extracted string or value.

Output JSON structure:
{
${fieldNames.map((fn) => `  "${fn}": "<extracted value or \"\">"`).join(',\n')}
}`;

      const aiResponse = await aiProvider.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        temperature: 0.1
      });

      const raw = aiResponse.content || '';
      logger.debug('AI entity extraction raw response', { raw });

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const entities: Record<string, any> = {};
        for (const f of fieldList) {
          const directVal = parsed[f.name];
          if (directVal !== undefined && directVal !== null) {
            entities[f.name] = String(directVal).trim();
          } else {
            const foundKey = Object.keys(parsed).find(
              (k) => k.toLowerCase().replace(/[\s_-]/g, '') === f.name.toLowerCase().replace(/[\s_-]/g, '')
            );
            entities[f.name] = foundKey && parsed[foundKey] !== undefined ? String(parsed[foundKey]).trim() : '';
          }
        }

        return {
          entities,
          confidence: aiResponse.confidenceScore || 0.95,
          rawResponse: raw
        };
      }
    } catch (err: any) {
      logger.warn('AI entity extraction encountered error, falling back to heuristic parsing', { error: err.message });
    }

    // Heuristic Fallback if AI provider is offline or returns invalid JSON
    const fallbackEntities = this.heuristicEntityExtractor(text, fieldNames);
    return {
      entities: fallbackEntities,
      confidence: 0.7
    };
  }

  /**
   * Fast rule-based heuristic entity extractor fallback for common fields
   */
  public static heuristicEntityExtractor(text: string, fieldNames: string[]): Record<string, string> {
    const res: Record<string, string> = {};

    for (const rawName of fieldNames) {
      const name = rawName.toLowerCase();
      if (name.includes('work') || name.includes('employed')) {
        const isWorking = /\b(currently working|yes working|working|haan kaam|job kar)\b/i.test(text);
        const notWorking = /\b(not working|no working|unemployed|jobless|nahi|fresher)\b/i.test(text);
        res[rawName] = notWorking ? 'No' : isWorking ? 'Yes' : (/\byes\b/i.test(text) ? 'Yes' : '');
      } else if (name.includes('exp')) {
        const expMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?|saal)/i) || text.match(/(?:exp|experience)[:\s]*(\d+(?:\.\d+)?(?:\s*years?)?)/i);
        res[rawName] = expMatch ? (expMatch[1].includes('year') ? expMatch[1] : `${expMatch[1]} years`) : '';
      } else if (name.includes('age')) {
        const ageMatch = text.match(/(?:age|years old)[:\s]*(\d{2})/i) || text.match(/\b(\d{2})\s*(?:years? old|yr old|saal)\b/i);
        res[rawName] = ageMatch ? ageMatch[1] : '';
      } else if (name.includes('excel')) {
        const excelMatch =
          text.match(/(?:excel|ms excel)[:\s]*([a-zA-Z]+)/i) ||
          text.match(/\b(intermediate|basic|advanced|expert|yes|know|aata hai)\b.*excel/i) ||
          text.match(/excel.*?\b(intermediate|basic|advanced|expert|yes)\b/i);
        res[rawName] = excelMatch
          ? excelMatch[1]
            ? excelMatch[1].charAt(0).toUpperCase() + excelMatch[1].slice(1)
            : 'Yes'
          : text.toLowerCase().includes('excel')
          ? 'Yes'
          : '';
      } else if (name.includes('current ctc') || (name.includes('current') && name.includes('ctc'))) {
        const ctcMatch = text.match(/(?:current ctc|current|c\.?c\.?t\.?)[:\s]*(\d+(?:\.\d+)?\s*(?:lpa|k|lakhs?|lac|inr)?)/i);
        res[rawName] = ctcMatch ? ctcMatch[1].trim() : '';
      } else if (name.includes('expected ctc') || (name.includes('expected') && name.includes('ctc'))) {
        const expCtcMatch = text.match(/(?:expected ctc|expected|e\.?c\.?t\.?)[:\s]*(\d+(?:\.\d+)?\s*(?:lpa|k|lakhs?|lac|inr)?)/i);
        res[rawName] = expCtcMatch ? expCtcMatch[1].trim() : '';
      } else if (name.includes('location') || name.includes('residential') || name.includes('city') || name.includes('address')) {
        const locMatch = text.match(/(?:living in|location|staying in|resident of|from)[:\s]*([a-zA-Z\s]+?)(?:,|$|\.|\b\d+\s*days)/i);
        res[rawName] = locMatch ? locMatch[1].trim() : '';
      } else if (name.includes('notice')) {
        const noticeMatch = text.match(/(\d+)\s*(?:days?|months?|weeks?|din)\s*(?:notice)?/i) || text.match(/(?:notice period|notice)[:\s]*(\d+\s*(?:days?|months?|weeks?))/i);
        res[rawName] = noticeMatch ? (noticeMatch[0].includes('notice') ? noticeMatch[0] : `${noticeMatch[0]}`) : '';
      } else if (name.includes('phone') || name.includes('mobile')) {
        const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{10,13}\b/);
        res[rawName] = phoneMatch ? phoneMatch[0] : '';
      } else if (name.includes('email')) {
        const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        res[rawName] = emailMatch ? emailMatch[0] : '';
      } else {
        res[rawName] = '';
      }
    }
    return res;
  }

  /**
   * Generates a context-aware AI validation nudge when a candidate replies without providing the required
   * input (e.g. replies "Okay", asks "Who is this?", or enters text instead of a phone number/email/ID).
   */
  public static async generateValidationNudge(params: {
    candidateName?: string;
    missingField: 'phone' | 'email' | 'survey_id' | 'any';
    userReply: string;
    nodePrompt?: string;
  }): Promise<string> {
    const { candidateName, missingField, userReply, nodePrompt } = params;

    let fieldDescription = '10-digit phone number (e.g. 9876543210)';
    if (missingField === 'email') fieldDescription = 'valid email address (e.g. yourname@example.com)';
    if (missingField === 'survey_id') fieldDescription = 'Survey ID or verification code';
    if (missingField === 'any') fieldDescription = 'registered phone number or email address';

    const defaultNudge = candidateName
      ? `Hey ${candidateName}, could you please share your ${fieldDescription} so we can verify your details in our system?`
      : `Could you please share your ${fieldDescription} so we can verify your details in our system?`;

    try {
      const aiProvider = getAIProvider();
      const prompt = `You are a polite, helpful WhatsApp assistant for FlowDesk.
The user ${candidateName ? `(${candidateName})` : ''} was asked for their ${fieldDescription} in workflow stage "${nodePrompt || 'Verification'}".
The user replied: "${userReply}".
This reply does NOT contain their ${fieldDescription}.

Instructions:
1. If the user asked a question, expressed doubt, or asked who/what this is, provide a brief, polite, helpful 1-sentence answer.
2. Then politely ask them to reply with their ${fieldDescription} so we can verify their entry and proceed.
3. If they just said "ok", "yes", "hey", or something generic, acknowledge briefly and politely request their ${fieldDescription}.
4. Keep the entire response within 1-2 short, friendly sentences.
5. Do NOT include markdown asterisks (*), quotes, or hashtags.`;

      const res = await aiProvider.chat({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        maxTokens: 120
      });

      const reply = res.content?.trim();
      if (reply && reply.length > 5 && reply.length < 350) {
        return reply.replace(/[*#]/g, '');
      }
      return defaultNudge;
    } catch (err: any) {
      logger.warn('AI validation nudge generation failed; using standard prompt', { error: err.message });
      return defaultNudge;
    }
  }

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

    // 2. Retrieve relevant Knowledge Base context (scoped to active campaign if present)
    let scopedCollectionId: string | undefined;
    const targetCampaignId = conversation.activeCampaignId || (conversation as any).campaignId;
    if (targetCampaignId) {
      try {
        const campaign = await Campaign.findById(targetCampaignId);
        if (campaign?.knowledgeBaseId) {
          scopedCollectionId = campaign.knowledgeBaseId.toString();
        }
      } catch (err) {
        // ignore lookup error
      }
    }

    const kbArticles = await KnowledgeBaseService.searchRelevantArticles(
      text,
      undefined,
      4,
      scopedCollectionId
    );
    let kbContext = '';
    if (kbArticles.length > 0) {
      kbContext = kbArticles
        .map((art) => `[Title: ${art.title} (Category: ${art.category}${art.sourceFileName ? `, Source: ${art.sourceFileName}` : ''})]\n${art.content}`)
        .join('\n\n');
    }

    // 2b. Check if candidate is in an active workflow awaiting response
    let activeWorkflowQuestionNotice = '';
    try {
      const activeExec = await WorkflowExecution.findOne({
        contactId: contact._id,
        status: { $in: ['waiting_for_reply', 'running', 'delayed'] }
      });
      if (activeExec) {
        const wf = await Workflow.findById(activeExec.workflowId);
        const currNode = wf?.nodes.find((n) => n.id === activeExec.currentStepId);
        if (currNode) {
          const promptQuestion =
            currNode.config?.messageTemplate ||
            currNode.config?.body ||
            currNode.config?.prompt ||
            '';
          activeWorkflowQuestionNotice = `
<active_workflow_stage>
The contact is currently in an active recruitment/onboarding workflow.
${promptQuestion ? `The pending question they were asked is: "${promptQuestion}"` : ''}

CRITICAL INSTRUCTIONS:
1. First, answer the contact's side-question or query warmly, naturally, and concisely using the Knowledge Base above.
${promptQuestion ? `2. If natural and appropriate, gently mention that they can also reply to the earlier question whenever they are ready. Speak completely naturally like a friendly coordinator. NEVER use developer node names or robotic formulaic phrases like "By the way, to proceed:".` : ''}
DO NOT abort, complete, or cancel their progress in the workflow.
</active_workflow_stage>`;
        }
      }
    } catch (wfErr) {
      // ignore
    }

    // 3. Retrieve recent conversation history (last 8 messages)
    const recentMessages = await Message.find({ conversationId: conversation._id })
      .sort({ createdAt: -1 })
      .limit(8);

    recentMessages.reverse();

    // 4. Build System Prompt & Instructions
    const contactDisplayName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'User';
    const systemInstruction = `You are FlowDesk's AI Assistant for company operations, sales outreach, customer feedback surveys, and user support.
Your job is to assist contacts, leads, clients, survey participants, and candidates politely, clearly, and concisely.

Strict Boundaries:
- Only provide information confirmed by the Knowledge Base or approved tools below.
- Never guess or speculate regarding pricing, policies, deadlines, survey results, or requirements.
- If you cannot answer with high certainty or if a user seems distressed, call request_human_assistance.
- If the contact asks about survey verification, check verify_survey_completion.
- If the contact asks about service/job details or specifications, check get_job_details or use knowledge context.
- Contact Name: ${contactDisplayName}
- Contact Phone: ${contact.phone}

<knowledge_context>
${kbContext || 'No specific knowledge base articles found for this topic.'}
</knowledge_context>${activeWorkflowQuestionNotice}`;

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
      provider: env.MESSAGING_PROVIDER || 'mock',
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

