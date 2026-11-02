export interface IVerificationQuery {
  phone: string;
  surveyId?: string;
  sheetName?: string;
}

export interface IVerificationResult {
  verified: boolean;
  candidatePhone: string;
  surveyId?: string;
  submittedAt?: string;
  rowValues?: Record<string, any>;
  provider: string;
  cached?: boolean;
}

export interface IVerificationStatus {
  connected: boolean;
  provider: string;
  details: Record<string, any>;
}

export interface IVerificationProvider {
  name: string;
  verifySubmission(query: IVerificationQuery): Promise<IVerificationResult>;
  testConnection(): Promise<IVerificationStatus>;
}

