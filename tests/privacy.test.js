import { describe, it, expect } from 'vitest';
import { filterSensitiveData } from '../src/privacy.js';

describe('privacy filter', () => {
  it('redacts credit card numbers', () => {
    const input = 'Card number is 4532015112830366';
    expect(filterSensitiveData(input)).not.toContain('4532015112830366');
    expect(filterSensitiveData(input)).toContain('[CARD]');
  });

  it('redacts email addresses', () => {
    const input = 'Send to user@example.com please';
    expect(filterSensitiveData(input)).not.toContain('user@example.com');
    expect(filterSensitiveData(input)).toContain('[EMAIL]');
  });

  it('redacts API keys', () => {
    const input = 'Set sk-ant-api03-abcdefghijklmnop as the key';
    expect(filterSensitiveData(input)).not.toContain('sk-ant-api03');
    expect(filterSensitiveData(input)).toContain('[KEY]');
  });

  it('redacts IP addresses', () => {
    const input = 'Server at 192.168.1.100';
    expect(filterSensitiveData(input)).not.toContain('192.168.1.100');
    expect(filterSensitiveData(input)).toContain('[IP]');
  });

  it('redacts password assignments', () => {
    const input = 'password = "hunter2"';
    expect(filterSensitiveData(input)).toContain('[SECRET]');
  });

  it('preserves non-sensitive content', () => {
    const input = 'Refactor the UserService to use dependency injection';
    expect(filterSensitiveData(input)).toBe(input);
  });
});
