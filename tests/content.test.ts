import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateContent } from '../scripts/content';

describe('content validation', () => {
  it('all content files pass their Zod schemas', () => {
    const report = validateContent();
    expect(report.errors).toEqual([]);
    expect(report.checked).toBeGreaterThan(0);
  });

  describe('rejects bad content', () => {
    let dir: string | undefined;
    afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

    it('reports schema violations and unknown kinds', () => {
      dir = mkdtempSync(join(tmpdir(), 'content-'));
      mkdirSync(join(dir, 'palettes'));
      mkdirSync(join(dir, 'mystery'));
      writeFileSync(join(dir, 'palettes', 'bad.json'), JSON.stringify({ id: 'Bad Id', name: '' }));
      const { errors } = validateContent(dir);
      const files = errors.map((e) => e.file);
      expect(files).toContain('palettes/bad.json');
      expect(files).toContain('mystery');
    });
  });
});
