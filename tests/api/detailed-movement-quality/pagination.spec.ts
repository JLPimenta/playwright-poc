import { expect, MovementQueryBuilder, test } from '@fixtures';
import { CYCLE_KEY, PAGINATION_LIMITS } from '@models/detailed-movement-quality.model';

test.describe('Paginação', { tag: ['@contract'] }, () => {
  test('page_size é respeitado e total_pages é coerente', async ({
    movementService,
    authToken,
  }) => {
    const response = await movementService.fetchValid(
      MovementQueryBuilder.default().paginate(1, 5).build(),
      authToken,
    );
    const { total_records, total_records_per_page, total_pages } = response.Pagination;
    test.skip(total_records === 0, 'Janela sem registros. Ajuste o .env.');

    expect(total_records_per_page).toBe(5);
    expect(response.Result.length).toBeLessThanOrEqual(5);
    expect(total_pages, `${total_records} registros / ${total_records_per_page} por página`).toBe(
      Math.ceil(total_records / total_records_per_page),
    );
  });

  test('percorrer todas as páginas não perde nem duplica registros', async ({
    movementService,
    authToken,
  }) => {
    const sonda = await movementService.fetchValid(
      MovementQueryBuilder.default().paginate(1, 10).build(),
      authToken,
    );
    test.skip(sonda.Pagination.total_pages < 2, 'Menos de 2 páginas na janela configurada.');
    test.skip(sonda.Pagination.total_pages > 50, 'Muitas páginas para varredura em teste.');

    const { records, totalRecords } = await movementService.allPages(
      MovementQueryBuilder.default().build(),
      authToken,
      10,
    );

    const chaves = records.map((r) => (r as Record<string, unknown>)[CYCLE_KEY]);

    expect(new Set(chaves).size, 'ciclos repetidos entre páginas').toBe(chaves.length);
    expect(records, `total_records = ${totalRecords}`).toHaveLength(totalRecords);
  });

  test('página além do total devolve lista vazia', async ({ movementService, authToken }) => {
    const response = await movementService.fetchValid(
      MovementQueryBuilder.default().paginate(9999, 10).build(),
      authToken,
    );

    expect(response.Result).toEqual([]);
  });

  test('parâmetro de paginação fora do intervalo é rejeitado', async ({
    movementService,
    authToken,
  }) => {
    const casos: Array<[string, number, number]> = [
      ['page zero', 0, 10],
      ['page_size zero', 1, 0],
      ['page_size acima do máximo', 1, PAGINATION_LIMITS.maxPageSize + 1],
    ];

    for (const [nome, page, pageSize] of casos) {
      const result = await movementService.fetch(
        MovementQueryBuilder.default().paginate(page, pageSize).build(),
        authToken,
      );

      expect.soft(result.status, `${nome}: corpo ${result.text.slice(0, 150)}`).toBe(422);
    }
  });
});
