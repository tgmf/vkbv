// Interaction (M6): one day on the game's seed (4) played by hand with the mouse, in order:
// 1. `road_both` by hand: the five objects inspected, the junk special (its confirm step), the lure,
//    the walk that reveals the town, then the morning cards on the roadworks; it reaches the anchor
//    (docs/questions.md M6-1: `empty_teapot` is never found on this seed, its pin is left out).
// 2. The presence strip: a card held over the roadworks at 15:00 shows the crew there in the morning.
// 3. Edit feedback: `tea_break` on the roadworks at 07:40, after the morning was watched.
// 4. A fizzled pin: hollow or half-filled, and it says why.
// 5. Gaze on the roadworks: the ghosts there solid for its ticks, the charge down by its cost.
// 6. The break alert: withdrawing the lure would undo paid facts; Cancel, then Confirm.
// Screenshots go to test-results/.
import { expect, test, type Page } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import {
  charge,
  clickTarget,
  edge,
  goTo,
  landEdit,
  openGame,
  playhead,
  playTo,
  playToEnd,
  settled,
  tickXY,
  watchConsole,
  watched,
  zoomOut,
} from './helpers';

const OBJECTS = ['melmans_whistle', 'chipped_teacup', 'odds_jar', 'flea_comb', 'old_box'];
const CREW = ['gavrila', 'bublik', 'pip', 'semyon'];
/**
 * A screenshot, and the page's heap and DOM size beside it (test-results/m6-memory.txt). The sizes come
 * from a CDP session, which only Chromium has; the other engines take the screenshot alone.
 */
