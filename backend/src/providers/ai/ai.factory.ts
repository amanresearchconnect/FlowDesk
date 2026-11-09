import { IAIProvider } from './ai.interface.js';
import { MockAIProvider } from './mock-ai.provider.js';
import { GeminiAIProvider } from './gemini-ai.provider.js';
import { OpenAIAIProvider } from './openai-ai.provider.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

let aiProviderInstance: IAIProvider | null = null;

export function getAIProvider(): IAIProvider {
  if (aiProviderInstance) {
    return aiProviderInstance;
  }

  const providerType = env.AI_PROVIDER;

  switch (providerType) {
    case 'openai': {
      logger.info('Initializing OpenAI Provider', { model: env.AI_MODEL || 'gpt-4o-mini' });
      aiProviderInstance = new OpenAIAIProvider({
        apiKey: env.OPENAI_API_KEY,
        model: env.AI_MODEL && !env.AI_MODEL.startsWith('gemini') ? env.AI_MODEL : 'gpt-4o-mini'
      });
      break;
    }

    case 'gemini': {
      logger.info('Initializing Gemini AI Provider', { model: env.AI_MODEL });
      aiProviderInstance = new GeminiAIProvider({
        apiKey: env.GEMINI_API_KEY,
        model: env.AI_MODEL
      });
      break;
    }

    case 'mock':
    default: {
      if (env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim()) {
        logger.info('OPENAI_API_KEY detected; auto-initializing OpenAI Provider');
        aiProviderInstance = new OpenAIAIProvider({
          apiKey: env.OPENAI_API_KEY,
          model: env.AI_MODEL && !env.AI_MODEL.startsWith('gemini') ? env.AI_MODEL : 'gpt-4o-mini'
        });
        break;
      }
      if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim()) {
        logger.info('GEMINI_API_KEY detected; auto-initializing Gemini Provider');
        aiProviderInstance = new GeminiAIProvider({
          apiKey: env.GEMINI_API_KEY,
          model: env.AI_MODEL
        });
        break;
      }
      logger.info('Initializing Mock AI Provider for offline development / testing (zero API keys set)');
      aiProviderInstance = new MockAIProvider();
      break;
    }
  }

  return aiProviderInstance;
}

export function resetAIProvider(): void {
  aiProviderInstance = null;
}

