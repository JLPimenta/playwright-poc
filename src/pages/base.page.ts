import type { Page, Locator } from '@playwright/test';

/**
 * Base dos Page Objects da camada E2E.
 * Convenções:
 *  - localizadores expostos como `readonly` no construtor, nunca criados dentro
 *    dos métodos;
 *  - preferir `getByRole` / `getByTestId` a seletores CSS;
 *  - métodos descrevem a ação do usuário (`filtrarPorPeriodo`), não o clique;
 *  - nenhuma asserção aqui dentro.
 */
export abstract class BasePage {
  protected constructor(
    protected readonly page: Page,
    private readonly path: string,
  ) {}

  async goto(): Promise<void> {
    await this.page.goto(this.path);
    await this.waitUntilReady();
  }

  /** Sobrescreva quando a tela tiver um marcador confiável de carregamento concluído. */
  protected async waitUntilReady(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
  }

  protected byTestId(testId: string): Locator {
    return this.page.getByTestId(testId);
  }
}
