import { IContact } from '../models/contact.model.js';

export function interpolateTemplate(
  template: string,
  contact: Partial<IContact>
): string {
  if (!template) return '';

  return template.replace(/\{\{([^{}]+)\}\}/g, (_match, key) => {
    const trimmed = key.trim();

    // Standard properties
    if (trimmed === 'firstName') return contact.firstName || '';
    if (trimmed === 'lastName') return contact.lastName || '';
    if (trimmed === 'phone') return contact.phone || '';
    if (trimmed === 'email') return contact.email || '';

    // Custom fields (e.g. {{customFields.roleApplied}} or {{roleApplied}})
    if (trimmed.startsWith('customFields.')) {
      const field = trimmed.replace('customFields.', '');
      return contact.customFields?.[field] ?? '';
    }

    if (contact.customFields && contact.customFields[trimmed] !== undefined) {
      return contact.customFields[trimmed];
    }

    return '';
  });
}
