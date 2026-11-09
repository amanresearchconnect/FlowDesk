import {
  IAIProvider,
  IAIChatOptions,
  IAIChatResponse,
  IAIChatMessage,
  IAIToolDefinition
} from './ai.interface.js';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';

export interface OpenAIConfig {
  apiKey: string;
  model?: string;
}

export class OpenAIAIProvider implements IAIProvider {
  private apiKey: string;
  private model: string;

  constructor(config: OpenAIConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'gpt-4o-mini';
  }

  public async chat(options: IAIChatOptions): Promise<IAIChatResponse> {
    if (!this.apiKey) {
      throw new AppError(
        'OpenAI API key is missing. Set OPENAI_API_KEY in environment variables.',
        500,
        'AI_CONFIG_ERROR'
      );
    }

    const endpoint = 'https://api.openai.com/v1/chat/completions';

    // Map messages to OpenAI Chat Completion format
    const formattedMessages = options.messages.map((m) => {
      const msg: Record<string, any> = {
        role: m.role,
        content: m.content || null
      };

      if (m.name) {
        msg.name = m.name;
      }

      if (m.toolCallId) {
        msg.tool_call_id = m.toolCallId;
      }

      if (m.toolCalls && m.toolCalls.length > 0) {
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments)
          }
        }));
      }

      return msg;
    });

    const payload: Record<string, any> = {
      model: this.model,
      messages: formattedMessages,
      temperature: options.temperature ?? 0.2
    };

    if (options.maxTokens) {
      payload.max_tokens = options.maxTokens;
    }

    if (options.tools && options.tools.length > 0) {
      payload.tools = options.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      }));
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('OpenAI API error response', { status: response.status, body: errorText });
        throw new AppError(
          `OpenAI API request failed with status ${response.status}: ${errorText}`,
          502,
          'OPENAI_API_ERROR'
        );
      }

      const data = (await response.json()) as any;
      const choice = data?.choices?.[0];

      if (!choice) {
        throw new AppError('OpenAI API returned no choices', 502, 'OPENAI_EMPTY_RESPONSE');
      }

      const msg = choice.message || {};
      const toolCalls: Array<{ id: string; name: string; arguments: Record<string, any> }> = [];

      if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          let parsedArgs: Record<string, any> = {};
          try {
            parsedArgs = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
          } catch {
            parsedArgs = { raw: tc.function.arguments };
          }

          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: parsedArgs
          });
        }
      }

      const finishReason = choice.finish_reason === 'tool_calls' ? 'tool_calls' : 'stop';

      return {
        content: msg.content || undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        confidenceScore: 0.92,
        finishReason
      };
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.error('Unexpected error calling OpenAI API', { error: err.message });
      throw new AppError(`OpenAI invocation error: ${err.message}`, 502, 'OPENAI_NETWORK_ERROR');
    }
  }
}

