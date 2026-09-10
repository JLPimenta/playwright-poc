# Automação de testes — Fast2Mine

Projeto Playwright que cobre a Data API e, à medida que as telas entrarem, os
fluxos E2E do sistema.

Este documento é sobre **arquitetura, padrões e como escrever testes aqui**. O
que é específico de um endpoint vive em `docs/`.
---

## Começando

```bash
nvm use
npm install
npx playwright install --with-deps
cp .env.example .env      # preencha BASE_URL, API_USERNAME, API_PASSWORD
npm run test:smoke        # confirma que o ambiente responde
```

| Comando              | O que faz                                                         |
| -------------------- | ----------------------------------------------------------------- |
| `npm test`           | Tudo                                                              |
| `npm run test:api`   | Só a camada de API                                                |
| `npm run test:e2e`   | Só interface                                                      |
| `npm run test:smoke` | O ambiente subiu e responde                                       |
| `npm run test:ui`    | Modo interativo, ótimo para desenvolver                           |
| `npm run verify`     | Formatação + lint + tipos + coleta. **Rode antes de todo commit** |
| `npm run report`     | Relatório HTML da última execução                                 |

---

## O princípio

Uma responsabilidade por camada, e uma direção só de dependência:

```
teste  →  fixtures  →  service  →  http client  →  config
                ↘  builders · models · matchers
```

Nenhuma camada olha para trás. O service não conhece o teste. O http client não
conhece regra de negócio. A config não importa nada do projeto.

Se você precisar violar essa direção para resolver um problema, o problema está
no desenho — não force o import.

## As camadas

### `src/config` — configuração

Único lugar do projeto que lê `process.env`. Validado com Zod na carga, então
um `.env` malformado quebra na inicialização com mensagem clara, em vez de virar
`undefined` no meio de um teste.

`endpoints.ts` centraliza as rotas. Nenhum teste ou service escreve caminho
literal — trocar uma rota é uma linha.

### `src/core` — transporte

`HttpClient` monta a requisição, mede o tempo, trata 429 e anexa a troca HTTP ao
relatório.

Devolve sempre `HttpResult`, que carrega o corpo cru (`text`) junto do parseado.
Isso é proposital: em teste negativo a resposta pode nem ser JSON, e a mensagem
de falha precisa mostrar o que realmente voltou.

### `src/services` — Service Objects

Equivalente de API ao Page Object. Encapsula _como se fala_ com um recurso:
rota, formato dos parâmetros, forma do retorno.

Todo service expõe dois caminhos:

| Método         | Uso                                                                  |
| -------------- | -------------------------------------------------------------------- |
| `fetch()`      | Resultado cru. Para o teste negativo julgar status e corpo           |
| `fetchValid()` | Exige 200 e schema válido. Para o teste positivo receber dado tipado |

**Services não fazem asserção.** Quem julga é o teste.

### `src/models` — contrato

Schemas Zod que respondem "o que a API promete devolver". Derivados dos modelos
Pydantic da API.

### `src/data` — builders e massa

Builders fluentes para montar requisições, e as constantes de massa (payloads de
injeção, datas inválidas, termos que não podem vazar).

Concentram conhecimento de formato: nenhum teste monta string de data ou CSV de
ids na mão.

### `src/support` — matchers de domínio

Matchers customizados que substituem blocos `for` + `expect` repetidos.

O ganho não é economizar linha — é a **mensagem de falha**. Ela fica escrita num
lugar só, e é o que a pessoa lê às 3 da manhã quando o CI quebra.

### `src/fixtures` — composição

Estende o `test` do Playwright com os services já construídos.

`src/fixtures/index.ts` é o **ponto de entrada único**. Todo spec importa de
`@fixtures`, nunca de `@playwright/test` — é o que garante que os matchers de
domínio estejam sempre disponíveis e permite trocar implementação sem tocar em
nenhum teste.

### `src/pages` — Page Objects

Camada E2E. `BasePage` define as convenções; cada tela vira uma subclasse.

---

## Como escrever um teste de API

