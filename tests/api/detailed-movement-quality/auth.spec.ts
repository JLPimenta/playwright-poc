import { expect, MovementQueryBuilder, test } from '@fixtures';
import { DetailedMovementQualityService } from '@services/detailed-movement-quality.service';

test.describe('Autenticação', { tag: ['@contract'] }, () => {
  test('requisição sem token é rejeitada', { tag: ['@smoke'] }, async ({ anonymousHttp }) => {
    const service = new DetailedMovementQualityService(anonymousHttp);
    const result = await service.fetch(MovementQueryBuilder.default().build());

    expect(result.status, 'endpoint acessível sem autenticação').toBe(401);
    expect(result.text).not.toContain('"Result"');
  });

  test('token inválido é rejeitado', async ({ movementService }) => {
    const result = await movementService.fetch(
      MovementQueryBuilder.default().build(),
      'token.invalido.aqui',
    );

    // `get_current_user` responde 403 quando o JWT não decodifica — ver BUG-004.
    expect([401, 403], `recebido ${result.status}`).toContain(result.status);
    expect(result.text).toNotLeakImplementationDetails();
  });
});
