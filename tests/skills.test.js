import { readFile } from 'fs/promises';
import { describe, it, expect } from 'vitest';

describe('apply-observations skill', () => {
  it('has valid SKILL.md with correct allowed-tools', async () => {
    const content = await readFile(new URL('../skills/apply-observations/SKILL.md', import.meta.url), 'utf8');
    expect(content).toContain('name: apply-observations');
    expect(content).toContain('allowed-tools:');
    // Must have Read and Edit, must NOT have Bash
    expect(content).toContain('Read');
    expect(content).toContain('Edit');
    expect(content).not.toMatch(/allowed-tools:.*Bash/);
  });

  it('references your-taste:start/end markers', async () => {
    const content = await readFile(new URL('../skills/apply-observations/SKILL.md', import.meta.url), 'utf8');
    expect(content).toContain('your-taste:start');
    expect(content).toContain('your-taste:end');
  });
});

describe('scan-sessions skill chains to apply-observations', () => {
  it('references apply-observations in Step 5', async () => {
    const content = await readFile(new URL('../skills/scan-sessions/SKILL.md', import.meta.url), 'utf8');
    expect(content).toContain('apply-observations');
  });
});
