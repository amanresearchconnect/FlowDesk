import {
  IAIProvider,
  IAIChatOptions,
  IAIChatResponse,
  IAIChatMessage
} from './ai.interface.js';
import { logger } from '../../utils/logger.js';

export class MockAIProvider implements IAIProvider {
  public async chat(options: IAIChatOptions): Promise<IAIChatResponse> {
    const { messages, tools = [] } = options;
    const lastMessage = messages[messages.length - 1];

    logger.debug('MockAIProvider processing chat', {
      messageCount: messages.length,
      lastRole: lastMessage?.role
    });

    // 1. If previous message is a tool response, synthesize natural answer
    if (lastMessage?.role === 'tool') {
      return this.handleToolResultResponse(messages, lastMessage);
    }

    const userText = lastMessage?.content || '';
    const lowerText = userText.toLowerCase();

    // Check system message for context such as candidate phone or knowledge base
    const systemMsg = messages.find((m) => m.role === 'system')?.content || '';

    // Check if this is an intent classification request for workflow branches
    if (userText.includes('intent classifier for an enterprise WhatsApp workflow engine') || systemMsg.includes('intent classifier')) {
      const isAffirmative = ['yes', 'sure', 'interested', 'ready', 'haan', 'done', 'yup', 'okay', 'bhej', 'count me in', 'apply'].some((w) => lowerText.includes(w));
      const isNegative = ['no', 'nah', 'not interested', 'cancel', 'stop', 'remove', 'nahi', 'busy', 'decline'].some((w) => lowerText.includes(w));

      const branchMatches = [...userText.matchAll(/\[Branch \d+\] ID: "([^"]+)", Intent\/Condition: "([^"]+)"/g)];
      let matchedBranchId: string | null = null;
      if (isAffirmative && branchMatches[0]) {
        matchedBranchId = branchMatches[0][1];
      } else if (isNegative && branchMatches[1]) {
        matchedBranchId = branchMatches[1][1];
      }

      if (matchedBranchId) {
        return {
          content: JSON.stringify({
            matched: true,
            targetStepId: matchedBranchId,
            confidence: 0.95
          }),
          finishReason: 'stop'
        };
      }

      return {
        content: JSON.stringify({
          matched: false
        }),
        finishReason: 'stop'
      };
    }

    // Check if this is an Entity & Form Data Extractor request
    if (systemMsg.includes('Entity & Form Data Extractor') || userText.includes('Entity & Form Data Extractor')) {
      const fieldLines = [...systemMsg.matchAll(/- "([^"]+)"/g)].map((m) => m[1]);
      const res: Record<string, string> = {};
      for (const f of fieldLines) {
        const fn = f.toLowerCase();
        if (fn.includes('work')) res[f] = /working|yes|haan/i.test(userText) ? 'Yes' : 'No';
        else if (fn.includes('exp')) {
          const m = userText.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?|saal)/i);
          res[f] = m ? `${m[1]} years` : '3 years';
        } else if (fn.includes('age')) {
          const m = userText.match(/\b(\d{2})\b/);
          res[f] = m ? m[1] : '25';
        } else if (fn.includes('excel')) {
          res[f] = /intermediate|advanced|expert/i.test(userText) ? 'Intermediate' : 'Yes';
        } else if (fn.includes('current ctc') || (fn.includes('current') && fn.includes('ctc'))) {
          const m = userText.match(/(?:current\s*ctc|current)[:\s]*(\d+(?:\.\d+)?\s*(?:lpa|k|lakhs?)?)/i);
          res[f] = m ? m[1].trim() : '4.5 LPA';
        } else if (fn.includes('expected ctc') || (fn.includes('expected') && fn.includes('ctc'))) {
          const m = userText.match(/(?:expected\s*ctc|expected)[:\s]*(\d+(?:\.\d+)?\s*(?:lpa|k|lakhs?)?)/i);
          res[f] = m ? m[1].trim() : '6 LPA';
        } else if (fn.includes('location')) {
          res[f] = /malad/i.test(userText) ? 'Malad' : 'Mumbai';
        } else if (fn.includes('notice')) {
          const m = userText.match(/(\d+)\s*(?:days?|months?)/i);
          res[f] = m ? `${m[1]} days` : '30 days';
        } else {
          res[f] = '';
        }
      }

