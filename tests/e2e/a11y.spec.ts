// The accessibility pass (06 §8, M8 item 5): every control has an accessible name and is reachable by
// keyboard; reduced motion stops the pulsing, the focus layer and animations; text is never under
// 14 px and its contrast is at least 4.5:1. The debug panel is developer-only and left out. Text drawn
// straight over the world view (labels, clusters) has no background of its own to measure; it is
// counted and listed in the report, not judged here.
import { expect, test, type Page } from '@playwright/test';
import { landEdit, openGame, playTo, unfocus, watchConsole } from './helpers';

interface Finding {
  what: string;
  text: string;
  detail: string;
}

/** Visible controls without an accessible name. */
const unnamed = (page: Page): Promise<Finding[]> =>
  page.evaluate<Finding[]>(`(() => {
    const out = [];
    const sel = 'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest('[data-testid="debug"]')) continue;
      const r = el.getBoundingClientRect();
      const hidden = el.closest('.sr-only') === null && (r.width === 0 || r.height === 0);
      if (hidden) continue;
      const labelled = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') ||
        el.getAttribute('title') || (el.labels && el.labels.length > 0) ||
        el.querySelector('title') || (el.textContent || '').trim();
      if (!labelled)
        out.push({ what: el.tagName.toLowerCase(), text: el.outerHTML.slice(0, 120), detail: '' });
    }
    return out;
  })()`);

/** Text under 14 px, and text whose contrast with its own background is under 4.5:1. */
const textChecks = (page: Page): Promise<{ small: Finding[]; low: Finding[]; overWorld: number }> =>
  page.evaluate(`(() => {
    const rgb = (s) => (s.match(/[\\d.]+/g) || []).map(Number);
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const over = (top, bottom) => { const a = top[3] ?? 1; return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)); };
    /** The colour behind an element: its ancestors' backgrounds composed, or null over the canvas. */
    const behind = (el) => {
      const layers = [];
      for (let e = el; e; e = e.parentElement) {
        if (e.classList && (e.classList.contains('scene-css') || e.classList.contains('world'))) return null;
        const c = rgb(getComputedStyle(e).backgroundColor);
        if (c.length >= 3 && (c[3] ?? 1) > 0) { layers.push(c); if ((c[3] ?? 1) >= 1) break; }
      }
      let base = [27, 29, 34];
      for (const l of layers.reverse()) base = over(l, base);
      return base;
    };
    const small = [], low = [];
    let overWorld = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || seen.has(el) || !(n.textContent || '').trim()) continue;
      seen.add(el);
      if (el.closest('[data-testid="debug"], .sr-only, svg, option, script, style')) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      const text = (n.textContent || '').trim().slice(0, 40);
      const size = parseFloat(cs.fontSize);
      if (size < 14) small.push({ what: el.className || el.tagName, text, detail: size + 'px' });
      const bg = behind(el);
      if (!bg) { overWorld++; continue; }
      const fg = over(rgb(cs.color), bg);
      const k = ratio(fg, bg);
      if (k < 4.5) low.push({ what: el.className || el.tagName, text, detail: k.toFixed(2) });
    }
    return { small, low, overWorld };
  })()`);

test('controls are named and reachable by keyboard; text size and contrast hold', async ({
  page,
}) => {
  test.setTimeout(5 * 60_000);
  const errors = watchConsole(page);
  await openGame(page);
  await playTo(page, 40);
  await page.getByTestId('settings-open').click(); // the settings panel's controls too

  expect(await unnamed(page), 'controls without a name').toEqual([]);
  const text = await textChecks(page);
  console.log(`a11y: ${text.overWorld} text elements drawn over the world view, not measured`);
  expect(text.small, 'text under 14 px').toEqual([]);
  expect(text.low, 'contrast under 4.5:1').toEqual([]);
  await page.getByTestId('settings-close').click();

  // keyboard alone reaches the controls: Tab visits play, the powers, the settings and the pins
  await unfocus(page);
  const visited = new Set<string>();
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate<string>(
      `document.activeElement?.getAttribute('data-testid') ?? ''`,
    );
    if (id) visited.add(id);
  }
  for (const id of ['play', 'power-lure', 'power-gaze', 'settings-open', 'locale-en'])
    expect([...visited], id).toContain(id);
  // a card held by its number, pinned by Tab and Enter, withdrawn by Delete; Escape puts a card down
  await page.getByTestId('object-melmans_whistle').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await unfocus(page);
  await page.keyboard.press('1');
  await expect(page.locator('.hand .card[aria-pressed="true"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.hand .card[aria-pressed="true"]')).toHaveCount(0);
  await page.keyboard.press('1');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await landEdit(page);
  await expect(page.locator('[data-testid^="pin-"]')).toHaveCount(1);
  await page.locator('[data-testid^="pin-"]').focus();
  await page.keyboard.press('Delete');
  await landEdit(page);
  await expect(page.locator('[data-testid^="pin-"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('text size 150% keeps the layout; reduced motion stops pulsing and animation', async ({
  page,
}) => {
  test.setTimeout(5 * 60_000);
  const errors = watchConsole(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
  await playTo(page, 30);
  const scene = page.getByTestId('scene');
  await expect(scene).toHaveAttribute('data-pulse', 'off');
  await expect(scene).toHaveAttribute('data-focus', 'off');
  // an edit: no ripple animation, the edit still lands and shows
  await page.getByTestId('object-melmans_whistle').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('inspect-close').click();
  await page.getByTestId('card-something_shiny').click();
  await page.getByTestId('cat-marti').focus();
  await page.keyboard.press('Enter');
  // animations and transitions running longer than a frame
  const running = () =>
    page.evaluate<number>(
      `document.getAnimations().filter((a) => a.playState === 'running' &&
        Number(a.effect?.getTiming().duration) > 1).length`,
    );
  expect(await running()).toBe(0);
  await landEdit(page);
  expect(await running()).toBe(0);
  await page.screenshot({ path: 'test-results/a11y-reduced-motion.png' });

  // the largest text size: no control spills off the 1280×720 view
  await page.getByTestId('settings-open').click();
  await page.getByTestId('text-150').click();
  await page.getByTestId('settings-close').click();
  const spill = await page.evaluate<number>(
    `[...document.querySelectorAll('button, [data-testid="timeline"]')]
      .filter((el) => !el.closest('[data-testid="debug"]'))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.right > innerWidth + 1 || r.bottom > innerHeight + 1)).length`,
  );
  await page.screenshot({ path: 'test-results/a11y-text-150.png' });
  expect(spill).toBe(0);
  expect(errors).toEqual([]);
});
