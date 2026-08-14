# Achados na revisão de código — `/api/v1/detailed_movement_with_quality`

Levantados por leitura estática de `api/v1/routes/detailed_movement_with_quality.py`,
`api/v1/services/detailed_movement_with_quality_service.py`, `core/pagination.py`,
`core/dependencies.py`, `models/Response_models.py` e da migration
`dbo.rpt_detailed_movement_with_quality.sql`.

Os achados de severidade crítica vêm todos da procedure: são defeitos que não
produzem erro HTTP e chegam ao consumidor como número plausível.

## Em aberto

| ID      | Severidade | Tema                                                              |
| ------- | ---------- | ----------------------------------------------------------------- |
| BUG-014 | Crítica    | `element_N` não identifica o elemento, e a numeração é instável   |
| BUG-015 | Crítica    | `UNION ALL` permite colisão de `transport_report_id`              |
| BUG-010 | Crítica    | Precedência de `last_update_timestamp` está invertida             |
| BUG-011 | Alta       | `isnull(cvc.value, 0)` transforma teor ausente em zero            |
| BUG-016 | Alta       | Bloco de alimentação ignora o modo `last_update_timestamp`        |
| BUG-007 | Alta       | Erro do banco sobe como 500 com a mensagem do driver exposta      |
| BUG-006 | Alta       | Colunas de elemento dependem do período consultado                |
| BUG-013 | Média      | Divisão inteira ao converter tempos para minutos                  |
| BUG-012 | Média      | Limite de 60 elementos é aplicado em silêncio, sem erro           |
| BUG-001 | Média      | Rota registrada usa underscore; a documentação usa hífen          |
| BUG-004 | Média      | Token inválido responde 403 em vez de 401                         |
| BUG-008 | Média      | `resolve_equip_ids` levanta 204 com corpo                         |
| BUG-017 | Média      | Possível troca entre `empty_maneuver_time` e `full_maneuver_time` |
| BUG-005 | Baixa      | Parser de data aceita muito mais formatos que o documentado       |
| BUG-009 | Baixa      | Ordem das colunas `element_N` é lexicográfica                     |

## Resolvidos

| ID      | Tema                                    | Como foi resolvido                                                     |
| ------- | --------------------------------------- | ---------------------------------------------------------------------- |
| BUG-002 | Contrato de resposta divergindo do card | Modelo reescrito em inglês; o card passa a ser corrigido a partir dele |
| BUG-003 | Paginação decorativa                    | `page` e `page_size` implementados na rota, com fatiamento real        |

---

## BUG-003 — Paginação decorativa · Resolvido

A rota passou a expor `page` (`ge=1`, default 1) e `page_size` (`ge=1`,
`le=1000`, default 100), e fatia o resultado com `iloc` antes de serializar.
`total_pages`, `next_page` e `previous_page` agora acompanham a página pedida.

**Ressalva que permanece** — o fatiamento acontece depois do pivot, então o
DataFrame inteiro do período ainda passa pela memória a cada requisição. A
paginação protege o cliente do payload gigante, não o servidor do custo. Se
janelas amplas virarem uso comum, o corte precisa descer para a procedure.

Coberto por `pagination.spec.ts` (15 testes), incluindo navegação completa sem
perda nem duplicação — que é o que pega ausência de ordenação determinística.

## BUG-002 — Contrato de resposta divergindo do card · Resolvido

`QualityDetailedMovementModel` foi reescrito com nomes em inglês
(`start_date`, `equipment_type`, `cycle_time`, `material`…) no lugar dos antigos
`DataInicio`, `Tipo_Equipamento`, `Temp_Ciclo`, `Material_CM`. O service
acompanhou: as colunas de origem viraram `id_element`, `element_name` e
`element_value`.

Por decisão do time, **o modelo implementado passa a ser o contrato oficial** e
o critério de aceite será corrigido a partir dele. A suíte asserta esses nomes.

