import { IContact } from '../models/contact.model.js';

export function interpolateTemplate(
  template: string,
  contact: Partial<IContact>
): string {
  if (!template) return '';

  return template.replace(/\{\{([^{}]+)\}\}/g, (_match, key) => {
    const trimmed = key.trim();
    const lower = trimmed.toLowerCase();
    const normalizedKey = lower.replace(/[-_\s]/g, '');

    // Standard name variations ({{name}}, {{Name}}, {{fullName}}, {{firstName}})
    if (lower === 'name' || lower === 'fullname' || normalizedKey === 'candidate' || normalizedKey === 'contactname') {
      const customName = contact.customFields?.name || contact.customFields?.Name;
      if (customName) return String(customName);
      const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
      return fullName || contact.firstName || '';
    }

    if (lower === 'firstname') return contact.firstName || '';
    if (lower === 'lastname') return contact.lastName || '';

    // Phone variations ({{Phone}}, {{phone}}, {{mobile}})
    if (lower === 'phone' || lower === 'mobile' || normalizedKey === 'phonenumber') {
      return (
        contact.customFields?.phone ||
        contact.customFields?.Phone ||
        contact.customFields?.mobile ||
        contact.phone ||
        ''
      );
    }

    // Email variations ({{Email}}, {{email}})
    if (lower === 'email' || normalizedKey === 'emailaddress') {
      return contact.customFields?.email || contact.customFields?.Email || contact.email || '';
    }

    // Date/Time
    if (lower === 'now' || lower === 'date' || lower === 'timestamp') {
      return new Date().toISOString();
    }

    // Custom fields with prefix (e.g. {{customFields.roleApplied}})
    if (trimmed.startsWith('customFields.')) {
      const field = trimmed.replace('customFields.', '');
      return contact.customFields?.[field] ?? '';
    }

    // Direct match in customFields
    if (contact.customFields && contact.customFields[trimmed] !== undefined) {
      return String(contact.customFields[trimmed]);
    }

    // Case-insensitive / normalized lookup in customFields (e.g. {{Survey-ID}} matches surveyId or survey_id)
    if (contact.customFields) {
      for (const [cfKey, cfVal] of Object.entries(contact.customFields)) {
        if (cfKey.toLowerCase() === lower || cfKey.toLowerCase().replace(/[-_\s]/g, '') === normalizedKey) {
          return String(cfVal ?? '');
        }
      }
    }

    return '';
  });
}

