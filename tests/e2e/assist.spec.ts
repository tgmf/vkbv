// Assist mode (06 §2, M8 item 8) on seed 4: off, no story markers; on, a marker on the cat where a story
// tied to the anchor forms (the lure's story once the lure is near Marti, certain, so lit all through
// its cycle; the share of each cycle is unit-tested: tests/ui/pulse, tests/player/assist); a
// held card that could advance a forming story rings it; withdrawing the lure lists the lure's story
// under its own heading in the break alert. Screenshots: test-results/assist-*.png.
import { expect, test, type Page } from '@playwright/test';
import { landEdit, openGame, playTo, unfocus, watchConsole, zoomOut } from './helpers';

const marker = (page: Page, storylet: string) =>
  page.locator(`.scene-story[data-story="${storylet}"]`);

async function setAssist(page: Page, on: boolean): Promise<void> {
  await page.getByTestId('settings-open').click();
  const box = page.getByTestId('assist');
  if (on) await box.check();
  else await box.uncheck();
  await page.getByTestId('settings-close').click();
  await unfocus(page);
}

test('assist mode: story markers, rings and disruption warnings', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const errors = watchConsole(page);
  await openGame(page);
  await playTo(page, 60);
  // off by default: no marker
  await expect(page.locator('.scene-story:visible')).toHaveCount(0);

  await setAssist(page, true);
  await zoomOut(page);
  await page.screenshot({ path: 'test-results/assist-01-on.png' });

  // the lure at the front door at 17:35: the lure's story forms on Marti
  await page.getByTestId('object-chipped_teacup').focus(); // Tea Break, for the ring below
  await page.keyboard.press('Enter');
  await page.getByTestId('inspect-close').click();
  await playTo(page, 715);
  await page.getByTestId('power-lure').click();
  await page.getByTestId('place-flat.door').focus();
  await page.keyboard.press('Enter');
  await landEdit(page);
  await unfocus(page);
  await page.keyboard.press('ArrowRight'); // the lure works from the tick after it
  await expect(page.getByTestId('playhead')).toHaveAttribute('data-tick', '716');
  // certain (the lure is near and the door's choice is open): lit through its whole cycle
  await expect(marker(page, 'door_lure')).toBeVisible();
  await expect(marker(page, 'door_lure')).toHaveAttribute('data-lit', 'on');
  await expect(marker(page, 'door_lure')).not.toHaveClass(/ring/);
  await page.screenshot({ path: 'test-results/assist-02-lure.png' });
  // off: no marker; on again: back
  await setAssist(page, false);
  await expect(page.locator('.scene-story:visible')).toHaveCount(0);
  await setAssist(page, true);
  await expect(marker(page, 'door_lure')).toBeVisible();

  // Tea Break shifts teaCraving, a prime the door's choice counts: holding it rings the story
  await page.getByTestId('card-tea_break').click();
  await expect(marker(page, 'door_lure')).toHaveClass(/ring/);
  await page.screenshot({ path: 'test-results/assist-03-ring.png' });
  await page.keyboard.press('Escape');
  await expect(marker(page, 'door_lure')).not.toHaveClass(/ring/);

  // withdrawing the lure: the story it was forming is listed under its own heading
  const lure = page.locator('[data-testid^="pin-"]', {
    has: page.locator('title', { hasText: 'Lure' }),
  });
  await lure.focus();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('break-alert')).toBeVisible({ timeout: 120_000 });
  await expect(
    page.getByTestId('break-alert').locator('[data-testid="disrupted"][data-storylet="door_lure"]'),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/assist-04-disrupted.png' });
  await page.getByTestId('alert-cancel').click();
  await expect(page.getByTestId('break-alert')).toBeHidden();
  await expect(lure).toHaveCount(1);
  expect(errors).toEqual([]);
});
