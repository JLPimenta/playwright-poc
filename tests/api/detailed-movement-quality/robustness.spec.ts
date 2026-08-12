import { test, expect, MovementQueryBuilder, LIST_FILTERS, idsFor } from '@fixtures';
import { INJECTION_PAYLOADS } from '@data/query.builder';

test.describe('Robustez e segurança', { tag: ['@regression'] }, () => {
  test('payload de injeção não gera erro de servidor nem vaza a procedure', async ({
    movementService,
    authToken,
  }) => {
    for (const filtro of LIST_FILTERS) {
      for (const payload of INJECTION_PAYLOADS) {
        const result = await movementService.fetch(
          MovementQueryBuilder.default().withRaw(filtro, payload).build(),
          authToken,
        );

        expect
          .soft(result.status, `${filtro}="${payload}" causou erro de servidor`)
          .toBeLessThan(500);
        expect.soft(result.text, `${filtro}="${payload}"`).toNotLeakImplementationDetails();
      }
    }
  });

  test('injeção nos parâmetros de data é barrada na validação', async ({
    movementService,
    authToken,
  }) => {
    for (const payload of INJECTION_PAYLOADS) {
      const result = await movementService.fetch(
        MovementQueryBuilder.default().dataIn(payload).build(),
        authToken,
      );

      expect.soft(result.status, `dataIn="${payload}"`).toBe(400);
    }
  });

  test('id de lista não numérico não expõe erro do banco', async ({
    movementService,
    authToken,
  }) => {
    // A API repassa a string direto para a procedure. Se a validação não
    // acontecer na borda, o erro do driver sobe como 500 com a mensagem do
    // banco embutida — ver BUG-007.
    for (const filtro of LIST_FILTERS) {
      const result = await movementService.fetch(
        MovementQueryBuilder.default().withRaw(filtro, 'abc').build(),
        authToken,
      );

      expect.soft(result.status, `${filtro}="abc" devolveu ${result.status}`).toBeLessThan(500);
      expect.soft(result.text, `${filtro}="abc"`).toNotLeakImplementationDetails();
    }
  });

  test('lista extensa de ids não derruba a requisição', async ({ movementService, authToken }) => {
    const muitos = Array.from({ length: 500 }, (_, i) => String(i + 1));

    const result = await movementService.fetch(
      MovementQueryBuilder.default().withIds('id_equips', muitos).build(),
      authToken,
    );

    expect(result.status, 'URL longa não tratada').not.toBe(414);
    expect(result.status).toBeLessThan(500);
  });

  test('ids duplicados não inflam o resultado', async ({ movementService, authToken }) => {
    const ids = idsFor('id_turns');
    test.skip(ids.length === 0, 'Configure TURN_IDS no .env.');

    const unico = await movementService.fetchValid(
      MovementQueryBuilder.default().withIds('id_turns', [ids[0]]).build(),
      authToken,
    );
    const repetido = await movementService.fetchValid(
      MovementQueryBuilder.default().withIds('id_turns', [ids[0], ids[0], ids[0]]).build(),
      authToken,
    );

    expect(
      repetido.Pagination.total_records,
      'ids repetidos inflaram o resultado — provável JOIN sem DISTINCT',
    ).toBe(unico.Pagination.total_records);
  });

  test('mensagens de erro não expõem implementação', async ({ movementService, authToken }) => {
    const cenarios = [
      { nome: 'data inválida', query: MovementQueryBuilder.default().dataIn('xxx').build() },
      { nome: 'sem parâmetros', query: {} },
      {
        nome: 'booleano inválido',
        query: MovementQueryBuilder.default().onlyCompletedCycles('###').build(),
      },
    ];

    for (const cenario of cenarios) {
      const result = await movementService.fetch(cenario.query, authToken);
      expect.soft(result.text, `cenário "${cenario.nome}"`).toNotLeakImplementationDetails();
    }
  });

  test('headers de resposta não revelam a stack', async ({ movementService, authToken }) => {
    const result = await movementService.fetch(MovementQueryBuilder.default().build(), authToken);

    for (const header of ['x-powered-by', 'x-aspnet-version', 'x-runtime']) {
      expect.soft(result.headers[header], `header ${header} presente`).toBeUndefined();
    }
  });
});
