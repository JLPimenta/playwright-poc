import { expect, FuelQueryBuilder, test } from '@fixtures';
import { FIXED_FIELDS, REFUELLING_KEY } from '@models/fuel-management.model';

test.describe('Contrato da resposta', { tag: ['@contract'] }, () => {
  test(
    'consulta válida devolve o envelope no contrato',
    { tag: ['@smoke'] },
    async ({ fuelService, authToken }) => {
      const response = await fuelService.fetchValid(FuelQueryBuilder.default().build(), authToken);

      expect(response.Result).toBeInstanceOf(Array);
      expect(response.Result.length).toBeGreaterThan(0);
      expect(response.Pagination.total_records).toBeGreaterThan(0);
    },
  );

  test('nenhum campo do contrato desaparece do registro', async ({ fuelService, authToken }) => {
    const records = await fuelService.records(FuelQueryBuilder.default().build(), authToken);

    for (const [indice, record] of records.entries()) {
      const chaves = new Set(Object.keys(record));
      const ausentes = FIXED_FIELDS.filter((campo) => !chaves.has(campo));

      expect
        .soft(
          ausentes,
          `registro ${indice} (id_cta=${record[REFUELLING_KEY]}): campo ausente. ` +
            'Valor nulo é aceitável; a chave sumir quebra o consumidor.',
        )
        .toEqual([]);
    }
  });

  test('id_cta não se repete no resultado', async ({ fuelService, authToken }) => {
    const records = await fuelService.records(FuelQueryBuilder.default().build(), authToken);

    expect(records).toHaveUniqueValuesOf(REFUELLING_KEY);
  });
});
