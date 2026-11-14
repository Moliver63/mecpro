# Revisão Goldfish — MecProAI

> Revisão por um agente **sem histórico** antes e depois de mudanças de risco.
> Adaptado do Elephant-Goldfish Model (google/elephant-goldfish-model) para um
> fundador solo. Criado em 2026-11-14 a partir do veredito do Conselho.

## Por que existe

O padrão que mais custou neste repositório não foi falta de contexto. Foi a
mesma sessão escrever o código e conferir o código. Exemplo real: o regex de
prova social que "passou no teste" porque outro padrão do mesmo array dava
match, enquanto o padrão testado estava quebrado (barra simples em template
literal). A cabeça que errou ao escrever errou de novo ao testar.

O `docs/` já é o **Elefante**: guarda o contexto entre sessões. Este arquivo
define o **Peixinho**: um revisor que nunca viu a conversa.

Princípio: **quem confere não pode ser quem escreveu, nem ter lido o
raciocínio de quem escreveu.**

Isto não substitui teste. Revisão aponta; teste prova.

---

## Quando é obrigatório

A revisão Goldfish é obrigatória quando a mudança toca qualquer item abaixo:

| Área | Exemplos |
|---|---|
| Banco | `server/schema.ts`, qualquer `migration_*.sql`, colunas novas, reconciliação schema × produção |
| Guardas de verdade | `campaignFactGuard.ts`, `campaignQualityGate.ts`, `campaignBriefingReadiness.ts`, `creativeReview.ts` |
| Publicação | `publish_campaign`, `publishToMeta`, Google/TikTok publish, `update_live_meta_campaign`, endpoints de UPDATE em campanha ativa |
| Autorização | `oauthServer.ts`, `mcpServer.ts` (auth/escopo), `protectedProcedure`/`adminProcedure`, checagem de dono |
| Dinheiro | Asaas, créditos, afiliados/comissões, budget mínimo |
| Dados entre clientes | `learning_base`, `winner_patterns`, qualquer fallback, exemplo ou memória que possa vazar fato de um cliente para outro |
| Regra que bloqueia | qualquer portão novo ou alterado que impede gerar, salvar ou publicar |

**Não precisa:** ajuste visual, texto de UI, docs, log, refatoração sem mudança
de comportamento coberta por teste existente.

Na dúvida, rode. Custa alguns minutos; o `drizzle-kit push` custou 20 tabelas.

---

## Fluxo

```
1. Especificação curta   → docs/specs/AAAA-MM-DD-assunto.md (modelo abaixo)
2. Peixinho de especificação (contexto novo) → lista classificada
3. Elefante corrige a especificação (máx. 2 rodadas no total)
4. Implementação + testes
5. Peixinho de diff (contexto novo) → lê o diff e roda os testes
6. Michel decide os BLOQUEANTES que sobraram. Só então commit.
```

Regras do ciclo:

- **Contexto novo de verdade.** No Claude Code, subagente novo (Agent/Task).
  Ele recebe só: a especificação (ou o diff), os arquivos que ela cita e este
  checklist. Nunca a conversa, nunca o "por que eu fiz assim".
- **Modelo diferente quando der.** Revisar Claude com Claude dá contexto limpo,
  mas não independência de vieses. Se houver como rodar o Peixinho em outro
  modelo (Gemini, Codex), prefira.
- **Máximo 2 rodadas.** Se ainda houver BLOQUEANTE depois da segunda, pare e
  leve ao Michel. "Até zero ressalvas" não termina nunca com LLM.
- **Saída classificada.** Sem classificação o Michel aprova tudo por cansaço.
- **Se não der para abrir contexto novo, a revisão não aconteceu.** Não
  simular revisão na mesma sessão e chamar de Goldfish.

---

## Classificação dos apontamentos

| Classe | Significa | Exige |
|---|---|---|
| **BLOQUEANTE** | Quebra produção, vaza dado entre clientes, apaga dado, publica errado, abre falha de segurança | Evidência (`arquivo:linha` ou trecho da spec) **e** um caso de teste que falharia hoje |
| **RISCO** | Pode dar errado em cenário plausível | Cenário concreto em uma frase |
| **OPCIONAL** | Melhoria, estilo, nome | Nada. O Elefante pode ignorar |

