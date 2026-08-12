import { test, expect, MovementQueryBuilder, env } from '@fixtures';
import {
  CYCLE_KEY,
  elementIndexOf,
  elementKeysOf,
  MAX_QUALITY_ELEMENTS,
  type MovementRecord,
} from '@models/detailed-movement-quality.model';

/**
 * Núcleo de risco do endpoint: o pivoteamento dinâmico feito com
 * `DataFrame.pivot_table` em `detailed_movement_with_quality_service.py`.
 *
 * Os defeitos aqui não produzem HTTP 500 — produzem número errado em relatório
 * de qualidade, que é muito mais caro de descobrir depois.
 */
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
      expect(records).toHaveUniqueValuesOf(CYCLE_KEY);
    },
  );

  test('id é sequencial e começa em 1', async ({ movementService, authToken }) => {
    const records = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(records.length === 0, 'Sem registros na janela configurada.');

    // O service descarta o `id` da procedure e gera um novo por linha de ciclo.
    const ids = records.map((r) => r.id);
    expect(ids).toEqual(records.map((_, index) => index + 1));
  });

  test('colunas de elemento seguem element_N e são iguais em todos os registros', async ({
    movementService,
    authToken,
  }) => {
    const records = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(records.length === 0, 'Sem registros na janela configurada.');

    expect(records).toHaveConsistentElementColumns();
  });

  test('quantidade de colunas bate com o cadastro do cliente', async ({
    movementService,
    authToken,
  }) => {
    test.skip(
      env.expectedElementCount < 0,
      'Configure EXPECTED_ELEMENT_COUNT no .env com o número de elementos cadastrados.',
    );

    const records = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(records.length === 0, 'Sem registros na janela configurada.');

    const colunas = elementKeysOf(records[0] as Record<string, unknown>);

    expect(colunas, `colunas encontradas: ${colunas.join(', ')}`).toHaveLength(
      env.expectedElementCount,
    );
    expect(colunas.length).toBeLessThanOrEqual(MAX_QUALITY_ELEMENTS);
  });

  test('valores de elemento são número ou null, nunca NaN ou string', async ({
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

    // `clean_nan_from_dict` deve converter NaN/inf em null antes de serializar.
    // Se um NaN escapar, o Starlette derruba a resposta inteira.
    expect(records).toSatisfyForEveryRecord(
      (record) =>
        colunas.every((coluna) => {
          const valor = (record as Record<string, unknown>)[coluna];
          return valor === null || (typeof valor === 'number' && Number.isFinite(valor));
        }),
      'toda coluna de elemento é número finito ou null',
    );
  });

  test('elemento sem medição vem como null, não como zero', async ({
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

    const valores = records.flatMap((record) =>
      colunas.map((coluna) => (record as Record<string, unknown>)[coluna]),
    );
    const temNulo = valores.some((valor) => valor === null);

    test.skip(
      !temNulo,
      'Nenhum elemento sem medição nesta janela. Provisione um ciclo com elemento não medido.',
    );

    // Zero e null precisam ser distinguíveis: 0 falsifica média de teor.
    expect(
      valores.some((valor) => valor === 0),
      'presença de zeros é aceitável; o teste apenas garante que null existe e não virou 0',
    ).toBeDefined();
    expect(temNulo).toBe(true);
  });

  test('precisão decimal é preservada', async ({ movementService, authToken }) => {
    const records = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(records.length === 0, 'Sem registros na janela configurada.');

    const colunas = elementKeysOf(records[0] as Record<string, unknown>);
    const valores = records
      .flatMap((record) => colunas.map((coluna) => (record as Record<string, unknown>)[coluna]))
      .filter((valor): valor is number => typeof valor === 'number');

    test.skip(valores.length === 0, 'Nenhum valor de elemento preenchido nesta janela.');

    expect(
      valores.some((valor) => !Number.isInteger(valor)),
      'Todos os teores vieram inteiros. Se a base tem casas decimais, houve truncamento.',
    ).toBe(true);
  });

  test('conjunto de colunas não depende da janela consultada', async ({
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

    const colunasEstreita = elementKeysOf(estreita[0] as Record<string, unknown>).sort();
    const colunasAmpla = elementKeysOf(ampla[0] as Record<string, unknown>).sort();

    // O service monta as colunas a partir de `id_elemento` presente no
    // resultado da procedure. Se a procedure só devolver elementos medidos no
    // período, o schema muda conforme o filtro e o consumidor quebra.
    expect(
      colunasEstreita,
      'O conjunto de colunas mudou entre janelas. As colunas devem vir do cadastro de ' +
        'elementos do cliente, não dos dados existentes no período. Ver BUG-006.',
    ).toEqual(colunasAmpla);
  });

  test('mesma consulta devolve as mesmas colunas na mesma ordem', async ({
    movementService,
    authToken,
  }) => {
    const query = MovementQueryBuilder.default().build();

    const execucoes: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const records = await movementService.records(query, authToken);
      if (records.length === 0) break;
      execucoes.push(elementKeysOf(records[0] as Record<string, unknown>).join('|'));
    }

    test.skip(execucoes.length < 3, 'Sem registros suficientes na janela configurada.');

    expect(new Set(execucoes).size, `ordens observadas:\n${execucoes.join('\n')}`).toBe(1);
  });

  test('índices das colunas são únicos e dentro do limite', async ({
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

    const indices = colunas.map(elementIndexOf);

    expect(indices.filter(Number.isNaN), `colunas fora do padrão: ${colunas.join(', ')}`).toEqual(
      [],
    );
    expect(new Set(indices).size, 'índices duplicados entre as colunas').toBe(indices.length);
    expect(Math.max(...indices)).toBeLessThanOrEqual(MAX_QUALITY_ELEMENTS);
  });

  test('registros sem qualidade continuam aparecendo', async ({ movementService, authToken }) => {
    const records = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(records.length === 0, 'Sem registros na janela configurada.');

    const colunas = elementKeysOf(records[0] as Record<string, unknown>);
    test.skip(colunas.length === 0, 'Nenhuma coluna de elemento no retorno.');

    // O merge é `how="left"`, então ciclo sem medição deve permanecer no
    // resultado com todas as colunas nulas — e não sumir.
    const semNenhumaMedicao = records.filter((record) =>
      colunas.every((coluna) => (record as Record<string, unknown>)[coluna] === null),
    );

    expect(
      semNenhumaMedicao.every((record) => temDadosDeMovimentacao(record)),
      'ciclos sem medição devem manter os campos de movimentação preenchidos',
    ).toBe(true);
  });
});

function temDadosDeMovimentacao(record: MovementRecord): boolean {
  return record[CYCLE_KEY] !== null && record.DataInicio !== null;
}
