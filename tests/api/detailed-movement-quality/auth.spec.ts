import { test, expect, MovementQueryBuilder, endpoints, env } from '@fixtures';
import { DetailedMovementQualityService } from '@services/detailed-movement-quality.service';
import { AuthService } from '@services/auth.service';

test.describe('Autenticação', { tag: ['@contract'] }, () => {
  test(
    'requisição sem token é rejeitada com 401',
    { tag: ['@smoke'] },
    async ({ anonymousHttp }) => {
      const service = new DetailedMovementQualityService(anonymousHttp);
      const result = await service.fetch(MovementQueryBuilder.default().build());

      expect(result.status, 'endpoint acessível sem autenticação').toBe(401);
      expect(result.text).not.toContain('"Result"');
    },
  );

  test('token inválido é rejeitado', async ({ movementService }) => {
    const result = await movementService.fetch(
      MovementQueryBuilder.default().build(),
      'token.invalido.aqui',
    );

    expect([401, 403], `recebido ${result.status}`).toContain(result.status);
    expect(result.text).toNotLeakImplementationDetails();
  });

  test('token com assinatura de outra chave é rejeitado', async ({ movementService }) => {
    const tokenForjado =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      'eyJzdWIiOiIxIiwiZXhwIjo0MTAyNDQ0ODAwfQ.' +
      'ZmFrZS1zaWduYXR1cmUtbm90LXZhbGlkLWF0LWFsbA';

    const result = await movementService.fetch(
      MovementQueryBuilder.default().build(),
      tokenForjado,
    );

    expect([401, 403], `token forjado aceito com status ${result.status}`).toContain(result.status);
  });

  test('esquema Basic não é aceito no lugar de Bearer', async ({ anonymousHttp, authToken }) => {
    const result = await anonymousHttp.get(endpoints.reports.detailedMovementWithQuality, {
      params: { ...MovementQueryBuilder.default().build() },
      headers: { Authorization: `Basic ${authToken}` },
    });

    expect(result.status).toBe(401);
  });

  test('token válido dá acesso ao endpoint', async ({ movementService, authToken }) => {
    const result = await movementService.fetch(MovementQueryBuilder.default().build(), authToken);
    expect(result.status).toBe(200);
  });

  test('login com credenciais incorretas não emite token', async ({ anonymousHttp }) => {
    const auth = new AuthService(anonymousHttp);
    const result = await auth.requestToken(env.api.credentials.username, 'senha-obviamente-errada');

    expect(result.status, 'login aceitou senha errada').not.toBe(200);
    expect(result.body?.access_token).toBeUndefined();
    expect(result.text).toNotLeakImplementationDetails();
  });
});
