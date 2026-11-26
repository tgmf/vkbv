// The viewer (M5): the world as a wave and the timeline, on the dev page (`?dev=1`) with seed 49598663
// played as typed (docs/questions.md M5-3: requested seed 1's vetted seed; under `road_both` Marti
// meets Rokko at 18:50, golden file road_both.s1). Screenshots go to test-results/.
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { readChapterDir, readJson } from '../../src/cli/files';
import { loadChapter, loadTuning, parsePinSets } from '../../src/content/load';
import { fogSetup } from '../../src/sim/fog';
import { extendEdge, rerunAll } from '../../src/sim/recompute';

const SEED = 49598663;
const data = join(import.meta.dirname, '..', '..', 'src', 'content', 'data');
const ch1 = loadChapter(
  readChapterDir(join(data, 'ch1')),
  loadTuning(readJson(join(data, 'tuning.json'))),
);
const pinsets = parsePinSets(readJson(join(data, 'pinsets.json')), ch1);

/** Console errors and warnings, except the GL driver's note when a screenshot reads the canvas back. */
function watchConsole(page: Page): string[] {
  const out: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    if (m.text().includes('GPU stall due to ReadPixels')) return;
    out.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => out.push(`pageerror: ${e.message}`));
  return out;
}

async function open(page: Page, pinset = 'untouched', extra = '', revealAll = true): Promise<void> {
  await page.goto(`./?dev=1&seed=${SEED}${extra}`);
  await expect(page.locator('html')).toHaveAttribute('data-sim', 'ready');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-tick', '0', { timeout: 30_000 });
  if (!revealAll) await page.getByTestId('dev-reveal').uncheck();
  if (pinset !== 'untouched') {
    await page.getByTestId('pinset').selectOption(pinset);
    await expect(page.locator('[data-testid^="pin-"]')).toHaveCount(pinsets[pinset]?.length ?? 0);
  }
  await expect(page.getByTestId('playhead')).toHaveAttribute('data-streamed', '');
  await expect(page.getByTestId('playhead')).toHaveAttribute('data-edge', '0');
  await page.getByTestId('town').click(); // the keyboard does not act on a focused field
}

const num = async (page: Page, testId: string, attr: string): Promise<number> =>
  Number(await page.getByTestId(testId).getAttribute(attr));
const playhead = (page: Page) => num(page, 'playhead', 'data-tick');
const edge = (page: Page) => num(page, 'playhead', 'data-edge');
const watched = (page: Page) => num(page, 'watched', 'data-count');

/** Plays at the observe speed (Space, then L: 16 ticks/s) until the playhead reaches `tick`. */
async function playTo(page: Page, tick: number): Promise<void> {
  if ((await page.getByTestId('speed').getAttribute('data-dir')) !== 'fwd') {
    await page.keyboard.press('Space');
    await page.keyboard.press('l');
  }
  await expect
    .poll(() => playhead(page), { timeout: 180_000, intervals: [100] })
    .toBeGreaterThanOrEqual(tick);
  await page.keyboard.press('k');
  await expect(page.getByTestId('speed')).toHaveAttribute('data-dir', 'pause');
  await page.waitForTimeout(300); // an observe still on its way lands
}

