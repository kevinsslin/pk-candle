import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/e2e-dev.mjs',
    url: 'http://127.0.0.1:5173',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
