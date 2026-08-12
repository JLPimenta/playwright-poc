import type { HttpClient } from '@core/http-client';

/**
 * Base dos Service Objects.
 *
 * Um service encapsula *como se fala* com um recurso da API: rota, formato dos
 * parâmetros e forma do retorno. Ele não faz asserção — devolve dados para o
 * teste julgar. É o equivalente de API para o Page Object da camada E2E.
 */
export abstract class BaseService {
  protected constructor(protected readonly http: HttpClient) {}
}
