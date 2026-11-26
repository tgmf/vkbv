// The debug panel (06 §10, M8) in the debug mode (`?dev=1`: the panel open, no teaser, no saving) on
// seed 49598663 (requested seed 1, vetted): the Tuning tab's change re-runs the day and its copy is a
// valid tuning.json; the Wave tab's numbers; a pin set loaded from the Pin sets tab plays back as its
// golden file says.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { loadTuning } from '../../src/content/load';
import { canonicalJson } from '../../src/sim/hash';
import { hash32 } from '../../src/sim/rng';
import { playTo, playToEnd, watchConsole } from './helpers';

const SEED = 49598663;

async function openDev(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`./?dev=1&seed=${SEED}`);
  await expect(page.locator('html')).toHaveAttribute('data-sim', 'ready');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-tick', '0', { timeout: 30_000 });
  await expect(page.getByTestId('playhead')).toHaveAttribute('data-streamed', '');
  await expect(page.getByTestId('debug')).toBeVisible();
}

/** The number a Wave tab chart shows at the playhead ("fog states: 412 at the playhead"). */
async function chartAt(page: Page, testid: string): Promise<number> {
  const caption = page.getByTestId(testid).locator('figcaption');
  await expect(caption).toHaveText(/: \d+ at the playhead/, { timeout: 30_000 });
  return Number(/: (\d+) at/.exec((await caption.textContent()) ?? '')?.[1]);
}

test('the Tuning and Wave tabs: a knob changes the next re-run; copy as JSON; strain', async ({
  page,
}) => {
  test.setTimeout(10 * 60_000);
  const errors = watchConsole(page);
  await openDev(page);
  await playTo(page, 150);

  // the Wave tab: per-tick counts, the last re-run, local causes, the cases at the playhead
  await page.getByTestId('debug-tab-wave').click();
  const before = await chartAt(page, 'wave-states');
  expect(await chartAt(page, 'wave-cases')).toBeGreaterThan(0);
  expect(await chartAt(page, 'wave-live')).toBeGreaterThan(0);
  await expect(page.getByTestId('wave-ms')).toHaveText(/\d+ ms/);
  await expect(page.getByTestId('wave-local')).toHaveText(/\d+/);
  await expect(page.getByTestId('wave-case-table').locator('tr').first()).toContainText('ppm');
  await page.screenshot({ path: 'test-results/debug-wave.png' });

  // the Tuning tab: a coarser state floor re-runs the day with fewer fog states
  await page.getByTestId('debug-tab-tuning').click();
  const knob = page.getByTestId('knob-fog.minStatePpm');
  await expect(knob).toHaveValue('1000');
  await knob.fill('20000');
  await knob.blur();
  await expect(page.locator('.shell')).toHaveAttribute('data-phase', 'play', { timeout: 120_000 });
  await expect(page.getByTestId('playhead')).toHaveAttribute('data-streamed', '', {
    timeout: 120_000,
  });
  await expect(page.getByTestId('playhead')).toHaveAttribute('data-tick', '150');
  await expect(knob).toHaveValue('20000');
  await page.getByTestId('debug-tab-wave').click();
  await expect.poll(() => chartAt(page, 'wave-states'), { timeout: 60_000 }).toBeLessThan(before);

  // copy as JSON: a valid tuning.json holding the change
  await page.getByTestId('debug-tab-tuning').click();
  await page.getByTestId('tuning-copy').click();
  const text = await page.getByTestId('tuning-json').inputValue();
  const copied = loadTuning(JSON.parse(text));
  expect(copied.fog.minStatePpm).toBe(20000);
  await page.screenshot({ path: 'test-results/debug-tuning.png' });

  // strain, on the button (a projection to the end of the day: tens of seconds)
  await page.getByTestId('debug-tab-wave').click();
  await page.getByTestId('wave-strain-compute').click();
  await expect(page.getByTestId('wave-strain')).toContainText('ppm', { timeout: 300_000 });
  await page.screenshot({ path: 'test-results/debug-strain.png' });

  // Reset brings the shipped tuning back
  await page.getByTestId('debug-tab-tuning').click();
  await page.getByTestId('tuning-reset').click();
  await expect(page.getByTestId('knob-fog.minStatePpm')).toHaveValue('1000', { timeout: 120_000 });
  expect(errors).toEqual([]);
});

test('a pin set loaded from the Pin sets tab reproduces its golden playback', async ({ page }) => {
  test.setTimeout(15 * 60_000);
  const errors = watchConsole(page);
  await openDev(page);
  await page.getByTestId('pinset').selectOption('road_both');
  await expect(page.locator('[data-testid^="pin-"]')).toHaveCount(5);
  await playToEnd(page);
  const golden = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', 'golden', 'road_both.s1.expected.json'), 'utf8'),
  ) as { vettedSeed: number; end: { kind: string; tick: number }; watchedHash: string };
  expect(golden.vettedSeed).toBe(SEED);
  await expect(page.getByTestId('strike')).toHaveCount(golden.end.kind === 'anchor' ? 1 : 0);
  await page.getByTestId('debug-tab-player').click();
  const player = JSON.parse((await page.getByTestId('debug-player').textContent()) ?? '{}') as {
    watched: unknown[];
  };
  const hash = hash32(canonicalJson(player.watched)).toString(16).padStart(8, '0');
  expect(hash).toBe(golden.watchedHash);
  await page.screenshot({ path: 'test-results/debug-golden.png' });
  expect(errors).toEqual([]);
});

test('the Events, State, Player and Telemetry tabs', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const errors = watchConsole(page);
  await openDev(page);
  await page.getByTestId('pinset').selectOption('lure_unprimed');
  await playTo(page, 60);
  // Events: the lantern's events, by type; a click scrubs there
  await page.getByTestId('debug-tab-events').click();
  await expect(page.getByTestId('event-line').first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('events-type').selectOption('activity');
  const line = page.getByTestId('event-line').nth(1);
  await expect(line).toContainText('activity');
  const tick = await line.getAttribute('data-tick');
  await line.click();
  await expect(page.getByTestId('playhead')).toHaveAttribute('data-tick', tick ?? '');
  // State: the lantern state and a fogged cat's chain per case
  await page.getByTestId('debug-tab-state').click();
  await expect(page.getByTestId('dev-clock')).toContainText(`tick ${tick}`, { timeout: 30_000 });
  await page.getByTestId('dev-cat').selectOption('gavrila');
  await expect(page.getByTestId('dev-chain').first()).toContainText(/\d/, { timeout: 30_000 });
  await page.screenshot({ path: 'test-results/debug-state.png' });
  // Player: +100 charge and reveal all
  await page.getByTestId('debug-tab-player').click();
  const charge = Number(await page.getByTestId('charge').getAttribute('data-charge'));
  await page.getByTestId('debug-charge').click();
  await expect(page.getByTestId('charge')).toHaveAttribute('data-charge', String(charge + 100));
  await page.getByTestId('debug-unlockCards').click();
  await expect(page.locator('.hand .card')).toHaveCount(9);
  // Telemetry: the debug mode records nothing; the tab shows the kept buffer and its numbers
  await page.getByTestId('debug-tab-telemetry').click();
  await expect(page.getByTestId('telemetry-summary')).toContainText('minutesPlayed');
  expect(errors).toEqual([]);
});
