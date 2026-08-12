const pad = (n: number): string => String(n).padStart(2, '0');

/** Formata um Date (interpretado em UTC) no formato aceito pela API. */
export function toApiDateTime(date: Date): string {
  return (
    `${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  );
}

/** Converte `dd-MM-YYYY HH:mm:ss` em epoch (ms), interpretando como UTC. */
export function fromApiDateTime(value: string): number {
  const [datePart, timePart = '00:00:00'] = value.split(' ');
  const [dd, mm, yyyy] = datePart.split('-');
  return Date.parse(`${yyyy}-${mm}-${dd}T${timePart}Z`);
}

export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** Amostras inválidas usadas nos testes negativos de data. */
export const INVALID_DATES = {
  diaInexistente: '31-02-2026 00:00:00',
  mesInvalido: '01-13-2026 00:00:00',
  horaInvalida: '01-08-2026 25:00:00',
  textoLivre: 'ontem',
  vazio: '',
  soNumeros: '99999999',
} as const;

/**
 * Formatos que a documentação não promete, mas que o `dateutil` aceita.
 */
export const TOLERATED_DATE_FORMATS = {
  isoComHora: '2026-08-01 00:00:00',
  barras: '01/08/2026 00:00:00',
  semHora: '01-08-2026',
} as const;
