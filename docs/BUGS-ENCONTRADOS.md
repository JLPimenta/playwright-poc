# Achados na revisão de código — `/api/v1/detailed_movement_with_quality`

Levantados por leitura estática de `api/v1/routes/detailed_movement_with_quality.py`,
`api/v1/services/detailed_movement_with_quality_service.py`, `core/pagination.py`,
`core/dependencies.py` e `models/Response_models.py`. Ainda não confirmados em execução.

| ID      | Severidade | Tema                                                            |
| ------- | ---------- | --------------------------------------------------------------- |
| BUG-002 | Crítica    | Contrato de resposta diverge por completo do critério de aceite |
| BUG-003 | Alta       | Paginação é decorativa — resposta sempre em página única        |
| BUG-007 | Alta       | Erro do banco sobe como 500 com a mensagem do driver exposta    |
| BUG-006 | Alta       | Colunas de elemento podem depender do período consultado        |
| BUG-001 | Média      | Rota registrada usa underscore; a documentação usa hífen        |
| BUG-004 | Média      | Token inválido responde 403 em vez de 401                       |
| BUG-008 | Média      | `resolve_equip_ids` levanta 204 com corpo                       |
| BUG-005 | Baixa      | Parser de data aceita muito mais formatos que o documentado     |
| BUG-009 | Baixa      | Ordem das colunas `element_N` é lexicográfica                   |

---

## BUG-002 — Contrato de resposta diverge do critério de aceite · Crítica

O card especifica um payload em inglês, com data e hora unificadas:

```json
{
  "datetime_start": "2026-08-04T11:11:08Z",
  "equipment_type": "…",
  "cycle_time": 0,
  "material": "…"
}
```

`QualityDetailedMovementModel` entrega outra coisa:

```json
{
  "DataInicio": "2026-08-04",
  "HoraInicio": "11:11:08",
  "Tipo_Equipamento": "…",
  "Temp_Ciclo": 0,
  "Material_CM": "…"
}
```

Não é diferença de nomenclatura: são contratos incompatíveis. Além dos nomes,
o AC pede `datetime_start`/`datetime_end` como timestamps ISO únicos, enquanto
o modelo quebra em quatro campos (`DataInicio`, `HoraInicio`, `DataFim`,
`HoraFim`). Também não existem `last_update_timestamp`, `production_date`,
nem os `*_id` das dimensões (só `id_truck` e `transport_report_id`).

**Impacto** — qualquer consumidor construído a partir da documentação do card
quebra. E a ausência dos `*_id` impede o cliente de fazer join com as tabelas
estruturais da própria API.

**Ação** — decidir qual é a verdade. Se for o modelo em português (por espelhar
o relatório da base, como diz a regra de negócio), o card precisa ser corrigido.
Se for o AC, o modelo precisa ser reescrito. A suíte hoje asserta o
implementado — contrato completo em
[DETAILED-MOVEMENT-QUALITY.md](DETAILED-MOVEMENT-QUALITY.md).

## BUG-003 — Paginação decorativa · Alta

```python
pagination = Pagination(total_records=total_records, page_size=total_records, page=1, url=url)
```

`page_size` recebe o total, `page` é fixo em 1. Consequências: `total_pages`
é sempre 1, `next_page`/`previous_page` são sempre `null`, e o endpoint não
aceita nenhum parâmetro de página. O objeto `Pagination` existe na resposta mas
não pagina nada.

**Impacto** — uma janela de 30 dias devolve tudo numa resposta só, depois de
passar por um `DataFrame` inteiro em memória. É o vetor mais provável de
esgotamento de memória em produção, ainda mais com `LIMIT_REQUESTS` permitindo
requisições concorrentes.

**Ação** — implementar paginação real (usar `PAGINATION_PAGE_SIZE`, que já
existe em `utils/consts.py` com default 5000) ou remover o objeto da resposta e
documentar o limite de janela.

## BUG-007 — Erro do banco exposto como 500 · Alta

