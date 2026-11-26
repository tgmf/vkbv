// The first playthrough (07 §5, M7): requested seed 1 through the real interface, vetted live (it becomes
// 49598663), scripted as that seed plays (tests/player/playthrough.ts; docs/questions.md M3-3, M3-4):
// `empty_teapot` is never found and the unprimed lure already brings Marti out, so there is no "turns
// back, prime him" step, and the morning cards on the roadworks change nothing.
//  1. the teaser, "preparing the day" while the seed is vetted, then the `watch` hint;
//  2. the five objects inspected; a card on Marti (`barely`);
//  3. played to the fray (`power`, `fray`);
//  4. back to 17:35, the lure at the front door, played on: the strike, Rokko's locked thread, the end
//     screen (no button without a URL), Keep playing (`sandbox`);
//  5. back to the morning, Tea Break and Box on the roadworks, played to the anchor again: no second
//     end screen;
//  6. the lure withdrawn (the break alert): the timeline frays; the lure placed again: the anchor again.
// After each step the page is reloaded and must come back the same: the save, the watched facts, the
// charge, the edge and the end. A screenshot per step goes to test-results/fp-*.png.
// M8: it is also the scripted telemetry session (07 §6): the end screen's follow link (the e2e build
// sets VITE_URL_FOLLOW only) and a pin dragged to another tick, so every event shows in the kept buffer.
import { expect, test, type Page } from '@playwright/test';
import { EVENT_NAMES, type TelemetryEvent } from '../../src/telemetry/events';
import {
  charge,
  edge,
  goTo,
  landEdit,
  playhead,
  playTo,
  playToEnd,
  resumed,
  saveOf,
  tickXY,
  unfocus,
  watchConsole,
  zoomOut,
} from './helpers';