Pontos a refletir no card ao atualizá-lo, porque continuam diferentes do que ele
descreve hoje:

- data e hora seguem separadas (`start_date` + `start_time`), enquanto o card
  descreve `datetime_start` como timestamp único;
- não há `*_id` para as dimensões — só `id_truck` e `transport_report_id`.
  Sem eles o cliente não consegue fazer join com as tabelas estruturais da
  própria API;
- nomes escolhidos divergem dos do card em alguns campos: `shift` (card:
  `turn`), `truck` (card: `equipment`), `fleet` (card: `equipment_group`);
- seguem ausentes `production_date`, `username`, `code_time`,
  `total_cycle_time`, tempos de parada, altitudes e `exception_type`.

---

## BUG-014 — `element_N` não identifica o elemento, e a numeração é instável · Crítica

A procedure numera os elementos por **ordem alfabética do nome**:

```sql
concat('el', row_number() over(order by [name] asc)) as 'id_element'
from content where active = 1
```

Duas consequências, e as duas são silenciosas:

**1. Cadastrar um elemento renumera todos os outros.** Com `Fe` e `SiO2`
cadastrados, `element_1 = Fe`. Ao cadastrar `Al2O3`, a numeração vira
`element_1 = Al2O3`, `element_2 = Fe`, `element_3 = SiO2`. O consumidor que
mapeou `element_1 → Fe` passa a ler alumina como se fosse ferro, sem erro
nenhum e sem mudança de schema.

Isso contradiz diretamente o docstring de `pivot_dynamic_elements`, que afirma
que a numeração "é estável por cliente" e "evita que o mesmo elemento físico
mude de coluna entre duas consultas diferentes".

**2. O nome do elemento não chega ao cliente.** A procedure devolve
`element_name`, mas o pivot o descarta:

```python
drop_cols = {element_id_col, element_name_col, element_value_col, "id"}
```

Ou seja: a resposta traz `element_1: 65.4` e **não existe nenhuma forma de
saber qual elemento é**. Nem na resposta, nem em endpoint auxiliar.

**Ação** — as duas coisas precisam ser resolvidas juntas. Numerar pelo `id` do
elemento (estável) em vez da posição alfabética, e expor o mapa
`element_N → nome` em algum lugar: um bloco no envelope da resposta, um
cabeçalho, ou um endpoint de metadados.

Enquanto isso não existir, o consumo correto do endpoint depende de
conhecimento fora de banda — que é exatamente o tipo de acoplamento que a
API deveria eliminar.

## BUG-015 — `UNION ALL` permite colisão de `transport_report_id` · Crítica

O resultado une duas origens:

```sql
select tr.id as 'transport_report_id' ... from dba.transport_report_data(...)
UNION ALL
select lr.id as 'transport_report_id' ... from dbo.dw_load_report lr
```

`tr.id` e `lr.id` vêm de tabelas diferentes e são sequências independentes.
Nada impede que um ciclo de transporte e um de alimentação tenham o mesmo id.

O pivot no Python agrupa exatamente por essa coluna:

```python
base_df = df[base_columns].drop_duplicates(subset=[movement_id_col])
pivot_df = df.pivot_table(index=movement_id_col, ..., aggfunc="sum")
```

Na colisão, os dois ciclos viram **uma linha só**: o `drop_duplicates` mantém
os atributos de um deles e descarta o outro, e o `aggfunc="sum"` soma os teores
dos dois. O resultado é um registro que não corresponde a nenhum ciclo real.

**Por que passa despercebido** — o teste `cada ciclo aparece uma única vez`
continua verde justamente porque a fusão elimina a duplicata. O sintoma é
perda de registro e teor somado, não id repetido.

**Ação** — usar uma chave composta (origem + id) como índice do pivot, ou
prefixar o id por origem na própria procedure.

**Verificação** — comparar, no banco, `count(distinct id)` de cada origem no
período com o `total_records` do endpoint. Se o endpoint devolver menos, há
colisão.

