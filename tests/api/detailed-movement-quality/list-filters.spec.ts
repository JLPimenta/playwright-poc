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

  test('only_completed_cycles=true devolve só ciclos sem exceção', async ({
    movementService,
    authToken,
  }) => {
    const response = await movementService.fetchValid(
      MovementQueryBuilder.default().onlyCompletedCycles(true).build(),
      authToken,
    );
    test.skip(response.Result.length === 0, 'Nenhum ciclo completo na janela configurada.');

    // A procedure filtra por `exception_type is null`, e `cycle_type`
    expect(response.Result).toSatisfyForEveryRecord(
      (record) => record.cycle_type === null,
      'cycle_type é null quando only_completed_cycles=true',
    );
  });
});