const OBJECTS = ['melmans_whistle', 'chipped_teacup', 'odds_jar', 'flea_comb', 'old_box'];
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/fp-${name}.png` });

/** Records every hint as it appears, across reloads (sessionStorage), to check none shows twice. */
async function recordHints(page: Page): Promise<void> {
  await page.addInitScript(`(() => {
    const check = () => {
      const h = document.querySelector('[data-testid="hint"]')?.getAttribute('data-hint') ?? '';
      if (h !== '' && h !== sessionStorage.getItem('fp.now')) {
        const list = JSON.parse(sessionStorage.getItem('fp.hints') ?? '[]');
        sessionStorage.setItem('fp.hints', JSON.stringify([...list, h]));
      }
      sessionStorage.setItem('fp.now', h);
    };
    new MutationObserver(check).observe(document, {
      subtree: true, childList: true, attributes: true, attributeFilter: ['data-hint'],
    });
  })()`);
}
const hintsShown = (page: Page): Promise<string[]> =>
  page.evaluate<string[]>(`JSON.parse(sessionStorage.getItem('fp.hints') ?? '[]')`);

/** Waits for a hint, dismissing any other that stands in its queue. */
async function waitHint(page: Page, id: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const h = page.getByTestId('hint');
        const now = (await h.count()) > 0 ? await h.getAttribute('data-hint') : null;
        // dismiss that hint only: the one waited for may replace it before the click lands (WebKit)
        if (now !== null && now !== id)
          await page
            .locator(`[data-testid="hint"][data-hint="${now}"] [data-testid="hint-dismiss"]`)
            .click({ timeout: 1000 })
            .catch(() => undefined);
        return now;
      },
      { timeout: 90_000, intervals: [250] },
    )
    .toBe(id);
}

/** Dismisses the hint showing, if any, so its button covers nothing the test clicks. */
async function clearHint(page: Page): Promise<void> {
  const b = page.getByTestId('hint-dismiss');
  if ((await b.count()) > 0) await b.click();
}

/** What a reload must restore: the save itself and what the page shows from it. */
async function state(page: Page) {
  await unfocus(page);
  await page.keyboard.press('k'); // pausing saves (04 §9)
  await page.waitForTimeout(300);
  return {
    save: await saveOf(page),
    digest: await page.getByTestId('watched').getAttribute('data-digest'),
    watched: await page.getByTestId('watched').getAttribute('data-count'),
    playhead: await playhead(page),
    edge: await edge(page),
    charge: await charge(page),
    fray: await page.getByTestId('fray').count(),
    strike: await page.getByTestId('strike').count(),
    pins: await page.locator('[data-testid^="pin-"]').count(),
  };
}

/** Reloads and checks the same day comes back. */
async function reloadCheck(page: Page, name: string): Promise<void> {
  const before = await state(page);
  expect(before.save, name).not.toBeNull();
  await page.reload();
  await resumed(page);
  await expect(page.getByTestId('teaser')).toBeHidden();
  const after = await state(page);
  expect(after, `reload at ${name}`).toEqual(before);
}

async function hold(page: Page, card: string): Promise<void> {
  await clearHint(page);
  await page.getByTestId(`card-${card}`).click();
  await expect(page.getByTestId(`card-${card}`)).toHaveAttribute('aria-pressed', 'true');
}

async function placeLure(page: Page): Promise<void> {
  await clearHint(page);
  await page.getByTestId('power-lure').click();
  await page.getByTestId('place-flat.door').focus();
  await page.keyboard.press('Enter');
  await landEdit(page);
}

test('the first playthrough, seed 1', async ({ page }) => {
  test.setTimeout(45 * 60_000);
  const errors = watchConsole(page);
  await recordHints(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.context().route('https://example.invalid/**', (r) => r.fulfill({ body: 'ok' }));

  // 1. A new game on a typed seed: the teaser while it is vetted live, then "preparing the day"
  await page.goto('./?seed=1');
  await expect(page.locator('html')).toHaveAttribute('data-sim', 'ready');
  await expect(page.getByTestId('teaser')).toBeVisible();
  await shot(page, '01-teaser');
  await page.keyboard.press('Enter');
  if ((await page.locator('.shell').getAttribute('data-phase')) === 'preparing') {
    await expect(page.getByTestId('preparing')).toBeVisible();
    await shot(page, '02-preparing');
  }
  await expect(page.locator('.shell')).toHaveAttribute('data-phase', 'play', { timeout: 600_000 });
  expect(new URL(page.url()).searchParams.get('seed')).toBe('1');
  await waitHint(page, 'watch');
  await shot(page, '03-watch');
  await reloadCheck(page, 'start');

  // 2. Watch; inspect the five objects; a card on Marti barely moves him
  await playTo(page, 60);
  for (const o of OBJECTS) {
    await clearHint(page);
    await page.getByTestId(`object-${o}`).focus(); // Enter inspects a focused object (06 §8)
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('inspect-panel')).toBeVisible();
    await page.getByTestId('inspect-close').click();
  }
  await expect(page.locator('.hand .card')).toHaveCount(5);
  await shot(page, '04-inspected');
  await hold(page, 'something_shiny');
  await page.getByTestId('cat-marti').focus();
  await page.keyboard.press('Enter');
  await landEdit(page);
  await waitHint(page, 'barely');
  await expect(page.getByTestId('charge')).toHaveAttribute('data-pulse', 'true');
  await shot(page, '05-barely');
  await reloadCheck(page, 'card on Marti');

  // 3. Play on: the rain (the lure becomes affordable), the boat leaves, the timeline frays
  await playToEnd(page);
  await expect(page.getByTestId('fray')).toHaveCount(1);
  expect(await playhead(page)).toBe(1075);
  await waitHint(page, 'fray');
  await shot(page, '06-fray');
  await reloadCheck(page, 'fray');

  // 4. Back to 17:35: the lure at the front door; he walks out and meets Rokko
  await goTo(page, 715);
  await placeLure(page);
  await shot(page, '07-lure');
  await playToEnd(page);
  await expect(page.getByTestId('strike')).toHaveCount(1);
  await expect(page.getByTestId('end-screen')).toBeVisible({ timeout: 20_000 });
  // no button without a URL: the e2e build sets only VITE_URL_FOLLOW
  for (const b of ['wishlist', 'newsletter'])
    await expect(page.getByTestId(`end-${b}`)).toHaveCount(0);
  await expect(page.getByTestId('end-follow')).toBeVisible();
  await expect(page.getByTestId('keep-playing')).toBeVisible();
  await shot(page, '08-end-screen');
  const popup = page.waitForEvent('popup');
  await page.getByTestId('end-follow').click(); // `cta_click`
  await (await popup).close();
  await page.bringToFront(); // the popup took the focus: some engines stop animation frames behind it
  // Rokko's thread, locked, with its line on hover
  await page.getByTestId('locked-thread').hover();
  await expect(page.getByTestId('locked-tip')).toBeVisible();
  await expect(page.getByTestId('locked-tip')).toContainText('Rokko');
  await shot(page, '09-locked-thread');
  await page.getByTestId('keep-playing').click();
  await expect(page.getByTestId('end-screen')).toBeHidden();
  await waitHint(page, 'sandbox');
  await shot(page, '10-sandbox');
  await reloadCheck(page, 'after the anchor');

  // 5. Back to the morning: the roadworks take cards now; the same strike, no second end screen
  await zoomOut(page);
  await goTo(page, 180);
  await hold(page, 'tea_break');
  await page.getByTestId('place-town.roadworks').focus();
  await page.keyboard.press('Enter');
  await landEdit(page);
  await goTo(page, 200);
  await hold(page, 'box');
  await page.getByTestId('place-town.roadworks').focus();
  await page.keyboard.press('Enter');
  await landEdit(page);
  // the Box pin dragged back to 08:55 (`pin_moved`)
  const boxPin = page.locator('[data-testid^="pin-"]', {
    has: page.locator('title', { hasText: 'Box' }),
  });
  const pb = await boxPin.boundingBox();
  if (!pb) throw new Error('no Box pin');
  const [tx] = await tickXY(page, 195);
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tx, pb.y + pb.height / 2, { steps: 5 });
  await page.mouse.up();
  await landEdit(page);
  await expect(boxPin).toHaveAttribute('data-tick', '195');
  await shot(page, '11-roadworks');
  await playToEnd(page);
  await expect(page.getByTestId('strike')).toHaveCount(1);
  await page.waitForTimeout(6_000);
  await expect(page.getByTestId('end-screen')).toBeHidden();
  await shot(page, '12-anchor-again');
  await reloadCheck(page, 'roadworks');

  // 6. Keep playing: withdraw the lure (it undoes paid facts: the break alert), see the fray
  await goTo(page, 720);
  const lure = page.locator('[data-testid^="pin-"]', {
    has: page.locator('title', { hasText: 'Lure' }),
  });
  await lure.focus();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('break-alert')).toBeVisible({ timeout: 120_000 });
  await shot(page, '13-withdraw-alert');
  await page.getByTestId('alert-confirm').click();
  await landEdit(page);
  await playToEnd(page);
  await expect(page.getByTestId('fray')).toHaveCount(1);
  await expect(page.getByTestId('strike')).toHaveCount(0);
  await shot(page, '14-frayed-again');
  await reloadCheck(page, 'withdrawn');

  // ... restore it and watch the anchor again, with no second end screen
  await goTo(page, 715);
  await placeLure(page);
  await playToEnd(page);
  await expect(page.getByTestId('strike')).toHaveCount(1);
  await page.waitForTimeout(6_000);
  await expect(page.getByTestId('end-screen')).toBeHidden();
  await shot(page, '15-restored');
  await reloadCheck(page, 'restored');

  // every hint showed once at most; those this seed reaches all showed
  const shown = await hintsShown(page);
  expect(new Set(shown).size, shown.join(' ')).toBe(shown.length);
  for (const h of ['watch', 'ghosts', 'card', 'barely', 'scroll', 'power', 'fray', 'sandbox'])
    expect(shown, shown.join(' ')).toContain(h);
  const saved = JSON.parse((await saveOf(page)) ?? '{}') as { player?: { seen?: string[] } };
  expect(saved.player?.seen).toEqual([...shown, 'end', 'teaser'].sort());

  // the scripted session produced every telemetry event (07 §6), across its page loads
  const events = await page.evaluate<TelemetryEvent[]>(
    `JSON.parse(localStorage.getItem('acfw.telemetry') ?? '[]')`,
  );
  const names = new Set(events.map((e) => e.name));
  expect(
    EVENT_NAMES.filter((n) => !names.has(n)),
    'telemetry events never recorded',
  ).toEqual([]);
  expect(new Set(events.map((e) => e.session)).size).toBeGreaterThan(5); // one per page load
  expect(errors).toEqual([]);
});