## BUG-011 — Teor ausente vira zero · Alta

```sql
,isnull(cvc.value,0) as 'element_value'
```

Medição registrada sem valor é entregue como `0`, indistinguível de um teor
zero real. É o oposto do que o `clean_nan_from_dict` no Python tenta garantir.

**Impacto** — média de teor calculada pelo cliente fica errada para baixo, e
não há como detectar depois: o dado chega como número legítimo.

**Ação** — remover o `isnull` e deixar o valor nulo subir. O pivot já converte
NaN em `null` corretamente.

Coberto parcialmente por `pivot.spec.ts › teor ausente não é mascarado como
zero`, que alerta quando a proporção de zeros é alta demais para ser plausível.
A separação exata entre "zero real" e "não medido" só é possível no banco.

## BUG-016 — Bloco de alimentação ignora o modo `last_update_timestamp` · Alta

No modo incremental, a procedure amplia a janela para varrer tudo:

```sql
if @LastUpdateTimestamp is not null
begin
    set @start = dbo.date_to_timestamp('01-01-2000 00:00:00')
    set @end   = dbo.date_to_timestamp(dbo.getdate())
end
```

O primeiro bloco do `UNION` usa `@start`/`@end`. O segundo, não:

```sql
where lr.end_timestamp BETWEEN dbo.date_to_timestamp(@DataIn) AND dbo.date_to_timestamp(@DataFi)
```

Quando só `last_update_timestamp` é informado, `@DataIn` e `@DataFi` são nulos,
o `BETWEEN NULL AND NULL` não casa com nada, e **os ciclos de alimentação
somem** — sem erro, sem aviso.

**Impacto** — a sincronização incremental, que é o caso de uso do parâmetro,
devolve resultado incompleto de forma consistente.

**Ação** — usar `@start`/`@end` também no segundo bloco.

## BUG-013 — Divisão inteira ao converter tempos · Média

```sql
,tr.cycle_time/60 as 'cycle_time'
,tr.load_queue_time/60 as 'load_queue_time'
```

Se as colunas de origem forem `int` no SQL Server, `/60` é divisão inteira:
125 segundos viram `2` minutos em vez de `2.08`. A perda é sistemática e
sempre para baixo.

**Ação** — confirmar o tipo das colunas em `transport_report_data`. Se forem
inteiras, dividir por `60.0`.

Coberto por `contract.spec.ts › tempos são convertidos para minutos sem truncar
a fração`, que falha se a amostra inteira vier sem parte fracionária.

## BUG-012 — Limite de 60 elementos aplicado em silêncio · Média

O service promete erro ao ultrapassar o limite:

```python
if len(unique_element_ids) > max_elements:
    raise HTTPException(400, "Quantidade de elementos ... excede o limite máximo de 60")
```

Mas a procedure já corta antes. A tabela `@content` tem exatamente 60 slots
literais (`el1`..`el60`), e o `full join` deixa o 61º elemento com
`id_element` nulo — que o Python descarta no `dropna()`.

Resultado: cliente com 61 elementos recebe **200 com 60 colunas**, e o elemento
que sobrou desaparece sem aviso. O 400 nunca dispara.

**Ação** — decidir qual camada é responsável pelo limite e fazer a outra
confiar nela. Se o corte for no banco, o service deveria detectar a perda; se
for no service, a procedure precisa devolver todos.

O critério de aceite foi revisado e agora diz:

> Quando `dataIn` e `dataFi` não são informados, é necessário informar ao menos
> `last_update_timestamp`. Quando `dataIn` e `dataFi` são informados,
> desconsiderar o campo.

A janela de datas passa a ter precedência. A implementação faz o contrário:

```python
def validate_date_range(dataIn, dataFi, last_update_timestamp=None):
    if last_update_timestamp:
        # valida só o corte e retorna — dataIn e dataFi nem são olhados
        return
```

Dois efeitos:

