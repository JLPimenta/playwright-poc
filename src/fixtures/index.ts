/**
 * Ponto de entrada único das fixtures.
 *
 * Todo spec importa daqui — nunca de `@playwright/test` diretamente. É isso que
 * garante que os matchers de domínio e os services estejam sempre disponíveis,
 * e permite trocar a implementação sem tocar em nenhum teste.
 */
export { test } from './api.fixtures';
export { expect } from '@support/matchers';
export { MovementQueryBuilder, LIST_FILTERS, idsFor } from '@data/query.builder';
export { env } from '@config/env';
export { endpoints } from '@config/endpoints';
