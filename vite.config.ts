/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import solid from '@solidjs/vite-plugin';

export default defineConfig({
  base: './', // the build runs from any folder or sub-path, including an itch.io zip
  plugins: [solid()],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
