// Proves the ESLint guardrails (M0 acceptance): each fixture under tests/lint-fixtures/<folder>/ is
// linted with the rules of src/<folder>/ and must produce exactly the expected errors.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const eslint = new ESLint({ cwd: ROOT, ignore: false });

/** `line rule` for every error in a fixture. */
async function errors(fixture: string): Promise<string[]> {
  const [result] = await eslint.lintFiles([join(ROOT, 'tests/lint-fixtures', fixture)]);
  return (result?.messages ?? []).map((m) => `${m.line} ${m.ruleId ?? m.message}`);
}

// The first lint call builds the TypeScript program for the type-aware rules: about 1 s alone, but
// past Vitest's default 5 s under the full suite's load. Only the time limit is longer.
describe('lint guardrails', { timeout: 30_000 }, () => {
  it('src/sim may not import Solid, three or other src folders (types from content are fine)', async () => {
    expect(await errors('sim/imports.ts')).toEqual([
      '2 no-restricted-imports', // solid-js
      '3 no-restricted-imports', // three
      '4 no-restricted-imports', // ../i18n
    ]);
  });

  it('src/sim bans randomness, wall-clock time, float maths and postMessage', async () => {
    expect(await errors('sim/globals.ts')).toEqual([
      '2 no-restricted-properties', // Math.random
      '3 no-restricted-globals', // Date
      '3 no-restricted-properties', // Date.now
      '4 no-restricted-properties', // Math.exp
      '5 no-restricted-properties', // Math.sqrt
      '6 no-restricted-globals', // performance
      '6 no-restricted-properties', // performance.now
      '7 no-restricted-globals', // postMessage
    ]);
  });

  it('src/player has the same bans', async () => {
    expect(await errors('player/globals.ts')).toEqual([
      '2 no-restricted-properties', // Math.random
      '3 no-restricted-globals', // Date
      '3 no-restricted-properties', // Date.now
      '4 no-restricted-properties', // Math.log
      '5 no-restricted-properties', // Math.pow
      '6 no-restricted-globals', // localStorage
    ]);
  });

  it('postMessage outside src/bridge fails; src/ui may not import src/sim', async () => {
    expect(await errors('ui/post.ts')).toEqual([
      '2 no-restricted-imports',
      '5 no-restricted-properties',
    ]);
  });

  it('the worker runs no timer', () => {
    const source = readFileSync(join(ROOT, 'src/bridge/sim.worker.ts'), 'utf8');
    expect(source).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
  });
});
