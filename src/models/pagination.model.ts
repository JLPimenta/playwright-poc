import { z } from 'zod';

/**
 * Contrato de `core/pagination.py::Pagination.get_pagination()`.
 *
 * `next_page`/`previous_page` são string (URL) quando há navegação e null
 * quando não há — o código monta a URL por substituição de `page=`.
 */
export const paginationSchema = z.object({
  total_pages: z.number().int().nonnegative(),
  current_page: z.number().int(),
  next_page: z.string().nullable(),
  previous_page: z.string().nullable(),
  total_records: z.number().int().nonnegative(),
  total_records_per_page: z.number().int().nonnegative(),
});

export type Pagination = z.infer<typeof paginationSchema>;