1. Com os três parâmetros informados, o corte de atualização vence — deveria
   perder.
2. Com `last_update_timestamp` presente, `dataIn` e `dataFi` não são validados.
   Um intervalo invertido ou uma data inexistente passa sem 400.

O segundo é o mais perigoso: o cliente informa uma janela errada, não recebe
erro nenhum e assume que o retorno corresponde ao período que pediu.

Além do `validate_date_range`, é preciso confirmar como a procedure
`dbo.rpt_detailed_movement_with_quality` combina `@DataIn`/`@DataFi` com
`@LastUpdateTimestamp` — hoje os três vão para o banco e a precedência real
pode estar lá dentro.

**Ação** — inverter a precedência na validação e confirmar a regra na procedure.

Coberto por `date-filters.spec.ts › last_update_timestamp`. Esses testes ficam
**vermelhos até a correção** — é intencional: seguem o critério de aceite, não a
implementação.

**Ponto em aberto** — a regra fala em "dataIn e dataFi" no plural. Não define o
que fazer quando só um dos dois é informado junto com o corte. Fechar com o PO.

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

## BUG-017 — Possível troca entre os tempos de manobra · Média

```sql
,tr.unload_maneuver_time/60 as 'empty_maneuver_time'
,tr.load_maneuver_time/60 as 'full_maneuver_time'
```

A manobra de carregamento é mapeada para `full_maneuver_time` e a de
basculamento para `empty_maneuver_time`. Semanticamente parece invertido: o
caminhão manobra **vazio** para carregar e **cheio** para bascular.

Não dá para confirmar pela API — os dois campos são numéricos e plausíveis nos
dois sentidos. É o tipo de defeito que só aparece quando alguém compara o
relatório com a operação real.

**Ação** — confirmar com quem definiu a semântica dos campos. Se estiver
trocado, os dois relatórios que usam esses tempos estão errados desde sempre.

## BUG-006 — Colunas de elemento dependem do período · Alta

> Atualização após a revisão da procedure: **confirmado**, e a causa é outra.

A procedure monta `#content_elements` com os 60 slots fixos, o que sugeriria
schema estável. Mas o join final que popula `#dados` é:

```sql
left join content_variable_contents cvc on cv.id = cvc.content_variable_id and cvc.active = 1
left join #content_elements co on cvc.content_id = co.id
```

`co.id_element` só é preenchido quando existe `cvc` para aquele ciclo. Se
nenhum ciclo do período tiver medição do elemento X, X não aparece em `#dados`
e o Pandas não cria a coluna.

Ou seja: **as colunas continuam vindo dos dados do período, não do cadastro**,
e o schema da resposta muda conforme o filtro de data.

**Ação** — devolver uma linha por elemento ativo por ciclo (cross join com
`#content_elements`), com valor nulo quando não houver medição.

Coberto por `pivot.spec.ts › conjunto de colunas não depende da janela
consultada`.

## BUG-005 — Parser de data permissivo · Baixa

`convert_string_to_datetime` usa `dateutil.parser.parse(..., dayfirst=True)`,
que aceita `2026-08-01`, `01/08/2026`, `Aug 1 2026` e várias outras grafias,
embora a documentação prometa apenas `dd-MM-YYYY HH:mm:ss`.

**Impacto** — baixo isoladamente, mas cria dependência não documentada: um
cliente pode passar a mandar ISO, e apertar a validação depois vira breaking
change.

**Ação** — decidir entre documentar a permissividade ou restringir agora.

## BUG-009 — Ordem lexicográfica das colunas · Baixa

`pivot_table` ordena as colunas pelo valor de `id_element` como string, então
a saída é `el1, el10, el11, …, el2` — que vira `element_1, element_10,
element_11, …, element_2`. Não corrompe dado, mas contraria a leitura natural
do payload e de qualquer documentação que mostre `element_1, element_2, …`.

**Ação** — ordenar as colunas pelo índice numérico antes do `merge`.
