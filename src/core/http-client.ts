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
 * Espera máxima acumulada por requisição ao lidar com 429.
 *
 * Precisa ser bem menor que o timeout do teste: um spec que faz N chamadas em
 * sequência gastaria N × este valor no pior caso.
 */
const RETRY_BUDGET_MS = 6_000;

/**
 * Camada única de transporte HTTP.
 *
 * Responsabilidades:
 *  - montar a requisição (query string, headers, auth);
 *  - medir o tempo;
 *  - tratar 429 quando o retry estiver habilitado, dentro de um orçamento;
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
    let result = await this.dispatch<T>(method, path, options);

    if (!env.rateLimit.retry) return result;

    // Orçamento total de espera por requisição. Sem esse teto, um teste que
    // faz várias chamadas em sequência estoura o timeout do Playwright antes
    // de qualquer asserção rodar — e a falha vira "Test timeout exceeded", que
    // não diz nada sobre a causa real ter sido rate limit.
    let gastoMs = 0;

    for (let attempt = 1; result.status === 429 && gastoMs < RETRY_BUDGET_MS; attempt += 1) {
      const esperaMs = Math.min(
        this.retryAfterMs(result.headers, attempt),
        RETRY_BUDGET_MS - gastoMs,
      );
      if (esperaMs <= 0) break;

      await new Promise((resolve) => setTimeout(resolve, esperaMs));
      gastoMs += esperaMs;

      result = await this.dispatch<T>(method, path, options);
    }

    if (result.status === 429) {
      this.annotate(
        'rate limit',
        `${method} ${path} continuou em 429 após ${(gastoMs / 1000).toFixed(1)}s de espera. ` +
          'Suba LIMIT_REQUESTS no .env da API ou reduza a concorrência da suíte.',
      );
    }

    return result;
  }

  private async dispatch<T>(
    method: string,
    path: string,
    options: RequestOptions,
  ): Promise<HttpResult<T>> {
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
      timeout: env.requestTimeoutMs,
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
  private attachToReport(
    method: string,
    path: string,
    options: RequestOptions,
    result: HttpResult<unknown>,
  ): void {
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

  /** Registra uma anotação no relatório do teste corrente, se houver um. */
  private annotate(type: string, description: string): void {
    try {
      test.info().annotations.push({ type, description });
    } catch {
      // Fora do contexto de um teste. Silenciar é correto aqui.
    }
  }

  private retryAfterMs(headers: Record<string, string>, attempt: number): number {
    const header = headers['retry-after'];
    const seconds = header ? Number(header) : NaN;
    if (Number.isFinite(seconds)) return seconds * 1000;
    return 500 * 2 ** attempt;
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
