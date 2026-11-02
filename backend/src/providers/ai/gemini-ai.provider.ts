import {
  IAIProvider,
  IAIChatOptions,
  IAIChatResponse,
  IAIChatMessage,
  IAIToolDefinition
} from './ai.interface.js';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

export class GeminiAIProvider implements IAIProvider {
  private apiKey: string;
  private model: string;

  constructor(config: GeminiConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'gemini-2.0-flash';
  }

  public async chat(options: IAIChatOptions): Promise<IAIChatResponse> {
    if (!this.apiKey) {
      throw new AppError('Gemini API key is missing. Set GEMINI_API_KEY in environment variables.', 500, 'AI_CONFIG_ERROR');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    // Extract system message if present
    const systemMessage = options.messages.find((m) => m.role === 'system');
    const conversationMessages = options.messages.filter((m) => m.role !== 'system');

    // Build payload
    const payload: Record<string, any> = {
      contents: this.mapMessagesToGemini(conversationMessages),
      generationConfig: {
        temperature: options.temperature ?? 0.3,
        maxOutputTokens: options.maxTokens ?? 1024
      }
    };

    if (systemMessage && systemMessage.content) {
      payload.systemInstruction = {
        parts: [{ text: systemMessage.content }]
      };
    }

    if (options.tools && options.tools.length > 0) {
      payload.tools = [
        {
          functionDeclarations: options.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters
          }))
        }
      ];
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Gemini API error response', { status: response.status, body: errorText });
        throw new AppError(`Gemini API request failed with status ${response.status}: ${errorText}`, 502, 'GEMINI_API_ERROR');
      }

      const data = (await response.json()) as any;
      const candidate = data?.candidates?.[0];

      if (!candidate) {
        throw new AppError('Gemini API returned no candidates', 502, 'GEMINI_EMPTY_RESPONSE');
      }

      const parts = candidate.content?.parts || [];
      const functionCalls: Array<{ id: string; name: string; arguments: Record<string, any> }> = [];
      let textContent = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.functionCall) {
          functionCalls.push({
            id: `gemini_call_${Date.now()}_${i}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args || {}
          });
        }
        if (part.text) {
          textContent += (textContent ? '\n' : '') + part.text;
        }
      }

      if (functionCalls.length > 0) {
        return {
          toolCalls: functionCalls,
          finishReason: 'tool_calls',
          confidenceScore: 0.95
        };
      }

      return {
        content: textContent,
        finishReason: 'stop',
        confidenceScore: 0.9
      };
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.error('Gemini API invocation error', { error: err.message });
      throw new AppError(`Failed to invoke Gemini AI: ${err.message}`, 500, 'AI_INVOCATION_ERROR');
    }
  }

  private mapMessagesToGemini(messages: IAIChatMessage[]): any[] {
    const contents: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content || '' }]
        });
      } else if (msg.role === 'assistant') {
        const parts: any[] = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.arguments
              }
            });
          }
        }
        contents.push({
          role: 'model',
          parts
        });
      } else if (msg.role === 'tool') {
        contents.push({
          role: 'function',
          parts: [
            {
              functionResponse: {
                name: msg.name || 'unknown_tool',
                response: {
                  content: msg.content || ''
                }
              }
            }
          ]
        });
      }
    }

    return contents;
  }
}

