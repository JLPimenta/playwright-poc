import { test, expect, MovementQueryBuilder } from '@fixtures';
import { INVALID_DATES, TOLERATED_DATE_FORMATS } from '@data/date.builder';

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
      expect
        .soft(String(result.text), `${caso.nome}: mensagem não identifica os campos`)
        .toContain('obrigatórios');
    }
  });

  test(
    'dataIn maior que dataFi retorna erro claro',
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

  test('datas inválidas retornam 400 e não erro de servidor', async ({
    movementService,
    authToken,
  }) => {
    for (const [nome, valor] of Object.entries(INVALID_DATES)) {
      const result = await movementService.fetch(MovementQueryBuilder.default().dataIn(valor).build(), authToken);

      expect.soft(result.status, `dataIn="${valor}" (${nome})`).toBe(400);
      expect.soft(result.text, `dataIn="${valor}" (${nome})`).toNotLeakImplementationDetails();
    }
  });

  test('parser aceita formatos além do documentado', async ({ movementService, authToken }) => {
    // A API usa `dateutil.parser.parse(..., dayfirst=True)`, que é mais
    // permissivo do que o `dd-MM-YYYY HH:mm:ss` da documentação.
    // O teste registra o comportamento real; ver BUG-005.
    for (const [nome, valor] of Object.entries(TOLERATED_DATE_FORMATS)) {
      const result = await movementService.fetch(
        MovementQueryBuilder.default().dataIn(valor).build(),
        authToken,
      );

      expect
        .soft(result.status, `formato "${valor}" (${nome}) devolveu ${result.status}`)
        .toBe(200);
    }
  });

  test('data é interpretada como dia-mês, não mês-dia', async ({ movementService, authToken }) => {
    // 03-04-2026 deve significar 3 de abril. Se o parser lesse mês primeiro,
    // a janela cairia em 4 de março e nenhum registro do dia 3 apareceria.
    const records = await movementService.records(
      MovementQueryBuilder.default().window('03-04-2026 00:00:00', '03-04-2026 23:59:59').build(),
      authToken,
    );

    test.skip(
      records.length === 0,
      'Sem registros em 03-04-2026. Provisione massa nesse dia para provar a leitura dd-MM.',
    );

    expect(records).toSatisfyForEveryRecord(
      (record) => record.DataInicio === '2026-04-03',
      'registros caem em 3 de abril (e não em 4 de março)',
    );
  });

  test('janela retornada respeita o intervalo solicitado', async ({
    movementService,
    authToken,
  }) => {
    const records = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(records.length === 0, 'Sem registros na janela configurada.');

    const { dataIn, dataFi } = MovementQueryBuilder.default().build();
    const inicio =
      (dataIn as string).slice(6, 10) +
      '-' +
      (dataIn as string).slice(3, 5) +
      '-' +
      (dataIn as string).slice(0, 2);
    const fim =
      (dataFi as string).slice(6, 10) +
      '-' +
      (dataFi as string).slice(3, 5) +
      '-' +
      (dataFi as string).slice(0, 2);

    expect(records).toSatisfyForEveryRecord(
      (record) =>
        typeof record.DataInicio !== 'string' ||
        (record.DataInicio >= inicio && record.DataInicio <= fim),
      `DataInicio dentro de [${inicio}, ${fim}]`,
    );
  });
});

test.describe('last_update_timestamp', { tag: ['@contract'] }, () => {
  test('dispensa dataIn e dataFi', { tag: ['@smoke'] }, async ({ movementService, authToken }) => {
    const result = await movementService.fetch(
      { last_update_timestamp: '01-01-2020 00:00:00' },
      authToken,
    );

    expect(result.status, `corpo: ${result.text.slice(0, 300)}`).toBe(200);
  });

  test('quando informado, dataIn e dataFi são ignorados', async ({
    movementService,
    authToken,
  }) => {
    const corte = '01-01-2020 00:00:00';

    const somenteCorte = await movementService.fetchValid(
      { last_update_timestamp: corte },
      authToken,
    );

    // Janela de datas que, sozinha, não retornaria nada.
    const corteComJanelaVazia = await movementService.fetchValid(
      {
        last_update_timestamp: corte,
        dataIn: '01-01-1990 00:00:00',
        dataFi: '02-01-1990 00:00:00',
      },
      authToken,
    );

    test.skip(
      somenteCorte.Pagination.total_records === 0,
      'Nenhum registro atualizado após o corte. Ajuste a massa de teste.',
    );

    expect(
      corteComJanelaVazia.Pagination.total_records,
      'a regra é ignorar dataIn/dataFi quando last_update_timestamp é informado',
    ).toBe(somenteCorte.Pagination.total_records);
  });

  test('dataIn inválido é ignorado junto com a janela', async ({ movementService, authToken }) => {
    // `validate_date_range` retorna antes de validar dataIn quando
    // last_update_timestamp está presente. O teste fixa esse contrato.
    const result = await movementService.fetch(
      { last_update_timestamp: '01-01-2020 00:00:00', dataIn: 'lixo' },
      authToken,
    );

    expect(result.status).toBe(200);
  });

  test('formato inválido retorna 400', async ({ movementService, authToken }) => {
    for (const valor of ['ontem', '31-02-2026 00:00:00', '']) {
      const result = await movementService.fetch({ last_update_timestamp: valor }, authToken);
      expect.soft(result.status, `last_update_timestamp="${valor}"`).toBe(400);
    }
  });

  test('corte no futuro retorna lista vazia', async ({ movementService, authToken }) => {
    const response = await movementService.fetchValid(
      { last_update_timestamp: '01-01-2099 00:00:00' },
      authToken,
    );

    expect(response.Result).toEqual([]);
  });
});
