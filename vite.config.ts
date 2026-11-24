/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import solid from '@solidjs/vite-plugin';

export default defineConfig({
  base: './', // the build runs from any folder or sub-path, including an itch.io zip
  plugins: [solid()],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    projects: [
      // everything but the timing tests, in parallel (npm run test)
      {
        extends: true,
        test: { name: 'unit', include: ['tests/**/*.test.ts'], exclude: ['tests/budget/**'] },
      },
      // the timing tests (07 §4), alone so other suites do not share the CPU (npm run bench)
      { extends: true, test: { name: 'budget', include: ['tests/budget/**/*.test.ts'] } },
    ],
  },
});
