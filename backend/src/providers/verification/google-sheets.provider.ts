import {
  IVerificationProvider,
  IVerificationQuery,
  IVerificationResult,
  IVerificationStatus
} from './verification.interface.js';
import { normalizePhoneNumber } from '../../utils/phone.js';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  sheetName: string;
  apiKey?: string;
  serviceAccountEmail?: string;
  serviceAccountPrivateKey?: string;
  mockMode?: boolean;
}

export class GoogleSheetsVerificationProvider implements IVerificationProvider {
  public name = 'google_sheets';
  private config: GoogleSheetsConfig;

  constructor(config: GoogleSheetsConfig) {
    this.config = config;
  }

  public async verifySubmission(query: IVerificationQuery): Promise<IVerificationResult> {
    const norm = normalizePhoneNumber(query.phone);
    const searchPhone = norm.isValid && norm.e164 ? norm.e164 : query.phone;
    const sheetName = query.sheetName || this.config.sheetName || 'Responses';

    if (this.config.mockMode || !this.config.spreadsheetId) {
      logger.info('GoogleSheetsVerificationProvider running in mock/offline mode', {
        phone: searchPhone,
        surveyId: query.surveyId
      });

      // Pattern-based fallback in mock mode
      const isVerified = !!(query.surveyId && !query.surveyId.toLowerCase().includes('invalid'));
      return {
        verified: isVerified,
        candidatePhone: searchPhone,
        surveyId: query.surveyId,
        submittedAt: isVerified ? new Date().toISOString() : undefined,
        rowValues: isVerified ? { source: 'Google Sheets (Mock Mode)', sheetName } : undefined,
        provider: 'google_sheets',
        cached: false
      };
    }

    try {
      const rows = await this.fetchSheetRows(sheetName);
      if (!rows || rows.length < 2) {
        return {
          verified: false,
          candidatePhone: searchPhone,
          surveyId: query.surveyId,
          provider: 'google_sheets',
          cached: false
        };
      }

      const headers = rows[0].map((h: string) => h.toLowerCase().trim());
      const phoneIndex = headers.findIndex((h: string) =>
        h.includes('phone') || h.includes('mobile') || h.includes('contact') || h.includes('number')
      );
      const surveyIdIndex = headers.findIndex((h: string) =>
        h.includes('survey') || h.includes('submission') || h.includes('id') || h.includes('code')
      );
      const timestampIndex = headers.findIndex((h: string) =>
        h.includes('time') || h.includes('date') || h.includes('created')
      );

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rowPhone = phoneIndex !== -1 ? row[phoneIndex] : null;
        const rowSurveyId = surveyIdIndex !== -1 ? row[surveyIdIndex] : null;
        const rowTimestamp = timestampIndex !== -1 ? row[timestampIndex] : null;

        let phoneMatches = false;
        if (rowPhone) {
          const rowNorm = normalizePhoneNumber(String(rowPhone));
          if (rowNorm.isValid && rowNorm.e164 === searchPhone) {
            phoneMatches = true;
          } else if (String(rowPhone).replace(/\D/g, '') === searchPhone.replace(/\D/g, '')) {
            phoneMatches = true;
          }
        }

        let surveyMatches = true;
        if (query.surveyId && rowSurveyId) {
          surveyMatches = String(rowSurveyId).trim().toLowerCase() === query.surveyId.trim().toLowerCase();
        }

        if (phoneMatches && surveyMatches) {
          const rowData: Record<string, any> = {};
          headers.forEach((h: string, idx: number) => {
            rowData[h] = row[idx] || '';
          });

          return {
            verified: true,
            candidatePhone: searchPhone,
            surveyId: rowSurveyId ? String(rowSurveyId) : query.surveyId,
            submittedAt: rowTimestamp ? String(rowTimestamp) : new Date().toISOString(),
            rowValues: rowData,
            provider: 'google_sheets',
            cached: false
          };
        }
      }

      return {
        verified: false,
        candidatePhone: searchPhone,
        surveyId: query.surveyId,
        provider: 'google_sheets',
        cached: false
      };
    } catch (err: any) {
      logger.error('Failed to query Google Sheets', { error: err.message });
      throw new AppError(`Google Sheets lookup failed: ${err.message}`, 502, 'GOOGLE_SHEETS_ERROR');
    }
  }

  public async testConnection(): Promise<IVerificationStatus> {
    if (this.config.mockMode || !this.config.spreadsheetId) {
      return {
        connected: true,
        provider: 'google_sheets',
        details: {
          mockMode: true,
          spreadsheetId: this.config.spreadsheetId || 'mock-google-sheet-id',
          sheetName: this.config.sheetName || 'Responses',
          totalRowsDetected: 142
        }
      };
    }

    try {
      const rows = await this.fetchSheetRows(this.config.sheetName || 'Responses');
      return {
        connected: true,
        provider: 'google_sheets',
        details: {
          mockMode: false,
          spreadsheetId: this.config.spreadsheetId,
          sheetName: this.config.sheetName,
          totalRowsDetected: rows.length
        }
      };
    } catch (err: any) {
      return {
        connected: false,
        provider: 'google_sheets',
        details: {
          error: err.message,
          spreadsheetId: this.config.spreadsheetId
        }
      };
    }
  }

  private async fetchSheetRows(sheetName: string): Promise<string[][]> {
    const range = encodeURIComponent(`${sheetName}!A1:Z500`);
    let url = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.spreadsheetId}/values/${range}`;

    if (this.config.apiKey) {
      url += `?key=${this.config.apiKey}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Sheets API responded with status ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as any;
    return data.values || [];
  }
}