Apontamento BLOQUEANTE sem evidência e sem teste é rebaixado para RISCO.
Máximo de 10 apontamentos por rodada, os mais graves primeiro.

---

## Checklist (cada linha veio de um bug real)

Toda vez que um bug chegar a produção, ele vira uma linha aqui
(Regra 15 do FRAMEWORK_EXCELENCIA). Checklist que não cresce envelhece.

### A. Desenho (pegar na especificação)

1. **Direção inversa.** Se A bloqueia B, B bloqueia A? (`propertyType` só checava
   sala comercial → apartamento; `purpose` não tinha checagem nenhuma.)
2. **Fato de cliente no código.** Algum literal de um cliente específico
   (bairro, metragem, preço, nome)? (`buildCarouselFallback` devolvia "Cobertura
   Triplex / Praia Brava" para todo mundo.)
3. **Regra global que devia ser por projeto.** A lista/regra recebe o projeto
   como parâmetro? (`buildForbiddenClaims` aplica a mesma lista à plataforma
   inteira.)
4. **Só funciona em um nicho.** A checagem vale para qualquer segmento ou só
   imóvel? (Fact Guard estrutural era 100% `facts.realEstate`.)
5. **Detecção por palavra solta.** Duas categorias podem disparar juntas? Há
   prioridade/exclusão? ("academia" em "condomínio com piscina e academia" virava
   fitness.)
6. **Negação.** "não é X" é lido como X? ("não é sala comercial nem à venda" virava
   sala comercial + venda.)
7. **Toda regra que bloqueia tem saída em todas as portas:** tela, chat e MCP?
   (22/10: aprovação existia no chat e no MCP, não na tela.)
8. **Cópia da regra.** Existe outra implementação da mesma regra? A mudança
   atinge todas? (Prefira `createCaller` e uma função única com teste de fonte.)
9. **Produtor × portão.** Antes de afrouxar um portão, ler o que o lado de
   produção manda. (Seis vezes o portão estava certo.)
10. **UPDATE parcial.** Campo ausente no input significa "não mexer" ou está
    resetando para fallback? (`updateAdSetPlacements` apagava geo e idade.)
11. **Duas fontes do mesmo fato.** Dois guardas com noções diferentes de
    "confirmado"? (`offerAnchor` × `verifiedFacts`.)
12. **Conversa × banco.** A spec trata "o Michel aprovou" como fato? O fato é o
    campo no banco (`needsReview: false`).
13. **Status de criação × status real.** `publishStatus: success` não é
    `effective_status: ACTIVE`.

### B. Implementação (pegar no diff)

1. **`new RegExp` com template literal:** `\\d`, `\\s`, `\\b` com barra dupla.
   Barra simples vira letra ou caractere de controle sem erro.
2. **`\b` com acento:** falha depois de "já", "não", "locação". Usar
   `(?=[^a-zà-ÿA-ZÀ-Ÿ]|$)`.
3. **Palavra sem acento no regex:** `locacao` nunca casa com "locação".
4. **`/g` + `.test()` antes de `.replace()`:** avança `lastIndex` e quebra o
   replace.
5. **Newline literal em regex/split:** esbuild rejeita.
6. **Tipo mascarado por `any`:** `budget` chega number ou string. Normalizar
   antes de `.match()`.
7. **Campo inexistente:** `campaigns.createdAt` não existe (`generatedAt`). Acesso
   vira `undefined` em silêncio. Conferir no `schema.ts` real.
8. **Campo novo obrigatório:** todos os chamadores foram atualizados? (Segunda
   chamada de `upsertCampaignMetricsDaily` em `index.ts`.)
9. **Valor limpo usado no payload**, não só na auditoria.
10. **Índice posicional:** remover item desloca os seguintes?
    (`realImages[index % n]` → foto do cliente errado.)
11. **Truncagem:** `.slice(0, N)` cru corta palavra. Usar `limitMetaText`.
12. **Segurança:** `escapeHtml` em tudo que vem da query; `redirect_uri`
    validado antes de **qualquer** redirect, inclusive o de negação; checagem de
    dono do recurso (`updateCreative` gravava com qualquer usuário logado);
    isolamento por `userId`; token nunca inteiro em log.

### C. Banco

1. **Nunca `drizzle-kit push` em produção.** Migração manual em
   `migration_*.sql`.
2. `server/schema.ts` **não** representa produção hoje (faltam ~20 tabelas).
   Qualquer mudança de schema começa comparando com o banco real.
3. A migração é aditiva? Se remove ou altera coluna, qual o plano de volta?
4. Quem roda a migração e quando? Código que depende de coluna nova não pode
   subir antes dela.

### D. Testes

1. **O teste falha se a correção for revertida?** Rodar com a correção
   desfeita. Se passa, o teste não prova nada.
2. Um caso por padrão do array, não um caso para o array inteiro.
3. Teste que cita incidente de produção protege decisão; teste que trava
   posição de string protege implementação.
4. Suites mínimas conforme a área: `npm run test:fact-guard`,
   `npm run test:quality-gates`, `npm run check:server`. Erro de TypeScript
   "pré-existente" só é aceito comparando com o commit anterior.

---

## Prompts prontos

### Peixinho de especificação

```
Você é um revisor sem contexto. Não viu nenhuma conversa sobre esta mudança.
Leia, nesta ordem:
1. docs/GOLDFISH_REVIEW.md (checklist e classificação)
2. a especificação: docs/specs/<arquivo>.md
3. somente os arquivos de código que a especificação cita

Tarefa: encontrar o que a especificação não diz e deveria dizer.
Percorra o checklist A e C item por item. Para cada apontamento, informe:
classe (BLOQUEANTE/RISCO/OPCIONAL), item do checklist, evidência
(arquivo:linha ou trecho da spec) e, se BLOQUEANTE, o caso de teste que
falharia hoje. Máximo 10 apontamentos, do mais grave ao menos grave.
Não proponha código. Não elogie. Se não achar nada bloqueante, diga isso
em uma linha.
```

### Peixinho de diff

```
Você é um revisor sem contexto. Não viu a conversa nem a especificação
sendo discutida.
Leia docs/GOLDFISH_REVIEW.md, depois docs/specs/<arquivo>.md, depois o diff
(git diff <base>..HEAD).

1. Rode as suites indicadas no checklist D para as áreas tocadas e reporte
   o resultado real (não presuma).
2. Percorra os checklists B, C e D no diff.
3. Para cada correção de bug no diff, verifique se existe teste que falharia
   com a correção revertida.
Mesmo formato de saída: classe, item, evidência, teste que falharia.
Máximo 10. Sem elogios.
```

---

## Modelo de especificação (`docs/specs/AAAA-MM-DD-assunto.md`)

```markdown
# <assunto>

## Problema
O que está errado hoje, com evidência (log, id de campanha, arquivo:linha).

## Mudança
O que muda, em comportamento. Não em código.

## Arquivos
Lista do que será tocado.

## Fora do escopo
O que parece relacionado e não será mexido, e por quê.

## Portas afetadas
Tela / chat / MCP: como cada uma se comporta depois.

## Dados
Tabelas, colunas, migração, quem roda e quando.

## Como provar
Teste que falha antes e passa depois. Como confirmar em produção.

## Revisão Goldfish
| Rodada | Fase | Bloqueantes | Riscos | Resultado |
|---|---|---|---|---|
```

A tabela "Revisão Goldfish" de cada spec é a medição. Em 2026-11-28, contar
**só os BLOQUEANTES que teriam chegado a produção**. Se for zero, o método não
se pagou e pode ser abandonado ou reduzido.

---

## Primeiro uso

Reconciliação de `server/schema.ts` com o banco de produção (pendência crítica
aberta desde o incidente das 20 tabelas). É a mudança com maior chance de
repetir aquele dano.
