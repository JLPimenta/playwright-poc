import { test, expect, MovementQueryBuilder, env } from '@fixtures';

/**
 * O endpoint é limitado por `@limiter.limit(f"{LIMIT_REQUESTS}/minute")`
 * (slowapi, chave = IP de origem). O default do código é 10/minuto.
 *
 * Este spec roda serialmente e sem retry: ele *precisa* estourar o limite.
 * Por isso está isolado dos demais — se rodasse junto, contaminaria a contagem
 * das outras requisições do mesmo IP.
 */
test.describe('Rate limit', { tag: ['@regression'] }, () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  test('estoura o limite configurado e responde 429', async ({ movementService, authToken }) => {
    test.skip(
      env.rateLimit.retry,
      'RETRY_ON_RATE_LIMIT=true mascara o 429. Desative para rodar este teste.',
    );
    test.skip(
      env.rateLimit.perMinute > 60,
      `RATE_LIMIT_PER_MINUTE=${env.rateLimit.perMinute} é alto demais para exercitar em teste.`,
    );

    const tentativas = env.rateLimit.perMinute + 3;
    const query = MovementQueryBuilder.default().emptyWindow().build();
    const statuses: number[] = [];

    for (let i = 0; i < tentativas; i += 1) {
      const result = await movementService.fetch(query, authToken);
      statuses.push(result.status);
      if (result.status === 429) break;
    }

    expect(
      statuses,
      `nenhuma das ${tentativas} requisições foi limitada. Statuses: ${statuses.join(', ')}. ` +
        'O rate limit protege a API de consulta pesada — se não dispara, é achado de segurança.',
    ).toContain(429);
  });

  test('resposta 429 não vaza detalhes de implementação', async ({
    movementService,
    authToken,
  }) => {
    test.skip(env.rateLimit.retry, 'RETRY_ON_RATE_LIMIT=true mascara o 429.');
    test.skip(env.rateLimit.perMinute > 60, 'Limite alto demais para exercitar em teste.');

    const query = MovementQueryBuilder.default().emptyWindow().build();
    let corpoDoBloqueio: string | null = null;

    for (let i = 0; i < env.rateLimit.perMinute + 3 && corpoDoBloqueio === null; i += 1) {
      const result = await movementService.fetch(query, authToken);
      corpoDoBloqueio = result.status === 429 ? result.text : null;
    }

    test.skip(corpoDoBloqueio === null, 'Limite não foi atingido nesta execução.');

    expect(corpoDoBloqueio ?? '').toNotLeakImplementationDetails();
  });
});
