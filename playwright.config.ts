import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:4173', headless: true, ...(process.env['PLAYWRIGHT_CHROMIUM_PATH'] ? { launchOptions: { executablePath: process.env['PLAYWRIGHT_CHROMIUM_PATH'], args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] } } : {}) },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
});
