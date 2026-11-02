import {
  IVerificationProvider,
  IVerificationQuery,
  IVerificationResult,
  IVerificationStatus
} from './verification.interface.js';
import { normalizePhoneNumber } from '../../utils/phone.js';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';

export interface MicrosoftGraphConfig {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  driveId?: string;
  workbookItemId?: string;
  worksheetName?: string;
  mockMode?: boolean;
}

export class MicrosoftGraphVerificationProvider implements IVerificationProvider {
  public name = 'microsoft_graph';
  private config: MicrosoftGraphConfig;

  constructor(config: MicrosoftGraphConfig) {
    this.config = config;
  }

  public async verifySubmission(query: IVerificationQuery): Promise<IVerificationResult> {
    const norm = normalizePhoneNumber(query.phone);
    const searchPhone = norm.isValid && norm.e164 ? norm.e164 : query.phone;
    const worksheetName = query.sheetName || this.config.worksheetName || 'Responses';

    if (this.config.mockMode || !this.config.clientId || !this.config.tenantId) {
      logger.info('MicrosoftGraphVerificationProvider running in mock/offline mode', {
        phone: searchPhone,
        surveyId: query.surveyId
      });

      const isVerified = !!(query.surveyId && !query.surveyId.toLowerCase().includes('invalid'));
      return {
        verified: isVerified,
        candidatePhone: searchPhone,
        surveyId: query.surveyId,
        submittedAt: isVerified ? new Date().toISOString() : undefined,
        rowValues: isVerified
          ? { source: 'Microsoft Excel Online (Mock Mode)', worksheetName }
          : undefined,
        provider: 'microsoft_graph',
        cached: false
      };
    }

    try {
      const accessToken = await this.getAccessToken();
      const rows = await this.fetchUsedRange(accessToken, worksheetName);

      if (!rows || rows.length < 2) {
        return {
          verified: false,
          candidatePhone: searchPhone,
          surveyId: query.surveyId,
          provider: 'microsoft_graph',
          cached: false
        };
      }

      const headers = rows[0].map((h: any) => String(h).toLowerCase().trim());
      const phoneIndex = headers.findIndex((h: string) =>
        h.includes('phone') || h.includes('mobile') || h.includes('contact')
      );
      const surveyIdIndex = headers.findIndex((h: string) =>
        h.includes('survey') || h.includes('submission') || h.includes('id')
      );
      const timestampIndex = headers.findIndex((h: string) =>
        h.includes('time') || h.includes('date')
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
            provider: 'microsoft_graph',
            cached: false
          };
        }
      }

      return {
        verified: false,
        candidatePhone: searchPhone,
        surveyId: query.surveyId,
        provider: 'microsoft_graph',
        cached: false
      };
    } catch (err: any) {
      logger.error('Failed to query Microsoft Graph API', { error: err.message });
      throw new AppError(`Microsoft Graph lookup failed: ${err.message}`, 502, 'MS_GRAPH_ERROR');
    }
  }

  public async testConnection(): Promise<IVerificationStatus> {
    if (this.config.mockMode || !this.config.clientId || !this.config.tenantId) {
      return {
        connected: true,
        provider: 'microsoft_graph',
        details: {
          mockMode: true,
          workbookName: 'Recruitment_Surveys_2026.xlsx',
          worksheetName: this.config.worksheetName || 'Responses',
          totalRowsDetected: 1420
        }
      };
    }

    try {
      const accessToken = await this.getAccessToken();
      const rows = await this.fetchUsedRange(accessToken, this.config.worksheetName || 'Responses');

      return {
        connected: true,
        provider: 'microsoft_graph',
        details: {
          mockMode: false,
          driveId: this.config.driveId,
          workbookItemId: this.config.workbookItemId,
          worksheetName: this.config.worksheetName,
          totalRowsDetected: rows.length
        }
      };
    } catch (err: any) {
      return {
        connected: false,
        provider: 'microsoft_graph',
        details: {
          error: err.message,
          clientId: this.config.clientId
        }
      };
    }
  }

  private async getAccessToken(): Promise<string> {
    const tokenUrl = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams();
    params.append('client_id', this.config.clientId || '');
    params.append('client_secret', this.config.clientSecret || '');
    params.append('grant_type', 'client_credentials');
    params.append('scope', 'https://graph.microsoft.com/.default');

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to obtain Microsoft Graph token: ${err}`);
    }

    const data = (await res.json()) as any;
    return data.access_token;
  }

  private async fetchUsedRange(accessToken: string, worksheetName: string): Promise<any[][]> {
    const url = `https://graph.microsoft.com/v1.0/drives/${this.config.driveId}/items/${this.config.workbookItemId}/workbook/worksheets/${encodeURIComponent(worksheetName)}/usedRange`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Microsoft Graph API error (${res.status}): ${err}`);
    }

    const data = (await res.json()) as any;
    return data.values || [];
  }
}

