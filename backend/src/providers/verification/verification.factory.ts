import { IVerificationProvider } from './verification.interface.js';
import { mockVerificationProvider } from './mock-verification.provider.js';
import { GoogleSheetsVerificationProvider } from './google-sheets.provider.js';
import { MicrosoftGraphVerificationProvider } from './microsoft-graph.provider.js';
import { InternalDbVerificationProvider } from './internal-db.provider.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

let verificationProviderInstance: IVerificationProvider | null = null;

export function getVerificationProvider(forceProvider?: string): IVerificationProvider {
  if (forceProvider) {
    return createProviderByName(forceProvider);
  }

  if (verificationProviderInstance) {
    return verificationProviderInstance;
  }

  const providerType = env.VERIFICATION_PROVIDER;
  verificationProviderInstance = createProviderByName(providerType);
  return verificationProviderInstance;
}

function createProviderByName(name: string): IVerificationProvider {
  switch (name) {
    case 'google_sheets': {
      logger.info('Initializing Google Sheets Verification Provider');
      return new GoogleSheetsVerificationProvider({
        spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
        sheetName: env.GOOGLE_SHEETS_SHEET_NAME,
        apiKey: env.GOOGLE_API_KEY,
        serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        serviceAccountPrivateKey: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
        mockMode: env.VERIFICATION_MOCK_MODE
      });
    }

    case 'microsoft_graph': {
      logger.info('Initializing Microsoft Graph Verification Provider');
      return new MicrosoftGraphVerificationProvider({
        tenantId: env.MS_GRAPH_TENANT_ID,
        clientId: env.MS_GRAPH_CLIENT_ID,
        clientSecret: env.MS_GRAPH_CLIENT_SECRET,
        driveId: env.MS_GRAPH_DRIVE_ID,
        workbookItemId: env.MS_GRAPH_WORKBOOK_ITEM_ID,
        worksheetName: env.MS_GRAPH_WORKSHEET_NAME,
        mockMode: env.MS_GRAPH_MOCK_MODE
      });
    }

    case 'internal_db': {
      logger.info('Initializing Internal DB Verification Provider');
      return new InternalDbVerificationProvider();
    }

    case 'mock':
    default: {
      logger.info('Initializing Mock Verification Provider for offline testing');
      return mockVerificationProvider;
    }
  }
}

export function resetVerificationProvider(): void {
  verificationProviderInstance = null;
}

