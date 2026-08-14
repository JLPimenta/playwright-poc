/**
 * Formato de data da API: `dd-MM-YYYY HH:mm:ss`.
 *
 * Nenhum teste monta ou interpreta string de data na mão — o conhecimento de
 * formato mora aqui.
 */

/**
 * Converte um dia `dd-MM-YYYY` para o `YYYY-MM-DD` que o Pydantic serializa.
 *
 * Derivar em vez de escrever o literal é proposital: um valor digitado à mão
 * pode inverter dia e mês justamente no teste que existe para detectar essa
 * inversão — e aí o teste passa a confirmar o defeito em vez de apontá-lo.
 */
export function apiDayToIso(day: string): string {
  const [dd, mm, yyyy] = day.split('-');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Amostras inválidas do teste negativo de data.
 *
 * Duas, e não cinco: são os dois caminhos distintos de validação. Mês 13, hora
 * 25 e string vazia caem no mesmo tratamento de um destes — repeti-los só
 * multiplica requisições contra o rate limit da API sem informar mais nada.
 */
export const INVALID_DATES = {
  /** Formato correto, data que não existe no calendário. */
  diaInexistente: '31-02-2026 00:00:00',
  /** Não parseia de jeito nenhum. */
  textoLivre: 'ontem',
} as const;
