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

/**
 * Extracts Google Spreadsheet ID from either a full URL or raw ID
 * e.g. https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFM.../edit -> 1BxiMVs0XRA5nFM...
 */
export function extractSpreadsheetId(urlOrId?: string): string | undefined {
  if (!urlOrId || !urlOrId.trim()) return undefined;
  const trimmed = urlOrId.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  if (!trimmed.includes('/') && trimmed.length >= 10) {
    return trimmed;
  }
  return trimmed;
}

export interface VerifyCandidateOptions extends IVerificationQuery {
  providerName?: string;
  spreadsheetUrl?: string;
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
    const targetSpreadsheetId = extractSpreadsheetId(options.spreadsheetUrl || options.spreadsheetId);
    const cacheKey = `verify:${provider.name}:${searchPhone}:${options.surveyId || 'any'}:${targetSpreadsheetId || 'default'}`;

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
      sheetName: options.sheetName,
      spreadsheetId: targetSpreadsheetId
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

  public static async appendRowToSheet(options: {
    sheetName?: string;
    rowValues: any[];
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    providerName?: string;
  }): Promise<{ success: boolean; rowNumber?: number }> {
    const provider = getVerificationProvider(options.providerName) as any;
    const targetSpreadsheetId = extractSpreadsheetId(options.spreadsheetUrl || options.spreadsheetId);
    if (typeof provider.appendRow === 'function') {
      return provider.appendRow(
        options.sheetName || 'Responses',
        options.rowValues,
        targetSpreadsheetId,
        options.spreadsheetUrl || options.spreadsheetId
      );
    }
    return { success: true };
  }

  public static async upsertRowToSheet(options: {
    sheetName?: string;
    mode?: 'append' | 'update' | 'upsert';
    lookupKey?: 'phone' | 'email' | 'surveyId';
    lookupValue?: string;
    columnUpdates: Array<{ sheetColumn: string; value: any }>;
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    providerName?: string;
  }): Promise<{ success: boolean; mode: 'appended' | 'updated' | 'not_found'; rowNumber?: number }> {
    const provider = getVerificationProvider(options.providerName) as any;
    const targetSpreadsheetId = extractSpreadsheetId(options.spreadsheetUrl || options.spreadsheetId);
    if (typeof provider.upsertRow === 'function') {
      return provider.upsertRow({
        sheetName: options.sheetName || 'Responses',
        mode: options.mode || 'upsert',
        lookupKey: options.lookupKey || 'phone',
        lookupValue: options.lookupValue,
        columnUpdates: options.columnUpdates,
        customSpreadsheetId: targetSpreadsheetId,
        rawUrl: options.spreadsheetUrl || options.spreadsheetId
      });
    }

    const rowValues = options.columnUpdates.map((c) => c.value);
    const appendRes = await this.appendRowToSheet({
      sheetName: options.sheetName,
      rowValues,
      spreadsheetId: targetSpreadsheetId,
      spreadsheetUrl: options.spreadsheetUrl,
      providerName: options.providerName
    });
    return { success: appendRes.success, mode: 'appended', rowNumber: appendRes.rowNumber };
  }
}

