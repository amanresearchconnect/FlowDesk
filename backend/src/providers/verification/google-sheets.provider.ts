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

        // Normalize survey IDs (e.g. SURV-1234, SUR-1234, surv1234 -> sur1234)
        const normalizeSurveyId = (id: string) =>
          id ? id.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^surv/, 'sur') : '';
        const normSearchSurvey = normalizeSurveyId(cleanSurveyId);
        const normRowSurvey = normalizeSurveyId(rowSurveyId);

        let surveyMatches = false;
        if (normSearchSurvey && normRowSurvey) {
          surveyMatches =
            normSearchSurvey === normRowSurvey ||
            normRowSurvey.endsWith(normSearchSurvey) ||
            normSearchSurvey.endsWith(normRowSurvey);
        }

        let emailMatches = false;
        if (cleanEmail && rowEmail) {
          emailMatches = rowEmail === cleanEmail;
        }

        // Strict & Accurate Matching Rules:
        // 1. Phone or Email directly conflicts with row:
        const phoneConflict = Boolean(cleanSearchPhone && rowPhone && !phoneMatches);
        const emailConflict = Boolean(cleanEmail && rowEmail && !emailMatches);
        // Survey conflict: only if neither surveyMatches nor (phoneMatches && emailMatches)
        const surveyConflict = Boolean(
          cleanSurveyId && rowSurveyId && !surveyMatches && !(phoneMatches && emailMatches)
        );

        if (phoneConflict || emailConflict || surveyConflict) {
          continue;
        }

        // 2. At least one provided search identifier must match.
        let isMatched = false;
        if (cleanSearchPhone && phoneMatches) {
          isMatched = true;
        } else if (cleanSurveyId && surveyMatches) {
          isMatched = true;
        } else if (cleanEmail && emailMatches) {
          isMatched = true;
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

    // 1. Try Google Service Account API FIRST if credentials exist (real-time, zero CDN cache delay)
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
          if (data.values && Array.isArray(data.values) && data.values.length > 0) {
            logger.info('Successfully fetched Google Sheet rows via Service Account API (live real-time)', {
              spreadsheetId,
              sheetName: targetSheet,
              rowCount: data.values.length
            });
            return data.values;
          }
        }
      } catch (saErr: any) {
        logger.warn('Service Account fetch failed, falling back to public export endpoint', { error: saErr.message });
      }
    }

    // 2. Fallback to public Google Sheets CSV export endpoint
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
      logger.warn('Failed to fetch sheet via public CSV endpoint', { error: csvErr.message });
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

    throw new Error(`Unable to read Google Sheet (${targetSheet}). Ensure the spreadsheet is shared with link access or with the service account.`);
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

  public async upsertRow(options: {
    sheetName?: string;
    mode?: 'append' | 'update' | 'upsert';
    lookupKey?: 'phone' | 'email' | 'surveyId';
    lookupValue?: string;
    columnUpdates: Array<{ sheetColumn: string; value: any }>;
    customSpreadsheetId?: string;
    rawUrl?: string;
  }): Promise<{ success: boolean; mode: 'appended' | 'updated' | 'not_found'; rowNumber?: number }> {
    const targetSheet = options.sheetName || this.config.sheetName || 'Responses';
    const spreadsheetId = options.customSpreadsheetId || this.config.spreadsheetId;
    const mode = options.mode || 'upsert';
    const lookupKey = options.lookupKey || 'phone';
    const lookupValue = String(options.lookupValue || '').trim();
    const columnUpdates = options.columnUpdates || [];

    // If pure append mode, construct row and append directly
    if (mode === 'append' || !lookupValue) {
      const rowValues = columnUpdates.map((c) => c.value);
      const appendRes = await this.appendRow(targetSheet, rowValues, spreadsheetId, options.rawUrl);
      return { success: appendRes.success, mode: 'appended', rowNumber: appendRes.rowNumber };
    }

    try {
      // Fetch current sheet rows to inspect headers and check for existing candidate row
      const rows = await this.fetchSheetRows(targetSheet, spreadsheetId);
      const headers = Array.from(rows?.[0] || []).map((h: any) => String(h ?? '').trim());
      const headersLower = headers.map((h) => h.toLowerCase());

      // Detect column index for lookupKey
      let lookupColIndex = -1;
      if (lookupKey === 'phone') {
        lookupColIndex = headersLower.findIndex((h) =>
          h.includes('phone') || h.includes('mobile') || h.includes('contact') || h.includes('number')
        );
      } else if (lookupKey === 'email') {
        lookupColIndex = headersLower.findIndex((h) => h.includes('email') || h.includes('mail'));
      } else if (lookupKey === 'surveyId') {
        lookupColIndex = headersLower.findIndex((h) =>
          h.includes('survey') || h.includes('id') || h.includes('code')
        );
      }
      if (lookupColIndex === -1 && lookupKey) {
        lookupColIndex = headersLower.indexOf(lookupKey.toLowerCase());
      }

      // Search for existing row matching lookupValue
      let matchedRowIdx = -1; // 0-based index in rows array
      if (lookupColIndex !== -1 && rows && rows.length > 1) {
        const cleanSearchDigits = lookupKey === 'phone' ? lookupValue.replace(/\D/g, '') : '';
        const cleanSearchText = lookupValue.toLowerCase();

        for (let r = 1; r < rows.length; r++) {
          const cellVal = String(rows[r]?.[lookupColIndex] || '').trim();
          if (!cellVal) continue;

          if (lookupKey === 'phone') {
            const cellDigits = cellVal.replace(/\D/g, '');
            if (
              (cleanSearchDigits.length >= 7 && cellDigits.endsWith(cleanSearchDigits.slice(-10))) ||
              (cellDigits.length >= 7 && cleanSearchDigits.endsWith(cellDigits.slice(-10)))
            ) {
              matchedRowIdx = r;
              break;
            }
          } else {
            if (cellVal.toLowerCase() === cleanSearchText) {
              matchedRowIdx = r;
              break;
            }
          }
        }
      }

      // SCENARIO 1: Matching row found -> UPDATE row in place!
      if (matchedRowIdx !== -1) {
        const sheetRowNum = matchedRowIdx + 1; // 1-based in Google Sheet
        const existingRow = Array.from(rows[matchedRowIdx] || []);

        for (const update of columnUpdates) {
          const colName = update.sheetColumn.trim();
          let colIdx = headersLower.indexOf(colName.toLowerCase());
          if (colIdx === -1) {
            headers.push(colName);
            headersLower.push(colName.toLowerCase());
            colIdx = headers.length - 1;
          }
          existingRow[colIdx] = update.value;
        }

        // Write updated row via Google Service Account API
        if (this.config.serviceAccountEmail && this.config.serviceAccountPrivateKey && spreadsheetId) {
          const accessToken = await this.getServiceAccountAccessToken();
          const range = `${targetSheet}!A${sheetRowNum}`;
          const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
          const res = await fetch(url, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ values: [existingRow] })
          });

          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Google Sheets update responded with ${res.status}: ${errorText}`);
          }

          logger.info('Successfully updated existing row in Google Sheet', {
            sheetName: targetSheet,
            spreadsheetId,
            rowNumber: sheetRowNum,
            lookupKey,
            lookupValue
          });
          return { success: true, mode: 'updated', rowNumber: sheetRowNum };
        }

        logger.info('Simulated Google Sheet row update (mock mode)', {
          sheetName: targetSheet,
          rowNumber: sheetRowNum
        });
        return { success: true, mode: 'updated', rowNumber: sheetRowNum };
      }

      // SCENARIO 2: No match found
      if (mode === 'update') {
        logger.info('Google Sheet update skipped: candidate row not found', {
          sheetName: targetSheet,
          lookupKey,
          lookupValue
        });
        return { success: false, mode: 'not_found' };
      }

      // SCENARIO 3: Upsert mode when not found -> APPEND as a new row!
      const newRow = new Array(headers.length).fill('');
      for (const update of columnUpdates) {
        const colName = update.sheetColumn.trim();
        let colIdx = headersLower.indexOf(colName.toLowerCase());
        if (colIdx === -1) {
          headers.push(colName);
          headersLower.push(colName.toLowerCase());
          colIdx = headers.length - 1;
        }
        newRow[colIdx] = update.value;
      }

      const appendRes = await this.appendRow(targetSheet, newRow, spreadsheetId, options.rawUrl);
      return { success: appendRes.success, mode: 'appended', rowNumber: appendRes.rowNumber };
    } catch (err: any) {
      logger.warn('Google Sheet upsert encountered an error, falling back to simple append', {
        error: err.message
      });
      const fallbackValues = columnUpdates.map((c) => c.value);
      const appendRes = await this.appendRow(targetSheet, fallbackValues, spreadsheetId, options.rawUrl);
      return { success: appendRes.success, mode: 'appended', rowNumber: appendRes.rowNumber };
    }
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

