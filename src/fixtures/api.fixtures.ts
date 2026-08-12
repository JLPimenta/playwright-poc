import {
  type APIRequestContext,
  request as playwrightRequest,
  test as base,
} from '@playwright/test';
import { env } from '@config/env';
import { HttpClient } from '@core/http-client';
import { AuthService } from '@services/auth.service';
import { DetailedMovementQualityService } from '@services/detailed-movement-quality.service';

interface WorkerFixtures {
  authToken: string;
}

/** Fixtures de escopo `test`. */
interface TestFixtures {
  http: HttpClient;
  authService: AuthService;
  movementService: DetailedMovementQualityService;

  /** Contexto sem `Authorization`, para os testes de autenticação. */
  anonymousHttp: HttpClient;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  authToken: [
    async ({}, use) => {
      const context = await createApiContext();
      try {
        const token = await new AuthService(new HttpClient(context)).login();
        await use(token);
      } finally {
        await context.dispose();
      }
    },
    { scope: 'worker' },
  ],

  http: async ({ request }, use) => {
    await use(new HttpClient(request));
  },

  anonymousHttp: async ({}, use) => {
    const context = await createApiContext();
    try {
      await use(new HttpClient(context));
    } finally {
      await context.dispose();
    }
  },

  authService: async ({ http }, use) => {
    await use(new AuthService(http));
  },

  movementService: async ({ http }, use) => {
    await use(new DetailedMovementQualityService(http));
  },
});

async function createApiContext(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    baseURL: env.api.baseUrl,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { Accept: 'application/json' },
  });
}
