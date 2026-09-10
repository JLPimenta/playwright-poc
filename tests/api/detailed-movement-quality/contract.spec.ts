import { expect, MovementQueryBuilder, test } from '@fixtures';
import { FIXED_FIELDS, MOVEMENT_SOURCES } from '@models/detailed-movement-quality.model';

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

  test('campos derivados batem com o fim do ciclo', async ({ movementService, authToken }) => {
    const records = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(records.length === 0, 'Sem registros na janela configurada.');

    expect(records).toSatisfyForEveryRecord((record) => {
      if (typeof record.datetime_end !== 'string') return true;

      const fim = new Date(record.datetime_end);

      return (
        record.year === fim.getUTCFullYear() &&
        record.month === fim.getUTCMonth() + 1 &&
        record.day === fim.getUTCDate()
      );
    }, 'year/month/day derivados de datetime_end (se falhar, confirme com a PO se derivam de datetime_start)');
  });

  test('movement_source identifica a origem do registro', async ({
    movementService,
    authToken,
  }) => {
    const records = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(records.length === 0, 'Sem registros na janela configurada.');

    expect(records).toSatisfyForEveryRecord(
      (record) => MOVEMENT_SOURCES.includes(record.movement_source as never),
      `movement_source é um de: ${MOVEMENT_SOURCES.join(', ')}`,
    );
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
