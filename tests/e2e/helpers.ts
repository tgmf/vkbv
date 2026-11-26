// Shared steps for the M6 browser tests: the game page (`./`) plays the first vetted seed (4), as a
// player gets it. Targets are reached through the accessible target list's screen positions
// (`data-x`, `data-y`, 02 §4) or by keyboard.
import { expect, type Locator, type Page } from '@playwright/test';

/** Console errors and warnings, except the GL driver's note when a screenshot reads the canvas back. */
export function watchConsole(page: Page): string[] {
  const out: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    if (m.text().includes('GPU stall due to ReadPixels')) return;
    out.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => out.push(`pageerror: ${e.message}`));
  return out;
}

/**
 * Opens a new game on `seed` (4, the first vetted seed, unless asked), skips the teaser and waits for
 * the day's first re-run (the edge at 0). A seed not on the offline list is vetted live first: give
 * `vetMs` for it.
 */
export async function openGame(page: Page, seed = 4, vetMs = 30_000): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`./?seed=${seed}`);
  await expect(page.locator('html')).toHaveAttribute('data-sim', 'ready');
  await skipTeaser(page, vetMs);
  await expect(page.getByTestId('scene')).toHaveAttribute('data-tick', '0', { timeout: 30_000 });
  await expect(page.getByTestId('playhead')).toHaveAttribute('data-streamed', '');
}

/** Skips the teaser with a key and waits until the day has started (vetting may take a while). */
export async function skipTeaser(page: Page, vetMs = 30_000): Promise<void> {
  await expect(page.getByTestId('teaser')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.shell')).toHaveAttribute('data-phase', 'play', { timeout: vetMs });
}

/** Waits after a reload until the saved day has been re-run (no teaser). */
export async function resumed(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-sim', 'ready');
  await expect(page.locator('.shell')).toHaveAttribute('data-phase', 'play', { timeout: 120_000 });
  await expect(page.getByTestId('playhead')).toHaveAttribute('data-streamed', '');
}

/** The save as the page holds it (04 §9). */
export const saveOf = (page: Page): Promise<string | null> =>
  page.evaluate(() => localStorage.getItem('acfw.ch1.v2'));

export const num = async (page: Page, testId: string, attr: string): Promise<number> =>
  Number(await page.getByTestId(testId).getAttribute(attr));
export const playhead = (page: Page) => num(page, 'playhead', 'data-tick');
export const edge = (page: Page) => num(page, 'playhead', 'data-edge');
export const watched = (page: Page) => num(page, 'watched', 'data-count');
export const charge = (page: Page) => num(page, 'charge', 'data-charge');

/** Moves keyboard focus off any control, so keys reach the game (the town's name takes the click). */
export async function unfocus(page: Page): Promise<void> {
  await page.getByTestId('town').click();
}

/** Waits until no edit is on its way (no preview streaming, no break alert). */
export async function settled(page: Page): Promise<void> {
  await expect(page.getByTestId('playhead')).toHaveAttribute('data-pending', '', {
    timeout: 120_000,
  });
  await expect(page.getByTestId('playhead')).toHaveAttribute('data-streamed', '', {
    timeout: 120_000,
  });
}

/** Waits for an edit's preview to finish; confirms its break alert if one shows. */
export async function landEdit(page: Page): Promise<void> {
  const head = page.getByTestId('playhead');
  await expect(head).not.toHaveAttribute('data-pending', 'preview', { timeout: 120_000 });
  if ((await head.getAttribute('data-pending')) === 'alert')
    await page.getByTestId('alert-confirm').click();
  await settled(page);
}

/**
 * Plays to exactly `tick`: the shuttle at the observe speed (Space, then L: 16 ticks/s) to a little short
 * of it, then → a tick at a time, so a busy machine cannot overshoot and watch more than asked.
 */
export async function playTo(page: Page, tick: number): Promise<void> {
  const short = tick - 40;
  if ((await playhead(page)) < short) {
    await unfocus(page);
    await page.keyboard.press('Space');
    await page.keyboard.press('l');
    await expect
      .poll(() => playhead(page), { timeout: 240_000, intervals: [50] })
      .toBeGreaterThanOrEqual(short);
    await page.keyboard.press('k');
    await expect(page.getByTestId('speed')).toHaveAttribute('data-dir', 'pause');
    await page.waitForTimeout(300); // an observe still on its way lands
  }
  if ((await playhead(page)) < tick) await goTo(page, tick);
}

/** Plays until the timeline ends (the anchor's end or the fray): the shuttle pauses by itself. */
export async function playToEnd(page: Page): Promise<void> {
  await unfocus(page);
  await page.keyboard.press('Space');
  await page.keyboard.press('l');
  await expect(page.getByTestId('speed')).toHaveAttribute('data-dir', 'fwd');
  await expect(page.getByTestId('speed')).toHaveAttribute('data-dir', 'pause', {
    timeout: 300_000,
  });
  await page.waitForTimeout(300);
}

/** Moves the playhead to exactly `tick`: ← scrubs back, → plays forward one tick at a time. */
export async function goTo(page: Page, tick: number): Promise<void> {
  await unfocus(page);
  for (let i = 0; i < 2000; i++) {
    const t = await playhead(page);
    if (t === tick) return;
    if (t > tick + 20) {
      // a click on the bar scrubs back in one go
      await page.mouse.click(...(await tickXY(page, tick)));
      continue;
    }
    await page.keyboard.press(t > tick ? 'ArrowLeft' : 'ArrowRight');
    await expect.poll(() => playhead(page), { timeout: 10_000 }).not.toBe(t);
  }
  throw new Error(`could not reach ${tick}`);
}

/** The point of a tick on the timeline's tracks, as Timeline.tsx draws it (span from the bar). */
export async function tickXY(page: Page, tick: number): Promise<[number, number]> {
  const svg = page.getByTestId('timeline').locator('svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('no timeline');
  const minSpan = 36; // timeline.minSpanTicks
  const span = Math.max(await edge(page), minSpan, 1);
  return [box.x + 16 + (tick / span) * (box.width - 32), box.y + 40];
}

/** A target's screen point from the accessible list (`cat-…`, `object-…`, `place-…`). */
export async function pointOf(target: Locator): Promise<[number, number]> {
  await expect(target).toHaveAttribute('data-x', /\d/);
  const x = Number(await target.getAttribute('data-x'));
  const y = Number(await target.getAttribute('data-y'));
  return [x, y];
}

/** Clicks a target in the scene where it was drawn. */
export async function clickTarget(page: Page, testId: string): Promise<void> {
  await page.waitForTimeout(250); // positions refresh five times a second
  const [x, y] = await pointOf(page.getByTestId(testId));
  await page.mouse.click(x, y);
}

/** Zooms the camera out over the scene, so the whole town is in view. */
export async function zoomOut(page: Page): Promise<void> {
  const scene = await page.getByTestId('scene').boundingBox();
  if (!scene) throw new Error('no scene');
  await page.getByTestId('follow').click(); // stop following Marti
  await page.mouse.move(scene.x + scene.width / 2, scene.y + scene.height / 2);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);
}
