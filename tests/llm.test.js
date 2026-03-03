import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { resolveProvider, loadConfig } from '../src/llm.js';

const TEST_DIR = '/tmp/your-taste-test-llm';

// Save and restore env vars to avoid pollution between tests
const savedEnv = {};
const PROVIDER_KEYS = [
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY',
  'GEMINI_API_KEY', 'GROQ_API_KEY', 'MISTRAL_API_KEY', 'OPENROUTER_API_KEY',
];

function clearProviderEnv() {
  for (const key of PROVIDER_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
}

function restoreProviderEnv() {
  for (const key of PROVIDER_KEYS) {
    if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key];
    else delete process.env[key];
  }
}

describe('resolveProvider', () => {
  beforeEach(() => clearProviderEnv());
  afterEach(() => restoreProviderEnv());

  it('returns null when no config and no env vars', () => {
    expect(resolveProvider()).toBeNull();
  });

  it('detects ANTHROPIC_API_KEY first', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.OPENAI_API_KEY = 'sk-openai-test';
    const p = resolveProvider();
    expect(p.id).toBe('anthropic');
    expect(p.apiKey).toBe('sk-ant-test');
    expect(p.apiFormat).toBe('anthropic-messages');
  });

  it('falls through to next available env var', () => {
    process.env.DEEPSEEK_API_KEY = 'sk-ds-test';
    const p = resolveProvider();
    expect(p.id).toBe('deepseek');
    expect(p.model).toBe('deepseek-chat');
    expect(p.baseUrl).toContain('deepseek.com');
  });

  it('config provider overrides env detection', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const p = resolveProvider({ provider: 'groq', apiKey: 'gsk-test' });
    expect(p.id).toBe('groq');
    expect(p.apiKey).toBe('gsk-test');
  });

  it('config model overrides default', () => {
    const p = resolveProvider({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o' });
    expect(p.model).toBe('gpt-4o');
  });

  it('config baseUrl overrides default', () => {
    const p = resolveProvider({ provider: 'openai', apiKey: 'sk-test', baseUrl: 'https://proxy.example.com/v1' });
    expect(p.baseUrl).toBe('https://proxy.example.com/v1');
  });

  it('config provider reads env var for API key when not in config', () => {
    process.env.GROQ_API_KEY = 'gsk-env';
    const p = resolveProvider({ provider: 'groq' });
    expect(p.apiKey).toBe('gsk-env');
  });

  it('returns null for unknown provider in config', () => {
    const p = resolveProvider({ provider: 'nonexistent' });
    expect(p).toBeNull();
  });

  it('claude-cli-proxy uses localhost:3456 with no API key', () => {
    const p = resolveProvider({ provider: 'claude-cli-proxy' });
    expect(p.id).toBe('claude-cli-proxy');
    expect(p.apiKey).toBeNull();
    expect(p.baseUrl).toBe('http://localhost:3456/v1');
    expect(p.model).toBe('claude-sonnet-4');
  });

  it('ollama has no API key and null envKey', () => {
    const p = resolveProvider({ provider: 'ollama' });
    expect(p.id).toBe('ollama');
    expect(p.apiKey).toBeNull();
    expect(p.baseUrl).toContain('localhost:11434');
  });

  it('ollama is not auto-detected (no env key)', () => {
    // No env vars set — should not pick up ollama
    expect(resolveProvider()).toBeNull();
  });

  it('detection follows priority order', () => {
    process.env.GROQ_API_KEY = 'gsk-test';
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    const p = resolveProvider();
    expect(p.id).toBe('groq'); // groq before openrouter
  });
});

describe('loadConfig', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    process.env.YOUR_TASTE_DIR = TEST_DIR;
  });

  afterEach(async () => {
    delete process.env.YOUR_TASTE_DIR;
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('returns null when config file missing', async () => {
    expect(await loadConfig()).toBeNull();
  });

  it('parses valid yaml config', async () => {
    await writeFile(`${TEST_DIR}/config.yaml`, 'provider: deepseek\napiKey: sk-test\n');
    const config = await loadConfig();
    expect(config.provider).toBe('deepseek');
    expect(config.apiKey).toBe('sk-test');
  });

  it('returns null for empty config file', async () => {
    await writeFile(`${TEST_DIR}/config.yaml`, '');
    expect(await loadConfig()).toBeNull();
  });

  it('returns null for non-object config', async () => {
    await writeFile(`${TEST_DIR}/config.yaml`, '"just a string"');
    expect(await loadConfig()).toBeNull();
  });
});
