# Endpoint — movimentação detalhada com qualidade

Documento de referência do recurso sob teste. Para arquitetura e como escrever
testes, veja o [README](../README.md). Para os defeitos encontrados na revisão
de código, [docs/BUGS-ENCONTRADOS.md](BUGS-ENCONTRADOS.md).

```
GET /api/v1/detailed_movement_with_quality
Authorization: Bearer <access_token>
```

Repositório da API: `mining-control-data-api`
Rota: `api/v1/routes/detailed_movement_with_quality.py`
Regra: `api/v1/services/detailed_movement_with_quality_service.py`
Procedure: `dbo.rpt_detailed_movement_with_quality`

> A rota registrada usa **underscore**. O critério de aceite documenta hífen
> (`detailed-movement-with-quality`) e a descrição do card cita ainda uma
> terceira grafia. Ver BUG-001.

## O que o endpoint faz

Devolve movimentação com os teores de qualidade de cada ciclo. A procedure
entrega os dados em formato longo — uma linha por elemento por ciclo — e a API
pivoteia esses elementos em colunas dinâmicas `element_1`…`element_N`, uma linha
por ciclo.

O pivot é feito em Pandas (`DataFrame.pivot_table`), fora do banco. É onde mora
o risco: os defeitos dessa etapa não produzem erro HTTP — produzem número errado
em relatório de qualidade.

### Origem dos dados

O resultado é um `UNION ALL` de **duas** origens, o que não é óbvio pelo nome do
endpoint:

| Origem                      | O que traz                     | Observação                                                     |
| --------------------------- | ------------------------------ | -------------------------------------------------------------- |
| `dba.transport_report_data` | Ciclos de transporte           | Traz todos os campos                                           |
| `dbo.dw_load_report`        | Carregamentos de `Alimentação` | Tempos de fila, basculamento, distâncias e `dmt` vêm **nulos** |

Consequências práticas para quem escreve teste ou consome o endpoint:

- registros de alimentação têm boa parte dos campos numéricos nulos por
  construção — asserções sobre tempos e distâncias precisam filtrar antes;
- `transport_report_id` vem de sequências independentes nas duas tabelas, então
  pode colidir. Ver BUG-015, que é o achado mais grave da revisão;
- no modo `last_update_timestamp`, o bloco de alimentação some por completo
  (BUG-016).

### Como os elementos são numerados

```sql
concat('el', row_number() over(order by [name] asc)) as 'id_element'
from content where active = 1
```

A numeração é **posicional por ordem alfabética do nome**, não vinculada ao
elemento. Cadastrar um elemento novo renumera todos os que vêm depois dele no
alfabeto, e o `element_N` do consumidor passa a apontar para outra substância.

O nome do elemento existe na procedure (`element_name`) mas é descartado pelo
pivot — a resposta não permite saber qual elemento é cada coluna. Ver BUG-014.

## Autenticação

Token obtido em `POST /api/v1/login/access-token`, com corpo
`application/x-www-form-urlencoded` (`username` / `password`) — não JSON. É o
erro de integração mais comum aqui.

O token vale 180 minutos por padrão (`ACCESS_TOKEN_EXPIRE_MINUTES`).

| Situação                                     | Status                |
| -------------------------------------------- | --------------------- |
| Sem header `Authorization`                   | 401                   |
| Token malformado ou assinado com outra chave | **403** (ver BUG-004) |
| Usuário inexistente                          | 404                   |
| Usuário inativo                              | 400                   |

## Parâmetros

