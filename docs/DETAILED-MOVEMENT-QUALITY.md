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

Devolve movimentação detalhada de transporte com os teores de qualidade de cada
ciclo. Na base, cada elemento medido é uma linha; a API pivoteia esses elementos
em colunas dinâmicas `element_1`…`element_N`, uma linha por ciclo.

O pivot é feito em Pandas (`DataFrame.pivot_table`), fora do banco. É onde mora
o risco: os defeitos dessa etapa não produzem erro HTTP — produzem número errado
em relatório de qualidade.

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

| Parâmetro               | Tipo   | Regra                                                                             |
| ----------------------- | ------ | --------------------------------------------------------------------------------- |
| `dataIn`                | string | Obrigatório quando `last_update_timestamp` não é informado. `dd-MM-YYYY HH:mm:ss` |
| `dataFi`                | string | Idem                                                                              |
| `last_update_timestamp` | string | Quando informado, **ignora** `dataIn` e `dataFi` — inclusive sem validá-los       |
| `id_equips`             | CSV    | Ausente → todos os equipamentos vinculados                                        |
| `id_equip_types`        | CSV    | Ausente → todos                                                                   |
| `id_equip_groups`       | CSV    | Ausente → todos                                                                   |
| `id_turns`              | CSV    | Ausente → todos                                                                   |
| `id_material_groups`    | CSV    | Ausente → todos                                                                   |
| `id_materials`          | CSV    | Ausente → todos                                                                   |
| `only_completed_cycles` | bool   | Default `None`, repassado como NULL à procedure                                   |

Não existe parâmetro de paginação. O objeto `Pagination` da resposta é
decorativo (BUG-003).

### Sobre o formato de data

A API converte com `dateutil.parser.parse(..., dayfirst=True)`, que aceita bem
mais do que o documentado: `2026-08-01`, `01/08/2026`, `01-08-2026` sem hora.
`dayfirst=True` garante que `03-04-2026` é 3 de abril, não 4 de março — o teste
`date-filters.spec.ts › data é interpretada como dia-mês` prova isso, e é o tipo
de falha que não gera erro, só dado do dia errado.

## Contrato da resposta

```json
{
  "Pagination": {
    "total_pages": 1,
    "current_page": 1,
    "next_page": null,
    "previous_page": null,
    "total_records": 2,
    "total_records_per_page": 2
  },
  "Result": [
    {
      "id": 1,
      "transport_report_id": 252719,
      "DataInicio": "2026-08-04",
      "HoraInicio": "11:11:08",
      "Tipo_Equipamento": "…",
      "Temp_Ciclo": 0,
      "element_1": 65.4,
      "element_2": 3.2
    }
  ]
}
```

São **52 campos fixos** mais as colunas dinâmicas. Definição em
`src/models/detailed-movement-quality.model.ts`.

| Grupo               | Qtde | Campos                                                                                                                                                                                                                                                                             |
| ------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inteiros            | 7    | `id`, `transport_report_id`, `id_truck`, `Dia`, `Mes`, `Ano`, `Hora_Basc`                                                                                                                                                                                                          |
| Data (`YYYY-MM-DD`) | 2    | `DataInicio`, `DataFim`                                                                                                                                                                                                                                                            |
| Hora (`HH:MM:SS`)   | 2    | `HoraInicio`, `HoraFim`                                                                                                                                                                                                                                                            |
| Texto               | 18   | `Turno`, `Turma`, `matricula`, `Operador`, `grupo_operador`, `Tipo_Equipamento`, `Frota`, `Caminhao`, `Carga`, `Frota_Carga`, `Origem_Area_CM`, `Origem_Sub_Area_CM`, `Destino_Area_CM`, `Destino_Sub_Area_CM`, `Material_CM`, `Grupo_Material`, `Tipo_Movimentacao`, `Tipo_Ciclo` |
| Decimais            | 23   | Balanças, tempos (`Temp_*`), distâncias (`Dist_*`, `DMT`), coordenadas                                                                                                                                                                                                             |
| Dinâmicos           | 0–60 | `element_1`…`element_N`                                                                                                                                                                                                                                                            |

> **A suíte asserta este contrato, não o do critério de aceite.** Os dois
> divergem por completo — o card promete `datetime_start`, `equipment_type`,
> `cycle_time`. Decisão registrada; ver BUG-002.

