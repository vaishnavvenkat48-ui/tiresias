import { defineConfig } from '@playwright/test';

/**
 * Core-loop browser test. Uses the locally installed Google Chrome (no browser
 * download). Expects the backend on :5000 and the Vite dev server on :5173 —
 * start them with `npm run dev` from the repo root, or set E2E_BASE_URL.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    channel: process.env.E2E_CHANNEL || 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
