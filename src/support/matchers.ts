import { expect as baseExpect } from '@playwright/test';
import {
  elementKeysOf,
  ELEMENT_KEY_PATTERN,
  type MovementRecord,
} from '@models/detailed-movement-quality.model';
import { IMPLEMENTATION_LEAK_TERMS } from '@data/query.builder';

/**
 * Matchers de domínio.
 *
 * Cada um substitui um bloco de `for` + `expect` que apareceria repetido em
 * vários specs. Isso mantém o teste declarativo e concentra a mensagem de
 * falha num lugar só.
 */
export const expect = baseExpect.extend({
  /**
   * Todos os registros expõem o mesmo conjunto de colunas
   * dinâmicas, e todas seguem o padrão `element_N`.
   */
  toHaveConsistentElementColumns(records: MovementRecord[]) {
    if (records.length === 0) {
      return {
        pass: false,
        message: () => 'Nenhum registro para avaliar as colunas de elemento.',
      };
    }

    const first = elementKeysOf(records[0] as Record<string, unknown>).sort();
    const problemas: string[] = [];

    const foraDoPadrao = first.filter((key) => !ELEMENT_KEY_PATTERN.test(key));
    if (foraDoPadrao.length > 0) {
      problemas.push(`Colunas fora do padrão element_N: ${foraDoPadrao.join(', ')}`);
    }

    records.forEach((record, index) => {
      const atual = elementKeysOf(record as Record<string, unknown>).sort();
      if (atual.join('|') !== first.join('|')) {
        problemas.push(
          `Registro ${index} (${String(record.transport_report_id)}) tem colunas ` +
            `[${atual.join(', ')}], diferente do primeiro [${first.join(', ')}]`,
        );
      }
    });

    return {
      pass: problemas.length === 0,
      message: () =>
        problemas.length === 0
          ? `Esperava colunas inconsistentes, mas todas batem: [${first.join(', ')}]`
          : `Colunas de elemento inconsistentes:\n${problemas.slice(0, 10).join('\n')}`,
    };
  },

  /** Nenhum valor repetido na chave informada — usado para detectar pivot duplicando ciclos. */
  toHaveUniqueValuesOf(records: MovementRecord[], key: string) {
    const valores = records.map((r) => (r as Record<string, unknown>)[key]);
    const vistos = new Map<unknown, number>();
    const duplicados: unknown[] = [];

    for (const valor of valores) {
      const contagem = (vistos.get(valor) ?? 0) + 1;
      vistos.set(valor, contagem);
      if (contagem === 2) duplicados.push(valor);
    }

    return {
      pass: duplicados.length === 0,
      message: () =>
        duplicados.length === 0
          ? `Esperava duplicatas em "${key}", mas os ${valores.length} valores são únicos.`
          : `${duplicados.length} valor(es) duplicado(s) em "${key}": ` +
            `${duplicados.slice(0, 10).join(', ')}${duplicados.length > 10 ? '…' : ''}\n` +
            'Sintoma de pivot mal aplicado: cada linha de elemento virou uma linha de resultado.',
    };
  },

  /** O corpo da resposta não vaza nome de procedure, stack trace ou driver de banco. */
  toNotLeakImplementationDetails(body: string) {
    const encontrados = IMPLEMENTATION_LEAK_TERMS.filter((termo) =>
      body.toLowerCase().includes(termo.toLowerCase()),
    );

    return {
      pass: encontrados.length === 0,
      message: () =>
        encontrados.length === 0
          ? 'Esperava vazamento de detalhe de implementação, mas o corpo está limpo.'
          : `Resposta vazou detalhe de implementação: ${encontrados.join(', ')}\n` +
            `Corpo: ${body.slice(0, 400)}`,
    };
  },

  /** Todos os registros satisfazem o predicado. Reporta os primeiros contraexemplos. */
  toSatisfyForEveryRecord(
    records: MovementRecord[],
    predicate: (record: MovementRecord) => boolean,
    description: string,
  ) {
    const falhas = records.filter((record) => !predicate(record));

    return {
      pass: falhas.length === 0,
      message: () =>
        falhas.length === 0
          ? `Esperava algum registro violando "${description}", mas todos os ${records.length} passaram.`
          : `${falhas.length}/${records.length} registro(s) violaram "${description}".\n` +
            `Exemplos: ${falhas
              .slice(0, 3)
              .map((f) => JSON.stringify(f).slice(0, 200))
              .join('\n')}`,
    };
  },
});