### Dois campos que confundem

**`id` não é identificador.** O service descarta o `id` da procedure e gera um
contador sequencial 1..N por resposta. O mesmo ciclo tem `id` diferente em
consultas diferentes.

**`transport_report_id` é a chave real do ciclo.** Exportada como `CYCLE_KEY` no
model — use ela para deduplicar, comparar e correlacionar.

### Colunas dinâmicas

A procedure devolve `id_elemento` no formato `el1`…`el60`; o service renomeia
para `element_1`…`element_60`. O limite é 60 (`MAX_QUALITY_ELEMENTS`); acima
disso a API responde 400.

Três comportamentos que a suíte fixa:

- **Sem medição vem `null`**, nunca `0`. `clean_nan_from_dict` converte NaN e
  inf em `null` antes de serializar. Zero falsifica média de teor.
- **Elemento duplicado no mesmo ciclo é somado** — `pivot_table` usa
  `aggfunc="sum"`. Confirme com o time se essa é a regra desejada; média ou
  última medição seriam escolhas igualmente plausíveis.
- **A ordem é lexicográfica**: `element_1, element_10, element_11, …, element_2`
  (BUG-009).

## Comportamentos fixados pela suíte

Erros de validação:

| Cenário                                             | Status  | Mensagem                                           |
| --------------------------------------------------- | ------- | -------------------------------------------------- |
| Sem `dataIn`/`dataFi` e sem `last_update_timestamp` | 400     | "dataIn e dataFi são obrigatórios…"                |
| `dataIn` > `dataFi`                                 | 400     | "Data inicial (dataIn) não pode ser maior…"        |
| Data em formato irreconhecível                      | 400     | "Formato de data inválido…"                        |
| `last_update_timestamp` inválido                    | 400     | Formato esperado                                   |
| `only_completed_cycles` não booleano                | **422** | Validação do FastAPI                               |
| Filtro de lista com id inexistente                  | 200     | `Result: []`                                       |
| Nenhum registro no período                          | 200     | `Result: []`, `total_records: 0`, `total_pages: 0` |
| Acima de 60 elementos                               | 400     | Limite excedido                                    |
| Acima do rate limit                                 | 429     | slowapi                                            |

Paginação, hoje: `current_page: 1`, `total_pages: 1`, `next_page` e
`previous_page` sempre `null`, `total_records_per_page == total_records`.
`pagination.spec.ts` fixa isso de propósito — implementar paginação de verdade
vai quebrar esses testes, e é assim que a mudança será notada.

## Cobertura

78 testes automatizados.

| Spec                   | Testes | Cobre                                                                                                                         |
| ---------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `contract.spec.ts`     | 11     | Envelope, os 52 campos, tipos, coerência `Dia`/`Mes`/`Ano`, métodos não suportados, resultado vazio                           |
| `date-filters.spec.ts` | 11     | Obrigatoriedade, intervalo invertido, formatos inválidos e tolerados, leitura `dd-MM`, precedência de `last_update_timestamp` |
| `list-filters.spec.ts` | 22     | Os 6 filtros (efeito, id inexistente, combinação) e `only_completed_cycles`                                                   |
| `pivot.spec.ts`        | 11     | Unicidade de ciclo, `id` sequencial, colunas consistentes, `null` vs zero, precisão decimal, estabilidade entre janelas       |
| `robustness.spec.ts`   | 7      | Injeção, id não numérico, listas extensas, vazamento de erro, headers                                                         |
| `auth.spec.ts`         | 6      | 401 sem token, token forjado, esquema `Basic`, login com senha errada                                                         |
| `pagination.spec.ts`   | 5      | Página única, coerência dos totais, `page` ignorado                                                                           |
| `performance.spec.ts`  | 3      | SLA nas duas janelas, custo do pivot vs `transport_report`                                                                    |
| `rate-limit.spec.ts`   | 2      | 429 e ausência de vazamento na resposta bloqueada                                                                             |

Tags: `@smoke` (6), `@contract`, `@regression`, `@performance`.

### Os cinco testes que mais importam

Falham silenciosamente em produção — não geram 500, geram número errado:

1. `pivot.spec.ts › cada ciclo aparece uma única vez` — pivot duplicando infla
   massa movimentada e toda métrica derivada.
2. `pivot.spec.ts › conjunto de colunas não depende da janela consultada` — se
   as colunas vierem dos dados e não do cadastro, o schema muda conforme o
   filtro (BUG-006).
3. `pivot.spec.ts › elemento sem medição vem como null, não como zero` — zero
   falsifica média de teor.
4. `date-filters.spec.ts › data é interpretada como dia-mês` — `MM-dd` devolve o
   dia errado sem erro nenhum.
5. `robustness.spec.ts › id de lista não numérico não expõe erro do banco` —
   BUG-007, acionável por qualquer usuário autenticado.

## Massa de teste

Testes sem a fixture necessária ficam **skipped com motivo explícito**. Rode
`npm test` e leia os skips: são a lista de provisionamento.

| Ref   | O que precisa existir                        | Variável                        | Habilita                          |
| ----- | -------------------------------------------- | ------------------------------- | --------------------------------- |
| MT-01 | Janela com ciclos e medições                 | `DATA_IN` / `DATA_FI`           | Quase toda a suíte                |
| MT-02 | 30 dias com volume representativo            | `DATA_IN_WIDE` / `DATA_FI_WIDE` | Pivot entre janelas, performance  |
| MT-03 | Ciclo com elemento cadastrado e não medido   | —                               | `null` vs zero                    |
| MT-04 | Elemento ativo sem medição no período        | —                               | Colunas vêm do cadastro (BUG-006) |
| MT-05 | Duas medições do mesmo elemento no ciclo     | —                               | Regra de agregação (manual)       |
| MT-06 | Cliente com 61 elementos                     | —                               | Limite de 60 (manual)             |
| MT-07 | Cliente com 0 elementos                      | —                               | Ausência de colunas (manual)      |
| MT-08 | Registro em 03-04-2026, nenhum em 04-03-2026 | —                               | Leitura `dd-MM`                   |
| MT-09 | Teor com 4 casas decimais, um zero e um nulo | —                               | Precisão e `null`                 |
| MT-10 | 2+ ids válidos de cada dimensão              | `EQUIP_IDS`, `TURN_IDS`, …      | `list-filters.spec.ts`            |
| MT-11 | Ciclos sem fim no período                    | —                               | `only_completed_cycles`           |
| MT-12 | Usuário de teste ativo                       | `API_USERNAME` / `API_PASSWORD` | Toda a suíte                      |
| MT-13 | Equipamentos de um segundo cliente           | —                               | Isolamento multi-tenant (manual)  |
| MT-14 | `LIMIT_REQUESTS` elevado no ambiente         | `RATE_LIMIT_PER_MINUTE`         | Viabiliza a execução              |

### Rate limit

`LIMIT_REQUESTS` tem default **10/minuto por IP** (`utils/consts.py`). Com esse
valor a suíte não roda. Suba no `.env` da API ao testar e reflita o valor em
`RATE_LIMIT_PER_MINUTE`.

Duas escolhas de desenho vêm daí: `authToken` tem escopo `worker` (autentica uma
vez por processo, não por teste) e `rate-limit.spec.ts` roda em modo serial,
porque ele precisa estourar o limite e contaminaria a contagem dos outros.

## Cenários que exigem banco

Não automatizáveis pela API — validar via MSSQL:

| Cenário                                   | Por quê                                                           |
| ----------------------------------------- | ----------------------------------------------------------------- |
| Valor pivotado bate com a linha de origem | Só o banco tem a verdade. É a verificação mais importante do card |
| Estrutura equivale ao relatório da base   | Requisito explícito do critério de aceite                         |
| Procedure devolve elementos sem medição   | Determina se BUG-006 é real                                       |
| Elemento duplicado no ciclo               | Confirmar se somar é a regra desejada                             |
| Cliente com 61 / com 0 elementos          | Exige provisionar cadastro                                        |
| Fuso da entrada vs. da saída              | Comparar hora retornada com a hora no banco                       |
| Isolamento entre clientes                 | Exige segundo cliente com dados próprios                          |
| Consumo de memória em janela ampla        | Agravado por BUG-003                                              |

A matriz completa, com status de execução, está na planilha de cenários.