const shot = async (page: Page, name: string) => {
  if (page.context().browser()?.browserType().name() !== 'chromium') {
    await page.screenshot({ path: `test-results/m6-${name}.png` });
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const m = (k: string) => metrics.find((x) => x.name === k)?.value ?? 0;
  appendFileSync(
    'test-results/m6-memory.txt',
    `${name}: heap ${Math.round(m('JSHeapUsedSize') / 1e6)} MB, nodes ${m('Nodes')}, listeners ${m('JSEventListeners')}
`,
  );
  await cdp.detach();
  await page.screenshot({ path: `test-results/m6-${name}.png` });
};

/** Records whether edit feedback showed: a pulse on the story track, Marti's previous path. */
async function recordFeedback(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    window.__fb = { pulse: false, path: false };
    const check = () => {
      if (document.querySelector('[data-testid="dot-pulse"], [data-testid="changed"].pulse')) window.__fb.pulse = true;
      const p = document.querySelector('[data-testid="scene"]')?.getAttribute('data-path');
      if (p && p !== 'off') window.__fb.path = true;
    };
    new MutationObserver(check).observe(document.body, { subtree: true, childList: true, attributes: true });
  })()`);
}
const feedbackSeen = (page: Page) =>
  page.evaluate<{ pulse: boolean; path: boolean }>('window.__fb');

/** Holds a card from the hand and clicks a target in the scene. */
async function pin(page: Page, card: string, target: string): Promise<void> {
  await page.getByTestId(`card-${card}`).click();
  await expect(page.getByTestId(`card-${card}`)).toHaveAttribute('aria-pressed', 'true');
  await clickTarget(page, target);
}

/** Holds a card and pins it on a target by keyboard focus and Enter (exact where ghosts overlap). */
async function pinByFocus(page: Page, card: string, target: string): Promise<void> {
  await page.getByTestId(`card-${card}`).click();
  await expect(page.getByTestId(`card-${card}`)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId(target).focus();
  await page.keyboard.press('Enter');
}

/** The pins on the timeline as `card or power@tick`. */
async function pins(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (const el of await page.locator('[data-testid^="pin-"]').all())
    out.push(
      `${(await el.getAttribute('aria-label')) ?? ''}@${(await el.getAttribute('data-tick')) ?? ''}`,
    );
  return out;
}

const pinByLabel = (page: Page, name: string) =>
  page.locator('[data-testid^="pin-"]', { has: page.locator('title', { hasText: name }) });

test.describe.serial('interaction (M6), one day on seed 4', () => {
  let page: Page;
  let errors: string[];
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    errors = watchConsole(page);
    await openGame(page);
  });
  test.afterAll(async () => {
    expect(errors).toEqual([]);
    await page.close();
  });

  test('road_both by hand reaches the anchor', async () => {
    test.setTimeout(600_000);
    await playTo(page, 60);
    // inspect the five objects in the flat: stories and cards
    for (const o of OBJECTS) {
      await clickTarget(page, `object-${o}`);
      await expect(page.getByTestId('inspect-panel')).toBeVisible();
      if (o === 'melmans_whistle') await shot(page, 'inspect');
      await page.getByTestId('inspect-close').click();
    }
    await expect(page.locator('.hand .card')).toHaveCount(5);

    // the junk special on its own jar at 17:20: the confirm step first
    await playTo(page, 700);
    await pin(page, 'irresistible_junk', 'object-odds_jar');
    await expect(page.getByTestId('special-confirm')).toBeVisible();
    await shot(page, 'special-confirm');
    await page.getByTestId('special-ok').click();
    await landEdit(page);

    // the lure at the front door at 17:35 (the rain's charge floor pays for it)
    await goTo(page, 715);
    expect(await charge(page)).toBeGreaterThanOrEqual(100);
    await page.getByTestId('power-lure').click();
    await clickTarget(page, 'place-flat.door');
    await landEdit(page);
    await shot(page, 'lure');

    // Marti walks out; the town is revealed; the day runs to the meeting
    await playToEnd(page);
    await expect(page.getByTestId('place-town.roadworks')).toHaveAttribute('data-revealed', 'true');
    await expect(page.getByTestId('strike')).toHaveCount(1);
    // the end screen (M7) after the strike: keep playing
    await page.getByTestId('keep-playing').click({ timeout: 20_000 });

    // back to the morning: the roadworks take cards now
    await zoomOut(page);
    await goTo(page, 180);
    await pinByFocus(page, 'tea_break', 'place-town.roadworks');
    await landEdit(page);
    await goTo(page, 200);
    await pinByFocus(page, 'box', 'place-town.roadworks');
    await landEdit(page);
    await playToEnd(page);
    await expect(page.getByTestId('edge')).toHaveAttribute('data-end', 'anchor');
    await expect(page.getByTestId('strike')).toHaveCount(1);
    await shot(page, 'road_both-anchor');
    // the log: road_both without empty_teapot (M6-1)
    const log = await pins(page);
    expect(log.map((x) => x.split('@').pop())).toEqual(['180', '200', '700', '715']);
    expect(log[0]).toContain('Tea Break on The roadworks');
    expect(log[1]).toContain('Box! on The roadworks');
    expect(log[2]).toContain('Irresistible Junk on Jar of odds and ends');
    expect(log[3]).toContain('Lure on Front door');
  });

  test('the presence strip: a card over the roadworks at 15:00 shows the crew there in the morning', async () => {
    await goTo(page, 560);
    // tea_break is pinned; something_shiny can go on the roadworks too
    await page.getByTestId('card-something_shiny').click();
    await page.waitForTimeout(250);
    const [x, y] = [
      Number(await page.getByTestId('place-town.roadworks').getAttribute('data-x')),
      Number(await page.getByTestId('place-town.roadworks').getAttribute('data-y')),
    ];
    await page.mouse.move(x, y);
    const strip = page.getByTestId('presence');
    await expect(strip).toHaveCount(1);
    const ticks = ((await strip.getAttribute('data-ticks')) ?? '').split(',').map(Number);
    expect(ticks.filter((t) => t >= 80 && t <= 320).length).toBeGreaterThan(100); // 07:00–11:00
    await shot(page, 'presence-strip');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('presence')).toHaveCount(0);
  });

  test('edit feedback: tea_break on the roadworks at 07:40 after watching the morning', async () => {
    test.setTimeout(300_000);
    // take tea_break off 08:40 first (an edit of its own), then pin it at 07:40
    const tea = pinByLabel(page, 'Tea Break');
    await tea.focus();
    await page.keyboard.press('Delete');
    await landEdit(page);
    await expect(page.getByTestId('card-tea_break')).toBeVisible();
    await goTo(page, 120);
    const edgeBefore = await edge(page);
    await recordFeedback(page);
    await pinByFocus(page, 'tea_break', 'place-town.roadworks');
    // the re-run streams in from the edit as a ripple
    await expect(page.getByTestId('ripple')).toHaveCount(1, { timeout: 10_000 });
    await shot(page, 'feedback-ripple');
    const head = page.getByTestId('playhead');
    await expect(head).not.toHaveAttribute('data-pending', 'preview', { timeout: 120_000 });
    if ((await head.getAttribute('data-pending')) === 'alert') {
      await shot(page, 'feedback-alert');
      await page.getByTestId('alert-confirm').click();
    }
    // the edit lands: changed story dots pulse, Marti's previous path shows (recorded as they happen)
    await expect
      .poll(() => feedbackSeen(page), { timeout: 30_000 })
      .toEqual({ pulse: true, path: true });
    await shot(page, 'feedback-landed');
    await settled(page);
    // the bar's end is the new edge; on seed 4 this edit keeps the anchor (18:50), so the end stays
    // where it was (its change is checked when the lure is withdrawn, below)
    await expect(page.getByTestId('edge')).toHaveAttribute('data-tick', String(await edge(page)));
    expect(await edge(page)).toBe(edgeBefore);
  });

  test('a fizzled pin is drawn differently and says why', async () => {
    test.setTimeout(300_000);
    // something_shiny on the barrier (it shows once the crew arrived), then dragged to 05:45
    await goTo(page, 200);
    // the barrier sits under the crew's ghosts: aim with the keyboard's focus, Enter pins
    await page.getByTestId('card-something_shiny').click();
    await page.getByTestId('object-road_barrier').focus();
    await page.keyboard.press('Enter');
    await landEdit(page);
    const shiny = pinByLabel(page, 'Something Shiny');
    await expect(shiny).toHaveAttribute('data-fill', 'full');
    const [fx, fy] = await tickXY(page, 200);
    const [tx] = await tickXY(page, 5);
    const box = await shiny.boundingBox();
    if (!box) throw new Error('no pin');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move((fx + tx) / 2, fy, { steps: 5 });
    await page.mouse.move(tx, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await landEdit(page);
    const moved = pinByLabel(page, 'Something Shiny');
    await expect(moved).toHaveAttribute('data-tick', '5');
    await expect(moved).toHaveAttribute('data-fill', /hollow|half/);
    await expect(moved).toHaveAttribute('aria-label', /Did nothing/);
    await moved.focus(); // hover or focus shows why (06 §3); at 05:45 the playhead's handle covers it
    await shot(page, 'fizzled-pin');
  });

  test('Gaze on the roadworks turns the ghosts there solid for its ticks and costs its charge', async () => {
    test.setTimeout(300_000);
    await goTo(page, 200);
    const before = await charge(page);
    expect(before).toBeGreaterThanOrEqual(40);
    const ghostly = await page.getByTestId(`cat-${CREW[0] ?? ''}`).getAttribute('data-solid');
    await page.keyboard.press('g');
    await clickTarget(page, 'place-town.roadworks');
    await landEdit(page);
    expect(await charge(page)).toBe(before - 40);
    for (const t of [200, 202, 204]) {
      await goTo(page, t);
      const solid = await Promise.all(
        CREW.map((cat) => page.getByTestId(`cat-${cat}`).getAttribute('data-solid')),
      );
      expect(solid).toContain('true');
    }
    await shot(page, 'gaze');
    await goTo(page, 260);
    expect(ghostly).toBe('false'); // before the Gaze, a ghost there
  });

  test('the break alert: withdrawing the lure; Cancel leaves everything, Confirm lands it', async () => {
    test.setTimeout(300_000);
    await settled(page);
    const digest = await page.getByTestId('watched').getAttribute('data-digest');
    const count = await watched(page);
    const before = await pins(page);
    const lure = pinByLabel(page, 'Lure');
    await lure.focus();
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('break-alert')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId('break').first()).toBeVisible();
    await shot(page, 'break-alert');
    await page.getByTestId('alert-cancel').click();
    await settled(page);
    expect(await page.getByTestId('watched').getAttribute('data-digest')).toBe(digest);
    expect(await pins(page)).toEqual(before);
    expect(await playhead(page)).toBeGreaterThanOrEqual(0);

    await lure.focus();
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('break-alert')).toBeVisible({ timeout: 120_000 });
    await page.getByTestId('alert-confirm').click();
    // the bar's end moves: the anchor's end gives way to the new edge, and animates (06 §6, item 4)
    await expect(page.getByTestId('edge')).not.toHaveAttribute('data-end', 'anchor');
    await expect(page.getByTestId('edge')).toHaveClass(/arrive/);
    await shot(page, 'break-alert-confirmed');
    await settled(page);
    expect((await pins(page)).length).toBe(before.length - 1);
    expect(await watched(page)).toBeLessThan(count);
  });
});
