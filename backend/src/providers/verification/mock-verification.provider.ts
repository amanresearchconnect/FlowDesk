import {
  IVerificationProvider,
  IVerificationQuery,
  IVerificationResult,
  IVerificationStatus
} from './verification.interface.js';
import { normalizePhoneNumber } from '../../utils/phone.js';
import { logger } from '../../utils/logger.js';

export interface MockRecord {
  phone: string;
  surveyId: string;
  submittedAt: string;
  rowValues?: Record<string, any>;
}

export class MockVerificationProvider implements IVerificationProvider {
  public name = 'mock';

  private records: MockRecord[] = [
    {
      phone: '+919876543210',
      surveyId: 'SURV-TECH-2026',
      submittedAt: '2026-11-01T10:00:00.000Z',
      rowValues: { candidateName: 'Rahul Sharma', score: 92, role: 'Node.js Developer' }
    },
    {
      phone: '+919876543211',
      surveyId: 'SURV-REACT-101',
      submittedAt: '2026-11-01T11:30:00.000Z',
      rowValues: { candidateName: 'Priya Verma', score: 88, role: 'React Developer' }
    }
  ];

  public seedRecord(record: MockRecord): void {
    const norm = normalizePhoneNumber(record.phone);
    const phone = norm.isValid && norm.e164 ? norm.e164 : record.phone;
    this.records.push({ ...record, phone });
  }

  public clearRecords(): void {
    this.records = [];
  }

  public async verifySubmission(query: IVerificationQuery): Promise<IVerificationResult> {
    const norm = normalizePhoneNumber(query.phone);
    const searchPhone = norm.isValid && norm.e164 ? norm.e164 : query.phone;

    logger.info('MockVerificationProvider verifying submission', {
      phone: searchPhone,
      surveyId: query.surveyId
    });

    // 1. Check in-memory seeded records
    const found = this.records.find((r) => {
      const phoneMatch = r.phone === searchPhone;
      if (!phoneMatch) return false;
      if (query.surveyId) {
        return r.surveyId.toLowerCase() === query.surveyId.trim().toLowerCase();
      }
      return true;
    });

    if (found) {
      return {
        verified: true,
        candidatePhone: searchPhone,
        surveyId: found.surveyId,
        submittedAt: found.submittedAt,
        rowValues: found.rowValues,
        provider: 'mock',
        cached: false
      };
    }

    // 2. Pattern-based dynamic mock verification
    // Any valid surveyId starting with SURV- (not marked invalid) is verified dynamically
    if (query.surveyId && query.surveyId.toUpperCase().startsWith('SURV-') && !query.surveyId.toLowerCase().includes('invalid')) {
      return {
        verified: true,
        candidatePhone: searchPhone,
        surveyId: query.surveyId.trim(),
        submittedAt: new Date().toISOString(),
        rowValues: { simulated: true, verifiedStatus: 'completed' },
        provider: 'mock',
        cached: false
      };
    }

    return {
      verified: false,
      candidatePhone: searchPhone,
      surveyId: query.surveyId,
      provider: 'mock',
      cached: false
    };
  }

  public async testConnection(): Promise<IVerificationStatus> {
    return {
      connected: true,
      provider: 'mock',
      details: {
        totalRowsDetected: this.records.length,
        mockMode: true,
        sheetTitle: 'Mock_Survey_Responses'
      }
    };
  }
}

export const mockVerificationProvider = new MockVerificationProvider();

