// Smoke test (M0): the shell loads from a sub-path, shows the town, switches language, the worker
// answers init with ready, and nothing is logged to the console.
import { expect, test } from '@playwright/test';

test('the shell loads, switches language and starts the worker', async ({ page }) => {
  const console: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => console.push(`pageerror: ${e.message}`));

  await page.goto('./');
  await expect(page.getByTestId('town')).toHaveText('Son-Marta-Klekot');
  await expect(page.locator('html')).toHaveAttribute('data-sim', 'ready');

  await page.getByTestId('locale-ru').click();
  await expect(page.getByTestId('town')).toHaveText('Сон-Марты-Клекот');
  await page.getByTestId('locale-en').click();
  await expect(page.getByTestId('town')).toHaveText('Son-Marta-Klekot');
  await page.screenshot({ path: 'test-results/smoke-shell.png' });

  expect(console).toEqual([]);
});

test('?debug=1 lists every tuning knob with its description', async ({ page }) => {
  await page.goto('./?debug=1');
  const debug = page.getByTestId('debug');
  await expect(debug).toContainText('fog.maxLinks');
  await expect(debug).toContainText('Links besides the weather');
  await page.screenshot({ path: 'test-results/smoke-debug.png' });
  await page.keyboard.press('`');
  await expect(debug).toBeHidden();
});
