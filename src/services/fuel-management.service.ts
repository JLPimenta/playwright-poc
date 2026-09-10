import { endpoints } from '@config/endpoints';
import type { HttpClient } from '@core/http-client';
import type { HttpResult } from '@core/types';
import {
  type FuelManagementResponse,
  fuelManagementResponseSchema,
  type FuelRecord,
} from '@models/fuel-management.model';
import { BaseService } from './base.service';

export interface FuelManagementQuery {
  dataIn?: string;
  dataFi?: string;
  id_equips?: string;
  page?: number | string;
}

export class FuelManagementService extends BaseService {
  constructor(http: HttpClient) {
    super(http);
  }

  async fetch(query: FuelManagementQuery = {}, token?: string): Promise<HttpResult<unknown>> {
    return this.http.get(endpoints.reports.fuelManagement, { params: { ...query }, token });
  }

  async fetchValid(
    query: FuelManagementQuery,
    token: string,
  ): Promise<FuelManagementResponse & { durationMs: number }> {
    const result = await this.fetch(query, token);

    // Sem registros esta rota responde 204, não 200 com lista vazia.
    if (result.status === 204) {
      throw new Error(
        `Sem registros de abastecimento para ${JSON.stringify(query)}. ` +
          'Ajuste FUEL_DATA_IN/FUEL_DATA_FI no .env para um período com massa.',
      );
    }

    if (result.status !== 200) {
      throw new Error(
        `Esperado HTTP 200 em ${endpoints.reports.fuelManagement}, ` +
          `recebido ${result.status}.\nQuery: ${JSON.stringify(query)}\n` +
          `Corpo: ${result.text.slice(0, 600)}`,
      );
    }

    const parsed = fuelManagementResponseSchema.safeParse(result.body);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 20)
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Resposta fora do contrato:\n${issues}`);
    }

    return { ...parsed.data, durationMs: result.durationMs };
  }

  async records(query: FuelManagementQuery, token: string): Promise<FuelRecord[]> {
    const response = await this.fetchValid(query, token);
    return response.Result;
  }
}
