import { test, expect, MovementQueryBuilder, endpoints } from '@fixtures';
import {
  DATE_FIELDS,
  FIXED_FIELDS,
  NON_NEGATIVE_FIELDS,
  STRING_FIELDS,
  TIME_FIELDS,
  type MovementRecord,
} from '@models/detailed-movement-quality.model';

test.describe('Contrato da resposta', { tag: ['@contract'] }, () => {
  test(
    'retorna 200 com envelope Pagination + Result',
    { tag: ['@smoke'] },
    async ({ movementService, authToken }) => {
      const response = await movementService.fetchValid(
        MovementQueryBuilder.default().build(),
        authToken,
      );

      expect(response.Pagination).toBeDefined();
      expect(Array.isArray(response.Result)).toBe(true);
    },
  );

  test('todos os campos fixos existem em cada registro', async ({ movementService, authToken }) => {
    const records = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(records.length === 0, 'Janela DATA_IN/DATA_FI sem registros. Ajuste o .env.');

    for (const [index, record] of records.entries()) {
      const chaves = new Set(Object.keys(record));
      const ausentes = FIXED_FIELDS.filter((campo) => !chaves.has(campo));

      expect.soft(ausentes, `registro ${index}: campos ausentes no contrato`).toEqual([]);
    }
  });

  test('campos de data e hora usam a serialização do Pydantic', async ({
    movementService,
    authToken,
  }) => {
    const records = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(records.length === 0, 'Sem registros na janela configurada.');

    // Pydantic serializa `date` como YYYY-MM-DD e `time` como HH:MM:SS.
    // O schema já valida o formato; aqui garantimos coerência entre eles.
    expect(records).toSatisfyForEveryRecord(
      (record) =>
        DATE_FIELDS.every((campo) => record[campo] === null || typeof record[campo] === 'string'),
      'DataInicio/DataFim são string ou null',
    );

    expect(records).toSatisfyForEveryRecord(
      (record) =>
        TIME_FIELDS.every((campo) => record[campo] === null || typeof record[campo] === 'string'),
      'HoraInicio/HoraFim são string ou null',
    );
  });

  test('início do ciclo não é posterior ao fim', async ({ movementService, authToken }) => {
    const records = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(records.length === 0, 'Sem registros na janela configurada.');

    expect(records).toSatisfyForEveryRecord(
      (record) => inicioAntesDoFim(record),
      'DataInicio+HoraInicio <= DataFim+HoraFim',
    );
  });

  test('Dia/Mes/Ano são coerentes com DataInicio', async ({ movementService, authToken }) => {
    const records = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(records.length === 0, 'Sem registros na janela configurada.');

    expect(records).toSatisfyForEveryRecord((record) => {
      if (typeof record.DataInicio !== 'string') return true;
      const [ano, mes, dia] = record.DataInicio.split('-').map(Number);
      return record.Ano === ano && record.Mes === mes && record.Dia === dia;
    }, 'Dia/Mes/Ano derivados corretamente de DataInicio');
  });

  test('durações e distâncias não são negativas', async ({ movementService, authToken }) => {
    const records = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(records.length === 0, 'Sem registros na janela configurada.');

    for (const campo of NON_NEGATIVE_FIELDS) {
      expect
        .soft(records, `campo ${campo}`)
        .toSatisfyForEveryRecord(
          (record) => record[campo] === null || Number(record[campo]) >= 0,
          `${campo} >= 0`,
        );
    }
  });

  test('campos textuais não vêm como número', async ({ movementService, authToken }) => {
    const records = await movementService.records(
      MovementQueryBuilder.default().build(),
      authToken,
    );
    test.skip(records.length === 0, 'Sem registros na janela configurada.');

    expect(records).toSatisfyForEveryRecord(
      (record) =>
        STRING_FIELDS.every((campo) => record[campo] === null || typeof record[campo] === 'string'),
      'campos textuais são string ou null',
    );
  });

  test('Content-Type é application/json', async ({ movementService, authToken }) => {
    const result = await movementService.fetch(MovementQueryBuilder.default().build(), authToken);

    expect(result.headers['content-type'] ?? '').toContain('application/json');
  });

  test(
    'consulta sem correspondência retorna Result vazio com HTTP 200',
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

  test('métodos HTTP não suportados são rejeitados', async ({ http, authToken }) => {
    for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const result = await http.send(metodo, endpoints.reports.detailedMovementWithQuality, {
        token: authToken,
      });

      expect.soft([404, 405], `${metodo} retornou ${result.status}`).toContain(result.status);
    }
  });

  test('rota registrada no código é a que responde', async ({ movementService, authToken }) => {
    const result = await movementService.fetch(
      MovementQueryBuilder.default().build(),
      authToken,
      endpoints.reports.detailedMovementWithQuality,
    );

    expect(
      result.status,
      'a rota com underscore é a registrada em api/v1/routes/detailed_movement_with_quality.py',
    ).toBe(200);
  });
});

/** Compara início e fim usando os quatro campos separados que o modelo expõe. */
function inicioAntesDoFim(record: MovementRecord): boolean {
  const { DataInicio, HoraInicio, DataFim, HoraFim } = record;
  if (typeof DataInicio !== 'string' || typeof DataFim !== 'string') return true;

  const inicio = Date.parse(`${DataInicio}T${HoraInicio ?? '00:00:00'}Z`);
  const fim = Date.parse(`${DataFim}T${HoraFim ?? '00:00:00'}Z`);
  if (Number.isNaN(inicio) || Number.isNaN(fim)) return true;

  return inicio <= fim;
}
