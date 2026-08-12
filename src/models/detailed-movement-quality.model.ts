import { z } from 'zod';
import { paginationSchema } from './pagination.model';

/**
 * Contrato REAL do endpoint, extraído de
 * `models/Response_models.py::QualityDetailedMovementModel`.
 *
 * Atenção: estes nomes divergem por completo do exemplo do critério de aceite
 * (que usa `datetime_start`, `equipment_type`, `cycle_time`...). Ver BUG-002.
 * As asserções seguem o código implementado, por decisão registrada no README.
 */

/** Campos inteiros. */
export const INT_FIELDS = [
  'id',
  'transport_report_id',
  'id_truck',
  'Dia',
  'Mes',
  'Ano',
  'Hora_Basc',
] as const;

/** Campos serializados pelo Pydantic como `date` — string "YYYY-MM-DD". */
export const DATE_FIELDS = ['DataInicio', 'DataFim'] as const;

/** Campos serializados pelo Pydantic como `time` — string "HH:MM:SS". */
export const TIME_FIELDS = ['HoraInicio', 'HoraFim'] as const;

/** Campos textuais. */
export const STRING_FIELDS = [
  'Turno',
  'Turma',
  'matricula',
  'Operador',
  'grupo_operador',
  'Tipo_Equipamento',
  'Frota',
  'Caminhao',
  'Carga',
  'Frota_Carga',
  'Origem_Area_CM',
  'Origem_Sub_Area_CM',
  'Destino_Area_CM',
  'Destino_Sub_Area_CM',
  'Material_CM',
  'Grupo_Material',
  'Tipo_Movimentacao',
  'Tipo_Ciclo',
] as const;

/** Campos numéricos decimais. */
export const FLOAT_FIELDS = [
  'Balanca_Manager',
  'Balanca_Calculada',
  'Balanca_Caminhao',
  'Temp_Ciclo',
  'Temp_Fila_Carga',
  'Temp_Carga',
  'Temp_Fila_Basculamento',
  'Temp_Basculamento',
  'Temp_Vazio',
  'Temp_Cheio',
  'Temp_Manobra_Vazio',
  'Temp_Manobra_Cheio',
  'Dist_Vazio',
  'Dist_Cheio',
  'DMT',
  'load_lat',
  'load_lon',
  'unload_lat',
  'unload_lon',
  'load_utm_x',
  'load_utm_y',
  'unload_utm_x',
  'unload_utm_y',
] as const;

/** Durações e distâncias: não faz sentido serem negativas. */
export const NON_NEGATIVE_FIELDS = [
  'Temp_Ciclo',
  'Temp_Fila_Carga',
  'Temp_Carga',
  'Temp_Fila_Basculamento',
  'Temp_Basculamento',
  'Temp_Vazio',
  'Temp_Cheio',
  'Temp_Manobra_Vazio',
  'Temp_Manobra_Cheio',
  'Dist_Vazio',
  'Dist_Cheio',
  'DMT',
] as const;

/** Todos os campos fixos do contrato (52). Qualquer chave fora desta lista é coluna pivotada. */
export const FIXED_FIELDS: readonly string[] = [
  ...INT_FIELDS,
  ...DATE_FIELDS,
  ...TIME_FIELDS,
  ...STRING_FIELDS,
  ...FLOAT_FIELDS,
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME = /^\d{2}:\d{2}:\d{2}(\.\d+)?$/;

const shape: Record<string, z.ZodTypeAny> = {};
for (const f of INT_FIELDS) shape[f] = z.number().int().nullable();
for (const f of FLOAT_FIELDS) shape[f] = z.number().nullable();
for (const f of STRING_FIELDS) shape[f] = z.string().nullable();
for (const f of DATE_FIELDS) shape[f] = z.string().regex(ISO_DATE).nullable();
for (const f of TIME_FIELDS) shape[f] = z.string().regex(ISO_TIME).nullable();

/**
 * `passthrough()` é intencional: as colunas `element_N` são dinâmicas por
 * cliente e não podem ser declaradas em tempo de compilação. Elas são
 * validadas separadamente pelos matchers de `support/matchers.ts`.
 * Espelha o `model_config = ConfigDict(extra="allow")` do Pydantic.
 */
export const movementRecordSchema = z.object(shape).passthrough();

export const detailedMovementResponseSchema = z.object({
  Pagination: paginationSchema,
  Result: z.array(movementRecordSchema),
});

export type MovementRecord = z.infer<typeof movementRecordSchema>;
export type DetailedMovementResponse = z.infer<typeof detailedMovementResponseSchema>;

export const MAX_QUALITY_ELEMENTS = 60;
/** Chave que identifica o ciclo de verdade. `id` é recontado a cada resposta. */
export const CYCLE_KEY = 'transport_report_id';

const FIXED_SET = new Set(FIXED_FIELDS);

/** Chaves do registro que não pertencem ao contrato fixo, ou seja, as colunas pivotadas. */
export function elementKeysOf(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter((key) => !FIXED_SET.has(key));
}

/** Padrão gerado pelo `rename_map` do service: `el7` vira `element_7`. */
export const ELEMENT_KEY_PATTERN = /^element_\d+$/;

export function elementIndexOf(key: string): number {
  const match = ELEMENT_KEY_PATTERN.exec(key);
  return match ? Number(key.slice('element_'.length)) : Number.NaN;
}
