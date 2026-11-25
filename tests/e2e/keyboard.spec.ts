// Keyboard alone (M6 acceptance, 06 §8): inspect an object, pin a card on a cat and withdraw it, and
// place a power, pressing keys only. The game's seed (4); the charge for Gaze comes with the rain.
import { expect, test, type Page } from '@playwright/test';
import { charge, edge, openGame, settled, watchConsole } from './helpers';

/** Presses Tab (or Shift+Tab) until the focused element has this test id. */
async function tabTo(page: Page, testId: string, back = false): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const focused = page.locator(':focus');
    const at = (await focused.count()) > 0 ? await focused.getAttribute('data-testid') : null;
    if (at === testId) return;
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
  }
  throw new Error(`Tab never reached ${testId}`);
}

test('keyboard alone: inspect, pin a card on Marti, withdraw it, place Gaze', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchConsole(page);
  await openGame(page);

  // play a little (Space, → as playback), then inspect the whistle: Tab to it, Enter
  await page.keyboard.press('Space');
  await expect.poll(() => edge(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(8);
  await page.keyboard.press('k');
  await settled(page);
  await tabTo(page, 'object-melmans_whistle');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('inspect-panel')).toBeVisible();
  await expect(page.getByTestId('inspect-card')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('inspect-panel')).toHaveCount(0);
  await expect(page.getByTestId('card-something_shiny')).toBeVisible();

  // 1 holds the first card; Tab moves through its valid targets; Enter pins it on Marti
  await page.keyboard.press('1');
  await expect(page.getByTestId('card-something_shiny')).toHaveAttribute('aria-pressed', 'true');
  await tabTo(page, 'cat-marti');
  await expect(page.getByTestId('cat-marti')).toHaveAttribute('data-valid', 'true');
  await page.keyboard.press('Enter');
  await settled(page);
  const pin = page.locator('[data-testid^="pin-"]');
  await expect(pin).toHaveCount(1);
  await expect(page.getByTestId('card-something_shiny')).toHaveCount(0); // pinned, not in hand
  await page.screenshot({ path: 'test-results/m6-keyboard-pinned.png' });

  // Tab to the pin, Delete withdraws it: the card comes back
  const id = (await pin.getAttribute('data-testid')) ?? '';
  await tabTo(page, id);
  await page.keyboard.press('Delete');
  await settled(page);
  await expect(page.locator('[data-testid^="pin-"]')).toHaveCount(0);
  await expect(page.getByTestId('card-something_shiny')).toBeVisible();

  // play on until the rain's charge floor makes Gaze affordable (Space, L L: 16 ticks/s)
  await page.keyboard.press('Space');
  await page.keyboard.press('l');
  await expect.poll(() => charge(page), { timeout: 240_000 }).toBeGreaterThanOrEqual(40);
  await page.keyboard.press('k');
  await page.waitForTimeout(300);
  await settled(page);

  // G holds Gaze; Tab to a place it can go on; Enter places it and pays its cost
  const before = await charge(page);
  await page.keyboard.press('g');
  await expect(page.getByTestId('power-gaze')).toHaveAttribute('aria-pressed', 'true');
  await tabTo(page, 'place-flat.study');
  await page.keyboard.press('Enter');
  await settled(page);
  await expect(page.locator('[data-testid^="pin-"]')).toHaveCount(1);
  expect(await charge(page)).toBe(before - 40);
  await page.screenshot({ path: 'test-results/m6-keyboard-gaze.png' });
  expect(errors).toEqual([]);
});
