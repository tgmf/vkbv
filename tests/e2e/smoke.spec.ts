// Smoke test (07 §5): the page loads from a sub-path with no console errors, the teaser plays and is
// skipped, the timeline shows, Space toggles playback, the language switch changes the town's name,
// reloading restores the save (and the seed shows in the address), and panning the camera watches
// nothing.
import { expect, test } from '@playwright/test';
import { resumed, saveOf, skipTeaser, unfocus, watchConsole } from './helpers';

test('load, teaser, playback, language, reload, panning', async ({ page }) => {
  test.setTimeout(180_000);
  const console = watchConsole(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./');
  await expect(page.getByTestId('town')).toHaveText('Son-Marta-Klekot');
  await expect(page.locator('html')).toHaveAttribute('data-sim', 'ready');
  // a new game: the teaser, and the drawn seed in the address
  await expect(page.getByTestId('teaser')).toBeVisible();
  await page.screenshot({ path: 'test-results/smoke-teaser.png' });
  const seed = new URL(page.url()).searchParams.get('seed');
  expect(seed).toMatch(/^\d+$/);
  await skipTeaser(page);
  await expect(page.getByTestId('timeline')).toBeVisible();

  // Space toggles playback
  await unfocus(page);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('speed')).toHaveAttribute('data-dir', 'fwd');
  await expect
    .poll(async () => Number(await page.getByTestId('watched').getAttribute('data-count')), {
      timeout: 15_000,
    })
    .toBeGreaterThan(10);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('speed')).toHaveAttribute('data-dir', 'pause');
  await page.waitForTimeout(300);

  // the language switch
  await page.getByTestId('locale-ru').click();
  await expect(page.getByTestId('town')).toHaveText('Сон-Марты-Клекот');

  // panning the camera changes nothing watched
  const digest = await page.getByTestId('watched').getAttribute('data-digest');
  const box = await page.getByTestId('scene').boundingBox();
  if (!box) throw new Error('no scene');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 300, box.y + box.height / 2 - 150, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await page.getByTestId('watched').getAttribute('data-digest')).toBe(digest);

  // reload: the same day, the same language, no teaser, the seed still in the address
  const save = await saveOf(page);
  expect(save).not.toBeNull();
  await page.reload();
  await resumed(page);
  await expect(page.getByTestId('teaser')).toBeHidden();
  await expect(page.getByTestId('town')).toHaveText('Сон-Марты-Клекот');
  expect(await page.getByTestId('watched').getAttribute('data-digest')).toBe(digest);
  expect(new URL(page.url()).searchParams.get('seed')).toBe(seed);
  expect(await saveOf(page)).toBe(save);
  await page.screenshot({ path: 'test-results/smoke-reloaded.png' });

  expect(console).toEqual([]);
});

test('a save that cannot be read starts a new day with a notice', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('acfw.ch1.v2', '{"not":"a save"}'));
  await page.goto('./?seed=4');
  await expect(page.getByTestId('boot-notice')).toBeVisible();
  await skipTeaser(page);
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
