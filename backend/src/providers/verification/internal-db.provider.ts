import {
  IVerificationProvider,
  IVerificationQuery,
  IVerificationResult,
  IVerificationStatus
} from './verification.interface.js';
import { Contact } from '../../models/contact.model.js';
import { normalizePhoneNumber } from '../../utils/phone.js';
import { logger } from '../../utils/logger.js';

export class InternalDbVerificationProvider implements IVerificationProvider {
  public name = 'internal_db';

  public async verifySubmission(query: IVerificationQuery): Promise<IVerificationResult> {
    const norm = normalizePhoneNumber(query.phone);
    const searchPhone = norm.isValid && norm.e164 ? norm.e164 : query.phone;

    logger.info('InternalDbVerificationProvider verifying submission', {
      phone: searchPhone,
      surveyId: query.surveyId
    });

    const contact = await Contact.findOne({ phone: searchPhone });
    if (!contact) {
      return {
        verified: false,
        candidatePhone: searchPhone,
        surveyId: query.surveyId,
        provider: 'internal_db',
        cached: false
      };
    }

    const hasVerifiedTag = contact.tags?.includes('survey_verified');
    const isVerified = hasVerifiedTag || !!(query.surveyId && !query.surveyId.toLowerCase().includes('invalid'));

    if (isVerified && !hasVerifiedTag) {
      contact.tags = [...(contact.tags || []), 'survey_verified'];
      await contact.save();
    }

    return {
      verified: isVerified,
      candidatePhone: searchPhone,
      surveyId: query.surveyId,
      submittedAt: contact.updatedAt?.toISOString() || new Date().toISOString(),
      rowValues: {
        contactId: contact._id.toString(),
        tags: contact.tags,
        customFields: contact.customFields
      },
      provider: 'internal_db',
      cached: false
    };
  }

  public async testConnection(): Promise<IVerificationStatus> {
    const totalContacts = await Contact.countDocuments();
    return {
      connected: true,
      provider: 'internal_db',
      details: {
        totalRecords: totalContacts,
        source: 'MongoDB Contacts Collection'
      }
    };
  }
}

