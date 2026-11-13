import { IContact } from '../models/contact.model.js';

export function interpolateTemplate(
  template: string,
  contact: Partial<IContact> | Record<string, any>
): string {
  if (!template) return '';

  const obj = (contact || {}) as Record<string, any>;

  return template.replace(/\{\{([^{}]+)\}\}/g, (_match, key) => {
    const trimmed = key.trim();
    const lower = trimmed.toLowerCase();
    const normalizedKey = lower.replace(/[-_\s]/g, '');

    // 1. Direct match on top-level context (e.g. context['working'], context['current CTC'], etc.)
    if (obj[trimmed] !== undefined && obj[trimmed] !== null && obj[trimmed] !== '') {
      return String(obj[trimmed]);
    }

    // 2. Case-insensitive & normalized match on top-level context
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'customFields' || k === 'variables') continue;
      const kLower = k.toLowerCase();
      const kNorm = kLower.replace(/[-_\s]/g, '');
      if (kLower === lower || kNorm === normalizedKey) {
        if (v !== undefined && v !== null && v !== '') {
          return String(v);
        }
      }
    }

    // 3. Direct match in obj.variables if nested
    if (obj.variables && typeof obj.variables === 'object') {
      if (obj.variables[trimmed] !== undefined && obj.variables[trimmed] !== null && obj.variables[trimmed] !== '') {
        return String(obj.variables[trimmed]);
      }
      for (const [vk, vv] of Object.entries(obj.variables)) {
        const vkLower = vk.toLowerCase();
        const vkNorm = vkLower.replace(/[-_\s]/g, '');
        if (vkLower === lower || vkNorm === normalizedKey) {
          if (vv !== undefined && vv !== null && vv !== '') {
            return String(vv);
          }
        }
      }
    }

    // 4. Standard name variations ({{name}}, {{Name}}, {{fullName}}, {{firstName}}, {{1}})
    if (lower === 'name' || lower === 'fullname' || normalizedKey === 'candidate' || normalizedKey === 'contactname') {
      const customName = obj.customFields?.name || obj.customFields?.Name || obj.name;
      if (customName) return String(customName);
      const fullName = `${obj.firstName || ''} ${obj.lastName || ''}`.trim();
      return fullName || obj.firstName || '';
    }

    if (lower === 'firstname' || trimmed === '1') return obj.firstName || obj.name || '';
    if (lower === 'lastname') return obj.lastName || '';

    // Meta numeric parameter fallbacks ({{2}} = Role/Job Title, {{3}} = Interview Slot/Date)
    if (trimmed === '2') {
      return (
        obj['2'] ||
        obj.customFields?.['Job Title'] ||
        obj.customFields?.['jobTitle'] ||
        obj.customFields?.role ||
        obj.customFields?.position ||
        obj.jobTitle ||
        obj.role ||
        ''
      );
    }

    if (trimmed === '3') {
      return (
        obj['3'] ||
        obj.customFields?.['Interview Slot'] ||
        obj.customFields?.['interviewSlot'] ||
        obj.customFields?.slot ||
        obj.customFields?.date ||
        obj.interviewSlot ||
        ''
      );
    }

    // 5. Phone variations ({{Phone}}, {{phone}}, {{mobile}})
    if (lower === 'phone' || lower === 'mobile' || normalizedKey === 'phonenumber' || normalizedKey === 'candidatephone') {
      return (
        obj.candidatePhone ||
        obj.phone ||
        obj.customFields?.phone ||
        obj.customFields?.Phone ||
        obj.customFields?.mobile ||
        ''
      );
    }

    // 6. Email variations ({{Email}}, {{email}})
    if (lower === 'email' || normalizedKey === 'emailaddress' || normalizedKey === 'candidateemail') {
      return (
        obj.candidateEmail ||
        obj.email ||
        obj.customFields?.email ||
        obj.customFields?.Email ||
        ''
      );
    }

    // 7. Date/Time
    if (lower === 'now' || lower === 'date' || lower === 'timestamp' || lower === '$date' || lower === '$timestamp') {
      return obj['$timestamp'] || obj['$date'] || new Date().toISOString();
    }

    // 8. Custom fields with prefix (e.g. {{customFields.roleApplied}})
    if (trimmed.startsWith('customFields.')) {
      const field = trimmed.replace('customFields.', '');
      return obj.customFields?.[field] ?? '';
    }

    // 9. Direct match in customFields
    if (obj.customFields && obj.customFields[trimmed] !== undefined && obj.customFields[trimmed] !== null) {
      return String(obj.customFields[trimmed]);
    }

    // 10. Case-insensitive / normalized lookup in customFields (e.g. {{Survey-ID}} matches surveyId or survey_id)
    if (obj.customFields) {
      for (const [cfKey, cfVal] of Object.entries(obj.customFields)) {
        if (cfKey.toLowerCase() === lower || cfKey.toLowerCase().replace(/[-_\s]/g, '') === normalizedKey) {
          return String(cfVal ?? '');
        }
      }
    }

    return '';
  });
}

