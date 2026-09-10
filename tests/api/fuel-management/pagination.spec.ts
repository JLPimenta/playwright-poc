import { expect, FuelQueryBuilder, test } from '@fixtures';
import { REFUELLING_KEY } from '@models/fuel-management.model';

test.describe('Paginação', { tag: ['@contract'] }, () => {
  test('total_pages é coerente com total_records', async ({ fuelService, authToken }) => {
    const response = await fuelService.fetchValid(FuelQueryBuilder.default().build(), authToken);
    const { total_records, total_records_per_page, total_pages, current_page } =
      response.Pagination;

    expect(current_page).toBe(1);
    expect(total_pages, `${total_records} registros / ${total_records_per_page} por página`).toBe(
      Math.ceil(total_records / total_records_per_page),
    );
    expect(response.Result.length).toBeLessThanOrEqual(total_records_per_page);
  });

  test('a segunda página traz registros diferentes da primeira', async ({
    fuelService,
    authToken,
  }) => {
    const primeira = await fuelService.fetchValid(FuelQueryBuilder.default().build(), authToken);
    test.skip(
      primeira.Pagination.total_pages < 2,
      `Só ${primeira.Pagination.total_pages} página(s). O page_size default é 5000, ` +
        'então é preciso uma janela bem maior para exercitar a navegação.',
    );

    const segunda = await fuelService.fetchValid(
      FuelQueryBuilder.default().page(2).build(),
      authToken,
    );

    const idsPrimeira = new Set(primeira.Result.map((r) => r[REFUELLING_KEY]));
    const repetidos = segunda.Result.filter((r) => idsPrimeira.has(r[REFUELLING_KEY]));

    expect(repetidos, 'registros repetidos entre a primeira e a segunda página').toEqual([]);
    expect(segunda.Pagination.current_page).toBe(2);
  });

  test('página além do total não devolve registros', async ({ fuelService, authToken }) => {
    const result = await fuelService.fetch(
      FuelQueryBuilder.default().page(9999).build(),
      authToken,
    );

    expect(
      result.status,
      `recebido ${result.status}. A rota devolve 204 quando não há registros (BUG-022).`,
    ).toBe(204);
  });

  test('page fora do intervalo não gera erro de servidor', async ({ fuelService, authToken }) => {
    for (const page of [0, -1]) {
      const result = await fuelService.fetch(
        FuelQueryBuilder.default().page(page).build(),
        authToken,
      );

      expect
        .soft(
          result.status,
          `page=${page}: recebido ${result.status}. Sem validação, o offset vira ` +
            'negativo e o banco rejeita a query.',
        )
        .toBeLessThan(500);
    }
  });
});
