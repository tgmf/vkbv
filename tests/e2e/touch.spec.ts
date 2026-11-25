// Touch emulation (M6 acceptance, 01 §5: Pointer Events only, no hover-only actions): the keyboard
// test's flows by taps alone. Inspect an object, pin a card on Marti and withdraw it, place Gaze.
import { expect, test } from '@playwright/test';
import { charge, edge, openGame, playhead, pointOf, settled, watchConsole } from './helpers';

test.use({ hasTouch: true });

test('touch alone: inspect, pin a card on Marti, withdraw it, place Gaze', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchConsole(page);
  await openGame(page);
  const tap = async (testId: string) => {
    await page.waitForTimeout(250); // target positions refresh five times a second
    const [x, y] = await pointOf(page.getByTestId(testId));
    await page.touchscreen.tap(x, y);
  };
  const tapEl = async (testId: string) => {
    const box = await page.getByTestId(testId).boundingBox();
    if (!box) throw new Error(`no ${testId}`);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  };

  // play a few ticks (the play button), pause
  await tapEl('play');
  await expect.poll(() => edge(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(8);
  await tapEl('play');
  await settled(page);

  // tap the whistle: its story and its card
  await tap('object-melmans_whistle');
  await expect(page.getByTestId('inspect-panel')).toBeVisible();
  await tapEl('inspect-close');
  await expect(page.getByTestId('card-something_shiny')).toBeVisible();

  // tap the card to hold it, tap Marti to pin it
  await tapEl('card-something_shiny');
  await expect(page.getByTestId('card-something_shiny')).toHaveAttribute('aria-pressed', 'true');
  await tap('cat-marti');
  await settled(page);
  const pin = page.locator('[data-testid^="pin-"]');
  await expect(pin).toHaveCount(1);
  await page.screenshot({ path: 'test-results/m6-touch-pinned.png' });

  // tap the pin: its × shows (no hover needed); tap × to withdraw
  const id = ((await pin.getAttribute('data-testid')) ?? '').slice('pin-'.length);
  await tapEl(`pin-${id}`);
  await expect(page.getByTestId(`withdraw-${id}`)).toBeVisible();
  await tapEl(`withdraw-${id}`);
  await settled(page);
  await expect(page.locator('[data-testid^="pin-"]')).toHaveCount(0);
  await expect(page.getByTestId('card-something_shiny')).toBeVisible();

  // play on to the rain (the shuttle's forward button twice: 16 ticks/s), until Gaze is affordable
  await tapEl('shuttle-forward');
  await tapEl('shuttle-forward');
  await expect.poll(() => charge(page), { timeout: 240_000 }).toBeGreaterThanOrEqual(40);
  await tapEl('play'); // pause
  await expect(page.getByTestId('speed')).toHaveAttribute('data-dir', 'pause');
  await page.waitForTimeout(300);
  await settled(page);
  expect(await playhead(page)).toBeGreaterThan(600);

  // tap Gaze, tap a place: placed, paid
  const before = await charge(page);
  await tapEl('power-gaze');
  await expect(page.getByTestId('power-gaze')).toHaveAttribute('aria-pressed', 'true');
  await tap('place-flat.study');
  await settled(page);
  await expect(page.locator('[data-testid^="pin-"]')).toHaveCount(1);
  expect(await charge(page)).toBe(before - 40);
  await page.screenshot({ path: 'test-results/m6-touch-gaze.png' });
  expect(errors).toEqual([]);
});
