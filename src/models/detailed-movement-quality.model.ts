import { z } from 'zod';
import { paginationSchema } from './pagination.model';

/**
 * Contrato do endpoint, extraído de
 * `models/Response_models.py::QualityDetailedMovementModel`.
 */

export const INT_FIELDS = [
  'id',
  'transport_report_id',
  'id_truck',
  'day',
  'month',
  'year',
  'dump_hour',
] as const;

/** `date` — string "YYYY-MM-DD". */
export const DATE_FIELDS = ['start_date', 'end_date'] as const;

/** `time` — string "HH:MM:SS". */
export const TIME_FIELDS = ['start_time', 'end_time'] as const;

export const STRING_FIELDS = [
  'shift',
  'team',
  'registration_id',
  'operator',
  'operator_group',
  'equipment_type',
  'fleet',
  'truck',
  'load_equipment',
  'load_fleet',
  'origin_area',
  'origin_subarea',
  'destination_area',
  'destination_subarea',
  'material',
  'material_group',
  'movement_type',
  'cycle_type',
] as const;

export const FLOAT_FIELDS = [
  'scale_manager_weight',
  'calculated_weight',
  'truck_scale_weight',
  'cycle_time',
  'load_queue_time',
  'load_time',
  'dump_queue_time',
  'dump_time',
  'empty_time',
  'full_time',
  'empty_maneuver_time',
  'full_maneuver_time',
  'empty_distance',
  'full_distance',
  'dmt',
  'load_lat',
  'load_lon',
  'unload_lat',
  'unload_lon',
  'load_utm_x',
  'load_utm_y',
  'unload_utm_x',
  'unload_utm_y',
] as const;

export const NON_NEGATIVE_FIELDS = [
  'cycle_time',
  'load_queue_time',
  'load_time',
  'dump_queue_time',
  'dump_time',
  'empty_time',
  'full_time',
  'empty_maneuver_time',
  'full_maneuver_time',
  'empty_distance',
  'full_distance',
  'dmt',
] as const;

/** Todos os campos fixos do contrato. */
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

/** Limite de elementos de qualidade — `MAX_QUALITY_ELEMENTS` no service da API. */
export const MAX_QUALITY_ELEMENTS = 60;

/** Chave que identifica o ciclo de verdade. `id` é recontado a cada consulta. */
export const CYCLE_KEY = 'transport_report_id';

/** Limites de paginação declarados na rota (`ge`/`le` dos Query params). */
export const PAGINATION_LIMITS = {
  defaultPageSize: 100,
  maxPageSize: 1000,
  minPage: 1,
} as const;

const FIXED_SET = new Set(FIXED_FIELDS);

/** Chaves do registro que não pertencem ao contrato fixo, ou seja, as colunas pivotadas. */
export function elementKeysOf(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter((key) => !FIXED_SET.has(key));
}

/** Padrão gerado pelo `rename_map` do service: `el7` vira `element_7`. */
export const ELEMENT_KEY_PATTERN = /^element_\d+$/;
