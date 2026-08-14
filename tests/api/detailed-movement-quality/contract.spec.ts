import { expect, MovementQueryBuilder, test } from '@fixtures';
import { FIXED_FIELDS } from '@models/detailed-movement-quality.model';

test.describe('Contrato da resposta', { tag: ['@contract'] }, () => {
  test(
    'consulta válida devolve o envelope no contrato',
    { tag: ['@smoke'] },
    async ({ movementService, authToken }) => {
      const response = await movementService.fetchValid(
        MovementQueryBuilder.default().build(),
        authToken,
      );

      expect(response.Result).toBeInstanceOf(Array);
      expect(response.Pagination.total_records).toBeGreaterThanOrEqual(0);
    },
  );

  test('nenhum campo do contrato desaparece do registro', async ({
    movementService,
    authToken,
  }) => {
    const records = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(records.length === 0, 'Janela DATA_IN/DATA_FI sem registros. Ajuste o .env.');
    for (const [index, record] of records.entries()) {
      const chaves = new Set(Object.keys(record));
      const ausentes = FIXED_FIELDS.filter((campo) => !chaves.has(campo));

      expect.soft(ausentes, `registro ${index}: campos ausentes`).toEqual([]);
    }
  });

  test('campos derivados batem com a data do ciclo', async ({ movementService, authToken }) => {
    const records = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(records.length === 0, 'Sem registros na janela configurada.');

    expect(records).toSatisfyForEveryRecord((record) => {
      if (typeof record.start_date !== 'string') return true;

      const [ano, mes, dia] = record.start_date.split('-').map(Number);

      return record.year === ano && record.month === mes && record.day === dia;
    }, 'day/month/year derivados de start_date');
  });

  test('dmt é a média entre distância vazia e cheia', async ({ movementService, authToken }) => {
    const records = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(records.length === 0, 'Sem registros na janela configurada.');

    // DMT é indicador consumido direto pelo cliente. Registros vindos do bloco
    // de alimentação trazem as distâncias nulas por construção.
    const comDistancia = records.filter(
      (record) =>
        typeof record.empty_distance === 'number' &&
        typeof record.full_distance === 'number' &&
        typeof record.dmt === 'number',
    );
    test.skip(comDistancia.length === 0, 'Nenhum registro com distâncias preenchidas.');

    expect(comDistancia).toSatisfyForEveryRecord((record) => {
      const esperado = (Number(record.empty_distance) + Number(record.full_distance)) / 2;
      return Math.abs(Number(record.dmt) - esperado) < 0.01;
    }, 'dmt = (empty_distance + full_distance) / 2');
  });

  test(
    'consulta sem correspondência devolve lista vazia com HTTP 200',
    { tag: ['@smoke'] },
    async ({ movementService, authToken }) => {
      const response = await movementService.fetchValid(
        MovementQueryBuilder.default().emptyWindow().build(),
        authToken,
      );

      expect(response.Result).toEqual([]);
      expect(response.Pagination.total_records).toBe(0);
    },
  );
});
