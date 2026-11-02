import { getVerificationProvider } from '../../providers/verification/verification.factory.js';
import {
  IVerificationQuery,
  IVerificationResult,
  IVerificationStatus
} from '../../providers/verification/verification.interface.js';
import { Contact } from '../../models/contact.model.js';
import { getRedisClient } from '../../config/redis.js';
import { normalizePhoneNumber } from '../../utils/phone.js';
import { logger } from '../../utils/logger.js';

export interface VerifyCandidateOptions extends IVerificationQuery {
  providerName?: string;
  skipCache?: boolean;
}

export class VerificationService {
  private static CACHE_TTL_SECONDS = 60;

  public static async verifyCandidateSubmission(
    options: VerifyCandidateOptions
  ): Promise<IVerificationResult> {
    const norm = normalizePhoneNumber(options.phone);
    const searchPhone = norm.isValid && norm.e164 ? norm.e164 : options.phone;
    const provider = getVerificationProvider(options.providerName);
    const cacheKey = `verify:${provider.name}:${searchPhone}:${options.surveyId || 'any'}`;

    // 1. Check Redis Cache
    if (!options.skipCache) {
      try {
        const redis = getRedisClient();
        const cached = await redis.get(cacheKey);
        if (cached) {
          logger.info('Verification cache hit from Redis', { cacheKey });
          const parsed = JSON.parse(cached) as IVerificationResult;
          if (parsed.verified) {
            await Contact.updateOne(
              { phone: searchPhone },
              { $addToSet: { tags: 'survey_verified' } }
            );
          }
          return {
            ...parsed,
            cached: true
          };
        }
      } catch (err: any) {
        logger.warn('Redis cache lookup failed, falling back to provider', {
          error: err.message
        });
      }
    }

    // 2. Query External Provider
    const result = await provider.verifySubmission({
      phone: searchPhone,
      surveyId: options.surveyId,
      sheetName: options.sheetName
    });

    // 3. Cache result in Redis for 60 seconds
    try {
      const redis = getRedisClient();
      await redis.setex(cacheKey, this.CACHE_TTL_SECONDS, JSON.stringify(result));
    } catch (err: any) {
      logger.warn('Failed to cache verification result in Redis', { error: err.message });
    }

    // 4. If verified, auto-tag Contact with 'survey_verified'
    if (result.verified) {
      await Contact.updateOne(
        { phone: searchPhone },
        { $addToSet: { tags: 'survey_verified' } }
      );
    }

    logger.info('Candidate verification evaluated', {
      phone: searchPhone,
      verified: result.verified,
      provider: provider.name
    });

    return {
      ...result,
      cached: false
    };
  }

  public static async testConnection(providerName?: string): Promise<IVerificationStatus> {
    const provider = getVerificationProvider(providerName);
    return provider.testConnection();
  }
}

