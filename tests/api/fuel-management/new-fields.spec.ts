import { env, expect, FuelQueryBuilder, test } from '@fixtures';
import { EXISTING_FIELDS, NEW_FIELDS, REFUELLING_KEY } from '@models/fuel-management.model';

test.describe('Campos de placa e terminant', { tag: ['@regression'] }, () => {
  test(
    'todo registro traz license_plate e terminant',
    { tag: ['@smoke'] },
    async ({ fuelService, authToken }) => {
      const records = await fuelService.records(FuelQueryBuilder.default().build(), authToken);

      for (const [indice, record] of records.entries()) {
        const chaves = new Set(Object.keys(record));
        const ausentes = NEW_FIELDS.filter((campo) => !chaves.has(campo));

        expect
          .soft(
            ausentes,
            `registro ${indice} (id_cta=${record[REFUELLING_KEY]}): campo ausente. ` +
              'Sem o dado cadastrado o valor deve vir null, não a chave sumir.',
          )
          .toEqual([]);
      }
    },
  );

  test('nenhum campo existente foi removido', async ({ fuelService, authToken }) => {
    const records = await fuelService.records(FuelQueryBuilder.default().build(), authToken);

    const chaves = new Set(Object.keys(records[0]));
    const removidos = EXISTING_FIELDS.filter((campo) => !chaves.has(campo));

    expect(
      removidos,
      'campos que existiam antes da alteração e sumiram — quebra as integrações em produção',
    ).toEqual([]);
  });

  test('os novos campos vêm também sob filtro de equipamento', async ({
    fuelService,
    authToken,
  }) => {
    const ids = env.fuel.equipIds;
    test.skip(ids.length === 0, 'Configure FUEL_EQUIP_IDS no .env.');

    const records = await fuelService.records(
      FuelQueryBuilder.default().withEquips(ids).build(),
      authToken,
    );

    expect(records).toSatisfyForEveryRecord(
      (record) => NEW_FIELDS.every((campo) => campo in record),
      'license_plate e terminant presentes sob filtro de id_equips',
    );
  });
});