### 1. A rota já existe em `endpoints.ts`?

```ts
// src/config/endpoints.ts
export const endpoints = {
  reports: {
    meuRelatorio: `${V1}/meu_relatorio`,
  },
} as const;
```

### 2. Descreva o contrato em `src/models/`

```ts
// src/models/meu-relatorio.model.ts
import { z } from 'zod';
import { paginationSchema } from './pagination.model';

export const meuRegistroSchema = z.object({
  id: z.number().int().nullable(),
  descricao: z.string().nullable(),
});

export const meuRelatorioResponseSchema = z.object({
  Pagination: paginationSchema,
  Result: z.array(meuRegistroSchema),
});

export type MeuRegistro = z.infer<typeof meuRegistroSchema>;
```

Use `.passthrough()` apenas quando a API tiver campos dinâmicos de verdade —
ele desliga a detecção de campo inesperado.

### 3. Crie o Service Object

```ts
// src/services/meu-relatorio.service.ts
import { endpoints } from '@config/endpoints';
import type { HttpClient } from '@core/http-client';
import type { HttpResult } from '@core/types';
import { meuRelatorioResponseSchema } from '@models/meu-relatorio.model';
import { BaseService } from './base.service';

export interface MeuRelatorioQuery {
  dataIn?: string;
  dataFi?: string;
}

export class MeuRelatorioService extends BaseService {
  constructor(http: HttpClient) {
    super(http);
  }

  async fetch(query: MeuRelatorioQuery = {}, token?: string): Promise<HttpResult<unknown>> {
    return this.http.get(endpoints.reports.meuRelatorio, { params: { ...query }, token });
  }

  async fetchValid(query: MeuRelatorioQuery, token: string) {
    const result = await this.fetch(query, token);

    if (result.status !== 200) {
      throw new Error(
        `Esperado HTTP 200, recebido ${result.status}.\n` +
          `Query: ${JSON.stringify(query)}\nCorpo: ${result.text.slice(0, 600)}`,
      );
    }

    const parsed = meuRelatorioResponseSchema.safeParse(result.body);
    if (!parsed.success) {
      throw new Error(
        `Resposta fora do contrato:\n${parsed.error.issues
          .slice(0, 20)
          .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
          .join('\n')}`,
      );
    }

    return parsed.data;
  }
}
```

### 4. Registre a fixture

```ts
// src/fixtures/api.fixtures.ts
interface TestFixtures {
  meuRelatorioService: MeuRelatorioService;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  meuRelatorioService: async ({ http }, use) => {
    await use(new MeuRelatorioService(http));
  },
});
```

### 5. Escreva o spec

```ts
// tests/api/meu-relatorio/contract.spec.ts
import { test, expect } from '@fixtures';

test.describe('Meu relatório', { tag: ['@contract'] }, () => {
  test(
    'retorna 200 com envelope',
    { tag: ['@smoke'] },
    async ({ meuRelatorioService, authToken }) => {
      const response = await meuRelatorioService.fetchValid(
        { dataIn: '01-08-2026 00:00:00', dataFi: '01-08-2026 23:59:59' },
        authToken,
      );

      expect(response.Result).toBeInstanceOf(Array);
    },
  );
});
```

### 6. Um arquivo por preocupação

Nada de `meu-relatorio.spec.ts` com tudo dentro. Separe por preocupação, como
os specs existentes:

```
tests/api/meu-relatorio/
  contract.spec.ts      forma da resposta, campos, tipos, status
  auth.spec.ts          401/403
  filters.spec.ts       cada filtro tem efeito
  robustness.spec.ts    injeção, valores absurdos, vazamento de erro
  performance.spec.ts   SLA
```

Quando um spec passa de ~200 linhas, ele está cobrindo mais de uma preocupação.

### Precisa de um matcher novo?

Quando a mesma verificação aparecer em três lugares, promova a matcher:

