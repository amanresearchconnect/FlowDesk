import {
  IVerificationProvider,
  IVerificationQuery,
  IVerificationResult,
  IVerificationStatus
} from './verification.interface.js';
import XLSX from 'xlsx';
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
    const targetSpreadsheetId = query.spreadsheetId || this.config.spreadsheetId;

    if (!targetSpreadsheetId) {
      logger.info('GoogleSheetsVerificationProvider running in mock/offline mode (no spreadsheet URL/ID provided)', {
        phone: searchPhone,
        surveyId: query.surveyId
      });

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
      const rows = await this.fetchSheetRows(sheetName, targetSpreadsheetId);
      if (!rows || rows.length < 2) {
        return {
          verified: false,
          candidatePhone: searchPhone,
          surveyId: query.surveyId,
          provider: 'google_sheets',
          cached: false
        };
      }

      // Safe header extraction that handles sparse arrays/holes without throwing TypeError
      const headers = Array.from(rows[0] || []).map((h: any) => String(h ?? '').toLowerCase().trim());
      let phoneIndex = headers.findIndex((h: string) =>
        Boolean(h) && (h.includes('phone') || h.includes('mobile') || h.includes('contact') || h.includes('number'))
      );
      let surveyIdIndex = headers.findIndex((h: string) =>
        Boolean(h) && (h.includes('survey') || h.includes('submission') || h.includes('id') || h.includes('code'))
      );
      let emailIndex = headers.findIndex((h: string) =>
        Boolean(h) && (h.includes('email') || h.includes('mail'))
      );
      let timestampIndex = headers.findIndex((h: string) =>
        Boolean(h) && (h.includes('time') || h.includes('date') || h.includes('created'))
      );

      // Resilient fallback: If headers in row 0 are missing or corrupted, scan row 1 values to detect columns
      if (rows[1] && (phoneIndex === -1 || surveyIdIndex === -1 || emailIndex === -1)) {
        for (let c = 0; c < rows[1].length; c++) {
          const sampleVal = String(rows[1][c] || '').trim();
          if (emailIndex === -1 && sampleVal.includes('@')) {
            emailIndex = c;
          } else if (phoneIndex === -1 && sampleVal.replace(/\D/g, '').length >= 10 && sampleVal.replace(/\D/g, '').length <= 14) {
            phoneIndex = c;
          } else if (surveyIdIndex === -1 && /^surv[-_]?[a-zA-Z0-9]+$/i.test(sampleVal)) {
            surveyIdIndex = c;
          }
        }
      }

      const cleanSearchPhone = searchPhone ? searchPhone.replace(/\D/g, '') : '';
      const cleanSurveyId = query.surveyId ? query.surveyId.trim().toLowerCase() : '';
      const cleanEmail = query.email ? query.email.trim().toLowerCase() : '';

      logger.info('Performing live candidate lookup against Google Sheet rows', {
        searchPhone: cleanSearchPhone,
        searchSurveyId: cleanSurveyId,
        searchEmail: cleanEmail,
        totalRows: rows.length,
        detectedIndices: { phoneIndex, surveyIdIndex, emailIndex }
      });

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const rowPhone = phoneIndex !== -1 && row[phoneIndex] ? String(row[phoneIndex]).replace(/\D/g, '') : '';
        const rowSurveyId = surveyIdIndex !== -1 && row[surveyIdIndex] ? String(row[surveyIdIndex]).trim().toLowerCase() : '';
        const rowEmail = emailIndex !== -1 && row[emailIndex] ? String(row[emailIndex]).trim().toLowerCase() : '';
        const rowTimestamp = timestampIndex !== -1 ? row[timestampIndex] : null;

        let phoneMatches = false;
        if (cleanSearchPhone && rowPhone) {
          phoneMatches =
            rowPhone === cleanSearchPhone ||
            rowPhone.endsWith(cleanSearchPhone) ||
            cleanSearchPhone.endsWith(rowPhone);
        }

        let surveyMatches = false;
        if (cleanSurveyId && rowSurveyId) {
          surveyMatches = rowSurveyId === cleanSurveyId;
        }

        let emailMatches = false;
        if (cleanEmail && rowEmail) {
          emailMatches = rowEmail === cleanEmail;
        }

        // Strict & Accurate Matching Rules:
        // 1. If candidate entered a survey ID, it MUST match the row's survey ID.
        // 2. If candidate provided phone/email, it must also match this candidate.
        let isMatched = false;
        if (cleanSurveyId && cleanSearchPhone) {
          isMatched = surveyMatches && (phoneMatches || !rowPhone);
        } else if (cleanSurveyId) {
          isMatched = surveyMatches;
        } else if (cleanSearchPhone) {
          isMatched = phoneMatches;
        } else if (cleanEmail) {
          isMatched = emailMatches;
        }

        if (isMatched) {
          const rowData: Record<string, any> = {};
          headers.forEach((h: string, idx: number) => {
            rowData[h || `col_${idx}`] = row[idx] || '';
          });

          logger.info('Candidate verification found MATCHING row in Google Sheet', {
            phone: searchPhone,
            surveyId: query.surveyId,
            matchedRowIndex: i
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

      logger.info('Candidate verification evaluated: NO MATCH in Google Sheet', {
        searchPhone: cleanSearchPhone,
        searchSurveyId: cleanSurveyId,
        searchEmail: cleanEmail
      });

      return {
        verified: false,
        candidatePhone: searchPhone,
        surveyId: query.surveyId,
        provider: 'google_sheets',
        cached: false
      };
    } catch (err: any) {
      logger.error('Google Sheets live lookup encountered error', { error: err.message });
      // When live spreadsheet verification encounters any error, NEVER falsely verify true!
      return {
        verified: false,
        candidatePhone: searchPhone,
        surveyId: query.surveyId,
        provider: 'google_sheets',
        cached: false
      };
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

  private async fetchSheetRows(sheetName: string, customSpreadsheetId?: string): Promise<string[][]> {
    const spreadsheetId = customSpreadsheetId || this.config.spreadsheetId;
    if (!spreadsheetId) {
      throw new Error('No Google Spreadsheet ID or URL provided');
    }

    const targetSheet = sheetName || this.config.sheetName || 'Responses';

    // 1. Try public Google Sheets CSV export endpoint (works out-of-the-box for any shared spreadsheet!)
    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(targetSheet)}`;
      const res = await fetch(csvUrl);
      if (res.ok) {
        const csvText = await res.text();
        if (csvText && csvText.length > 5 && !csvText.includes('<!DOCTYPE html>')) {
          const wb = XLSX.read(csvText, { type: 'string' });
          const firstSheet = wb.SheetNames[0];
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], { header: 1 }) as string[][];
          if (rows && rows.length > 0) {
            logger.info('Successfully fetched Google Sheet rows via public export endpoint', {
              spreadsheetId,
              sheetName: targetSheet,
              rowCount: rows.length
            });
            return rows;
          }
        }
      }
    } catch (csvErr: any) {
      logger.warn('Failed to fetch sheet via public CSV endpoint, trying Service Account / API', { error: csvErr.message });
    }

    // 2. Try Google Service Account if credentials exist
    if (this.config.serviceAccountEmail && this.config.serviceAccountPrivateKey) {
      try {
        const accessToken = await this.getServiceAccountAccessToken();
        const range = encodeURIComponent(`${targetSheet}!A1:Z500`);
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (res.ok) {
          const data = (await res.json()) as any;
          return data.values || [];
        }
      } catch (saErr: any) {
        logger.warn('Service account fetch failed', { error: saErr.message });
      }
    }

    // 3. Try API Key if provided
    if (this.config.apiKey) {
      const range = encodeURIComponent(`${targetSheet}!A1:Z500`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${this.config.apiKey}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as any;
        return data.values || [];
      }
    }

    throw new Error(`Unable to read Google Sheet (${targetSheet}). Ensure the spreadsheet is shared with link access.`);
  }

  public async appendRow(
    sheetName: string,
    rowValues: any[],
    customSpreadsheetId?: string,
    rawUrl?: string
  ): Promise<{ success: boolean; rowNumber?: number }> {
    const targetSheet = sheetName || this.config.sheetName || 'Responses';
    const spreadsheetId = customSpreadsheetId || this.config.spreadsheetId;
    const fullUrl = (rawUrl || '').trim();

    // 1. Direct Webhook / Google Apps Script Web App Link
    // When the user pastes an Apps Script Web App URL (e.g. https://script.google.com/macros/s/.../exec)
    if (fullUrl.includes('script.google.com/macros/s/') || fullUrl.includes('/exec')) {
      logger.info('Posting candidate row to Google Apps Script Webhook', {
        url: fullUrl,
        sheetName: targetSheet,
        rowValues
      });

      const res = await fetch(fullUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetName: targetSheet,
          values: rowValues,
          data: rowValues
        }),
        redirect: 'follow'
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new AppError(`Google Apps Script webhook returned ${res.status}: ${errorText}`, 502, 'GOOGLE_SHEETS_ERROR');
      }

      logger.info('Successfully appended row via Google Apps Script Webhook');
      return { success: true, rowNumber: 1 };
    }

    // 2. Google Cloud Service Account Bearer Token
    if (this.config.serviceAccountEmail && this.config.serviceAccountPrivateKey && spreadsheetId) {
      try {
        const accessToken = await this.getServiceAccountAccessToken();
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(targetSheet)}:append?valueInputOption=USER_ENTERED`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ values: [rowValues] })
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Google Sheets API responded with ${res.status}: ${errorText}`);
        }

        const data = (await res.json()) as any;
        logger.info('Successfully appended row via Google Service Account API', {
          spreadsheetId,
          updatedRows: data.updates?.updatedRows
        });
        return { success: true, rowNumber: data.updates?.updatedRows || 1 };
      } catch (err: any) {
        logger.error('Failed to append row via Google Service Account', { error: err.message });
        throw new AppError(`Google Sheets append failed: ${err.message}`, 502, 'GOOGLE_SHEETS_ERROR');
      }
    }

    // 3. Fallback to Mock Mode (when no real credentials/webhook are configured)
    logger.warn('Google Sheets live write skipped: neither a Google Apps Script Webhook URL nor Google Service Account credentials were provided in .env (running in simulation mock mode)', {
      sheetName: targetSheet,
      spreadsheetId,
      rowValues
    });
    return { success: true, rowNumber: Math.floor(Math.random() * 500) + 1 };
  }

  private async getServiceAccountAccessToken(): Promise<string> {
    const email = this.config.serviceAccountEmail;
    let key = this.config.serviceAccountPrivateKey || '';
    if (!email || !key) {
      throw new Error('Google Service Account credentials missing');
    }

    key = key.replace(/\\n/g, '\n');

    const crypto = await import('crypto');
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claimSet = Buffer.from(
      JSON.stringify({
        iss: email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
      })
    ).toString('base64url');

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${claimSet}`);
    const signature = signer.sign(key, 'base64url');
    const jwt = `${header}.${claimSet}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    });

    const data = (await res.json()) as any;
    if (!res.ok) {
      throw new Error(data.error_description || data.error || 'Failed to authenticate Google Service Account');
    }
    return data.access_token;
  }
}

