import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhoneNumber, isWhatsAppConfigured } from './whatsapp';

describe('normalizePhoneNumber', () => {
  it('accepts a 10-digit Mexican number and prepends 52', () => {
    assert.equal(normalizePhoneNumber('1234567890'), '521234567890');
  });

  it('accepts a number with country code (11+ digits)', () => {
    assert.equal(normalizePhoneNumber('521234567890'), '521234567890');
  });

  it('strips non-digit characters', () => {
    assert.equal(normalizePhoneNumber('+52 (123) 456-7890'), '521234567890');
  });

  it('accepts international numbers with 11-15 digits', () => {
    assert.equal(normalizePhoneNumber('12125551234'), '12125551234');
    assert.equal(normalizePhoneNumber('441234567890123'), '441234567890123');
  });

  it('throws for empty string', () => {
    assert.throws(() => normalizePhoneNumber(''), { message: /must contain digits/ });
  });

  it('throws for too-short numbers (less than 10 digits)', () => {
    assert.throws(() => normalizePhoneNumber('123456'), { message: /unexpected length/ });
  });

  it('throws for numbers with only non-digit characters', () => {
    assert.throws(() => normalizePhoneNumber('abc'), { message: /must contain digits/ });
  });
});

describe('isWhatsAppConfigured', () => {
  const originalEnv = { ...process.env };

  it('returns true when sender phone is set and enabled', () => {
    process.env.WHATSAPP_SENDER_PHONE = '526145139417';
    process.env.WHATSAPP_ENABLED = 'true';
    assert.equal(isWhatsAppConfigured(), true);
  });

  it('returns false when sender phone is missing', () => {
    delete process.env.WHATSAPP_SENDER_PHONE;
    process.env.WHATSAPP_ENABLED = 'true';
    assert.equal(isWhatsAppConfigured(), false);
  });

  it('returns false when explicitly disabled', () => {
    process.env.WHATSAPP_SENDER_PHONE = '526145139417';
    process.env.WHATSAPP_ENABLED = 'false';
    assert.equal(isWhatsAppConfigured(), false);
  });

  it('returns true when WHATSAPP_ENABLED is not set (defaults to true)', () => {
    delete process.env.WHATSAPP_ENABLED;
    process.env.WHATSAPP_SENDER_PHONE = '526145139417';
    assert.equal(isWhatsAppConfigured(), true);
  });

  // Restore env
  process.env = originalEnv;
});
