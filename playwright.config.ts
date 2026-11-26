import { defineConfig, devices } from '@playwright/test';

// The production build is served under a sub-path to prove it runs from any folder (M0 acceptance).
export const SUB_PATH = '/some/sub/path/';
const PORT = 4318;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  // three at a time: more starve the pages that vet live and play the day (M7 handoff; Tagir, M8-1)
  workers: 3,
  use: { baseURL: `http://localhost:${PORT}${SUB_PATH}` },
  // CI runs Chromium only (07 §7); all three engines run locally before release (02 §1)
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `npx tsx tests/e2e/serve.ts ${PORT} ${SUB_PATH}`,
    url: `http://localhost:${PORT}${SUB_PATH}`,
    reuseExistingServer: false,
  },
});
