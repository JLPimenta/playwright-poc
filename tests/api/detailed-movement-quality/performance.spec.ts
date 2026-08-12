import { test, expect, MovementQueryBuilder, env } from '@fixtures';

/**
 * O pivot roda em Pandas, em memória, e a resposta não é paginada de verdade —
 * a combinação torna o tempo de resposta sensível ao tamanho da janela.
 *
 * Os SLAs vêm do `.env` porque o critério de aceite não define nenhum.
 */
test.describe('Performance', { tag: ['@performance'] }, () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  test('janela padrão responde dentro do SLA', async ({ movementService, authToken }) => {
    const amostras = await medir(3, () =>
      movementService.fetch(MovementQueryBuilder.default().build(), authToken),
    );

    test.info().annotations.push({
      type: 'medições (ms)',
      description: amostras.join(', '),
    });

    expect(mediana(amostras), `amostras: ${amostras.join(', ')}ms`).toBeLessThanOrEqual(
      env.sla.defaultMs,
    );
  });

  test('janela ampla responde dentro do SLA', async ({ movementService, authToken }) => {
    const amostras = await medir(2, () =>
      movementService.fetch(MovementQueryBuilder.default().wideWindow().build(), authToken),
    );

    test.info().annotations.push({
      type: 'medições (ms)',
      description: amostras.join(', '),
    });

    expect(mediana(amostras), `amostras: ${amostras.join(', ')}ms`).toBeLessThanOrEqual(
      env.sla.wideMs,
    );
  });

  test('custo do pivot em relação ao transport_report', async ({ movementService, authToken }) => {
    const query = MovementQueryBuilder.default().build();

    const comQualidade = await movementService.fetch(query, authToken);
    const semQualidade = await movementService.fetchTransportReportBaseline(query, authToken);

    test.skip(
      semQualidade.status !== 200,
      `Baseline transport_report devolveu ${semQualidade.status}. Comparação inválida.`,
    );

    const fator = comQualidade.durationMs / Math.max(semQualidade.durationMs, 1);

    test.info().annotations.push({
      type: 'overhead',
      description: `com=${comQualidade.durationMs}ms sem=${semQualidade.durationMs}ms (${fator.toFixed(2)}x)`,
    });

    expect(fator, 'o pivot multiplicou demais o tempo de resposta').toBeLessThan(5);
  });
});

async function medir(
  vezes: number,
  acao: () => Promise<{ status: number; durationMs: number; text: string }>,
): Promise<number[]> {
  const amostras: number[] = [];

  for (let i = 0; i < vezes; i += 1) {
    const resultado = await acao();
    expect(resultado.status, `amostra ${i + 1}: ${resultado.text.slice(0, 200)}`).toBe(200);
    amostras.push(resultado.durationMs);
  }

  return amostras;
}

function mediana(valores: number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.floor(ordenados.length / 2)];
}
