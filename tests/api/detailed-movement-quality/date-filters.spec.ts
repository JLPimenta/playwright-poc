import { env, expect, MovementQueryBuilder, test } from '@fixtures';
import { apiDayToIso, INVALID_DATES } from '@data/date.builder';

test.describe('Filtros de data', { tag: ['@contract'] }, () => {
  test('dataIn e dataFi são obrigatórios sem last_update_timestamp', async ({
    movementService,
    authToken,
  }) => {
    const casos = [
      { nome: 'só dataFi', query: MovementQueryBuilder.default().dataIn(undefined).build() },
      { nome: 'só dataIn', query: MovementQueryBuilder.default().dataFi(undefined).build() },
      { nome: 'nenhuma data', query: {} },
    ];

    for (const caso of casos) {
      const result = await movementService.fetch(caso.query, authToken);

      expect.soft(result.status, `${caso.nome}: esperado 400`).toBe(400);
      expect.soft(String(result.text), `${caso.nome}`).toContain('obrigatórios');
    }
  });

  test(
    'intervalo invertido devolve erro claro',
    { tag: ['@smoke'] },
    async ({ movementService, authToken }) => {
      const result = await movementService.fetch(
        MovementQueryBuilder.default().window('10-08-2026 00:00:00', '01-08-2026 00:00:00').build(),
        authToken,
      );

      expect(result.status).toBe(400);
      expect(String(result.text)).toContain('não pode ser maior');
    },
  );

  test('data inválida devolve 400 sem vazar implementação', async ({
    movementService,
    authToken,
  }) => {
    for (const [nome, valor] of Object.entries(INVALID_DATES)) {
      const result = await movementService.fetch(
        MovementQueryBuilder.default().dataIn(valor).build(),
        authToken,
      );

      // 429 aqui não é falha do endpoint, é a suíte batendo no rate limit —
      // distinguir os dois evita caçar um defeito que não existe.
      expect
        .soft(result.status, `dataIn="${valor}" (${nome}): rate limit da API atingido`)
        .not.toBe(429);
      expect.soft(result.status, `dataIn="${valor}" (${nome})`).toBe(400);
      expect.soft(result.text, `dataIn="${valor}" (${nome})`).toNotLeakImplementationDetails();
    }
  });

  test('a janela filtra e é lida como dia-mês', async ({ movementService, authToken }) => {
    const dia = env.windows.ddmmDay;
    const esperado = apiDayToIso(dia);

    const records = await movementService.records(
      MovementQueryBuilder.default().window(`${dia} 00:00:00`, `${dia} 23:59:59`).build(),
      authToken,
    );

    test.skip(
      records.length === 0,
      `Sem registros em ${dia}. Aponte DATA_DDMM_DAY para um dia com massa, ` +
        'de preferência um em que a leitura MM-dd não retornaria nada.',
    );

    expect(records).toSatisfyForEveryRecord(
      (record) => record.start_date === esperado,
      `start_date = ${esperado} em todos os registros`,
    );
  });
});

/**
 * Regra vigente do critério de aceite: quando `dataIn` e `dataFi` são
 * informados, `last_update_timestamp` é desconsiderado. A implementação faz o
 * oposto — estes testes seguem o critério e ficam vermelhos até a correção.
 */
test.describe('last_update_timestamp', { tag: ['@contract'] }, () => {
  test('sozinho, dispensa dataIn e dataFi', async ({ movementService, authToken }) => {
    const result = await movementService.fetch(
      { last_update_timestamp: '01-07-2026 00:00:00' },
      authToken,
    );

    expect(result.status, `corpo: ${result.text.slice(0, 300)}`).toBe(200);
  });

  test('é desconsiderado quando a janela é informada', async ({ movementService, authToken }) => {
    const janela = MovementQueryBuilder.default().build();

    const somenteJanela = await movementService.fetchValid(janela, authToken);
    test.skip(
      somenteJanela.Pagination.total_records === 0,
      'Janela DATA_IN/DATA_FI sem registros. Ajuste o .env.',
    );

    // Corte no futuro: se fosse considerado, zeraria o resultado.
    const comCorteFuturo = await movementService.fetchValid(
      { ...janela, last_update_timestamp: '01-01-2099 00:00:00' },
      authToken,
    );

    expect(
      comCorteFuturo.Pagination.total_records,
      'com dataIn e dataFi informados, o corte de atualização deve ser ignorado',
    ).toBe(somenteJanela.Pagination.total_records);
  });
});
