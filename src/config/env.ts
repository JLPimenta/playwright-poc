import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

/**
 * Fonte única de configuração. Nenhum outro módulo lê `process.env`.
 *
 * Validado com Zod na carga: um `.env` malformado quebra na inicialização com
 * mensagem clara, em vez de produzir `undefined` no meio de um teste.
 */
const csv = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const bool = z
  .string()
  .default('false')
  .transform((v) => ['true', '1', 'yes'].includes(v.toLowerCase()));

const int = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = v === undefined || v === '' ? NaN : Number(v);
      return Number.isFinite(n) ? n : fallback;
    });

const envSchema = z.object({
  BASE_URL: z.string().url().default('http://localhost:8000'),
  WEB_BASE_URL: z.string().url().default('http://localhost:3000'),

  API_USERNAME: z.string().default(''),
  API_PASSWORD: z.string().default(''),

  DATA_IN: z.string().default('01-08-2026 00:00:00'),
  DATA_FI: z.string().default('01-08-2026 23:59:59'),
  DATA_IN_WIDE: z.string().default('01-07-2026 00:00:00'),
  DATA_FI_WIDE: z.string().default('31-07-2026 23:59:59'),

  EQUIP_IDS: csv,
  EQUIP_TYPE_IDS: csv,
  EQUIP_GROUP_IDS: csv,
  TURN_IDS: csv,
  MATERIAL_GROUP_IDS: csv,
  MATERIAL_IDS: csv,

  EXPECTED_ELEMENT_COUNT: int(-1),

  RATE_LIMIT_PER_MINUTE: int(10),
  RETRY_ON_RATE_LIMIT: bool,

  SLA_MS: int(3000),
  SLA_MS_WIDE: int(10000),

  LOG_HTTP: bool,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const detalhes = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Configuração inválida no .env:\n${detalhes}\n\nVeja .env.example.`);
}

const raw = parsed.data;

export const env = {
  api: {
    baseUrl: raw.BASE_URL,
    credentials: {
      username: raw.API_USERNAME,
      password: raw.API_PASSWORD,
    },
  },

  web: {
    baseUrl: raw.WEB_BASE_URL,
  },

  /** Janelas de data conhecidas com massa de teste. Formato dd-MM-YYYY HH:mm:ss. */
  windows: {
    default: { dataIn: raw.DATA_IN, dataFi: raw.DATA_FI },
    wide: { dataIn: raw.DATA_IN_WIDE, dataFi: raw.DATA_FI_WIDE },
  },

  /** Ids conhecidos do ambiente, usados para provar que cada filtro tem efeito. */
  ids: {
    id_equips: raw.EQUIP_IDS,
    id_equip_types: raw.EQUIP_TYPE_IDS,
    id_equip_groups: raw.EQUIP_GROUP_IDS,
    id_turns: raw.TURN_IDS,
    id_material_groups: raw.MATERIAL_GROUP_IDS,
    id_materials: raw.MATERIAL_IDS,
  },

  /** Número de elementos de qualidade cadastrados. -1 desativa a asserção exata. */
  expectedElementCount: raw.EXPECTED_ELEMENT_COUNT,

  rateLimit: {
    perMinute: raw.RATE_LIMIT_PER_MINUTE,
    retry: raw.RETRY_ON_RATE_LIMIT,
  },

  sla: {
    defaultMs: raw.SLA_MS,
    wideMs: raw.SLA_MS_WIDE,
  },

  logHttp: raw.LOG_HTTP,
} as const;

export type Env = typeof env;

/** Falha cedo e com mensagem acionável quando as credenciais não foram configuradas. */
export function assertCredentialsConfigured(): void {
  if (!env.api.credentials.username || !env.api.credentials.password) {
    throw new Error(
      'API_USERNAME e API_PASSWORD são obrigatórios para autenticar.\n' +
        'Copie .env.example para .env e preencha as credenciais.',
    );
  }
}
