import { expect, FuelQueryBuilder, test } from '@fixtures';
import { FuelManagementService } from '@services/fuel-management.service';

test.describe('Autenticação', { tag: ['@contract'] }, () => {
  test('requisição sem token é rejeitada', { tag: ['@smoke'] }, async ({ anonymousHttp }) => {
    const service = new FuelManagementService(anonymousHttp);
    const result = await service.fetch(FuelQueryBuilder.default().build());

    expect(result.status, 'endpoint acessível sem autenticação').toBe(401);
    expect(result.text).not.toContain('"Result"');
  });

  test('token inválido é rejeitado', async ({ fuelService }) => {
    const result = await fuelService.fetch(
      FuelQueryBuilder.default().build(),
      'token.invalido.aqui',
    );

    expect([401, 403], `recebido ${result.status}`).toContain(result.status);
    expect(result.text).toNotLeakImplementationDetails();
  });
});
