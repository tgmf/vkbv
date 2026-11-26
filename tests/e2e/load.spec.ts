// The first load (07 §4): the local production build is interactive within 3 s, from a sub-path.
// Interactive: the worker has loaded the content and the teaser takes a key.
import { expect, test } from '@playwright/test';
import { watchConsole } from './helpers';

const BUDGET_MS = 3000;

test('first load is interactive within 3 s', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  const t0 = Date.now();
  await page.goto('./?seed=4');
  await expect(page.locator('html')).toHaveAttribute('data-sim', 'ready', { timeout: BUDGET_MS });
  await expect(page.getByTestId('teaser')).toBeVisible({ timeout: BUDGET_MS });
  const ms = Date.now() - t0;
  test.info().annotations.push({ type: 'first load', description: `${ms} ms` });
  console.log(`first load: interactive after ${ms} ms`);
  expect(ms).toBeLessThanOrEqual(BUDGET_MS);
  // it takes input: a key skips the teaser
  await page.keyboard.press('Enter');
  await expect(page.locator('.shell')).toHaveAttribute('data-phase', 'play', { timeout: 30_000 });
  expect(errors).toEqual([]);
});
