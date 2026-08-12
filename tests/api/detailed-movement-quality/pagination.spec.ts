import { test, expect, MovementQueryBuilder } from '@fixtures';

/**
 * O endpoint expõe o objeto `Pagination`, mas não aceita parâmetro algum de
 * página: o código instancia `Pagination(total_records, page_size=total_records,
 * page=1)`. Ou seja, a paginação é decorativa — tudo volta numa resposta só.
 *
 * Estes testes fixam esse comportamento para que qualquer mudança futura
 * (implementar paginação de verdade) seja detectada como quebra de contrato.
 * Ver BUG-003.
 */
test.describe('Paginação', { tag: ['@contract'] }, () => {
  test('resposta com dados vem em página única', async ({ movementService, authToken }) => {
    const response = await movementService.fetchValid(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(response.Pagination.total_records === 0, 'Sem registros na janela configurada.');

    expect(response.Pagination.current_page).toBe(1);
    expect(response.Pagination.total_pages).toBe(1);
    expect(response.Pagination.next_page).toBeNull();
    expect(response.Pagination.previous_page).toBeNull();
  });

  test('total_records reflete a quantidade de registros devolvidos', async ({
    movementService,
    authToken,
  }) => {
    const response = await movementService.fetchValid(
      MovementQueryBuilder.default().build(),
      authToken,
    );

    expect(
      response.Result,
      'como a paginação é de página única, Result deve conter todos os registros',
    ).toHaveLength(response.Pagination.total_records);
  });

  test('total_records_per_page acompanha o total', async ({ movementService, authToken }) => {
    const response = await movementService.fetchValid(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(response.Pagination.total_records === 0, 'Sem registros na janela configurada.');

    expect(response.Pagination.total_records_per_page).toBe(response.Pagination.total_records);
  });

  test('parâmetro page é ignorado', async ({ movementService, authToken }) => {
    const primeira = await movementService.fetchValid(
      MovementQueryBuilder.default().build(),
      authToken,
    );

    const comPage = await movementService.fetch(
      { ...MovementQueryBuilder.default().build(), page: 2 } as never,
      authToken,
    );

    expect(comPage.status, 'informar page não deve quebrar a requisição').toBe(200);
    expect(
      (comPage.body as { Pagination: { total_records: number } }).Pagination.total_records,
      'page=2 devolveu conjunto diferente — a paginação passou a ser real? Atualize este teste.',
    ).toBe(primeira.Pagination.total_records);
  });

  test('resposta vazia traz Pagination zerado e coerente', async ({
    movementService,
    authToken,
  }) => {
    const response = await movementService.fetchValid(
      MovementQueryBuilder.default().emptyWindow().build(),
      authToken,
    );

    expect(response.Pagination.total_records).toBe(0);
    expect(response.Pagination.total_pages).toBe(0);
    expect(response.Result).toEqual([]);
  });
});
