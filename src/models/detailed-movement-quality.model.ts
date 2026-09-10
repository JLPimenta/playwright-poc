import { z } from 'zod';
import { paginationSchema } from './pagination.model';

/**
 * Contrato do endpoint, extraído de
 * `models/Response_models.py::QualityDetailedMovementModel`.
 */

export const INT_FIELDS = [
  'id',
  'transport_report_id',
  'start_timestamp',
  'end_timestamp',
  'last_update_timestamp',
  'year',
  'month',
  'day',
  'hour',
  'production_year',
  'production_month',
  'production_day',
  'turn_id',
  'team_id',
  'operator_group_id',
  'operator_id',
  'equipment_type_id',
  'equipment_group_id',
  'equipment_id',
  'load_equipment_type_id',
  'load_equipment_group_id',
  'load_equipment_id',
  'origin_id',
  'origin_subarea_id',
  'destination_id',
  'destination_subarea_id',
  'origin_subarea_type_id',
  'destination_subarea_type_id',
  'material_group_id',
  'material_id',
  'movement_type_id',
  'exception_type_id',
  'update_timestamp',
  'is_production',
] as const;

export const FLOAT_FIELDS = [
  'load_balance',
  'load_manager',
  'calculated_mass',
  'total_cycle_time',
  'cycle_time',
  'code_time',
  'load_queue_time',
  'load_time',
  'unload_queue_time',
  'unload_time',
  'empty_time',
  'full_time',
  'load_maneuver_time',
  'unload_maneuver_time',
  'unloaded_stop_time',
  'loaded_stop_time',
  'empty_distance',
  'full_distance',
  'dmt',
  'distance_manager',
  'load_lat',
  'load_lon',
  'load_alt',
  'unload_lat',
  'unload_lon',
  'unload_alt',
  'load_utm_x',
  'load_utm_y',
  'unload_utm_x',
  'unload_utm_y',
] as const;

export const STRING_FIELDS = [
  'movement_source',
  'turn',
  'team',
  'operator_group',
  'operator_registration_id',
  'operator',
  'equipment_type',
  'equipment_group',
  'equipment',
  'load_equipment_type',
  'load_equipment_group',
  'load_equipment',
  'origin',
  'origin_subarea',
  'destination',
  'destination_subarea',
  'origin_subarea_type',
  'destination_subarea_type',
  'material_group',
  'material',
  'movement_type',
  'exception_type',
  'username',
] as const;

export const DATETIME_FIELDS = ['datetime_start', 'datetime_end', 'date_update_timestamp'] as const;

/** Campos serializados pelo Pydantic como `date` — string "YYYY-MM-DD". */
export const DATE_FIELDS = ['production_date'] as const;

/** Todos os campos fixos do contrato. Qualquer chave fora desta lista é coluna pivotada. */
export const FIXED_FIELDS: readonly string[] = [
  ...INT_FIELDS,
  ...FLOAT_FIELDS,
  ...STRING_FIELDS,
  ...DATETIME_FIELDS,
  ...DATE_FIELDS,
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const shape: Record<string, z.ZodTypeAny> = {};
for (const f of INT_FIELDS) shape[f] = z.number().int().nullable();
for (const f of FLOAT_FIELDS) shape[f] = z.number().nullable();
for (const f of STRING_FIELDS) shape[f] = z.string().nullable();
for (const f of DATE_FIELDS) shape[f] = z.string().regex(ISO_DATE).nullable();
for (const f of DATETIME_FIELDS) {
  shape[f] = z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'não é data ISO-8601 válida' })
    .nullable();
}

export const movementRecordSchema = z.object(shape).passthrough();

export const detailedMovementResponseSchema = z.object({
  Pagination: paginationSchema,
  Result: z.array(movementRecordSchema),
});

export type MovementRecord = z.infer<typeof movementRecordSchema>;
export type DetailedMovementResponse = z.infer<typeof detailedMovementResponseSchema>;

/** Limite de elementos de qualidade — `MAX_QUALITY_ELEMENTS` no service da API. */
export const MAX_QUALITY_ELEMENTS = 60;

export const CYCLE_KEY = 'id';

/** Origens unidas pela procedure, expostas em `movement_source`. */
export const MOVEMENT_SOURCES = ['transport', 'load'] as const;

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

/** Padrão gerado por `element_column_name` no service: `el7` vira `element_7`. */
export const ELEMENT_KEY_PATTERN = /^element_\d+$/;
