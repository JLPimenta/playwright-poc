import { expect, idsFor, LIST_FILTERS, MovementQueryBuilder, test } from '@fixtures';
import { FILTER_TO_FIELD } from '@data/query.builder';

test.describe('Filtros de lista', { tag: ['@regression'] }, () => {
  test('cada filtro informado restringe o resultado', async ({ movementService, authToken }) => {
    const configurados = LIST_FILTERS.filter((filtro) => idsFor(filtro).length > 0);
    test.skip(configurados.length === 0, 'Configure os ids dos filtros no .env.');

    const semFiltro = await movementService.fetchValid(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(semFiltro.Pagination.total_records === 0, 'Sem registros na janela configurada.');

    for (const filtro of configurados) {
      const ids = idsFor(filtro);
      const campo = FILTER_TO_FIELD[filtro];

      const comFiltro = await movementService.fetchValid(
        MovementQueryBuilder.default().withIds(filtro, ids.slice(0, 1)).build(),
        authToken,
      );

      expect
        .soft(
          comFiltro.Pagination.total_records,
          `${filtro}=${ids[0]} devolveu mais registros que a consulta sem filtro`,
        )
        .toBeLessThanOrEqual(semFiltro.Pagination.total_records);

      if (comFiltro.Result.length === 0) continue;

      const distintos = new Set(comFiltro.Result.map((r) => (r as Record<string, unknown>)[campo]));

      expect
        .soft(
          distintos.size,
          `com um único id de ${filtro}, esperava um valor de ${campo}; ` +
            `vieram: ${[...distintos].join(', ')}`,
        )
        .toBe(1);
    }
  });

  test('filtros combinados aplicam interseção', async ({ movementService, authToken }) => {
    const configurados = LIST_FILTERS.filter((filtro) => idsFor(filtro).length > 0);
    test.skip(configurados.length < 2, 'Configure ao menos 2 filtros de lista no .env.');

    const builder = MovementQueryBuilder.default();
    for (const filtro of configurados) {
      builder.withIds(filtro, idsFor(filtro).slice(0, 1));
    }

    const combinado = await movementService.records(builder.build(), authToken);
    test.skip(combinado.length === 0, 'A combinação de filtros não retornou registros.');

    for (const filtro of configurados) {
      const campo = FILTER_TO_FIELD[filtro];
      const distintos = new Set(combinado.map((r) => (r as Record<string, unknown>)[campo]));

      expect.soft(distintos.size, `${campo} sob filtro combinado`).toBe(1);
    }
  });

  test('id inexistente devolve lista vazia sem erro', async ({ movementService, authToken }) => {
    const result = await movementService.fetch(
      MovementQueryBuilder.default().withRaw('id_equips', '999999999').build(),
      authToken,
    );

    expect(result.status, `corpo: ${result.text.slice(0, 300)}`).toBe(200);
    expect((result.body as { Result: unknown[] }).Result).toEqual([]);
  });

  test('only_completed_cycles restringe por exception_type', async ({
    movementService,
    authToken,
  }) => {
    const todos = await movementService.fetchValid(
      MovementQueryBuilder.default().onlyCompletedCycles(false).build(),
      authToken,
    );
    test.skip(todos.Result.length === 0, 'Sem registros na janela configurada.');

    const completos = await movementService.fetchValid(
      MovementQueryBuilder.default().onlyCompletedCycles(true).build(),
      authToken,
    );

    const rotulo = (registro: (typeof todos.Result)[number]) =>
      registro.exception_type === null ? '(null)' : String(registro.exception_type);

    const tiposTodos = new Set(todos.Result.map(rotulo));
    const tiposCompletos = new Set(completos.Result.map(rotulo));

    expect(
      completos.Pagination.total_records,
      'ciclos completos não podem exceder o total',
    ).toBeLessThanOrEqual(todos.Pagination.total_records);

    test.skip(
      tiposTodos.size < 2,
      `A janela só tem um valor de exception_type (${[...tiposTodos].join(', ')}). ` +
        'Sem variedade não dá para provar que o filtro restringe.',
    );

    const forasteiros = [...tiposCompletos].filter((tipo) => !tiposTodos.has(tipo));
    expect(
      forasteiros,
      'o filtro devolveu exception_type que não existe no conjunto total',
    ).toEqual([]);

    expect(
      tiposCompletos.size,
      `only_completed_cycles=true não restringiu nada: continuam ${tiposCompletos.size} ` +
        `valores distintos de exception_type (${[...tiposCompletos].join(', ')}). ` +
        'Confirme com o time qual valor representa ciclo completo.',
    ).toBeLessThan(tiposTodos.size);
  });
});
