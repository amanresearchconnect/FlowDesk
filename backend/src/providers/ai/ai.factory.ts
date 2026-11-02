import { IAIProvider } from './ai.interface.js';
import { MockAIProvider } from './mock-ai.provider.js';
import { GeminiAIProvider } from './gemini-ai.provider.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

let aiProviderInstance: IAIProvider | null = null;

export function getAIProvider(): IAIProvider {
  if (aiProviderInstance) {
    return aiProviderInstance;
  }

  const providerType = env.AI_PROVIDER;

  switch (providerType) {
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
      logger.info('Initializing Mock AI Provider for offline development / testing');
      aiProviderInstance = new MockAIProvider();
      break;
    }
  }

  return aiProviderInstance;
}

export function resetAIProvider(): void {
  aiProviderInstance = null;
}

