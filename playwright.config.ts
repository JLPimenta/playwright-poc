import { defineConfig, devices } from '@playwright/test';
import { env } from '@config/env';

/**
 * Dois projects independentes:
 *  - `api`   → testes de contrato/integração da Data API, sem browser;
 *  - `e2e`   → testes de interface, já configurado para quando as telas entrarem.
 *
 * Rodar só um: `npm run test:api` / `npm run test:e2e`.
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,

  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI
    ? [
        ['list'],
        ['html', { open: 'never' }],
        ['junit', { outputFile: 'test-results/junit.xml' }],
        ['blob'],
      ]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    /** Alinhado ao atributo que o time de Web usa nos componentes. */
    testIdAttribute: 'data-testid',
  },

  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      use: {
        baseURL: env.api.baseUrl,
        extraHTTPHeaders: { Accept: 'application/json' },
      },
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: env.web.baseUrl,
      },
    },
  ],
});