```python
raise HTTPException(
    status_code=500,
    detail=f"Erro ao executar rpt_detailed_movement_with_quality: {str(e)}",
)
```

A mensagem do driver vai inteira para o cliente, junto com o nome da procedure.
Como os filtros de lista são repassados como string crua para a procedure
(`id_equips`, `id_turns`, …), um valor não numérico chega ao banco e volta como
erro de conversão — ou seja, é acionável por qualquer usuário autenticado.

**Ação** — validar os filtros de lista na borda (aceitar apenas CSV de
inteiros) e trocar o `detail` por mensagem genérica, mantendo o erro real
apenas no log.

## BUG-006 — Colunas de elemento podem depender do período · Alta

```python
unique_element_ids = df[element_id_col].dropna().unique().tolist()
```

As colunas saem do que veio no `DataFrame`, não de um cadastro. O docstring
afirma que a procedure devolve `id_elemento` para todos os elementos ativos —
se essa premissa não se sustentar (por exemplo, quando nenhum ciclo do período
tem medição de um elemento), o schema da resposta muda conforme o filtro de
data.

**Impacto** — consumidor com schema fixo quebra de forma intermitente, só em
períodos sem medição de algum elemento. Difícil de reproduzir depois.

**Ação** — confirmar o comportamento da procedure. O teste
`pivot.spec.ts › conjunto de colunas não depende da janela consultada` cobre
exatamente isso.

## BUG-001 — Rota com underscore vs. hífen · Média

Código: `@router.get("/detailed_movement_with_quality")` → `/api/v1/detailed_movement_with_quality`.
Critério de aceite e descrição do card: `/api/v1/detailed-movement-with-quality`
e `/quality/detailed-movement`.

Três grafias para o mesmo recurso. Os demais endpoints do `api.py` usam
underscore (`transport_report`, `block_model`), então o código está coerente
com o repositório — a documentação é que está errada.

**Ação** — corrigir o card e a documentação.

Não há teste cobrindo a variante com hífen: a rota foi tratada como resolvida e
o endpoint alternativo saiu de `endpoints.ts`. Se a grafia voltar a ficar em
aberto, reintroduza a entrada e o teste comparativo.

## BUG-004 — Token inválido responde 403 · Média

`core/dependencies.py::get_current_user` levanta `HTTP_403_FORBIDDEN` quando o
JWT não decodifica. O correto para credencial ausente ou inválida é 401
(403 significa "autenticado, mas sem permissão"). Afeta todos os endpoints, não
só este.

**Ação** — avaliar com o time; mudar isso é breaking change para os
consumidores atuais.

## BUG-008 — 204 com corpo · Média

```python
raise HTTPException(status_code=204, detail="Nenhum equipamento ativo encontrado.")
```

`204 No Content` não pode ter corpo. Dependendo do servidor, isso vira erro de
protocolo ou o corpo é descartado silenciosamente — e o cliente recebe um 204
sem explicação.

**Ação** — usar 200 com lista vazia (coerente com o resto do AC) ou 404.

## BUG-005 — Parser de data permissivo · Baixa

`convert_string_to_datetime` usa `dateutil.parser.parse(..., dayfirst=True)`,
que aceita `2026-08-01`, `01/08/2026`, `Aug 1 2026` e várias outras grafias,
embora a documentação prometa apenas `dd-MM-YYYY HH:mm:ss`.

**Impacto** — baixo isoladamente, mas cria dependência não documentada: um
cliente pode passar a mandar ISO, e apertar a validação depois vira breaking
change.

**Ação** — decidir entre documentar a permissividade ou restringir agora.

## BUG-009 — Ordem lexicográfica das colunas · Baixa

`pivot_table` ordena as colunas pelo valor de `id_elemento` como string, então
a saída é `el1, el10, el11, …, el2` — que vira `element_1, element_10,
element_11, …, element_2`. Não corrompe dado, mas contraria a leitura natural
do payload e de qualquer documentação que mostre `element_1, element_2, …`.

**Ação** — ordenar as colunas pelo índice numérico antes do `merge`.
