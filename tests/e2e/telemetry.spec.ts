// Telemetry (07 §6, M8): with no VITE_TELEMETRY_URL the page sends nothing anywhere, while the kept
// buffer still records the session, across a reload.
import { expect, test } from '@playwright/test';
import type { TelemetryEvent } from '../../src/telemetry/events';
import { landEdit, openGame, playTo, watchConsole } from './helpers';

test('with no VITE_TELEMETRY_URL no request leaves the page; the buffer keeps the session', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(5 * 60_000);
  const errors = watchConsole(page);
  const requests: { method: string; url: string }[] = [];
  page.on('request', (r) => requests.push({ method: r.method(), url: r.url() }));
  await openGame(page);
  await playTo(page, 40);
  // an edit: card_played and a recompute
  await page.getByTestId('object-melmans_whistle').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('inspect-close').click();
  await page.getByTestId('card-something_shiny').click();
  await page.getByTestId('cat-marti').focus();
  await page.keyboard.press('Enter');
  await landEdit(page);
  // leaving the page sends session_end to the buffer, never to the network
  await page.reload();
  await expect(page.locator('.shell')).toHaveAttribute('data-phase', 'play', { timeout: 120_000 });
  await page.waitForTimeout(1000);

  const origin = new URL(baseURL ?? '').origin;
  const away = requests.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith('blob:'));
  expect(away, 'requests to other origins').toEqual([]);
  expect(requests.filter((r) => r.method !== 'GET')).toEqual([]);

  const events = await page.evaluate<TelemetryEvent[]>(
    `JSON.parse(localStorage.getItem('acfw.telemetry') ?? '[]')`,
  );
  const names = events.map((e) => e.name);
  for (const n of ['session_start', 'inspect', 'card_played', 'session_end'])
    expect(names, names.join(' ')).toContain(n);
  expect(new Set(events.map((e) => e.session)).size).toBe(2);
  await expect(page.getByTestId('telemetry-notice')).toHaveCount(0);
  expect(errors).toEqual([]);
});
