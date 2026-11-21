import { defineConfig, devices } from '@playwright/test';

// The production build is served under a sub-path to prove it runs from any folder (M0 acceptance).
export const SUB_PATH = '/some/sub/path/';
const PORT = 4318;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  use: { baseURL: `http://localhost:${PORT}${SUB_PATH}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx tsx tests/e2e/serve.ts ${PORT} ${SUB_PATH}`,
    url: `http://localhost:${PORT}${SUB_PATH}`,
    reuseExistingServer: false,
  },
});
