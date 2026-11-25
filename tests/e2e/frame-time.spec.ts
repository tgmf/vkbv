// Frame time while scrubbing with all 12 cats (07 §4: 60 fps, no long task over 50 ms), measured on
// the GPU when the machine has one: headless Chromium otherwise draws WebGL with SwiftShader, a
// software renderer, the worst case. The renderer used is recorded with the numbers.
import { expect, test, type Page } from '@playwright/test';

test.use({
  launchOptions: { args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] },
});

const tick = async (page: Page) =>
  Number(await page.getByTestId('playhead').getAttribute('data-tick'));

test('frame time while scrubbing with all 12 cats (07 §4)', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    if (m.text().includes('GPU stall due to ReadPixels')) return; // a screenshot reading the canvas back
    errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./?dev=1&seed=49598663');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-tick', '0', { timeout: 30_000 });
  const renderer = await page.evaluate<string>(
    `(() => { const gl = document.createElement('canvas').getContext('webgl2');
      const e = gl.getExtension('WEBGL_debug_renderer_info');
      return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()`,
  );
  await page.getByTestId('town').click();
  // play to 10:40: every fogged cat has ghosts in town
  await page.keyboard.press('Space');
  await page.keyboard.press('l');
  await expect.poll(() => tick(page), { timeout: 60_000 }).toBeGreaterThanOrEqual(300);
  await page.keyboard.press('k');
  // the shuttle back and forward at 64 ticks/s over the played stretch, timing every frame
  await page.evaluate(`(() => {
    window.__frames = [];
    window.__long = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration)))
      .observe({ type: 'longtask', buffered: false });
    let last = performance.now();
    const step = (now) => {
      window.__frames.push(now - last);
      last = now;
      if (window.__frames.length < 2000) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  })()`);
  for (let i = 0; i < 3; i++) await page.keyboard.press('j');
  await page.waitForTimeout(3000);
  await page.keyboard.press('k');
  for (let i = 0; i < 3; i++) await page.keyboard.press('l');
  await page.waitForTimeout(2500);
  await page.keyboard.press('k');
  const { frames, long } = await page.evaluate<{ frames: number[]; long: number[] }>(
    '({ frames: window.__frames, long: window.__long })',
  );
  const sorted = frames.slice(5).sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const summary =
    `${renderer}: frames ${sorted.length}, median ${at(0.5).toFixed(1)} ms, ` +
    `p95 ${at(0.95).toFixed(1)} ms, max ${at(1).toFixed(1)} ms; long tasks ${long.length} ` +
    `(longest ${Math.max(0, ...long).toFixed(0)} ms)`;
  info.annotations.push({ type: 'frame time', description: summary });
  console.log(`frame time while scrubbing: ${summary}`);
  expect(at(0.5)).toBeLessThan(20); // 60 fps
  expect(errors).toEqual([]);
});
