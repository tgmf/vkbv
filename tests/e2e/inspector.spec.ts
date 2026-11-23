// Dev inspector (docs/milestones/M1.5-inspector.md): the page shows the same history as the engine.
import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { readChapterDir, readJson } from '../../src/cli/files';
import { loadChapter, loadTuning } from '../../src/content/load';
import { runHistory } from '../../src/sim/history';
import { catNode } from '../../src/sim/space';

const data = join(import.meta.dirname, '..', '..', 'src', 'content', 'data');
const ch1 = loadChapter(
  readChapterDir(join(data, 'ch1')),
  loadTuning(readJson(join(data, 'tuning.json'))),
);
const history = runHistory(ch1, 1, 0);
const martiAt = (t: number) => {
  const cs = history.states[t]?.cats['marti'];
  if (!cs) throw new Error(`no state at ${t}`);
  return catNode(cs);
};

test('scrubbing shows Marti where the simulation has him', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('./?dev=1');
  await expect(page.getByTestId('clock')).toContainText('05:40');
  for (const t of [0, 120, 301, 455, 700]) {
    await page.getByTestId('scrub').fill(String(t));
    await expect(page.getByTestId('clock')).toContainText(`tick ${t}`);
    await expect(page.getByTestId('cat-marti')).toHaveAttribute('data-node', martiAt(t));
  }
  await page.screenshot({ path: 'test-results/inspector-seed1.png' });
  expect(errors).toEqual([]);
});

test('loading lure_primed shows the lure pin firing at 17:35', async ({ page }) => {
  await page.goto('./?dev=1');
  await expect(page.getByTestId('clock')).toContainText('05:40'); // the slider's range comes with the first view
  await page.getByTestId('pinset').selectOption('lure_primed');
  await page.getByTestId('scrub').fill('716');
  await expect(page.getByTestId('log')).toContainText('715 17:35 pinFired');
  await expect(page.getByTestId('log')).toContainText('lure_primed.2');
  await page.screenshot({ path: 'test-results/inspector-lure.png' });
});
