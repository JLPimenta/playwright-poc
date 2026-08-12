import { expect, idsFor, LIST_FILTERS, MovementQueryBuilder, test } from '@fixtures';
import { FILTER_TO_FIELD, type ListFilter } from '@data/query.builder';

test.describe('Filtros de lista', { tag: ['@regression'] }, () => {
  for (const filtro of LIST_FILTERS) {
    test.describe(filtro, () => {
      test('restringe o resultado quando informado', async ({ movementService, authToken }) => {
        const ids = idsFor(filtro);
        test.skip(ids.length === 0, `Configure os ids de ${filtro} no .env.`);

        const semFiltro = await movementService.records(
          MovementQueryBuilder.default().build(),
          authToken,
        );
        const comFiltro = await movementService.records(
          MovementQueryBuilder.default().withIds(filtro, ids.slice(0, 1)).build(),
          authToken,
        );

        test.skip(semFiltro.length === 0, 'Sem registros na janela configurada.');
        test.skip(comFiltro.length === 0, `Nenhum registro para ${filtro}=${ids[0]}.`);

        expect(
          comFiltro.length,
          `filtrar por ${filtro}=${ids[0]} não reduziu (nem manteve) o conjunto`,
        ).toBeLessThanOrEqual(semFiltro.length);

        const campo = FILTER_TO_FIELD[filtro];
        const distintos = new Set(comFiltro.map((r) => (r as Record<string, unknown>)[campo]));

        expect(distintos.size, `com um único id de ${filtro}, esperava um único valor de ${campo}; ` + `encontrados: ${[...distintos].join(', ')}`,).toBe(1);
      });

      test('ausência do parâmetro não filtra nada', async ({ movementService, authToken }) => {
        const ids = idsFor(filtro);
        test.skip(ids.length < 2, `Informe ao menos 2 ids de ${filtro} no .env.`);

        const todos = await movementService.records(
          MovementQueryBuilder.default().build(),
          authToken,
        );
        const doisIds = await movementService.records(
          MovementQueryBuilder.default().withIds(filtro, ids.slice(0, 2)).build(),
          authToken,
        );

        test.skip(todos.length === 0, 'Sem registros na janela configurada.');

        expect(
          todos.length,
          `sem ${filtro} o retorno deveria conter pelo menos tudo que o filtro devolve`,
        ).toBeGreaterThanOrEqual(doisIds.length);
      });

      test('id inexistente devolve lista vazia sem erro', async ({
        movementService,
        authToken,
      }) => {
        const result = await movementService.fetch(
          MovementQueryBuilder.default().withRaw(filtro, '999999999').build(),
          authToken,
        );

        expect(result.status, `corpo: ${result.text.slice(0, 300)}`).toBe(200);
        expect((result.body as { Result: unknown[] }).Result).toEqual([]);
      });
    });
  }

  test('filtros combinados aplicam interseção', async ({ movementService, authToken }) => {
    const configurados = LIST_FILTERS.filter((f) => idsFor(f).length > 0);
    test.skip(configurados.length < 2, 'Configure ao menos 2 filtros de lista no .env.');

    const builder = MovementQueryBuilder.default();
    for (const filtro of configurados) {
      builder.withIds(filtro, idsFor(filtro).slice(0, 1));
    }

    const combinado = await movementService.records(builder.build(), authToken);
    test.skip(combinado.length === 0, 'A combinação de filtros não retornou registros.');

    for (const filtro of configurados) {
      const campo = FILTER_TO_FIELD[filtro as ListFilter];
      const distintos = new Set(combinado.map((r) => (r as Record<string, unknown>)[campo]));
      expect
        .soft(distintos.size, `${campo} deveria ter um único valor sob filtro combinado`)
        .toBe(1);
    }
  });
});

test.describe('only_completed_cycles', { tag: ['@regression'] }, () => {
  test('true retorna subconjunto de false', async ({ movementService, authToken }) => {
    const completos = await movementService.fetchValid(
      MovementQueryBuilder.default().onlyCompletedCycles(true).build(),
      authToken,
    );
    const todos = await movementService.fetchValid(
      MovementQueryBuilder.default().onlyCompletedCycles(false).build(),
      authToken,
    );

    expect(
      completos.Pagination.total_records,
      'ciclos completos não podem ser mais numerosos que o total',
    ).toBeLessThanOrEqual(todos.Pagination.total_records);
  });

  test('valor inválido é rejeitado pela validação do FastAPI', async ({
    movementService,
    authToken,
  }) => {
    const result = await movementService.fetch(
      MovementQueryBuilder.default().onlyCompletedCycles('talvez').build(),
      authToken,
    );

    // `only_completed_cycles: bool | None` — o FastAPI devolve 422 com o
    // detalhe da validação, não 400.
    expect(result.status).toBe(422);
  });

  test('aceita as representações booleanas usuais', async ({ movementService, authToken }) => {
    for (const valor of ['true', 'True', '1', 'false', '0']) {
      const result = await movementService.fetch(
        MovementQueryBuilder.default().onlyCompletedCycles(valor).build(),
        authToken,
      );

      expect.soft(result.status, `only_completed_cycles=${valor}`).toBe(200);
    }
  });
});
