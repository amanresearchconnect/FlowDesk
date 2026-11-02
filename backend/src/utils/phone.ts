import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js';

export interface PhoneNormalizationResult {
  isValid: boolean;
  e164?: string;
  country?: string;
  error?: string;
}

export function normalizePhoneNumber(
  rawPhone: string | number | null | undefined,
  defaultCountry: string = 'IN'
): PhoneNormalizationResult {
  if (rawPhone === null || rawPhone === undefined) {
    return { isValid: false, error: 'Phone number cannot be empty' };
  }

  const phoneStr = String(rawPhone).trim();
  if (!phoneStr) {
    return { isValid: false, error: 'Phone number cannot be empty' };
  }

  // Sanitize common noise (spaces, parentheses, dashes, dots)
  const cleaned = phoneStr.replace(/[\s\-().]/g, '');

  try {
    // Attempt parse with provided country code or international format
    const parsed = parsePhoneNumberFromString(
      cleaned,
      defaultCountry.toUpperCase() as CountryCode
    );

    if (!parsed || !parsed.isValid()) {
      return {
        isValid: false,
        error: `Invalid phone number format for '${phoneStr}'`
      };
    }

    return {
      isValid: true,
      e164: parsed.number, // Always formatted in E.164 (e.g. +919876543210)
      country: parsed.country
    };
  } catch (err: any) {
    return {
      isValid: false,
      error: err.message || 'Error parsing phone number'
    };
  }
}