/** The x of a tick on the timeline's tracks, as Timeline.tsx draws it. */
async function tickX(page: Page, tick: number): Promise<{ x: number; y: number }> {
  const svg = page.getByTestId('timeline').locator('svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('no timeline');
  const span = Math.max(await edge(page), ch1.tuning.timeline.minSpanTicks, 1);
  return { x: box.x + 16 + (tick / span) * (box.width - 32), y: box.y + 50 };
}

test.describe('the viewer (M5)', () => {
  test('road_both, played: Marti at home, the rain, the lure, the walk, the barrier, the chain, the meeting', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errors = watchConsole(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, 'road_both', '', false); // the map revealed as Marti sees it
    await expect(page.getByTestId('place-flat.study')).toHaveAttribute('data-revealed', 'true');
    await expect(page.getByTestId('place-town.roadworks')).toHaveAttribute(
      'data-revealed',
      'false',
    );
    const shots: [number, string][] = [
      [20, 'home'], // 06:00, the town as ghosts
      [200, 'crew-ghosts'], // 09:00, the crew are ghosts
      [680, 'rain'], // 17:00, the rain started at 664
      [716, 'lure'], // 17:36, the lure fired at 715
      [730, 'walk'], // out since 725
      [736, 'barrier'], // blocked_road.facing at 734; the crew placed at 735
      [766, 'chain'], // chain_on_beach.following at 765
      [791, 'meeting'], // under_the_boat.meeting at 790
    ];
    const scene = await page.getByTestId('scene').boundingBox();
    if (!scene) throw new Error('no scene');
    for (const [tick, name] of shots) {
      await playTo(page, tick);
      // the crew: zoom out so the roadworks are in view, then back
      const wide = name === 'crew-ghosts';
      await page.mouse.move(scene.x + scene.width / 3, scene.y + scene.height / 2);
      if (wide) await page.mouse.wheel(0, 500);
      await page.screenshot({ path: `test-results/viewer-road_both-${tick}-${name}.png` });
      if (wide) await page.mouse.wheel(0, -500);
      if (name === 'crew-ghosts') {
        // before anything is watched the crew are ghosts, the likeliest copy first
        const gavrila = page.getByTestId('cat-gavrila');
        await expect(gavrila).toHaveAttribute('data-solid', 'false');
        expect(Number(await gavrila.getAttribute('data-ghosts'))).toBeGreaterThan(1);
        await expect(gavrila).toHaveAttribute('data-activity', 'tea_break'); // 63% on this seed
      }
      if (name === 'lure') {
        // the dev page's state panel (the M1.5 inspector, merged): the lure's pin fired at 17:35
        await expect(page.getByTestId('log')).toContainText('715 17:35 pinFired', {
          timeout: 20_000,
        });
      }
      if (name === 'walk' || name === 'barrier') {
        // the lantern reveals the places Marti walks through
        await expect(page.getByTestId('place-town.porch')).toHaveAttribute('data-revealed', 'true');
      }
      if (name === 'barrier') {
        await expect(page.getByTestId('place-town.roadworks')).toHaveAttribute(
          'data-revealed',
          'true',
        );
        // after Marti watches them they are solid
        for (const cat of ['gavrila', 'bublik'])
          await expect(page.getByTestId(`cat-${cat}`)).toHaveAttribute('data-solid', 'true');
      }
    }
    // the strike: the anchor's lightning mark on the timeline, at 18:50
    await expect(page.getByTestId('strike')).toHaveAttribute('data-tick', '790');
    expect(errors).toEqual([]);
  });

  test('five ticks of playback match the headless playback', async ({ page }) => {
    const errors = watchConsole(page);
    const setup = fogSetup(ch1, SEED);
    let tl = rerunAll(setup, null, {
      pins: pinsets['road_both'] ?? [],
      watched: [],
      frontier: { story: 0, pastTicks: 0, storylets: [] },
    });
    for (let t = 0; t < 5; t++) tl = extendEdge(setup, tl) ?? tl;
    const martiAt = (t: number) => tl.result.frames[t]?.cats['marti']?.[0]?.node;
    await open(page, 'road_both');
    await expect(page.getByTestId('cat-marti')).toHaveAttribute('data-node', martiAt(0) ?? '');
    for (let t = 1; t <= 5; t++) {
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => playhead(page)).toBe(t);
      await expect(page.getByTestId('cat-marti')).toHaveAttribute('data-node', martiAt(t) ?? '');
    }
    expect(await watched(page)).toBe(5);
    expect(errors).toEqual([]);
  });

  test('panning and zooming across the whole map change nothing in watched', async ({ page }) => {
    const errors = watchConsole(page);
    await open(page);
    await playTo(page, 30);
    const count = await watched(page);
    const digest = await page.getByTestId('watched').getAttribute('data-digest');
    const camera = await page.getByTestId('scene').getAttribute('data-camera');
    const box = await page.getByTestId('scene').boundingBox();
    if (!box) throw new Error('no scene');
    const at = (fx: number, fy: number) =>
      [box.x + box.width * fx, box.y + box.height * fy] as const;
    const drags: [readonly [number, number], readonly [number, number]][] = [
      [at(0.5, 0.2), at(0.5, 0.95)],
      [at(0.5, 0.95), at(0.5, 0.05)],
      [at(0.9, 0.5), at(0.1, 0.5)],
      [at(0.1, 0.5), at(0.9, 0.5)],
      [at(0.5, 0.05), at(0.5, 0.95)],
    ];
    for (const [from, to] of drags) {
      await page.mouse.move(from[0], from[1]);
      await page.mouse.down();
      await page.mouse.move(to[0], to[1], { steps: 12 });
      await page.mouse.up();
    }
    await page.mouse.move(...at(0.5, 0.5));
    await page.mouse.wheel(0, 800);
    await page.mouse.wheel(0, -1600);
    await page.screenshot({ path: 'test-results/viewer-panned.png' });
    await expect(page.getByTestId('scene')).not.toHaveAttribute('data-camera', camera ?? '');
    await expect(page.getByTestId('follow')).toHaveAttribute('aria-pressed', 'false');
    expect(await watched(page)).toBe(count);
    await expect(page.getByTestId('watched')).toHaveAttribute('data-digest', digest ?? '');
    expect(errors).toEqual([]);
  });

  test('dragging the playhead scrubs up to the edge; playback observes and extends the edge', async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await open(page);
    await playTo(page, 60);
    const end = await playhead(page);
    const seen = await watched(page);
    expect(seen).toBe(end);
    expect(await edge(page)).toBe(end);
    // drag back to 10: the scene follows within a frame, nothing is observed
    const from = await tickX(page, end);
    const to = await tickX(page, 10);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    const t = await playhead(page);
    expect(t).toBeLessThanOrEqual(12);
    // the frame drawn on the next animation frame shows the playhead's tick
    const drawn = await page.evaluate(
      `new Promise((r) => requestAnimationFrame(() => r(document.querySelector('[data-testid="scene"]').dataset.tick)))`,
    );
    expect(Number(drawn)).toBe(t);
    // dragging forward again stops at where the drag began (the playhead), never past the edge
    const past = await tickX(page, end + 30);
    await page.mouse.move(past.x, past.y, { steps: 8 });
    await page.mouse.up();
    expect(await playhead(page)).toBe(end);
    expect(await watched(page)).toBe(seen);
    // a click ahead of the playhead does nothing
    await page.keyboard.press('Home');
    await expect.poll(() => playhead(page)).toBe(0);
    const ahead = await tickX(page, 40);
    await page.mouse.click(ahead.x, ahead.y);
    expect(await playhead(page)).toBe(0);
    await page.screenshot({ path: 'test-results/viewer-scrubbed.png' });
    // playback over watched ticks adds nothing; past the edge it watches each tick and moves the edge
    await playTo(page, end + 10);
    const now = await playhead(page);
    expect(await edge(page)).toBe(now);
    expect(await watched(page)).toBe(now);
    expect(errors).toEqual([]);
  });

  test('untouched: the timeline frays when the boat leaves and playback stops there', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errors = watchConsole(page);
    await open(page);
    await page.keyboard.press('Space');
    await page.keyboard.press('l');
    await expect(page.getByTestId('fray')).toBeVisible({ timeout: 240_000 });
    await expect(page.getByTestId('speed')).toHaveAttribute('data-dir', 'pause');
    const t = await playhead(page);
    expect(t).toBe(1075); // golden untouched.s1: fray at 23:35
    expect(await edge(page)).toBe(1075);
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    expect(await playhead(page)).toBe(1075);
    await page.screenshot({ path: 'test-results/viewer-fray.png' });
    expect(errors).toEqual([]);
  });

  test('keyboard: Space, J, K, L, arrows, Home; End only with flags.jumpToEdge', async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await open(page);
    const speed = page.getByTestId('speed');
    await page.keyboard.press('Space');
    await expect(speed).toHaveAttribute('data-dir', 'fwd');
    await expect(speed).toHaveAttribute('data-tps', '4');
    await page.keyboard.press('Space');
    await expect(speed).toHaveAttribute('data-dir', 'pause');
    for (const tps of ['4', '16', '64', '256']) {
      await page.keyboard.press('l');
      await expect(speed).toHaveAttribute('data-tps', tps);
    }
    await page.keyboard.press('k');
    await expect(speed).toHaveAttribute('data-dir', 'pause');
    await page.keyboard.press('Home');
    await expect.poll(() => playhead(page)).toBe(0);
    const base = await playhead(page);
    for (let i = 1; i <= 3; i++) {
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => playhead(page)).toBe(base + i);
    }
    const seen = await watched(page);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => playhead(page)).toBe(base + 2);
    expect(await watched(page)).toBe(seen);
    // room to shuttle back: from tick 2 the shuttle reached the start and stopped before the second J
    // on a slow machine (CI, software WebGL)
    for (let i = 3; i <= 30; i++) {
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => playhead(page)).toBe(base + i);
    }
    await page.keyboard.press('j');
    await expect(speed).toHaveAttribute('data-dir', 'back');
    await page.keyboard.press('j');
    await expect(speed).toHaveAttribute('data-tps', '16');
    await page.keyboard.press('k');
    await page.keyboard.press('Home');
    await expect.poll(() => playhead(page)).toBe(0);
    await page.keyboard.press('End');
    await page.waitForTimeout(200);
    expect(await playhead(page)).toBe(0);
    await expect(page.getByTestId('jump-edge')).toHaveCount(0);
    // with the playtest flag, End jumps to the edge as a scrub
    await open(page, 'untouched', '&flag.jumpToEdge=1');
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await expect.poll(() => playhead(page)).toBe(3);
    await page.keyboard.press('Home');
    await page.keyboard.press('End');
    await expect.poll(() => playhead(page)).toBe(3);
    await expect(page.getByTestId('jump-edge')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the shuttle: faster than observeMaxTps behind the edge observes nothing, then plays live', async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await open(page);
    await playTo(page, 160);
    const end = await playhead(page);
    await page.keyboard.press('Home');
    await expect.poll(() => playhead(page)).toBe(0);
    for (let i = 0; i < 3; i++) await page.keyboard.press('l'); // 64 ticks/s
    await expect(page.getByTestId('speed')).toHaveAttribute('data-tps', '64');
    // midway, well behind the edge: a scrub, nothing new was watched
    await expect.poll(() => playhead(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(80);
    expect(await playhead(page)).toBeLessThan(end);
    expect(await watched(page)).toBe(end);
    // at the edge it is live playback, capped at observeMaxTps, and the edge moves with it
    await expect.poll(() => edge(page), { timeout: 10_000 }).toBeGreaterThan(end + 5);
    await page.keyboard.press('k');
    await expect(page.getByTestId('speed')).toHaveAttribute('data-dir', 'pause');
    await page.waitForTimeout(300); // an observe still on its way lands
    const at = await playhead(page);
    expect([await watched(page), await edge(page)]).toEqual([at, at]);
    expect(errors).toEqual([]);
  });

  test('reduced motion turns off the focus layer and pulsing; ghosts stay', async ({ page }) => {
    const errors = watchConsole(page);
    await open(page);
    await expect(page.getByTestId('scene')).not.toHaveAttribute('data-focus', 'off');
    await expect(page.getByTestId('scene')).toHaveAttribute('data-pulse', 'on');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.getByTestId('scene')).toHaveAttribute('data-focus', 'off');
    await expect(page.getByTestId('scene')).toHaveAttribute('data-pulse', 'off');
    await playTo(page, 60);
    expect(
      Number(await page.getByTestId('cat-gavrila').getAttribute('data-ghosts')),
    ).toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/viewer-reduced-motion.png' });
    expect(errors).toEqual([]);
  });

  for (const [width, height] of [
    [1280, 720],
    [1024, 640],
  ] as const) {
    test(`the layout holds at ${width}×${height}`, async ({ page }) => {
      const errors = watchConsole(page);
      await page.setViewportSize({ width, height });
      await open(page);
      await playTo(page, 20);
      const timeline = await page.getByTestId('timeline').boundingBox();
      const world = await page.getByTestId('world').boundingBox();
      const side = await page.getByTestId('side').boundingBox();
      if (!timeline || !world || !side) throw new Error('missing layout area');
      expect(timeline.height).toBeGreaterThanOrEqual(120);
      expect(timeline.width).toBeGreaterThanOrEqual(width - 1);
      expect(timeline.y + timeline.height).toBeLessThanOrEqual(height + 1);
      expect(world.width).toBeGreaterThan(width / 2);
      expect(world.height).toBeGreaterThan(height / 3);
      expect(side.x).toBeGreaterThanOrEqual(world.x + world.width - 1);
      await page.screenshot({ path: `test-results/viewer-layout-${width}x${height}.png` });
      expect(errors).toEqual([]);
    });
  }
});
