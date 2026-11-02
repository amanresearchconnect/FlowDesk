import { describe, it, expect } from 'vitest';
import { normalizePhoneNumber } from '../../src/utils/phone.js';

describe('Phone Number Normalization Unit Tests', () => {
  it('should normalize standard 10-digit Indian numbers to E.164 with default IN', () => {
    const result = normalizePhoneNumber('9876543210', 'IN');
    expect(result.isValid).toBe(true);
    expect(result.e164).toBe('+919876543210');
    expect(result.country).toBe('IN');
  });

  it('should normalize Indian numbers with leading zero', () => {
    const result = normalizePhoneNumber('09876543210', 'IN');
    expect(result.isValid).toBe(true);
    expect(result.e164).toBe('+919876543210');
  });

  it('should normalize numbers already having +91 prefix and punctuation', () => {
    const result = normalizePhoneNumber('+91 (987) 654-3210', 'IN');
    expect(result.isValid).toBe(true);
    expect(result.e164).toBe('+919876543210');
  });

  it('should normalize international numbers like US numbers', () => {
    const result = normalizePhoneNumber('+1 (202) 555-0123');
    expect(result.isValid).toBe(true);
    expect(result.e164).toBe('+12025550123');
    expect(result.country).toBe('US');
  });

  it('should reject invalid numbers or alphabetic strings', () => {
    const resultAlpha = normalizePhoneNumber('not-a-number', 'IN');
    expect(resultAlpha.isValid).toBe(false);
    expect(resultAlpha.error).toBeDefined();

    const resultShort = normalizePhoneNumber('123', 'IN');
    expect(resultShort.isValid).toBe(false);

    const resultEmpty = normalizePhoneNumber('');
    expect(resultEmpty.isValid).toBe(false);
  });
});
