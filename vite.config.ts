/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import solid from '@solidjs/vite-plugin';

export default defineConfig({
  plugins: [solid()],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
