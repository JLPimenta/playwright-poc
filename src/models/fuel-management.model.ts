import { z } from 'zod';
import { paginationSchema } from './pagination.model';

/** Contrato de `models/Models.py::DwFuelManagementModel` (view `dw_fuel_management`). */

export const NEW_FIELDS = ['license_plate', 'terminant'] as const;

export const EXISTING_FIELDS = [
  'id_cta',
  'refuelling_start',
  'refuelling_end',
  'datetime_start',
  'datetime_end',
  'year',
  'month',
  'day',
  'hour',
  'production_date',
  'production_year',
  'production_month',
  'production_day',
  'equipment_id',
  'equipment',
  'operator',
  'station_name',
  'tank_name',
  'attendant_name',
  'hourmeter',
  'odometer',
  'volume',
  'duration',
  'distance',
  'cost_center',
] as const;

export const FIXED_FIELDS: readonly string[] = [...EXISTING_FIELDS, ...NEW_FIELDS];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isoDateTime = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'não é data ISO-8601 válida' })
  .nullable();

export const fuelRecordSchema = z.object({
  id_cta: z.number().int(),
  refuelling_start: z.number().int(),
  refuelling_end: z.number().int(),
  datetime_start: isoDateTime,
  datetime_end: isoDateTime,
  year: z.number().int().nullable(),
  month: z.number().int().nullable(),
  day: z.number().int().nullable(),
  hour: z.number().int().nullable(),
  production_date: z.string().regex(ISO_DATE).nullable(),
  production_year: z.number().int().nullable(),
  production_month: z.number().int().nullable(),
  production_day: z.number().int().nullable(),
  equipment_id: z.number().int().nullable(),
  equipment: z.string().nullable(),
  license_plate: z.string().nullable(),
  terminant: z.number().nullable(),
  operator: z.string(),
  station_name: z.string().nullable(),
  tank_name: z.string().nullable(),
  attendant_name: z.string().nullable(),
  hourmeter: z.number().nullable(),
  odometer: z.number().int().nullable(),
  volume: z.number().nullable(),
  duration: z.number().int().nullable(),
  distance: z.number().int().nullable(),
  cost_center: z.string().nullable(),
});

export const fuelManagementResponseSchema = z.object({
  Pagination: paginationSchema,
  Result: z.array(fuelRecordSchema),
});

export type FuelRecord = z.infer<typeof fuelRecordSchema>;
export type FuelManagementResponse = z.infer<typeof fuelManagementResponseSchema>;

export const REFUELLING_KEY = 'id_cta';
