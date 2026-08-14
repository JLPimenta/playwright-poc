import { env, expect, MovementQueryBuilder, test } from '@fixtures';

/**
 * Um único teste, e fora do CI de PR: tempo de resposta depende de ambiente e
 * de volume de massa, então falha aqui pede investigação, não bloqueio de
 * merge.
 *
 * O que ele monitora é real — o pivot monta o DataFrame do período inteiro em
 * memória antes de recortar a página.
 */
test.describe('Performance', { tag: ['@performance'] }, () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  test('janela padrão responde dentro do SLA', async ({ movementService, authToken }) => {
    const amostras: number[] = [];

    for (let i = 0; i < 3; i += 1) {
      const result = await movementService.fetch(MovementQueryBuilder.default().build(), authToken);
      expect(result.status, `amostra ${i + 1}: ${result.text.slice(0, 200)}`).toBe(200);
      amostras.push(result.durationMs);
    }

    const ordenadas = [...amostras].sort((a, b) => a - b);
    const mediana = ordenadas[Math.floor(ordenadas.length / 2)];

    test.info().annotations.push({ type: 'medições (ms)', description: amostras.join(', ') });

    expect(mediana, `amostras: ${amostras.join(', ')}ms`).toBeLessThanOrEqual(env.sla.defaultMs);
  });
});