```ts
// src/support/matchers.ts
export const expect = baseExpect.extend({
  toHaveUniqueValuesOf(records: MovementRecord[], key: string) {
    // ...calcula duplicados
    return {
      pass: duplicados.length === 0,
      message: () =>
        `${duplicados.length} valor(es) duplicado(s) em "${key}": ${duplicados.join(', ')}\n` +
        'Sintoma de pivot mal aplicado: cada linha de elemento virou uma linha de resultado.',
    };
  },
});
```

A mensagem deve dizer **o que está errado e o que isso significa**, não repetir
o valor esperado. `expect(x).toBe(y)` já faz isso.

---

## Como escrever um teste E2E

### 1. Page Object em `src/pages/`

```ts
// src/pages/relatorio-movimentacao.page.ts
import type { Page } from '@playwright/test';
import { BasePage } from './base.page';

export class RelatorioMovimentacaoPage extends BasePage {
  readonly filtroDataInicio = this.page.getByTestId('filtro-data-inicio');
  readonly filtroDataFim = this.page.getByTestId('filtro-data-fim');
  readonly botaoAplicar = this.page.getByRole('button', { name: 'Aplicar' });
  readonly tabela = this.page.getByRole('table');

  constructor(page: Page) {
    super(page, '/relatorios/movimentacao');
  }

  async filtrarPorPeriodo(inicio: string, fim: string): Promise<void> {
    await this.filtroDataInicio.fill(inicio);
    await this.filtroDataFim.fill(fim);
    await this.botaoAplicar.click();
  }
}
```

### 2. Fixture em `src/fixtures/web.fixtures.ts`

Mesmo padrão de `api.fixtures.ts`, reexportado por `src/fixtures/index.ts`.

### 3. Spec em `tests/e2e/`

```ts
import { test, expect } from '@fixtures';

test('filtra movimentação por período', async ({ relatorioPage }) => {
  await relatorioPage.goto();
  await relatorioPage.filtrarPorPeriodo('01/08/2026', '01/08/2026');

  await expect(relatorioPage.tabela).toBeVisible();
});
```

### Regras da camada E2E

- **Nenhuma asserção dentro do Page Object.** Ele sabe interagir; o teste julga.
- Localizadores como propriedades `readonly`, nunca criados dentro dos métodos.
- Preferir `getByRole` e `getByTestId` a CSS ou XPath. O atributo configurado é
  `data-testid` — alinhe com o time de Web na hora de pedir os hooks.
- Métodos descrevem a ação do usuário (`filtrarPorPeriodo`), não o clique
  (`clicarBotaoAplicar`).
- Autenticação via `storageState` gerado por um project de setup. Não repetir
  login em cada teste.

---

## O que merece um teste automatizado

Suíte grande não é suíte boa. Cada teste tem custo permanente: roda em todo PR,
quebra quando o código muda, e precisa ser lido e mantido por alguém. Um teste
que não muda nenhuma decisão quando falha é custo puro.

**Um cenário entra na suíte quando o defeito que ele pega é caro e silencioso.**
Caro para o cliente, e silencioso o bastante para passar por code review e por
um teste manual rápido.

Antes de escrever, responda:

| Pergunta                                                | Se a resposta for não      |
| ------------------------------------------------------- | -------------------------- |
| O cliente sente esse defeito?                           | Não escreva                |
| O defeito passaria despercebido sem este teste?         | Não escreva                |
| Já existe outro teste ou o schema que pegaria isso?     | Não escreva                |
| A falha vai dizer o que fazer, não só que algo quebrou? | Reescreva a asserção antes |

### Casos que quase sempre não valem um teste

**O schema já valida.** `fetchValid` roda a resposta inteira pelo Zod. Testar
"o campo X é string ou null" repete o schema em outro lugar — e agora são dois
lugares para atualizar quando o contrato mudar.

**É comportamento do framework.** `page_size` acima do máximo retorna 422 porque
o FastAPI tem `le=1000`. Um teste basta para fixar o contrato; seis, um por
valor inválido, testam o Pydantic.

