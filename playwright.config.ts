import { defineConfig, devices } from '@playwright/test';

const port = '3101';
const baseURL = `http://127.0.0.1:${port}`;
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: 'test-results',
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : [['line']],
  retries: process.env.CI ? 1 : 0,
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    launchOptions:
      chromiumExecutable === undefined
        ? {}
        : { executablePath: chromiumExecutable },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node .next/standalone/server.js',
    env: {
      HOSTNAME: '127.0.0.1',
      PORT: port,
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `${baseURL}/api/health/live`,
  },
  workers: 1,
});
