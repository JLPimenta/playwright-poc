import { APIRequestContext, test } from '@playwright/test';
import { env } from '@config/env';
import type { HttpResult, QueryParams } from './types';

export interface RequestOptions {
  params?: QueryParams;
  token?: string;
  headers?: Record<string, string>;
  form?: Record<string, string>;
  data?: unknown;
}

/**
 * Camada única de transporte HTTP.
 *
 * Responsabilidades:
 *  - montar a requisição (query string, headers, auth);
 *  - medir o tempo;
 *  - tratar 429 quando o retry estiver habilitado;
 *  - anexar requisição/resposta ao relatório do Playwright.
 */
export class HttpClient {
  constructor(private readonly request: APIRequestContext) {}

  async get<T = unknown>(path: string, options: RequestOptions = {}): Promise<HttpResult<T>> {
    return this.send<T>('GET', path, options);
  }

  async post<T = unknown>(path: string, options: RequestOptions = {}): Promise<HttpResult<T>> {
    return this.send<T>('POST', path, options);
  }

  async send<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD',
    path: string,
    options: RequestOptions = {},
  ): Promise<HttpResult<T>> {
    const maxAttempts = env.rateLimit.retry ? 4 : 1;

    let result = await this.dispatch<T>(method, path, options);

    for (let attempt = 1; attempt < maxAttempts && result.status === 429; attempt += 1) {
      const waitMs = this.retryAfterMs(result.headers, attempt);
      await new Promise((resolve) => setTimeout(resolve, waitMs));

      result = await this.dispatch<T>(method, path, options);
    }

    return result;
  }

  private async dispatch<T>(method: string, path: string, options: RequestOptions): Promise<HttpResult<T>> {
    const startedAt = Date.now();

    const raw = await this.request.fetch(path, {
      method,
      params: serializeParams(options.params),
      headers: {
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.headers ?? {}),
      },
      ...(options.form ? { form: options.form } : {}),
      ...(options.data !== undefined ? { data: options.data } : {}),
      failOnStatusCode: false,
    });

    const durationMs = Date.now() - startedAt;
    const text = await raw.text();

    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }

    const result: HttpResult<T> = {
      status: raw.status(),
      ok: raw.ok(),
      headers: raw.headers(),
      body: body as T,
      text,
      durationMs,
      raw,
    };

    this.attachToReport(method, path, options, result);
    return result;
  }

  /** Anexa a troca HTTP ao relatório, o que remove a necessidade de console.log nos testes. */
  private attachToReport(method: string, path: string, options: RequestOptions, result: HttpResult<unknown>): void {
    if (!env.logHttp) return;

    try {
      const info = test.info();
      const payload = {
        request: { method, path, params: options.params ?? {} },
        response: {
          status: result.status,
          durationMs: result.durationMs,
          body: result.text.slice(0, 4000),
        },
      };
      void info.attach(`${method} ${path} — ${result.status}`, {
        body: JSON.stringify(payload, null, 2),
        contentType: 'application/json',
      });
    } catch {
      // Fora do contexto de um teste (ex.: globalSetup). Silenciar é correto aqui.
    }
  }

  private retryAfterMs(headers: Record<string, string>, attempt: number): number {
    const header = headers['retry-after'];
    const seconds = header ? Number(header) : NaN;
    if (Number.isFinite(seconds)) return seconds * 1000;
    return Math.min(60_000, 2_000 * 2 ** attempt);
  }
}

/** Converte os parâmetros para o formato aceito pelo Playwright, omitindo vazios. */
function serializeParams(params?: QueryParams): Record<string, string> | undefined {
  if (!params) return undefined;

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    out[key] = String(value);
  }
  return out;
}
