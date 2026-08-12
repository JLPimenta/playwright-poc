import { endpoints } from '@config/endpoints';
import type { HttpClient } from '@core/http-client';
import type { HttpResult } from '@core/types';
import {
  type DetailedMovementResponse,
  detailedMovementResponseSchema,
  type MovementRecord,
} from '@models/detailed-movement-quality.model';
import { BaseService } from './base.service';

export interface DetailedMovementQuery {
  dataIn?: string;
  dataFi?: string;
  last_update_timestamp?: string;
  id_equips?: string;
  id_equip_types?: string;
  id_equip_groups?: string;
  id_turns?: string;
  id_material_groups?: string;
  id_materials?: string;
  only_completed_cycles?: boolean | string;
}

/**
 * Service Object do endpoint de movimentação detalhada com qualidade.
 */
export class DetailedMovementQualityService extends BaseService {
  constructor(http: HttpClient) {
    super(http);
  }

  async fetch(query: DetailedMovementQuery = {}, token?: string, path: string = endpoints.reports.detailedMovementWithQuality): Promise<HttpResult<unknown>> {
    return this.http.get(path, { params: { ...query }, token });
  }

  /** Exige 200 e schema válido. */
  async fetchValid(query: DetailedMovementQuery, token: string): Promise<DetailedMovementResponse & { durationMs: number }> {
    const result = await this.fetch(query, token);

    if (result.status !== 200) {
      throw new Error(
        `Esperado HTTP 200 em ${endpoints.reports.detailedMovementWithQuality}, ` +
          `recebido ${result.status}.\nQuery: ${JSON.stringify(query)}\n` +
          `Corpo: ${result.text.slice(0, 600)}`,
      );
    }

    const parsed = detailedMovementResponseSchema.safeParse(result.body);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 20)
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Resposta fora do contrato:\n${issues}`);
    }

    return { ...parsed.data, durationMs: result.durationMs };
  }

  /** Só os registros de uma consulta válida. */
  async records(query: DetailedMovementQuery, token: string): Promise<MovementRecord[]> {
    const response = await this.fetchValid(query, token);
    return response.Result;
  }

  /** Baseline sem qualidade, para comparar custo do pivot. */
  async fetchTransportReportBaseline(
    query: DetailedMovementQuery,
    token: string,
  ): Promise<HttpResult<unknown>> {
    return this.http.get(endpoints.reports.transportReport, { params: { ...query }, token });
  }
}
