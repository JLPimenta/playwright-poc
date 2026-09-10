import { env, expect, FuelQueryBuilder, test } from '@fixtures';

test.describe('Filtro por equipamento', { tag: ['@regression'] }, () => {
  test(
    'id_equips restringe o resultado ao equipamento pedido',
    { tag: ['@smoke'] },
    async ({ fuelService, authToken }) => {
      const ids = env.fuel.equipIds;
      test.skip(ids.length === 0, 'Configure FUEL_EQUIP_IDS no .env.');

      const semFiltro = await fuelService.fetchValid(FuelQueryBuilder.default().build(), authToken);
      const comFiltro = await fuelService.fetchValid(
        FuelQueryBuilder.default().withEquips(ids.slice(0, 1)).build(),
        authToken,
      );

      expect(
        comFiltro.Pagination.total_records,
        `id_equips=${ids[0]} devolveu mais registros que a consulta sem filtro`,
      ).toBeLessThanOrEqual(semFiltro.Pagination.total_records);

      expect(comFiltro.Result).toSatisfyForEveryRecord(
        (record) => Number(record.equipment_id) === Number(ids[0]),
        `equipment_id = ${ids[0]}`,
      );
    },
  );

  test('vários ids devolvem apenas os equipamentos pedidos', async ({ fuelService, authToken }) => {
    const ids = env.fuel.equipIds;
    test.skip(ids.length < 2, 'Informe ao menos 2 ids em FUEL_EQUIP_IDS no .env.');

    const records = await fuelService.records(
      FuelQueryBuilder.default().withEquips(ids).build(),
      authToken,
    );

    const permitidos = new Set(ids.map(Number));

    expect(records).toSatisfyForEveryRecord(
      (record) => permitidos.has(Number(record.equipment_id)),
      `equipment_id dentro de [${ids.join(', ')}]`,
    );
  });

  test('ausência do filtro devolve mais de um equipamento', async ({ fuelService, authToken }) => {
    const records = await fuelService.records(FuelQueryBuilder.default().build(), authToken);

    const distintos = new Set(records.map((record) => record.equipment_id));

    test.skip(
      distintos.size === 1,
      'A janela só tem abastecimento de um equipamento. Amplie a massa para provar ' +
        'que a ausência do filtro não restringe.',
    );

    expect(distintos.size, 'sem id_equips, esperava mais de um equipment_id').toBeGreaterThan(1);
  });

  test('id inexistente não devolve registros', async ({ fuelService, authToken }) => {
    const result = await fuelService.fetch(
      FuelQueryBuilder.default().withRawEquips('999999999').build(),
      authToken,
    );

    expect(
      result.status,
      `recebido ${result.status}. A rota devolve 204 quando não há registros (BUG-022).`,
    ).toBe(204);
  });

  test('id_equips não numérico não gera erro de servidor', async ({ fuelService, authToken }) => {
    const result = await fuelService.fetch(
      FuelQueryBuilder.default().withRawEquips('abc').build(),
      authToken,
    );

    expect(
      result.status,
      `recebido ${result.status}.`,
    ).toBeLessThan(500);
    expect(result.text).toNotLeakImplementationDetails();
  });
});
