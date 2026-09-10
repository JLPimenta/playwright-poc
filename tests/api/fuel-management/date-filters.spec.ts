import { env, expect, FuelQueryBuilder, test } from '@fixtures';
import { apiDayToIso, INVALID_DATES } from '@data/date.builder';

const soData = (janela: string) => apiDayToIso(janela.split(' ')[0]);

test.describe('Filtros de data', { tag: ['@contract'] }, () => {
  test('dataIn e dataFi são obrigatórios', async ({ fuelService, authToken }) => {
    const casos = [
      { nome: 'só dataFi', query: FuelQueryBuilder.default().dataIn(undefined).build() },
      { nome: 'só dataIn', query: FuelQueryBuilder.default().dataFi(undefined).build() },
      { nome: 'nenhuma data', query: {} },
    ];

    for (const caso of casos) {
      const result = await fuelService.fetch(caso.query, authToken);
      expect.soft(result.status, `${caso.nome}: esperado 400`).toBe(400);
    }
  });

  test(
    'dataIn igual ou maior que dataFi é rejeitado',
    { tag: ['@smoke'] },
    async ({ fuelService, authToken }) => {
      const invertido = await fuelService.fetch(
        FuelQueryBuilder.default().window('30-06-2026 23:59:59', '01-06-2026 00:00:00').build(),
        authToken,
      );
      expect.soft(invertido.status, 'intervalo invertido').toBe(400);

      // A rota compara com `>=`, então datas iguais também caem no 400.
      const iguais = await fuelService.fetch(
        FuelQueryBuilder.default().window('01-06-2026 00:00:00', '01-06-2026 00:00:00').build(),
        authToken,
      );
      expect.soft(iguais.status, 'dataIn igual a dataFi').toBe(400);
    },
  );

  test('data inválida não gera erro de servidor', async ({ fuelService, authToken }) => {
    for (const [nome, valor] of Object.entries(INVALID_DATES)) {
      const result = await fuelService.fetch(
        FuelQueryBuilder.default().dataIn(valor).build(),
        authToken,
      );

      expect
        .soft(result.status, `dataIn="${valor}" (${nome}): recebido ${result.status}`)
        .toBeLessThan(500);
      expect.soft(result.text, `dataIn="${valor}" (${nome})`).toNotLeakImplementationDetails();
    }
  });

  test('a janela recorta pelo início do abastecimento', async ({ fuelService, authToken }) => {
    const records = await fuelService.records(FuelQueryBuilder.default().build(), authToken);

    const inicio = soData(env.fuel.window.dataIn);
    const fim = soData(env.fuel.window.dataFi);

    expect(records).toSatisfyForEveryRecord(
      (record) =>
        typeof record.datetime_start !== 'string' ||
        (record.datetime_start.slice(0, 10) >= inicio && record.datetime_start.slice(0, 10) <= fim),
      `datetime_start dentro de [${inicio}, ${fim}]`,
    );
  });
});