**Multiplicação por dimensão equivalente.** Os seis filtros de lista percorrem o
mesmo caminho no código. Seis testes idênticos custam seis vezes mais e informam
quase o mesmo. Varra as dimensões **dentro** de um teste, com `expect.soft` e
mensagem que diga qual falhou.

**Heurística sem critério.** "Menos de 90% dos teores são zero" parece um teste,
mas o limiar é arbitrário: ou acusa sem defeito, ou passa com defeito. Quando a
verificação precisa do banco para ser conclusiva, ela é um cenário manual — e
deve estar documentada como tal.

**Detalhe interno sem efeito para o cliente.** Como o `id` é numerado entre
páginas não muda decisão de ninguém.

### Onde vale insistir

Concentre esforço onde o defeito **não gera erro** e chega ao cliente como
número plausível: cálculo, agregação, filtro que silenciosamente não filtra,
paginação que perde registro. No endpoint de qualidade, é o pivot — por isso ele
tem mais testes que autenticação e paginação somadas.

### Quando a suíte crescer

Cada teste novo justifica o custo, ou algum outro sai. Se um arquivo passar de
uma dúzia de testes, provavelmente há multiplicação por dimensão equivalente
escondida ali.

---

## Convenções

### Nomenclatura

| Item               | Padrão                                      | Exemplo                                        |
| ------------------ | ------------------------------------------- | ---------------------------------------------- |
| Arquivo de service | `kebab-case.service.ts`                     | `auth.service.ts`                              |
| Arquivo de model   | `kebab-case.model.ts`                       | `pagination.model.ts`                          |
| Arquivo de page    | `kebab-case.page.ts`                        | `base.page.ts`                                 |
| Spec               | `preocupacao.spec.ts`                       | `contract.spec.ts`                             |
| Pasta de specs     | `tests/<camada>/<recurso>/`                 | `tests/api/detailed-movement-quality/`         |
| Título de teste    | Frase declarativa do comportamento esperado | `'dataIn maior que dataFi retorna erro claro'` |

Títulos de teste descrevem **comportamento**, não mecânica. `'retorna 400 quando
dataIn > dataFi'` é melhor que `'testa validação de data'`.

### Comentários

Comentário explica **por quê**, nunca **o quê**. Se o nome da função, o título
do teste ou a mensagem de asserção já dizem, o comentário é ruído: ocupa
espaço, envelhece sem ninguém notar e treina o leitor a pular a leitura.

Escreva um comentário só quando o leitor não conseguir chegar sozinho à razão:
uma decisão contraintuitiva, um comportamento da API que contraria a
documentação, um `if` que existe por causa de um defeito conhecido.

```ts
// Ruim: repete a assinatura
/** Chamada crua: não assume status nem formato. */
async fetch(query, token) { ... }

// Bom: explica um desvio que ninguém adivinha lendo o código
// Sem registros esta rota responde 204, não 200 com lista vazia.
if (result.status === 204) { ... }
```

Antes de comentar, veja se o lugar certo não é outro:

| Se você quer explicar…                    | Escreva em…                             |
| ----------------------------------------- | --------------------------------------- |
| O que o teste verifica                    | O título do teste                       |
| Por que a falha importa e o que fazer     | A mensagem da asserção                  |
| Regra de negócio, contrato, comportamento | `docs/<endpoint>.md`                    |
| Defeito conhecido e seu impacto           | `docs/BUGS-*.md`, e cite o ID no código |

O leitor de uma falha no CI vê a mensagem da asserção, não o comentário. É lá
que o contexto rende.

### Tags

| Tag            | Quando usar                                   |
| -------------- | --------------------------------------------- |
| `@smoke`       | O ambiente subiu e responde. Roda em cada PR  |
| `@contract`    | Forma da resposta, status codes, autenticação |
| `@regression`  | Regra de negócio                              |
| `@performance` | Sensível a ambiente. Fora do CI de PR         |

```ts
test.describe('Contrato', { tag: ['@contract'] }, () => {
  test('nome do teste', { tag: ['@smoke'] }, async ({ ... }) => { ... });
});
```

### Asserções

