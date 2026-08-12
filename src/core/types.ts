import type { APIResponse } from '@playwright/test';

export type QueryValue = string | number | boolean | undefined | null;
export type QueryParams = Record<string, QueryValue>;

export interface HttpResult<T = unknown> {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: T;
  text: string;
  durationMs: number;
  raw: APIResponse;
}

export interface FastApiError {
  detail?: string | Array<{ loc: unknown[]; msg: string; type: string }>;
}
