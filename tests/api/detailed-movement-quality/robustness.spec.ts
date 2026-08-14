import { expect, MovementQueryBuilder, test } from '@fixtures';
import { INJECTION_PAYLOADS } from '@data/query.builder';

test.describe('Robustez', { tag: ['@regression'] }, () => {
  test('entrada maliciosa não gera erro de servidor nem vaza a procedure', async ({
    movementService,
    authToken,
  }) => {
    for (const payload of INJECTION_PAYLOADS) {
      const noFiltro = await movementService.fetch(
        MovementQueryBuilder.default().withRaw('id_equips', payload).build(),
        authToken,
      );
      expect.soft(noFiltro.status, `id_equips="${payload}"`).toBeLessThan(500);
      expect.soft(noFiltro.text, `id_equips="${payload}"`).toNotLeakImplementationDetails();

      const naData = await movementService.fetch(
        MovementQueryBuilder.default().dataIn(payload).build(),
        authToken,
      );
      expect.soft(naData.status, `dataIn="${payload}"`).toBe(400);
    }
  });

  test('id de lista não numérico não expõe o erro do banco', async ({
    movementService,
    authToken,
  }) => {
    const result = await movementService.fetch(
      MovementQueryBuilder.default().withRaw('id_turns', 'abc').build(),
      authToken,
    );

    expect(result.status, `recebido ${result.status}`).toBeLessThan(500);
    expect(result.text).toNotLeakImplementationDetails();
  });
});