```ts
// Bom: a mensagem diz o que investigar
expect(records, 'pivot duplicou ciclos — massa movimentada fica inflada').toHaveUniqueValuesOf(
  'transport_report_id',
);

// Ruim: a falha não ensina nada
expect(unicos.size).toBe(ids.length);
```

Use `expect.soft` quando quiser todos os problemas de uma vez em vez de parar no
primeiro — típico de verificação campo a campo.

### Massa de teste ausente

Use `test.skip` com motivo explícito, **não deixe falhar**:

```ts
test.skip(records.length === 0, 'Janela DATA_IN/DATA_FI sem registros. Ajuste o .env.');
```

Massa ausente é problema de ambiente, não defeito do produto. Falhar por isso
treina o time a ignorar vermelho.

O custo dessa escolha é que uma suíte com muitos skips parece saudável sem ser.
Por isso o motivo do skip precisa ser **acionável**: dizer qual variável ajustar
ou qual massa provisionar, não só "sem dados".

```ts
// Bom: quem lê sabe o que fazer
test.skip(records.length === 0, 'Janela DATA_IN/DATA_FI sem registros. Ajuste o .env.');

// Ruim: informa que pulou, não por quê nem como resolver
test.skip(records.length === 0);
```

Rode `npm test` e leia a coluna de skips: ela é a lista de trabalho de
provisionamento de ambiente. A causa mais comum é a janela `DATA_IN`/`DATA_FI`
não conter movimentação — sozinha ela derruba a maior parte da suíte, porque
quase toda asserção precisa de pelo menos um registro.

Só use `test.skip` para condição de ambiente ou massa. Skip por regra de
negócio é teste que deveria existir e não existe.

---

## Anti-padrões

| Não faça                                           | Faça                                                      |
| -------------------------------------------------- | --------------------------------------------------------- |
| `import { test } from '@playwright/test'` num spec | `import { test, expect } from '@fixtures'`                |
| Caminho literal `'/api/v1/algo'` no teste          | `endpoints.reports.algo`                                  |
| `process.env.X` fora de `src/config/env.ts`        | Adicione o campo ao schema Zod e consuma via `env`        |
| Asserção dentro de service ou page object          | Devolva o dado; o teste julga                             |
| `waitForTimeout`                                   | Asserção com auto-retry (`expect(locator).toBeVisible()`) |
| Teste que depende da ordem de execução de outro    | Fixture ou setup próprio                                  |
| Montar string de data no spec                      | `@data/date.builder`                                      |
| `test.only` commitado                              | `forbidOnly` já derruba o CI, mas não chegue lá           |
| Um spec gigante cobrindo tudo                      | Um arquivo por preocupação                                |

---

## Decisões registradas

**Por que fixture de escopo `worker` para o token?**
A API limita requisições por minuto e por IP. Autenticar uma vez por processo,
e não por teste, é o que mantém a suíte viável. Veja `RATE_LIMIT_PER_MINUTE` no
`.env.example`.

**Por que Zod e não gerar tipos do OpenAPI?**
O `/openapi.json` da API exige Basic Auth e reflete modelos Pydantic com
`extra="allow"` — ele não descreve campos dinâmicos. Gerar tipos de lá daria
falsa sensação de cobertura. Vale reavaliar quando os contratos estabilizarem.

**Por que services expõem `fetch` e `fetchValid` em vez de só um método?**
Teste negativo precisa do resultado cru para julgar status e corpo de erro;
teste positivo quer dado tipado sem repetir validação. Um método só forçaria
`try/catch` no spec ou asserção dentro do service.

**Por que dois projects e não dois repositórios?**
API e E2E compartilham config, autenticação e convenções. Separar duplicaria
tudo isso antes de existir um único teste de interface.

---

## Antes de abrir PR

```bash
npm run verify
```

Cobre formatação, lint, tipos e coleta dos testes — e não precisa de ambiente.
É o que roda no CI de cada PR; a execução contra o ambiente é job separado, com
credenciais em variáveis do projeto.

Relatório JUnit em `test-results/junit.xml` quando `CI=true`.
