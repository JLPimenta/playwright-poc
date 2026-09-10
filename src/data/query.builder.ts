import { env } from '@config/env';
import type { DetailedMovementQuery } from '@services/detailed-movement-quality.service';

/**
 * Builder fluente dos filtros do endpoint.
 *
 * Mantém os testes legíveis e concentra num só lugar o conhecimento de que os
 * filtros de lista viajam como CSV.
 *
 * @example
 *   const query = new MovementQueryBuilder().defaultWindow().onlyCompletedCycles().build();
 */
export class MovementQueryBuilder {
  private query: DetailedMovementQuery = {};

  static default(): MovementQueryBuilder {
    return new MovementQueryBuilder().defaultWindow();
  }

  /** Janela padrão do `.env`, com massa de teste conhecida. */
  defaultWindow(): this {
    this.query.dataIn = env.windows.default.dataIn;
    this.query.dataFi = env.windows.default.dataFi;
    return this;
  }

  /** Janela ampla, para volume e performance. */
  wideWindow(): this {
    this.query.dataIn = env.windows.wide.dataIn;
    this.query.dataFi = env.windows.wide.dataFi;
    return this;
  }

  window(dataIn: string, dataFi: string): this {
    this.query.dataIn = dataIn;
    this.query.dataFi = dataFi;
    return this;
  }

  /** Janela garantidamente sem registros. */
  emptyWindow(): this {
    return this.window('01-01-1990 00:00:00', '02-01-1990 00:00:00');
  }

  dataIn(value: string | undefined): this {
    this.query.dataIn = value;
    return this;
  }

  dataFi(value: string | undefined): this {
    this.query.dataFi = value;
    return this;
  }

  lastUpdate(value: string): this {
    this.query.last_update_timestamp = value;
    return this;
  }

  /** Aplica um filtro de lista a partir de um array de ids. */
  withIds(filter: ListFilter, ids: readonly string[]): this {
    this.query[filter] = ids.join(',');
    return this;
  }

  /** Valor cru, para os testes negativos (ex.: `'abc'`, `'1,,3'`). */
  withRaw(filter: ListFilter, value: string): this {
    this.query[filter] = value;
    return this;
  }

  onlyCompletedCycles(value: boolean | string = true): this {
    this.query.only_completed_cycles = value;
    return this;
  }

  /** Paginação. Omitir os dois usa o default da API (página 1, 100 registros). */
  paginate(page: number | string, pageSize?: number | string): this {
    this.query.page = page;
    if (pageSize !== undefined) this.query.page_size = pageSize;
    return this;
  }

  pageSize(value: number | string): this {
    this.query.page_size = value;
    return this;
  }

  build(): DetailedMovementQuery {
    return { ...this.query };
  }
}

export const LIST_FILTERS = [
  'id_equips',
  'id_equip_types',
  'id_equip_groups',
  'id_turns',
  'id_material_groups',
  'id_materials',
] as const;

export type ListFilter = (typeof LIST_FILTERS)[number];

/**
 * Campo do registro afetado por cada filtro.
 *
 * O modelo passou a expor o `*_id` de cada dimensão, então a verificação
 * compara id com id. Antes só dava para comparar pelo campo textual, que não
 * distingue dois registros de mesmo nome e ids diferentes.
 */
export const FILTER_TO_FIELD: Record<ListFilter, string> = {
  id_equips: 'equipment_id',
  id_equip_types: 'equipment_type_id',
  id_equip_groups: 'equipment_group_id',
  id_turns: 'turn_id',
  id_material_groups: 'material_group_id',
  id_materials: 'material_id',
};

/** Ids configurados no `.env` para um filtro. Vazio significa fixture ausente. */
export function idsFor(filter: ListFilter): readonly string[] {
  return env.ids[filter];
}

/** Payloads de injeção usados nos testes de robustez dos filtros. */
export const INJECTION_PAYLOADS = [
  "1' OR '1'='1",
  '1; DROP TABLE dbo.transport_report--',
  '1 UNION SELECT null,null,null--',
  "'; EXEC dbo.rpt_detailed_movement_with_quality--",
] as const;

/** Termos que nunca devem aparecer no corpo de uma resposta de erro. */
export const IMPLEMENTATION_LEAK_TERMS = [
  'rpt_detailed_movement_with_quality',
  'Traceback',
  'sqlalchemy',
  'pyodbc',
  'pandas',
  'DataFrame',
  'site-packages',
  'ODBC',
  'SQLSTATE',
] as const;