      return {
        content: JSON.stringify(res),
        confidenceScore: 0.95,
        finishReason: 'stop'
      };
    }

    const phoneMatch = systemMsg.match(/Candidate Phone:\s*(\+?\d+)/i) || userText.match(/(\+?\d{10,15})/);
    const candidatePhone = phoneMatch ? phoneMatch[1] : '+919876543210';

    // 2. Check for human escalation triggers
    const escalationKeywords = ['human', 'agent', 'operator', 'representative', 'help desk', 'person'];
    const wantsHuman = escalationKeywords.some((kw) => lowerText.includes(kw));

    if (wantsHuman) {
      const tool = tools.find((t) => t.name === 'request_human_assistance');
      if (tool) {
        return {
          finishReason: 'tool_calls',
          toolCalls: [
            {
              id: `call_${Date.now()}_human`,
              name: 'request_human_assistance',
              arguments: {
                reason: `Candidate requested human assistance: "${userText}"`
              }
            }
          ]
        };
      }
      return {
        content: 'I will connect you with a team member right away. An agent will be with you shortly.',
        confidenceScore: 0.9,
        finishReason: 'stop'
      };
    }

    // 3. Check for survey verification trigger
    const surveyIdMatch = userText.match(/SURV-[A-Z0-9_-]+/i) || userText.match(/survey\s*(?:id|code)?\s*(?:is|:)?\s*([A-Za-z0-9_-]{3,})/i);
    if (surveyIdMatch) {
      const surveyId = surveyIdMatch[1] || surveyIdMatch[0];
      const tool = tools.find((t) => t.name === 'verify_survey_completion');
      if (tool) {
        return {
          finishReason: 'tool_calls',
          toolCalls: [
            {
              id: `call_${Date.now()}_survey`,
              name: 'verify_survey_completion',
              arguments: {
                phone: candidatePhone,
                surveyId: surveyId.trim()
              }
            }
          ]
        };
      }
    }

    // 4. Check for candidate status lookup trigger
    if (lowerText.includes('status') || lowerText.includes('application') || lowerText.includes('submitted')) {
      const tool = tools.find((t) => t.name === 'get_candidate_status');
      if (tool) {
        return {
          finishReason: 'tool_calls',
          toolCalls: [
            {
              id: `call_${Date.now()}_status`,
              name: 'get_candidate_status',
              arguments: {
                phone: candidatePhone
              }
            }
          ]
        };
      }
    }

    // 5. Check Knowledge Base in system context before generic tool fallbacks
    if (systemMsg.includes('<knowledge_context>')) {
      const kbSection = systemMsg.split('<knowledge_context>')[1]?.split('</knowledge_context>')[0] || '';
      if (kbSection.trim() && !kbSection.includes('No specific knowledge base articles found')) {
        const queryWords = lowerText.split(/\s+/).filter((w) => w.length > 3);
        const matchFound = queryWords.some((w) => kbSection.toLowerCase().includes(w));
        if (matchFound) {
          const lines = kbSection
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith('[Title:'));
          const policyText = lines.join(' ') || kbSection.trim();
          return {
            content: `Based on company policy: ${policyText}`,
            confidenceScore: 0.95,
            finishReason: 'stop'
          };
        }
      }
    }

    // 6. Check for job details trigger
    if (lowerText.includes('job') || lowerText.includes('role') || lowerText.includes('salary') || lowerText.includes('hours') || lowerText.includes('timing')) {
      const tool = tools.find((t) => t.name === 'get_job_details');
      if (tool) {
        return {
          finishReason: 'tool_calls',
          toolCalls: [
            {
              id: `call_${Date.now()}_job`,
              name: 'get_job_details',
              arguments: {
                jobCode: 'general-inquiry'
              }
            }
          ]
        };
      }
    }

    // 7. Fallback response with confidence score
    if (lowerText.includes('unknown') || lowerText.includes('asdasd') || lowerText.length < 3) {
      return {
        content: "I'm sorry, I didn't quite catch that. Could you please rephrase or let me know if you would like to speak to an agent?",
        confidenceScore: 0.45,
        finishReason: 'stop'
      };
    }

    return {
      content: `Hello! I am FlowDesk's automated assistant. You asked: "${userText}". How can I help you today?`,
      confidenceScore: 0.85,
      finishReason: 'stop'
    };
  }

  private handleToolResultResponse(messages: IAIChatMessage[], toolMsg: IAIChatMessage): IAIChatResponse {
    let resultData: any = {};
    try {
      resultData = JSON.parse(toolMsg.content || '{}');
    } catch {
      resultData = { raw: toolMsg.content };
    }

    if (toolMsg.name === 'request_human_assistance') {
      return {
        content: 'I have notified our recruitment team. A human specialist has been assigned and will reply to you shortly.',
        confidenceScore: 1.0,
        finishReason: 'stop'
      };
    }

    if (toolMsg.name === 'verify_survey_completion') {
      if (resultData.verified) {
        return {
          content: `Great news! Your survey submission (${resultData.surveyId}) has been successfully verified. Thank you for completing it!`,
          confidenceScore: 0.98,
          finishReason: 'stop'
        };
      }
      return {
        content: `We checked survey ID ${resultData.surveyId}, but could not confirm completion yet. Please ensure you submitted the form or ask for an agent.`,
        confidenceScore: 0.75,
        finishReason: 'stop'
      };
    }

    if (toolMsg.name === 'get_candidate_status') {
      const optStatus = resultData.optInStatus || 'active';
      return {
        content: `Your application profile is currently ${optStatus}. We will contact you once the recruitment team completes reviewing your survey submission.`,
        confidenceScore: 0.95,
        finishReason: 'stop'
      };
    }

    if (toolMsg.name === 'get_job_details') {
      if (resultData.found) {
        return {
          content: `${resultData.title}: ${resultData.description}`,
          confidenceScore: 0.95,
          finishReason: 'stop'
        };
      }
      return {
        content: 'For this role, standard working hours are 9:00 AM to 6:00 PM, Monday through Friday.',
        confidenceScore: 0.85,
        finishReason: 'stop'
      };
    }

    return {
      content: `I processed your request: ${JSON.stringify(resultData)}`,
      confidenceScore: 0.9,
      finishReason: 'stop'
    };
  }
}

