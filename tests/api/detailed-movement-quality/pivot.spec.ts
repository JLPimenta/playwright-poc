import { env, expect, MovementQueryBuilder, test } from '@fixtures';
import {
  CYCLE_KEY,
  elementKeysOf,
  MAX_QUALITY_ELEMENTS,
} from '@models/detailed-movement-quality.model';

test.describe('Pivot dinâmico de elementos', { tag: ['@regression'] }, () => {
  test(
    'cada ciclo aparece uma única vez',
    { tag: ['@smoke'] },
    async ({ movementService, authToken }) => {
      const records = await movementService.records(
        MovementQueryBuilder.default().build(),
        authToken,
      );
      test.skip(records.length === 0, 'Sem registros na janela configurada.');

      // Pivot mal aplicado transforma cada linha de elemento numa linha de resultado e infla toda métrica de massa movimentada.
      expect(records).toHaveUniqueValuesOf(CYCLE_KEY);
    },
  );

  test('colunas de elemento são estáveis dentro da resposta', async ({
    movementService,
    authToken,
  }) => {
    const records = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(records.length === 0, 'Sem registros na janela configurada.');

    expect(records).toHaveConsistentElementColumns();

    const colunas = elementKeysOf(records[0] as Record<string, unknown>);
    expect(colunas.length, 'limite de elementos de qualidade').toBeLessThanOrEqual(
      MAX_QUALITY_ELEMENTS,
    );

    test.skip(
      env.expectedElementCount < 0,
      'Informe EXPECTED_ELEMENT_COUNT no .env para conferir a quantidade de colunas.',
    );

    expect(
      colunas,
      `colunas: ${colunas.join(', ')}. Vindo menos que o cadastrado, a procedure só ` +
        'devolve elementos com medição no período — ver BUG-006.',
    ).toHaveLength(env.expectedElementCount);
  });

  test('teor é número finito ou null, nunca NaN ou texto', async ({
    movementService,
    authToken,
  }) => {
    const records = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(records.length === 0, 'Sem registros na janela configurada.');

    const colunas = elementKeysOf(records[0] as Record<string, unknown>);
    test.skip(colunas.length === 0, 'Nenhuma coluna de elemento no retorno.');

    expect(records).toSatisfyForEveryRecord(
      (record) =>
        colunas.every((coluna) => {
          const valor = (record as Record<string, unknown>)[coluna];
          return valor === null || (typeof valor === 'number' && Number.isFinite(valor));
        }),
      'toda coluna de elemento é número finito ou null',
    );
  });

  test('o conjunto de colunas não muda com a janela consultada', async ({
    movementService,
    authToken,
  }) => {
    const estreita = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    const ampla = await movementService.records(
      MovementQueryBuilder.default().wideWindow().build(),
      authToken,
    );

    test.skip(estreita.length === 0 || ampla.length === 0, 'Uma das janelas está sem registros.');

    expect(
      elementKeysOf(estreita[0] as Record<string, unknown>).sort(),
      'As colunas devem vir do cadastro de elementos do cliente, não dos dados do ' +
        'período. Se mudam com o filtro, o consumidor quebra de forma intermitente. ' +
        'Ver BUG-006.',
    ).toEqual(elementKeysOf(ampla[0] as Record<string, unknown>).sort());
  });

  test('ciclo sem medição continua no resultado', async ({ movementService, authToken }) => {
    const records = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(records.length === 0, 'Sem registros na janela configurada.');

    const colunas = elementKeysOf(records[0] as Record<string, unknown>);
    test.skip(colunas.length === 0, 'Nenhuma coluna de elemento no retorno.');

    const semQualidade = records.filter((record) =>
      colunas.every((coluna) => (record as Record<string, unknown>)[coluna] === null),
    );
    test.skip(semQualidade.length === 0, 'Todos os ciclos da janela têm medição.');

    expect(semQualidade).toSatisfyForEveryRecord(
      (record) => record[CYCLE_KEY] !== null && record.datetime_start !== null,
      'ciclo sem medição mantém os campos de movimentação',
    );
  });
});