| Parâmetro               | Tipo   | Regra                                                                                                                                                                     |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dataIn`                | string | Obrigatório quando `last_update_timestamp` não é informado. `dd-MM-YYYY HH:mm:ss`                                                                                         |
| `dataFi`                | string | Idem                                                                                                                                                                      |
| `last_update_timestamp` | string | Busca por data de última atualização. Obrigatório quando `dataIn`/`dataFi` não são informados. **Desconsiderado quando `dataIn` e `dataFi` são informados** (ver BUG-010) |
| `id_equips`             | CSV    | Ausente → todos os equipamentos vinculados                                                                                                                                |
| `id_equip_types`        | CSV    | Ausente → todos                                                                                                                                                           |
| `id_equip_groups`       | CSV    | Ausente → todos                                                                                                                                                           |
| `id_turns`              | CSV    | Ausente → todos                                                                                                                                                           |
| `id_material_groups`    | CSV    | Ausente → todos                                                                                                                                                           |
| `id_materials`          | CSV    | Ausente → todos                                                                                                                                                           |
| `only_completed_cycles` | bool   | Default `None`, repassado como NULL à procedure                                                                                                                           |
| `page`                  | int    | Página, iniciando em 1 (`ge=1`). Default 1                                                                                                                                |
| `page_size`             | int    | Registros por página, de 1 a 1000 (`ge=1`, `le=1000`). Default 100                                                                                                        |

`page` e `page_size` são validados pelo FastAPI, então valor fora do intervalo
retorna **422**, não 400.

### Precedência entre a janela e o corte de atualização

O critério de aceite vigente diz:

> Quando `dataIn` e `dataFi` não são informados, é necessário informar ao menos
> `last_update_timestamp`. Quando `dataIn` e `dataFi` são informados,
> desconsiderar o campo.

**A janela de datas tem precedência.** A implementação faz o oposto, nas duas
camadas:

- `validate_date_range` retorna assim que encontra `last_update_timestamp`, sem
  sequer validar `dataIn`/`dataFi`;
- a procedure amplia a janela para `01-01-2000` até agora quando o corte é
  informado, ignorando o que veio nos parâmetros.

Os testes de `last_update_timestamp` seguem o critério de aceite e ficam
vermelhos até a correção — ver BUG-010.

Um caso não coberto pela regra: `dataIn` informado **sem** `dataFi`, junto com
`last_update_timestamp`. A redação fala em "dataIn e dataFi" no plural; vale
fechar com o PO se isso é erro de parâmetro ou se o corte assume.

### Sobre o formato de data

A API converte com `dateutil.parser.parse(..., dayfirst=True)`, que aceita bem
mais do que o documentado: `2026-08-01`, `01/08/2026`, `01-08-2026` sem hora.
`dayfirst=True` garante que a data é lida como dia-mês — o teste
`date-filters.spec.ts › data é interpretada como dia-mês` prova isso, e é o tipo
de falha que não gera erro, só dado do dia errado.

## Contrato da resposta

```json
{
  "Pagination": {
    "total_pages": 5,
    "current_page": 1,
    "next_page": "http://localhost:8000/api/v1/detailed_movement_with_quality?...&page=2",
    "previous_page": null,
    "total_records": 43,
    "total_records_per_page": 10
  },
  "Result": [
    {
      "id": 1,
      "transport_report_id": 252719,
      "start_date": "2026-08-04",
      "start_time": "11:11:08",
      "equipment_type": "Caminhão",
      "cycle_time": 0,
      "element_1": 65.4,
      "element_2": 3.2
    }
  ]
}
```

São **52 campos fixos** mais as colunas dinâmicas. Definição em
`src/models/detailed-movement-quality.model.ts`.

| Grupo               | Qtde | Campos                                                                                                                                                                                                                                                                        |
| ------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inteiros            | 7    | `id`, `transport_report_id`, `id_truck`, `day`, `month`, `year`, `dump_hour`                                                                                                                                                                                                  |
| Data (`YYYY-MM-DD`) | 2    | `start_date`, `end_date`                                                                                                                                                                                                                                                      |
| Hora (`HH:MM:SS`)   | 2    | `start_time`, `end_time`                                                                                                                                                                                                                                                      |
| Texto               | 18   | `shift`, `team`, `registration_id`, `operator`, `operator_group`, `equipment_type`, `fleet`, `truck`, `load_equipment`, `load_fleet`, `origin_area`, `origin_subarea`, `destination_area`, `destination_subarea`, `material`, `material_group`, `movement_type`, `cycle_type` |
| Decimais            | 23   | Pesos (`*_weight`), tempos (`*_time`), distâncias (`empty_distance`, `full_distance`, `dmt`), coordenadas                                                                                                                                                                     |
| Dinâmicos           | 0–60 | `element_1`…`element_N`                                                                                                                                                                                                                                                       |

Nomes usados nos filtros de lista, para asserção do efeito de cada um:
`id_equips` → `truck`, `id_equip_types` → `equipment_type`, `id_equip_groups` →
`fleet`, `id_turns` → `shift`, `id_material_groups` → `material_group`,
`id_materials` → `material`.

### Dois campos que confundem

**`id` não é identificador.** O service descarta o `id` da procedure e gera um
contador por ciclo **antes** de fatiar a página — então a numeração é global à
consulta: a página 2 com `page_size=10` começa em 11. O mesmo ciclo tem `id`
diferente em consultas diferentes.

**`transport_report_id` é a chave real do ciclo.** Exportada como `CYCLE_KEY` no
model — use ela para deduplicar, comparar e correlacionar.

### Colunas dinâmicas

A procedure devolve `id_element` no formato `el1`…`el60`; o service renomeia
para `element_1`…`element_60`. O limite é 60 (`MAX_QUALITY_ELEMENTS`); acima
disso a API responde 400.

Comportamentos que a suíte fixa:

- **Ciclo sem nenhuma medição** aparece com todas as colunas `null` — o merge do
  pivot é `how="left"`, então o ciclo não some do resultado.
- **Medição registrada sem valor vira `0`**, não `null`. A procedure faz
  `isnull(cvc.value, 0)`, o que torna teor ausente indistinguível de teor zero
  real. Ver BUG-011.
- **Elemento duplicado no mesmo ciclo é somado** — `pivot_table` usa
  `aggfunc="sum"`. Confirme com o time se essa é a regra desejada; média ou
  última medição seriam escolhas igualmente plausíveis.
- **A ordem é lexicográfica**: `element_1, element_10, element_11, …, element_2`
  (BUG-009).
- **O 61º elemento é descartado sem erro.** A procedure fixa 60 slots literais,
  então o limite é aplicado antes do Python e o 400 prometido pelo service nunca
  dispara. Ver BUG-012.

## Comportamentos fixados pela suíte

Erros de validação:

| Cenário                                             | Status  | Mensagem                                           |
| --------------------------------------------------- | ------- | -------------------------------------------------- |
| Sem `dataIn`/`dataFi` e sem `last_update_timestamp` | 400     | "dataIn e dataFi são obrigatórios…"                |
| `dataIn` > `dataFi`                                 | 400     | "Data inicial (dataIn) não pode ser maior…"        |
| Data em formato irreconhecível                      | 400     | "Formato de data inválido…"                        |
| `last_update_timestamp` inválido                    | 400     | Formato esperado                                   |
| `only_completed_cycles` não booleano                | **422** | Validação do FastAPI                               |
| `page` < 1 ou `page_size` fora de 1..1000           | **422** | Validação do FastAPI (`ge`/`le`)                   |
| Filtro de lista com id inexistente                  | 200     | `Result: []`                                       |
| Nenhum registro no período                          | 200     | `Result: []`, `total_records: 0`, `total_pages: 0` |
| Página além do total                                | 200     | `Result: []`                                       |
| Acima de 60 elementos                               | 400     | Limite excedido                                    |
| Acima do rate limit                                 | 429     | slowapi                                            |

Paginação: `total_pages = ceil(total_records / page_size)`, `next_page` e
`previous_page` como URL completa (ou `null` nas pontas). O fatiamento é feito
com `iloc` **depois** do pivot, então o DataFrame inteiro passa pela memória
antes de a página ser recortada — a paginação protege o cliente, não o
servidor.

## Cobertura

29 testes automatizados. O critério de inclusão está no
[README](../README.md#o-que-merece-um-teste-automatizado): entra o defeito que é
caro para o cliente **e** silencioso o bastante para escapar de review.

| Spec                   | Testes | Cobre                                                                                         |
| ---------------------- | ------ | --------------------------------------------------------------------------------------------- |
| `date-filters.spec.ts` | 6      | Obrigatoriedade, intervalo invertido, data inválida, leitura `dd-MM`, `last_update_timestamp` |
| `contract.spec.ts`     | 5      | Envelope, campos presentes, `day`/`month`/`year`, `dmt`, resultado vazio                      |
| `pivot.spec.ts`        | 5      | Unicidade de ciclo, colunas estáveis, teor numérico, colunas vs. janela, ciclo sem medição    |
| `list-filters.spec.ts` | 4      | Os 6 filtros num teste só, combinação, id inexistente, `only_completed_cycles`                |
| `pagination.spec.ts`   | 4      | `page_size` e `total_pages`, navegação sem perda, página além do total, limites               |
| `auth.spec.ts`         | 2      | Sem token e token inválido                                                                    |
| `robustness.spec.ts`   | 2      | Entrada maliciosa e id não numérico, sem 500 nem vazamento                                    |
| `performance.spec.ts`  | 1      | SLA da janela padrão                                                                          |

Tags: `@smoke` (4), `@contract`, `@regression`, `@performance`.

`pivot.spec.ts` tem mais testes que autenticação e paginação somadas de
propósito: é onde o defeito não gera erro e chega ao cliente como teor
plausível.

### Os quatro que mais importam

Falham silenciosamente em produção — não geram 500, geram número errado:

1. `pivot › cada ciclo aparece uma única vez` — pivot duplicando infla massa
   movimentada e toda métrica derivada.
2. `pivot › o conjunto de colunas não muda com a janela consultada` — se as
   colunas vierem dos dados e não do cadastro, o consumidor quebra de forma
   intermitente (BUG-006).
3. `pagination › percorrer todas as páginas não perde nem duplica registros` —
   sem ordenação determinística, o cliente sincroniza dado incompleto.
4. `date-filters › a janela filtra e é lida como dia-mês` — `MM-dd` devolve o
   dia errado sem erro nenhum.

## Massa de teste

Testes sem a fixture necessária ficam **skipped com motivo explícito**. Rode
`npm test` e leia os motivos: são a lista de provisionamento.

A causa dominante de skip é a janela `DATA_IN`/`DATA_FI` não ter registros:
sozinha, ela derruba a maior parte da suíte, porque quase toda asserção precisa
de pelo menos um registro para avaliar. Antes de investigar qualquer outra
coisa, confirme que o período configurado tem movimentação real na base.

| Ref   | O que precisa existir                                    | Variável                        | Habilita                          |
| ----- | -------------------------------------------------------- | ------------------------------- | --------------------------------- |
| MT-01 | Janela com ciclos e medições                             | `DATA_IN` / `DATA_FI`           | Quase toda a suíte                |
| MT-02 | 30 dias com volume representativo                        | `DATA_IN_WIDE` / `DATA_FI_WIDE` | Pivot entre janelas, performance  |
| MT-03 | Ciclo com elemento cadastrado e não medido               | —                               | `null` vs zero                    |
| MT-04 | Elemento ativo sem medição no período                    | —                               | Colunas vêm do cadastro (BUG-006) |
| MT-05 | Duas medições do mesmo elemento no ciclo                 | —                               | Regra de agregação (manual)       |
| MT-06 | Cliente com 61 elementos                                 | —                               | Limite de 60 (manual)             |
| MT-07 | Cliente com 0 elementos                                  | —                               | Ausência de colunas (manual)      |
| MT-08 | Dia com massa em que a leitura MM-dd não retornaria nada | `DATA_DDMM_DAY`                 | Leitura `dd-MM`                   |
| MT-09 | Teor com 4 casas decimais, um zero e um nulo             | —                               | Precisão e `null`                 |
| MT-10 | 2+ ids válidos de cada dimensão                          | `EQUIP_IDS`, `TURN_IDS`, …      | `list-filters.spec.ts`            |
| MT-11 | Ciclos sem fim no período                                | —                               | `only_completed_cycles`           |
| MT-12 | Usuário de teste ativo                                   | `API_USERNAME` / `API_PASSWORD` | Toda a suíte                      |
| MT-13 | Equipamentos de um segundo cliente                       | —                               | Isolamento multi-tenant (manual)  |
| MT-14 | `LIMIT_REQUESTS` elevado no ambiente                     | `RATE_LIMIT_PER_MINUTE`         | Viabiliza a execução              |

### Rate limit

`LIMIT_REQUESTS` tem default **10/minuto por IP** (`utils/consts.py`). Com esse
valor a suíte não roda. Suba no `.env` da API ao testar e reflita o valor em
`RATE_LIMIT_PER_MINUTE`.

Duas escolhas de desenho vêm daí: `authToken` tem escopo `worker` (autentica uma
vez por processo, não por teste) e `rate-limit.spec.ts` roda em modo serial,
porque ele precisa estourar o limite e contaminaria a contagem dos outros.

## Cenários que exigem banco

Não automatizáveis pela API — validar via MSSQL:

| Cenário                                            | Por quê                                                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Colisão de id entre as duas origens**            | `count(distinct id)` de cada origem no período vs. `total_records` do endpoint. Se o endpoint devolver menos, BUG-015 é real |
| **Renumeração ao cadastrar elemento**              | Cadastrar um elemento alfabeticamente anterior e conferir se `element_1` mudou de substância (BUG-014)                       |
| **Tipo das colunas de tempo**                      | Se forem `int`, a divisão por 60 trunca (BUG-013)                                                                            |
| **Teor registrado sem valor**                      | Separar "zero real" de "não medido", que o `isnull(...,0)` funde (BUG-011). Indistinguível pela API                          |
| **Tempos truncados por divisão inteira**           | `tr.cycle_time/60` com coluna `int`. Só o tipo no banco confirma (BUG-013)                                                   |
| **Rate limit protege o endpoint**                  | Infraestrutura, não regra de negócio. Exercitar em teste torna a suíte lenta e frágil                                        |
| Valor pivotado bate com a linha de origem          | Só o banco tem a verdade. É a verificação mais importante do card                                                            |
| Procedure devolve elementos sem medição no período | Determina o alcance do BUG-006                                                                                               |
| Modo incremental com bloco de alimentação          | Confirmar que os ciclos de `Alimentação` somem (BUG-016)                                                                     |
| Semântica dos tempos de manobra                    | Confirmar se `empty`/`full` estão trocados (BUG-017)                                                                         |
| Elemento duplicado no ciclo                        | Confirmar se somar é a regra desejada                                                                                        |
| Cliente com 61 / com 0 elementos                   | Exige provisionar cadastro                                                                                                   |
| Fuso da entrada vs. da saída                       | Comparar hora retornada com a hora no banco                                                                                  |
| Isolamento entre clientes                          | Exige segundo cliente com dados próprios                                                                                     |

A matriz completa, com status de execução, está na planilha de cenários.
