import * as xlsx from 'xlsx';
import { ValidationError } from '../utils/errors.js';

export interface SpreadsheetPreview {
  totalRows: number;
  detectedHeaders: string[];
  sampleRows: Record<string, any>[];
}

export class SpreadsheetService {
  public static parseBuffer(buffer: Buffer): Array<Record<string, any>> {
    try {
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];

      if (!sheetName) {
        throw new ValidationError('Uploaded file contains no worksheets');
      }

      const worksheet = workbook.Sheets[sheetName];
      // Convert worksheet to array of objects with empty strings for missing cells
      const rawRows = xlsx.utils.sheet_to_json<Record<string, any>>(worksheet, {
        defval: '',
        raw: false // formats dates/numbers as strings for consistent preview
      });

      if (!rawRows || rawRows.length === 0) {
        throw new ValidationError('Uploaded spreadsheet contains no data rows');
      }

      return rawRows;
    } catch (err: any) {
      if (err instanceof ValidationError) throw err;
      throw new ValidationError(`Failed to parse spreadsheet: ${err.message}`);
    }
  }

  public static getPreview(buffer: Buffer): SpreadsheetPreview {
    const rows = this.parseBuffer(buffer);
    const headersSet = new Set<string>();

    // Collect all unique column headers across the first 10 rows
    const sampleLimit = Math.min(rows.length, 5);
    const inspectLimit = Math.min(rows.length, 10);

    for (let i = 0; i < inspectLimit; i++) {
      Object.keys(rows[i]).forEach((header) => {
        if (header.trim()) {
          headersSet.add(header.trim());
        }
      });
    }

    const detectedHeaders = Array.from(headersSet);
    const sampleRows = rows.slice(0, sampleLimit);

    return {
      totalRows: rows.length,
      detectedHeaders,
      sampleRows
    };
  }
}
