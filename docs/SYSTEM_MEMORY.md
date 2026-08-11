# 🧠 MecProAI — Memória Técnica do Sistema

> **Para Claude:** Leia este arquivo NO INÍCIO de cada sessão antes de qualquer análise.
> **Última atualização:** 2026-08-07 (sessão 26)

---

## 🏗️ Stack & Deploy

| Camada | Tecnologia | Detalhe |
|---|---|---|
| Frontend | React + Vite + TypeScript | `/client/src/` |
| Backend | Node.js + Express + tRPC | `/server/_core/router.ts` |
| Banco | PostgreSQL + Drizzle ORM | Render.com managed DB |
| Auth | JWT + Google OAuth | `/server/_core/context.ts` |
| IA Principal | Google Gemini (5 chaves) | fallback: Groq → mock |
| Deploy | Render.com | `npm run build` / `tsx server/_core/index.ts` |
| Repo | GitHub | `github.com/Moliver63/mecpro.git` |
| URL Produção | `https://www.mecproai.com` | |
| Último commit | `6be00a9` | fix(ai): wire ctaRule into the main Gemini prompt |

---

## 📊 Score de Prontidão (sessão 19 — NÃO reavaliado na sessão 21)

**Score geral: ~96%** (última medição — sessão 21 não rodou o Conselho de reavaliação de score; recomenda-se reavaliar Imagens e Copies dado o volume de mudanças abaixo)

| Módulo | Score | Delta |
|---|---|---|
| Infraestrutura | 98% | — |
| Meta Ads | 98% | — |
| Geração de Campanhas IA | 96% | — |
| Imagens | 94% | ⚠️ pendente reavaliação (fotos reais + drag-reorder) |
| Copies | 97% | ⚠️ pendente reavaliação (anti-alucinação + quality-gate) |
| Financeiro | 87% | — |
| ML / Inteligência | 92% | — |
| Google Ads | 78% | — |
| TikTok Ads | 70% | — |

---

## ⚡ Estado das Integrações

*(sem mudanças na sessão 21 — ver sessão 20 para última tabela completa)*

---

## 🖼️ Fotos Reais do Cliente (upload mode) — NOVO sessão 21

Cadeia completa implementada: upload → análise Vision → geração → publicação Meta.

```
Step 6 "Fotos" no Campaign Builder (STEPS: Segmento, Objetivo, Plataforma,
Orçamento, Detalhes, Fotos, Match IA, Gerar — fluxo 1→8):

1. Modo explícito (form.creativeMode: 'auto' | 'upload', default 'auto')
   - "📸 Usar minhas fotos" → uploader aparece
   - "✨ Deixar a IA criar" → comportamento padrão (FLUX), uploader oculto

2. Upload: input file nativo, JPG/PNG/WEBP/HEIC, máx 8MB/arquivo, limite 10
   fotos (alinhado ao máximo real do carrossel Meta)
   - Drag-to-reorder (HTML5 nativo) + fallback de setas ◀▶ no mobile
   - 1ª imagem = card principal / capa do carrossel (badge ★ 1º)
   - imageRightsConfirmed: checkbox obrigatório de direito de uso (risco jurídico)

3. Análise em background: endpoint tRPC integrations.uploadCampaignImage
   (Cloudinary + analyzeImageWithVision na mesma chamada; falha na análise
   NÃO falha o upload) — badge ✓ Qualidade N/100 + adequação por canal
   (Meta: alerta texto >40 chars; Google: alerta quality_score<40; TikTok:
   recomenda foto limpa)

4. Geração (server/ai.ts): quando modo=upload com imagens válidas,
   enrichCreativesWithScoresAndImages atribui cada foto real a
   feedImageUrl/storyImageUrl/squareImageUrl (ciclando se menos fotos que
   criativos) e RETORNA ANTES do bloco FLUX — pula 100% da geração sintética

5. Publicação (server/_core/router.ts): effectiveImageUrls agora coleta
   TODAS as feedImageUrl únicas dos criativos com usesRealPhoto=true
   (dedup, limite 10). Prioridade: input.imageUrls explícito → realPhotoUrls
   do modo upload → fallbackPublishMedia.imageUrls (fluxo automático)
   - ≥2 fotos → carrossel (child_attachments, copy por card)
   - 1 foto → anúncio de imagem simples

BUG RAIZ CORRIGIDO (commit 36a898d): cada criativo tinha sua feedImageUrl
individual, mas o carrossel exige um array imageUrls[] com TODAS as fotos
no mesmo ad — effectiveImageUrls vinha vazio no modo upload e publicava
sem criativo visual. Log de confirmação: "Carrossel com fotos reais do
cliente: N fotos" (antes aparecia "Cloudflare FLUX OK" mesmo com upload).
```

---

## 🐛 Bugs Resolvidos / Features (sessão 21 — 06 a 08/07)

| Item | Causa raiz / Descrição | Fix | Commit |
|---|---|---|---|
| Mismatch de objetivo WhatsApp (queimava budget) | `sales + WhatsApp` caía no branch "sales sem pixel" → `OUTCOME_TRAFFIC + LANDING_PAGE_VIEWS` (otimizava page view numa campanha de conversa) | Branch novo antes do check de pixel: `sales+WA vinculado→OUTCOME_ENGAGEMENT+CONVERSATIONS`; `sales+WA sem vínculo→OUTCOME_TRAFFIC+LINK_CLICKS` | `ea9cdaf` |
| Frases redundantes na copy | "Não perca essa oportunidade / Você não quer perder a oportunidade" | `dedupeSentences()`: remove sentenças consecutivas com >60% overlap de palavras | `ea9cdaf` |
| Headline idêntica entre personas do mesmo segmento | "Aproveite o melhor valor" igual para TOF_Investidor e TOF_Lifestyle anulava a segmentação | `personalizeHeadlineForAdSet()` deriva persona do nome do adSet e adapta vocabulário (≤40 chars) | `ea9cdaf` |
| Score baixo publicava com só um warning decorativo | `finalScore<75` não bloqueava nem melhorava | Gate: score<75 → LLM reescreve usando `recommendations` do scoring engine (máx 2 tentativas); persiste baixo → `needsReview=true` (nunca trava a geração) | `f8b70c2` |
| Description ecoava a headline | `rawDesc === selectedDescription === adCopy.feed.description` sempre | `buildDescription()` com cascata: description explícita da IA (se ≠ headline) → frase 10-60 chars da copy → hook → fallback contextual por objetivo | `f8b70c2` |
| `imageRAG.ts` não compilava em build estrito | linha 391: `split("<newline>")` literal em vez de `split("\n")` escapado — análise de visão inteira inacessível | Corrigido split; desbloqueou Step 6 | `395c4df` |
| Endpoint de upload 404 em produção | `uploadCampaignImage` foi inserido dentro do `integrationsRouter`, path real é `integrations.uploadCampaignImage` | Frontend corrigido: `trpc.uploadCampaignImage` → `trpc.integrations.uploadCampaignImage` | `05abda1` |
| **Fotos reais nunca chegavam à geração** | Modo upload só passava descrição textual das fotos — backend sempre gerava FLUX sintético, mesmo com upload confirmado | Cadeia completa upload→geração→Meta (ver seção acima) | `62d1735` |
| **Carrossel publicava sem imagem no modo upload** | `effectiveImageUrls` vinha vazio (só usava `input.imageUrls` ou fallback, nenhum dos dois populado no modo upload) | Coleta `feedImageUrl` de todos os criativos com `usesRealPhoto=true`, dedup, limite 10 | `36a898d` |
| **Budget numérico quebrava 100% da publicação** | `currentAdSet.budget` tipado `string` mas podia vir `number` em runtime (adSet gerado com budget numérico) → `.match()` num number lançava erro; `any` mascarava do TS | Normaliza número vs string antes de processar; brinde: parser agora trata `.` como milhar e `,` como decimal (`R$ 1.250,50` → `1250.5`, antes virava `1.25`) | `1a37c2d` |
| **Placeholders vazando para o Meta** ([cidade], {preço}, EMPRESA_AQUI) | `auditCopy` só detectava e logava warning — publicava com placeholder visível | Placeholder vira bloqueante no quality gate → força regeneração LLM → se persistir, `stripPlaceholders()` sanitiza como último recurso → se ainda sobrar, `needsReview=true` | `278ebd0` |
| Claims fabricados na copy | Prefixos tipo "📊 Resultado comprovado:", "✅ Dados reais:" colados sem base factual (risco de compliance Meta) | Substituídos por variações de tom sem afirmação factual ("Vale a pena conferir:", "A escolha certa:") | `278ebd0` |
| Frases quebradas por template vazio | `{cidade}` sem valor virava "Seu imóvel em  por " (buraco + preposição órfã) | Limpa espaços duplos, preposições órfãs e pontuação solta após substituição | `278ebd0` |

### Isolado / não plugado ainda (risco zero, aguardando próxima etapa do Conselho)

| Item | Descrição | Status | Commit |
|---|---|---|---|
| `inferOfferType()` | Inferência determinística de tipo de oferta (10 tipos: locação, venda, lançamento, temporada, leilão, serviço, consulta, delivery, curso, produto) via regex de alto sinal. 12/12 casos-teste corretos | Função existe em `server/ai.ts`, **NÃO conectada** a nenhum fluxo | `b4c48c4` |
| `SUBSEGMENTS` | Config escalável de subsegmentos para os 9 segmentos existentes (`shared/subsegments.ts`), com `signals`, `hookOverride`, `ctaOverride` por subsegmento. 15/15 casos-teste corretos | Dado/config novo, **NÃO plugado** no fluxo de geração | `0d40136` |

**Próximo passo natural:** ligar `inferOfferType` + `SUBSEGMENTS` ao `resolveCampaignProfile` — é a semente do "Perfil da Campanha" (Entrega 1 do veredito do Conselho ainda pendente).

---

## 🧠 MARCO: Pipeline de Aprendizado (learning_base) destravado — sessão 22

**Contexto:** `learning_base` é a tabela que dá ao MecProAI seu único fosso de
dado defensável (auditoria confirmou: chave `(platform, objective, niche)`,
**sem `userId`** — agrega entre TODOS os clientes do mesmo nicho, efeito rede
real e estrutural, não hipotético). Query direta no banco em 23/07 revelou
que a tabela estava **parada desde 2026-06-05** — mais de 6 semanas sem
nenhuma escrita, com `avg_score=100` fixo em toda linha (poluição do bug de
escala, sessão 21) e `avg_ctr=avg_roas=0.0000` mesmo com `sample_count` alto
(até 595 amostras).

**Cadeia de 4 bugs, todos no cron/análise automática (`runAnalysisInternal`
em `adminIntelligenceRouter.ts`), corrigidos em sequência nesta sessão:**

| # | Commit | Bug | Sintoma antes do fix |
|---|---|---|---|
| 1 | `4171951` (sessão 21) | `calculateScore`: fator 100 em vez de 10 na escala do rawScore | `avg_score=100` sempre, todo mundo virava "winner pattern" |
| 2 | `cb26609` | `dbMod.db.getAllProjects()` — `db.ts` não exporta objeto `db`, só named exports | `errors:1`, nenhuma query rodava, zero visibilidade do motivo |
| 3 | `73ce355` | `ORDER BY c."createdAt"` — coluna não existe em `campaigns` (é `generatedAt`); também `c.budget`/`c.duration` inexistentes (são `suggestedBudgetDaily`/`durationDays`) | `errors:33`, 100% dos projetos falhavam; 2º bug era silencioso (fallback 0/30 sem erro) |
| 4 | `d9b5e4b` | `context.name` nunca era copiado de `c.name` na montagem do context → `context.name.slice()` quebrava quando criativo também não tinha headline | `errors:3`, sempre as mesmas 3 campanhas específicas |

**Como foi diagnosticado (processo, não só o fix):**
1. Instrumentei os catches silenciosos (`d6e5857`) — `catch { errors++ }` virou
   `catch { errors++; log.warn("ml-analysis", ..., { error: e.message }) }`
2. Criei endpoint `intelligence.runAnalysisNow` (`a49a7f8`) + botão "▶️ Rodar
   análise agora" em Admin → Analytics → Visão geral (`6da3eb9`) — dispara na
   hora, sem esperar o cron de 48h
3. Cada disparo manual revelou o próximo bug na cadeia, um de cada vez

**Resultado confirmado em produção (23/07 13:05):**
```
{"scored":156,"patternsExtracted":0,"errors":0}
```
Query de confirmação (`SELECT ... FROM learning_base ORDER BY last_updated DESC`):
`avg_score` agora varia de verdade (27.50 – 36.00), não mais fixo em 100.
`patternsExtracted=0` é esperado e correto — nenhuma campanha real atinge
ainda o `minScore=60` do threshold de winner pattern. Isso é informação de
negócio legítima (qualidade média das campanhas), não bug.

**Observação para investigar depois:** todas as linhas recentes têm
`niche='geral'` — a segmentação por nicho real ainda não está refletinda
no aprendizado (ver pendência de `SUBSEGMENTS`/`inferOfferType` abaixo).

---

## 📋 Sessões 17–23/07 (resumo — Meta OAuth, Analytics, Stop Slop)

Sequência de sessões focadas em resolver a cadeia de problemas de conexão
Meta que se arrastava desde 17/07, mais duas frentes novas (analytics do
site institucional e qualidade de copy):

**Meta OAuth / conexão (17–21/07):**
- `5bd4a73` `c590ae6` `aa80a9d` `6492440`: mensagens acionáveis para token
  expirado (190) e permissão negada (#200); `sanitizeAdAccountId()` helper
  global; fix de build (comentário JSX inválido em ternário)
- `1defc95`: **bug crítico** — "Reconectar com Facebook" sobrescrevia
  `adAccountId` salvo com `adAccounts[0]` arbitrário; nova prioridade
  preserva a conta configurada se ainda acessível
- `63b02f4`: **bug crítico** — `upsertMeta` gravava "60 dias" fixo para
  QUALQUER token colado (mesmo um de 2h do Graph Explorer); agora consulta
  `/debug_token` para validade real; `exchangeToken` ganhou fallback de env
  var (appId/appSecret) — antes só funcionava se estivessem no banco
- `032e1b1` `4b2836f`: conexão via Business Manager (`listMetaBusinesses` +
  `selectMetaAdAccount`) somada às duas formas existentes (OAuth direto +
  formulário manual), para contas dentro de portfólios empresariais
- `e2f0817`: CORS loga origem bloqueada em vez de esconder qual foi

**Analytics do site institucional (mecproai.com):**
- `8f3fd66` `b65ecdf` `96f834d`: GA4 (`G-JJ1H7MV9B7`), Microsoft Clarity
  (`xpe2mj40zj`), Meta Pixel (`1023228567098565`) instalados no `index.html`
- `3d97de6`: fix de build — `<noscript><img>` não é permitido dentro de
  `<head>` pela spec HTML (parse5/Vite rejeita); movido para o `<body>`
- `12740b8` `cd35abe` `b0a7854`: módulo `accountDiagnostics` (recommendations,
  opportunity_score, saúde de pixel) + banner no CampaignBuilder — só alarma
  sobre pixel ausente quando o projeto TEM `websiteUrl` configurado (evita
  falso positivo em campanhas 100% WhatsApp)
- `siteAnalyticsRouter.ts` + aba "Site" em Admin Analytics: GA4 ao vivo via
  Google Analytics Data API (Service Account, `GA4_PROPERTY_ID=476009199`),
  gráfico recharts + cards de resumo com variação %; Clarity/Meta seguem só
  como link (sem API de dados exportável equivalente para heatmap)

**Qualidade de copy (Stop Slop):**
- `4959f17`: `deslopify()` em `adAudit.ts` remove marcas de texto de IA
  (travessão longo, "além disso", clichês motivacionais) preservando sintaxe
  (substituir, não só deletar); guarda hídrida nunca deixa a copy pior que a
  original. **Achado importante:** os filtros de copy (dedup, persona,
  agora stop slop) nunca tinham efeito real — o payload enviado ao Meta usava
  as variáveis originais em 6 pontos, não as processadas; corrigido junto.

---

## 📋 Sessão 23/07–24/07 — Módulo 2, bug crítico de targeting, Públicos

**Busca por segmento na Ads Library (Módulo 2):**
- `fb8aa15` `ed2e07d`: endpoint `competitors.searchBySegment` — busca TODOS os
  anúncios de um termo/nicho sem precisar cadastrar concorrente por
  concorrente. Reusa 100% a infra existente (`analyzeCompetitor`, circuit
  breaker, cascata de 7 camadas) via um "concorrente virtual" por
  projeto+segmento. UI na tela de Análise de Concorrentes.
- `cb503a8`: **achado importante** — primeiro teste real revelou que os
  resultados vinham do fallback estimado por IA (Ads Library code 10, sem
  permissão), mas a UI mostrava como se fosse sucesso normal. Corrigido:
  banner amarelo explícito + toast de aviso + marcação "· estimado" por item
  quando `isReal=false`. Nunca deixar dado simulado passar por real.
- `3b93c13` `90fb91b`: redesign do Módulo 2 (Regra 14) — banner das 7 camadas
  virou recolhível, hub de ações unificado no header, empty state com 3
  caminhos claros (segmento/manual/IA), painel de KPIs + gráficos (evolução
  mensal, donut de formato) usando só dado real do `scraped_ads`, sem inventar
  CTR/keywords que a Ads Library não fornece para anúncios comerciais no Brasil.

**Fluxo Meta OAuth — dívida técnica e bug real (auditoria de doc externo):**
- Usuário trouxe um prompt genérico de "correção Meta Ads" gerado por outra IA.
  Auditoria linha a linha contra o código real mostrou: a maior parte do
  documento já estava resolvida (callback OAuth já existia, rotas backend já
  existiam e tipadas) — documento foi escrito sem acesso ao repo.
- `78fea5d`: dos itens reais, 2 corrigidos — popup de OAuth travava até 5min se
  fechado manualmente (agora tem `setInterval` de 500ms detectando
  `popup.closed`, com flag `settled` evitando cleanup duplicado); e os 4
  `(trpc as any).integrations` removidos, usando tipo direto (prova: outras 4
  mutations do mesmo arquivo já tipavam sem `as any`, mesmo setup de
  `import type { AppRouter }`).

**Segmentação por cidade + bug CRÍTICO de perda de targeting:**
- Auditoria de viabilidade de 8 features do gerenciador Meta (roadmap) —
  avaliação honesta contra o código real, não teoria. Descoberta: item 6
  (posicionamento IG/FB) já estava 100% pronto — erro de auditoria inicial
  (arquivo errado, `CampaignBuilder.tsx` em vez de `CampaignResult.tsx`, que é
  onde a publicação de fato acontece).
- `dbdc434`: novo modo de segmentação **"cidade"** (targeting exato pelos
  limites da cidade na Meta, complementando raio/estados/países). Reusa o
  padrão já provado de `resolveBrazilRegionKeys`, só trocando
  `location_types` para `"city"`.
- `2a62181`: rastreando a implementação até o fim, achado que o fluxo de
  **edição** de campanha já publicada (`updateAdSetPlacements`) tinha uma
  cópia separada e mais limitada do construtor de `geo_locations` — não
  suportava raio nem cidade, apenas estados/países. Corrigido com variável
  unificada `resolvedGeoLocations`.
- `abbe29c` — **BUG CRÍTICO, o achado mais importante da sessão**: o botão
  "Editar posicionamentos" (só trocar Instagram/Facebook numa campanha já no
  ar) enviava apenas `{ adSetId, placements, placementMode }` — nunca
  idade/geo. O backend sempre reconstruía o `targeting` do zero com fallback
  fixo (`age 18-65`, `countries:["BR"]`), **apagando silenciosamente** a
  segmentação geográfica E etária real da campanha a cada edição de
  posicionamento. Campanha configurada para SC, 25-45 anos, R$50/dia virava
  Brasil inteiro, 18-65, mesmo orçamento — sem erro, sem aviso. Bug de perda
  de dinheiro silenciosa, pré-existente (não introduzido nesta sessão).
  **Fix arquitetural**: antes de reconstruir, busca o `targeting` real do ad
  set na Meta (`GET /{adSetId}?fields=targeting`) e usa como base — só
  sobrescreve geo/idade quando há intenção explícita no input. Testado com 3
  cenários (preservação no caso real do bug, sobrescrita intencional,
  fallback seguro se a busca falhar).

**Públicos Personalizados e Semelhantes (Custom/Lookalike Audience):**
- `ec86c02`: usuário pediu paridade com o Gerenciador de Anúncios da Meta.
  Auditoria revelou 2 lacunas: Custom Audience já existia
  (`createRetargetingAudience`) mas só era acessível via Dashboard, num botão
  isolado de uma campanha já publicada — `PixelPanel` estava importado em
  `CampaignResult.tsx` mas nunca renderizado (import morto), ou seja, não
  havia como usar o público numa campanha nova. Lookalike não existia em
  lugar nenhum do código.
  - Novo endpoint `createLookalikeAudience` (mesmo padrão de
    `createRetargetingAudience`, `subtype: LOOKALIKE`, exige audiência-semente).
  - Nova seção "👥 Públicos (opcional)" na tela de publicação: lista públicos
    existentes com checkbox, botões inline para criar Personalizado ou
    Semelhante (bloqueado com aviso se não houver semente disponível).
  - `customAudienceIds` conectado ao payload de `publishToMeta`.

**Lição de processo (2 incidentes nesta sessão):**
- Rate limit anônimo do GitHub (60/h) esgotado no meio da sessão — `git fetch`
  passou a falhar com "could not read Username". Fix: `git remote set-url
  origin` com o token embutido, usando o limite autenticado (5000/h) também
  para fetch, não só para os commits via API.
- `git reset --hard origin/main` rodado sem verificar se havia edição local
  não commitada — descartou um fix já pronto (precisou ser refeito do zero,
  desta vez validando `git status`/contagem de ocorrências antes de resetar).

---



## 📋 Sessão 30/07 — campaign_metrics em produção, saga de debug, alerta de pausa

**Fase 1 do plano de dados executada: `campaign_metrics` diário**
- `5b35dc4`: tabela nova (série temporal diária de CTR/CPC/CPM/ROAS/
  impressões/alcance/frequência/leads/purchases), puramente aditiva —
  zero alteração em `adSets`/`creatives`/`learning_base`/`ad_patterns`.
  Decisão de segurança: chamada à Meta SEPARADA da agregada existente
  (com `time_increment=1`), em vez de reaproveitar a resposta — custa
  1 chamada extra por campanha, mas garante zero risco pro scoring já
  testado em produção.
- `3977716`: `FRAMEWORK_EXCELENCIA.md` sincronizado no mesmo lote —
  ver seção própria mais abaixo.

**Bug real descoberto ao validar em produção: código foi parar no lugar errado**
- `83ff3a2`: o bloco de `campaign_metrics` do commit `5b35dc4` foi
  inserido dentro de `syncMetaCampaignMetrics` (router.ts) — que é um
  `protectedProcedure` tRPC, só roda quando alguém clica o botão em
  Admin → Campaign Intelligence. O cron real que roda sozinho a cada
  24h (`autoSyncMLMetrics`, em `index.ts`) é uma implementação
  **completamente separada e duplicada**, que só atualizava
  `ml_dataset` e nunca tinha conhecimento da tabela nova. Fix: mesmo
  bloco (já testado) replicado também em `autoSyncMLMetrics`, isolado
  do bloco de `ml_dataset` existente (try/catch próprio, não toca
  numa linha do que já funcionava).
- `45b8cde`: o bloco novo em `autoSyncMLMetrics` tinha catch
  **totalmente silencioso** (nem log) — impossível diagnosticar se
  rodava ou falhava. Corrigido: `log.warn` com erro específico por
  campanha + log de resumo ao final de todo ciclo (sucesso, zero
  linhas, ou erro), sempre visível nos logs do Render com prefixo
  `[ml-cron]`.

**Causa raiz real da tabela vazia: nenhuma campanha estava ativa**
- Investigação em produção (não é bug de código nenhum, nem do antigo
  nem do novo): as 5 campanhas elegíveis do `userId 2`/`3` estavam
  todas com `effective_status: PAUSED` na Meta — pausadas por falta de
  crédito. Confirmado testando direto a API da Meta via `curl` do
  Shell do Render (token real, sem passar pelo nosso código), pra
  isolar se o problema era aplicação ou dado externo.
- **Lição de processo**: `publishStatus: 'success'` no nosso banco
  significa só "a chamada de criação funcionou" — não significa
  "a campanha está ativa e gastando". São conceitos diferentes que
  se confundiram durante o debug.
- **Achado à parte, sobre confiabilidade de análise externa**: uma
  reanálise trazida pelo usuário (de outra IA/agente) afirmou "156
  campanhas scored desde 23/07" como fato consumado. Query real:
  `0`. A alegação era fabricada — reforça que toda alegação numérica
  de análise externa precisa ser conferida contra o dado real antes
  de aceitar, nunca só contra o código.

**Nova feature: alerta de campanha pausada (`4a55219`)**
- Motivada diretamente pelo incidente acima — 3 clientes reais
  (imobiliária, psicóloga, cosméticos) ficaram com campanha parada
  sem ninguém saber, só descoberto por acaso durante outro debug.
- `campaigns.pauseNotifiedAt` (nova coluna, nullable): debounce —
  seta quando o alerta é enviado, reseta pra `NULL` quando a campanha
  volta a `ACTIVE` (permite alertar de novo numa pausa futura).
- `sendCampaignsPausedEmail()` em `email.ts`: mesmo padrão visual das
  funções existentes (Resend). Lista campanhas paradas + status +
  saldo atual, com destaque quando saldo < R$50.
- `checkPausedCampaigns()`: cron novo e isolado, primeira execução
  15min após boot, depois a cada 2h (mais frequente que os syncs de
  24h/48h — isso é sensível a tempo, campanha parada é lead perdido).
  1 e-mail por usuário agrupando todas as campanhas paradas dele.

**Lição de processo — cadeia de commit via GitHub API**
- Dois incidentes nesta sessão: um push retornou 422 sem motivo
  aparente (refeito passo a passo, sha por sha, funcionou na segunda
  tentativa — provável falha transitória da API); outro deu erro de
  parsing JSON ao ler a resposta do commit via `echo "$VAR" | python3`.
  Fix nos dois casos: salvar cada resposta HTTP em arquivo
  (`-o /tmp/resp.json`) em vez de capturar em variável de shell e
  fazer pipe — mais robusto contra caracteres especiais e mais fácil
  de inspecionar quando algo falha no meio da cadeia blob→tree→commit→ref.

---



## 📋 Sessão 05/08 — Webmail, MCP (3 fases) e servidor OAuth 2.1

Sessão grande, começou investigando por que `campaign_metrics` continuava
vazio (causa real: as 5 campanhas do incidente da sessão 24 continuavam
pausadas por falta de crédito) e evoluiu pra construir infraestrutura nova
significativa: caixa de email no admin, e um servidor MCP completo com OAuth
pra conectar o Claude diretamente ao MecProAI.

**Alerta proativo de saldo baixo (`16e1244`)**
Gap identificado pelo próprio usuário: o alerta de campanha pausada só
disparava DEPOIS da campanha já ter parado. Novo aviso dispara ANTES,
quando o saldo cai abaixo de R$150 com campanha ainda ativa — debounce
próprio (`media_balance.lowBalanceNotifiedAt`), reseta quando o saldo sobe
de novo (recarga).

**Webhook do Resend + Caixa de Email no admin (`1b9e361`, `7352958`)**
Webhook `/api/webhook/resend` (bounce/complaint dos emails transacionais,
via Svix) e depois uma caixa de email completa em `/admin/emails` —
inbox/enviados/arquivadas/lixeira, resposta inline, portado do padrão real
da Caro Vargas mas adaptado (inglês nos campos, sem SDK novo do Resend pra
não arriscar quebrar os emails já em produção — REST direto em vez de
`.emails.receiving.*`). Assinatura profissional (`dcd8c8a`) nos emails de
resposta do admin, com um bug de compatibilidade Outlook (`display:flex`
não funciona lá) pego e corrigido antes de subir.

**Fix real de produção: erro de geocoding (`55a5fca`)**
Log real mostrou `publishToMeta` falhando com subcode 1487855
(“não foi possível geocodificar o endereço”) no modo de targeting por raio.
Não havia log nenhum do valor real de `geoCity` antes da falha —
adicionado, junto de mensagem amigável pro erro (mesmo padrão já usado
pra outros subcodes conhecidos).

**Servidor MCP — 3 fases, 9 tools no total**

Motivado pelo pedido de conectar o Claude direto ao MecProAI. Decisão de
arquitetura mais importante: reaproveitar o sistema de API key já
existente (`api_keys` + `authApiKey`, já usado pela API pública de
concorrentes/insights) em vez de construir autorização do zero.

- **Fase 1 (`6ff39ba`)**: 4 tools de leitura — `list_projects`,
  `list_campaigns`, `get_campaign`, `get_campaign_metrics`. Cada uma
  verifica posse do projeto/campanha antes de devolver dado. Testado
  com cliente MCP real (não mock, via `InMemoryTransport`) confirmando
  isolamento entre usuários.
- **Fase 2 (`03f97b5`)**: 3 tools de escrita — `create_project`,
  `set_client_profile`, `generate_campaign`. Reusa exatamente a mesma
  lógica dos endpoints tRPC reais (`checkPlanLimit`, `generateCampaign`
  de `ai.ts`) — não reimplementa regra de negócio nenhuma.
- **Fase 3 (`9ad3524`, corrigido em `e515c82`)**: `list_meta_pages` +
  `publish_campaign`. A mais arriscada (gasta dinheiro real). Descoberta
  importante no caminho: `publishToMeta` publica UM ad set por vez, e a
  1ª chamada cria a campanha na Meta enquanto as seguintes reaproveitam
  esse ID via `existingMetaCampaignId` — mesmo padrão exato que
  `CampaignResult.tsx` já usa no loop de publicação multi-adset. As
  tools usam `appRouter.createCaller()` pra chamar os MESMOS procedures
  tRPC que a tela usa (upload de imagem, resolver página, publicar) —
  nunca reimplementa a lógica da Meta.
  - **Bug real corrigido em `e515c82`**: a primeira versão de
    `publish_campaign` usava só a imagem do primeiro criativo. O
    usuário apontou que isso já estava parametrizado — conferido na
    Regra 2 deste mesmo arquivo (coletar TODAS as `feedImageUrl`,
    dedup, limite 10). Corrigido pra coletar de todos os criativos.
    Uma função ainda mais precisa (`buildPublishMediaFromCreative`,
    trata vídeo + um segundo mecanismo de carrossel por criativo
    individual) foi encontrada mas **não integrada** — registrado como
    lacuna conhecida, não testado contra Meta real.

**Servidor OAuth 2.1 (`e5a2eed`) — a peça mais sensível desta sessão**
Necessário porque a conta do usuário no Claude não tinha acesso ao recurso
beta de "Request headers" (Bearer token manual) no conector customizado —
sem OAuth de verdade, a conexão falhava com 404 em `/authorize`.
Implementado o subconjunto da especificação oficial do MCP que o
Claude.ai realmente usa (RFC 8414, 7591, 9728, PKCE S256), reaproveitando
o login por sessão já existente (cookie `token`/jose) pra tela de
consentimento — não duplica autenticação.

**2 vulnerabilidades reais encontradas e corrigidas ANTES de considerar
pronto** (não depois de reportar bug):
1. XSS na tela de consentimento — `redirect_uri`/`code_challenge`/
   `state`/`resource` vêm da query string (controláveis por quem monta
   o link) e estavam sendo interpolados no HTML sem escapar.
2. Redirecionamento aberto no caminho de "negar" — a validação de que
   `redirect_uri` pertence ao client registrado só rodava no caminho de
   "permitir". Movida pra rodar antes de qualquer redirect, nos dois
   caminhos.

Testado com PKCE S256 real (gerar/derivar/validar/rejeitar) e os 4
ataques que a especificação exige bloquear (reuso de código, verifier
errado, client_id roubado) — todos rejeitados corretamente antes do
commit.

Indicador de status "Claude conectado" (`7fdd82a`) adicionado em
Settings após o próprio usuário perguntar se apareceria algum feedback
visual — bolinha verde/cinza + botão de desconectar (revoga o token na
hora).

**Bug pré-existente descoberto no caminho, corrigido de bônus**: o
parser JSON global (`app.use(json(...))`) era registrado DEPOIS do
router `/api/v1` ser montado em `index.ts` — confirmado código
sequencial sem condicional entre as duas linhas. Isso deixava `req.body`
undefined em TODAS as rotas POST desse router, incluindo duas que já
existiam antes desta sessão (`/competitors/analyze`, `/insights/generate`)
e a de criação de API key (`/keys`). Corrigido com `json()` local em
cada rota (mesmo padrão defensivo que o webhook do Asaas já usava,
possivelmente por ter batido nesse mesmo problema antes).

---

## 📋 Sessão 07/08 — Auditoria do conector MCP + fix real do `learning_base` + SUBSEGMENTS plugado

Sessão puxada por um pedido simples ("testa e audita o conector MCP") que
virou uma cadeia de achados reais em produção — nenhum deles veio de
suposição, todos confirmados por teste vivo (curl, query no banco, ou
smoke test isolado) antes de qualquer commit.

**Auditoria do MCP contra o código real, não contra padrão/memória**
Uma segunda IA (sem acesso ao repo, GitHub em timeout) tentou complementar
a auditoria com 6 "falhas adicionais" baseadas em padrão conhecido do
projeto. Checado uma a uma contra o código: **5 de 6 eram especulação
incorreta** (timeout em `publish_campaign` já existia, `AbortSignal.timeout`
em toda chamada Meta; validação de `campaignId` já era `z.number()`, nunca
`string`/`any`; log não vazava token). **1 era real**: `express-rate-limit`
estava instalado no `package.json` mas nunca importado em lugar nenhum —
zero rate limit de rajada no endpoint `/mcp`, só a cota diária/mensal por
API key. Lição: checar código real sempre vence pattern-matching, mesmo
quando o pattern-matching acerta ocasionalmente.

**2 bugs reais confirmados e corrigidos no MCP/API pública**
1. `security(publicApi): corrige double-encoding UTF-8/CP1252` (`bde37d7`)
   — `server/publicApi.ts` tinha mojibake em toda mensagem de erro PT-BR
   (confirmado via curl real: `"API key invÃ¡lida"` em vez de `"inválida"`).
   Causa: arquivo salvo com BOM + double-encoding em algum commit antigo.
   Corrigido linha a linha (script Python, `cp1252→utf-8`, não `latin-1` —
   caracteres de box-drawing em comentários usam a faixa 0x80-0x9F onde os
   dois encodings divergem).
2. `security(publicApi): adiciona rate limit de burst no endpoint MCP`
   (`5afd51d`) — 30 req/min por usuário autenticado (chaveado por
   `apiUser.id`, não por IP). Testado em produção: 30× `200`, depois `429`
   a partir da 31ª chamada, exatamente como esperado.

**`learning_base` — não estava "parado", tinha 2 bugs silenciosos de dado**
Um prompt de correção de outra sessão pediu pra "reativar" o pipeline —
checagem ao vivo (`server/scripts/check-learning-base.ts`, novo, somente
leitura) mostrou que ele JÁ estava ativo (escritas recentes confirmadas).
O problema real, achado só depois de ler o código com atenção: a função
que o cron de fato chama (`runAnalysisInternal`, `_core/index.ts:2203`)
**reimplementava context/metrics do zero** em vez de usar o helper
compartilhado `loadCampaignContext` que as outras 6 procedures do arquivo
já usam — e essa duplicação tinha divergido em dois pontos:
1. Nicho nunca era normalizado (texto livre da IA direto na chave) —
   confirmado em produção: `imobiliário`/`IMOBILIARIO`/`imoveis`/
   `Mercado Imobiliário` como 4+ linhas separadas do mesmo nicho real,
   diluindo o efeito de rede entre clientes que é a vantagem estrutural
   do sistema.
2. `avg_roas` nem estava na lista de colunas do `UPDATE`/`INSERT` —
   estruturalmente impossível gravar ROAS, mesmo com dado real disponível.

Fix (`af3092c` + `306c2ad`): troca pra `loadCampaignContext` (mata a
duplicação, ganha normalização de graça) + busca `metric_roas` real de
`campaign_scores` + `avg_roas` nas duas queries de escrita + acrescenta
remoção de acento na normalização (`imobiliário`→`imobiliario`, NFD +
strip de combining marks — `toLowerCase()`+`trim()` sozinhos não bastavam).
Testado ao vivo: `meta/sales/imobiliario` pulou de `n=17` pra `n=54` numa
única rodada pós-fix, confirmando convergência das variantes.

**ROAS zerado — investigado até a causa raiz real, não é mais bug**
Depois do fix, `roas` continuava `0.0000` em toda escrita nova. Antes de
assumir que o fix falhou, query direta: `campaign_scores` tem **946
linhas, ZERO com `metric_roas > 0`**. Não é bug do pipeline — é ausência
real de dado de conversão em qualquer lugar do sistema (provavelmente
falta configuração de Pixel de valor de compra nos clientes). Virou
pendência nova e separada (ver tabela abaixo), não confundir com o fix
de hoje, que está correto e vai funcionar assim que existir dado real.

**`inferOfferType` + `SUBSEGMENTS` finalmente plugados (`7ec0d50`)**
Ambos existiam prontos e testados (12/12 e 15/15 casos documentados) mas
nunca eram chamados em fluxo real. Plugado em `generateCampaign`, logo
após o `ctaRule` existente — resolve o mesmo `segment` que
`getSegmentInstruction` já resolve internamente (sem duplicar lógica),
roda `inferSubsegment` contra os mesmos campos de texto livre que já iam
pro prompt (produto/serviço, dor, proposta de valor, contexto extra), e só
injeta instrução de hook/CTA no prompt quando confiança é alta ou média —
confiança baixa ou sem match mantém comportamento anterior 100% intacto.
Validado com 3 smoke tests reais antes do commit: lançamento imobiliário →
alta confiança, texto genérico → baixa/null (sem instrução extra),
delivery → alta confiança.

**Achado de bônus, fora do escopo original, também corrigido (`6be00a9`)**
No mesmo lugar onde plugei o subsegmento, notei que `ctaRule` (a variável
que já existia, resultado de `getSegmentInstruction` — CTA por segmento
E palavras proibidas) nunca era de fato interpolada no prompt principal
enviado ao Gemini. Só era usada dentro do fallback do Groq (variável
homônima, escopo separado, shadowing). Ou seja: a maioria das campanhas
(Gemini funcionando, o caminho comum) nunca recebia essa camada de
guidance de segmento/compliance — só o caminho raro do fallback recebia.
Fix de uma linha: interpolar `${ctaRule}` no prompt principal, ao lado do
`${subsegmentInstruction}` novo.

**Lição pra próxima sessão:** o padrão "função duplicada em vez de reusar
helper compartilhado" já apareceu 3 vezes documentado neste arquivo
(sessão 25 — MCP tools vs. lógica tRPC; hoje — `runAnalysisInternal` vs.
`loadCampaignContext`; hoje — `ctaRule` externo nunca usado vs. `ctaRule`
interno do Groq). Ao encontrar qualquer variável/lógica que "parece"
repetida em dois lugares do mesmo arquivo, vale sempre checar se as duas
cópias divergiram silenciosamente antes de assumir que fazem a mesma
coisa.

---

## 📋 Sessão 11/08 — Idempotência no `publish_campaign`, incidente de perda de dados (recuperado via PITR), e bug real de namespace tRPC descoberto em teste ao vivo

Sessão puxada pelo auditor estático (`scripts/audit-architecture.mjs`, novo)
apontando `publish_campaign` sem nenhuma proteção contra chamada duplicada —
risco real porque é a única mutation do MCP que gasta orçamento de cliente
de verdade. Terminou em teste ponta-a-ponta contra a Meta real, incluindo
recuperação de um incidente sério no meio do caminho.

**Idempotência implementada (`baf381d`)**
Nova tabela `mcp_idempotency_keys` (`requestKey` = `userId:toolName:key`,
unique constraint fazendo o trabalho de atomicidade — não é
`SELECT` seguido de `INSERT`, é a própria constraint do banco capturando
`23505` em corrida). `publish_campaign` agora exige `idempotencyKey`
obrigatório no input; reserva a key **antes** de qualquer efeito colateral
(upload de imagem, chamada à Meta); devolve resultado cacheado se a mesma
key já foi usada; recusa se está em andamento (chamada concorrente). Uma
vez que o loop de publicação começa, o resultado fica `completed` mesmo em
falha parcial — nunca reexecuta às cegas só porque a mesma key voltou.

**Incidente: `drizzle-kit push:pg` apagou 20 tabelas em produção**
`server/schema.ts` está desatualizado em relação ao banco real — faltam
~20 tabelas que existem em produção mas não estão declaradas no schema
(`learning_base`, `oauth_tokens`, `oauth_clients`, `campaign_scores`,
`ad_patterns`, `winner_patterns`, `ml_dataset`, entre outras). Rodar
`db:push` pra aplicar só a tabela nova comparou o schema incompleto contra
o banco real e gerou um diff destrutivo — confirmado (não foi alarme
falso): `DROP TABLE` rodou em pelo menos 20 tabelas antes de travar num
erro de cast incompatível (`weeklyReportEnabled`) no meio da execução.
**Recuperado via Point-in-Time Recovery do Render** (plano Basic-256mb,
retenção de 7 dias) — banco novo restaurado (`mecpro_db_wpuh`,
`dpg-d9tlf6e417fc73en7e30-a`), dados confirmados linha por linha contra os
números do aviso de data-loss (só 1 linha de diferença em `oauth_tokens`,
esperado pela janela entre o timestamp escolhido e o incidente real).
`DATABASE_URL` do serviço web trocado pro banco restaurado. Tabela nova
criada via `CREATE TABLE IF NOT EXISTS` direto por SQL, não por
`drizzle-kit push` — **lição permanente: nunca mais rodar `db:push` contra
produção enquanto `server/schema.ts` não estiver reconciliado 1:1 com o
banco real. Virou pendência crítica nova (ver tabela abaixo).**

**Bug real descoberto só em teste ao vivo: namespace tRPC errado no MCP (`bdfad08`)**
Primeira tentativa de publicar de verdade (campanha 618, R$100/dia) falhou
com `No procedure found on path "campaigns,uploadImageToMeta"`. Investigação
no `appRouter` (composição final, `_core/router.ts:13277`) confirmou:
`uploadImageToMeta` vive em `integrationsRouter` (mount `integrations`), e
`resolvePageLink` vive em `competitorsRouter` (mount `competitors`) — nenhum
dos dois está em `campaignsRouter`, mas `server/mcpServer.ts` chamava
`caller.campaigns.uploadImageToMeta` e `caller.campaigns.resolvePageLink`.
Só `publishToMeta` estava no namespace certo (`campaignsRouter`, linha 3215).
**Esse bug já existia antes de hoje** — não foi introduzido pela mudança de
idempotência, só nunca tinha sido exercitado com imagem real de criativo
(a auditoria estática não detecta isso: `grep` prova presença de string, não
resolução correta de rota). Corrigido, testado de novo com a mesma
`idempotencyKey` (retry seguro, primeira tentativa tinha marcado a key como
`failed` antes de qualquer gasto real) — publicação confirmada
(`metaCampaignId: 120249006558020375`, carrossel de 6 criativos, ad set
ativo).

**Lição pra próxima sessão:** dois achados reforçam o mesmo padrão já
documentado nas sessões 22/25/26 — "parece certo no código, mas nunca foi
exercitado de ponta a ponta com dado real". Auditoria estática (grep,
contagem de linha, presença de padrão) é útil pra priorizar onde olhar,
mas não substitui teste funcional contra o sistema real quando dinheiro
de cliente está envolvido. E qualquer migration de schema contra produção
exige primeiro confirmar que o schema declarado bate 1:1 com o banco real
— um schema incompleto usado em `db:push` é indistinguível de uma intenção
real de apagar tabelas.

---

## 📋 Pendências (atualizado sessão 27 — 11/08)

| Prioridade | Item | Responsável |
|---|---|---|
| 🔴 | **NOVO (sessão 27), CRÍTICO** — `server/schema.ts` está desatualizado em relação ao banco real (~20 tabelas de produção não declaradas: `learning_base`, `oauth_tokens`, `oauth_clients`, `campaign_scores`, `ad_patterns`, `winner_patterns`, `ml_dataset`, entre outras). Causou incidente real de perda de dados via `drizzle-kit push:pg` (recuperado via PITR). Reconciliar schema declarado com estado real do banco ANTES de rodar `db:push` de novo | Dev |
| 🔴 | Recarregar crédito das 5 campanhas pausadas (imobiliária, psicóloga, cosméticos) — pausadas desde antes de 30/07 por falta de saldo | Michel |
| 🔴 | Ads Library API code 10 — bloqueia dado real na busca por segmento (Módulo 2) e afeta a qualidade de `winner_patterns` extraídos de anúncios estimados. Requer verificação de identidade em facebook.com/ID | Michel |
| 🔴 | Vincular WhatsApp 47999465824 à Página 1086894187837842 | Michel |
| 🔴 | Adicionar website no perfil projeto 41 (Villa Serena) | Michel |
| 🟡 | **NOVO (sessão 27)** — Decidir o que fazer com o banco antigo quebrado (`mecpro_db`, pré-restore) — manter parado por segurança por alguns dias ou já decomissionar pra não pagar por dois bancos | Michel |
| 🟡 | Implementar sync de `metric_roas` real via Pixel de conversão de valor. Confirmado ao vivo: 946 linhas em `campaign_scores`, ZERO com roas > 0 | Dev |
| 🟢 | Migrar linhas antigas de `learning_base` com nicho não-normalizado (`imobiliário`/`IMOBILIARIO`/etc, ~50 linhas pré-sessão-26) pra dentro das linhas novas normalizadas — soma `sample_count`, recalcula médias ponderadas | Dev |
| 🟡 | Expor `creativeMode`/`uploadedImages` (fotos reais do cliente) no `generate_campaign` (MCP) — hoje só gera no modo automático | Dev |
| 🟡 | Testar em produção: `createLookalikeAudience` com audiência-semente real | Michel |
| 🟡 | GA4_SERVICE_ACCOUNT_JSON — confirmar Viewer na propriedade GA4 476009199 | Michel |
| 🟡 | TikTok token no Render | Michel |
| 🟡 | Gemini chaves 2+3 em projetos separados | Michel |
| 🟢 | Campanhas geradas antes de `5b13463` têm budget antigo — regerar ou ajustar Módulo 4 | Michel |
| 🟢 | Testes automatizados mínimos (`parseBudgetString`, `stripPlaceholders`, `dedupeSentences`, `inferOfferType`, `buildDescription`) — usar `tsx --test` nativo, já é o padrão do projeto (só 1 arquivo de teste existe hoje: `placementGuidance.test.ts`). Não instalar Vitest/Jest, criaria sistema de teste paralelo | Dev |
| 🟢 | Reavaliar scores de Imagens/Copies com volume real pós fotos-reais-do-cliente — depende de acumular 10-20 campanhas no novo fluxo | Dev |

**Resolvidas nesta sessão (27)** — removidas da lista: `publish_campaign`
(MCP) testado contra a Meta real com sucesso (era item 🔴 top da lista
anterior); idempotência ausente em mutations MCP; bug de namespace tRPC
(`uploadImageToMeta`/`resolvePageLink` chamados sob `campaigns` em vez de
`integrations`/`competitors` — quebrava toda publicação com upload de
imagem via MCP).

**Roadmap de features do gerenciador Meta (avaliado, não implementado ainda):**
item 5 (reuso de criativo em carrossel), itens 4+8 (score preditivo +
recomendação de IA pré-publicação — agora desbloqueado, `SUBSEGMENTS` já
está plugado), item 7 (redesign do `CampaignResult.tsx`/`CampaignBuilder.tsx`).

---

## 💡 Prompt de Início de Sessão (atualizado)

```
Antes de qualquer coisa, leia o arquivo docs/SYSTEM_MEMORY.md do repositório
MecProAI (github.com/Moliver63/mecpro.git) — ele contém o estado técnico
completo do sistema, bugs resolvidos, regras críticas e pendências.

Stack: React 19 + Vite + TypeScript / Node.js + Express + tRPC / PostgreSQL + Drizzle / Render.com
Repo local: /home/claude/mecpro (se já clonado na sessão)
Último commit: 6be00a9 | Score: ~96% (não reavaliado) | Sessão: 26 (07/08/2026)
MARCO PRIORITÁRIO: MCP auditado e com 2 bugs reais corrigidos (rate limit
ausente + encoding corrompido); learning_base tinha 2 bugs silenciosos de
dado (nicho fragmentado + roas nunca gravável), não estava "parado" como
um prompt de correção antigo assumia — corrigido, e ROAS zerado confirmado
como ausência real de dado (946 linhas em campaign_scores, zero com roas
> 0), não bug. inferOfferType + SUBSEGMENTS finalmente plugados em
generateCampaign, e ctaRule (CTA + palavras proibidas por segmento) agora
chega no prompt principal do Gemini pela primeira vez — antes só o
fallback do Groq recebia essa instrução.
2 vulnerabilidades reais (XSS + redirect aberto) foram encontradas e
corrigidas no servidor OAuth ANTES do commit, não depois de reportar
bug — ver seção completa da sessão 25 acima antes de mexer em
qualquer rota de /authorize, /token ou /register.
Lições anteriores continuam valendo: publishStatus='success' ≠ ativa
(sessão 24), update nunca reconstrói targeting do zero (sessão 23,
Regra 14 do FRAMEWORK_EXCELENCIA.md). Nova lição (sessão 26): função
"parecida" duplicada em vez de reusar helper compartilhado já apareceu
3 vezes neste arquivo — sempre suspeitar de divergência silenciosa.

ARQUIVOS CRÍTICOS (verificar antes de editar):
- server/schema.ts          ← fonte da verdade do banco (SEMPRE consultar antes de query SQL)
- server/_core/router.ts    ← backend tRPC completo (publicação Meta, effectiveImageUrls)
- server/_core/index.ts     ← boot, crons ML, webhooks
- server/ai.ts              ← geração de campanhas (Gemini → Groq), inferOfferType (isolado)
- server/imageGeneration.ts ← FLUX → Pixabay → Google
- server/imageRAG.ts        ← análise Vision (corrigido sessão 21, cuidado com split("\n"))
- shared/subsegments.ts     ← SUBSEGMENTS (plugado em generateCampaign — sessão 26, inferSubsegment())
- client/src/pages/CampaignResult.tsx ← publicação Meta
- server/mcpServer.ts       ← servidor MCP (9 tools, 3 fases) — sessão 25; idempotência em `publish_campaign` + fix de namespace tRPC (`uploadImageToMeta`/`resolvePageLink`) — sessão 27
- server/oauthServer.ts     ← servidor OAuth 2.1 (/authorize, /token, /register) — sessão 25, sensível a segurança
- server/publicApi.ts       ← API pública + authApiKey (aceita API key E token OAuth) + rate limit de burst no /mcp (sessão 26). Encoding corrompido (mojibake) corrigido na sessão 26 — se reaparecer, usar script Python cp1252→utf-8 linha a linha, não latin-1 (box-drawing chars usam faixa 0x80-0x9F onde os dois divergem)

REGRAS CRÍTICAS — NÃO VIOLAR:

1. BUDGET:
   - Backend valida adSet ATUAL (input.adSetIndex), nunca todos
   - currentAdSet.budget pode vir NUMBER ou STRING em runtime — sempre normalizar
     antes de .match() (bug 1a37c2d quebrava 100% da publicação)
   - Parser trata "." como milhar e "," como decimal (R$ 1.250,50 → 1250.5)
   - Mínimo Meta: R$5,11/adSet/dia
   - Geração garante MIN_VIABLE_MONTHLY ≈ R$675 (4 adSets × R$5,11 × 30 × 1,1)

2. CARROSSEL:
   - getCardCopy(idx) → creativeList[idx % nCreatives]
   - Headline max 40 chars, description max 30 (limites Meta)
   - effectiveImageUrls precisa de TODAS as feedImageUrl (usesRealPhoto=true),
     dedup, limite 10 — não usar só a foto individual do criativo

3. FOTOS REAIS DO CLIENTE (creativeMode='upload'):
   - Pula 100% da geração FLUX quando há imagens válidas (status done)
   - imageRightsConfirmed obrigatório antes de continuar (risco jurídico)
   - Limite 10 fotos (máximo real do carrossel Meta)
   - 1ª foto do preview = card principal / capa

4. DETECÇÃO DE TEXTO EM IMAGEM:
   - Threshold heurístico: 0.18 (NÃO reduzir — 0.08 causava falso positivo)
   - diff > 200 (NÃO reduzir para 180)

5. WHATSAPP:
   - WA vinculado → OUTCOME_LEADS + CONVERSATIONS + whatsapp_phone_number
   - WA não vinculado → OUTCOME_LEADS + LINK_CLICKS + wa.me (sem phone_number)
   - sales + WA vinculado → OUTCOME_ENGAGEMENT + CONVERSATIONS (novo, sessão 21)
   - sales + WA sem vínculo → OUTCOME_TRAFFIC + LINK_CLICKS (novo, sessão 21)

6. DESCRIPTION:
   - Prioridade: ai.description ≠ headline | CTA label | 1ª frase hook | ângulo | VAZIO
   - NUNCA repetir headline como description | NUNCA usar copy completa | Max 30 chars

7. REGEX — esbuild:
   - NUNCA usar newline literal em regex ou split: /[,\n\r]/ ou split("<newline>")
   - CORRETO: .split(",")[0].split("\n")[0]

8. ANTI-ALUCINAÇÃO DE COPY:
   - Placeholder não substituído ([cidade], {preço}) é BLOQUEANTE no quality gate
   - Nunca publicar copy com placeholder visível, mesmo com score alto
   - Claims fabricados ("resultado comprovado", "dados reais") proibidos sem base factual
   - Verificar schema.ts ANTES de qualquer query SQL — tabela api_integrations
     (NÃO integrations), campo provider (NÃO platform)

9. SEGMENTAÇÃO (plugado na sessão 26):
   - inferOfferType() e SUBSEGMENTS agora rodam dentro de generateCampaign
     (server/ai.ts), logo após o ctaRule — só influenciam o prompt quando
     confiança é "alta" ou "média"; confiança "baixa" ou sem match não
     adiciona nada (fallback seguro)
   - learning_base agora normaliza nicho de verdade (lowercase + trim +
     remoção de acento via NFD) — linhas gravadas ANTES da sessão 26
     continuam fragmentadas (não foi feita migração retroativa)

10. MÓDULO server/db.ts:
    - NÃO exporta objeto "db" agregado — são named exports diretos
      (export async function getAllProjects() {...})
    - CORRETO: import * as db from "../db"; db.getAllProjects()
    - ERRADO: import("../db.js") e chamar dbMod.db.getAllProjects() → dbMod.db
      é undefined, quebra com "Cannot read properties of undefined" (bug real
      que travou o cron de análise por semanas, sessão 22)

11. SCHEMA campaigns — nomes de coluna reais (server/schema.ts):
    - Campo de data de criação é "generatedAt", NÃO "createdAt" (não existe)
    - Budget/duração são "suggestedBudgetDaily"/"durationDays", NÃO "budget"/
      "duration" (não existem — acesso vira undefined SILENCIOSAMENTE, sem
      erro, poluindo contexto com fallback 0/30 sem avisar)
    - SEMPRE grep no schema.ts antes de escrever SQL raw ou acessar c.<campo>
      de um SELECT c.* — dois bugs reais desta categoria na sessão 22

12. TOKEN META — validade e app credentials:
    - NUNCA gravar "60 dias" fixo ao salvar um token — sempre consultar
      /debug_token da Meta para a validade REAL (token do Graph Explorer
      vive só 1-2h; gravar 60 dias fixo é mentira que quebra em produção)
    - expires_at=0 no debug_token = token sem expiração (gravar null, não 0)
    - appId/appSecret: sempre ter fallback para env vars (META_APP_ID/
      META_APP_SECRET) — fluxo OAuth não grava esses campos no banco, então
      qualquer endpoint que dependa deles só do banco quebra pra quem
      conectou via OAuth

13. STOP SLOP / FILTROS DE COPY:
    - deslopify() em adAudit.ts remove marcas de IA (travessão longo, "além
      disso", clichês) — SEMPRE substituir preservando sintaxe, nunca só
      deletar (remove no meio da frase deixa fragmento sem sentido)
    - Guarda de segurança: nunca aplicar se resultado ficar com <3 palavras
      ou perder >60% do texto — devolve original intacto
    - CUIDADO: filtro só tem efeito se a variável processada for usada NO
      PAYLOAD final enviado ao Meta, não só na auditoria — bug real onde
      dedupeSentences/personalizeHeadlineForAdSet rodavam e logavam "removido"
      mas o Meta recebia o texto original mesmo assim (corrigido, mas
      padrão a vigiar em qualquer filtro novo)

14. UPDATE DE CAMPANHA/ADSET NUNCA RECONSTRÓI TARGETING DO ZERO:
    - BUG CRÍTICO (abbe29c): updateAdSetPlacements reconstruía age_min/
      age_max/geo_locations inteiros a cada chamada, com fallback fixo
      (18-65, Brasil) sempre que o frontend não enviava esses campos —
      e o frontend REALMENTE não enviava (só mandava adSetId+placements)
    - REGRA: qualquer endpoint de UPDATE deve buscar o estado atual na
      Meta primeiro (GET) e usar como base, só sobrescrevendo campos com
      intenção explícita no input. Nunca assumir default quando o campo
      está ausente — ausente pode significar "não mexer", não "resetar"
    - Mesmo padrão vale para qualquer campo futuro (interesses, públicos,
      orçamento) adicionado a endpoints de edição

15. AMBIENTE DE EXECUÇÃO — git e rate limit:
    - git fetch anônimo pode bater rate limit do GitHub (60/h) mesmo sem
      fazer commits — sintoma: "could not read Username for
      'https://github.com'". Fix: git remote set-url origin com token
      embutido, usa o limite autenticado (5000/h) também pro fetch
    - NUNCA rodar `git reset --hard` sem antes checar se há edição local
      não commitada (git status) — pode descartar trabalho pronto

16. TABELA scraped_ads — campo source distingue real de estimado:
    - getAdSource()/isRealAdSource() (exportadas de ai.ts) identificam se
      um anúncio veio da Ads Library oficial ou do fallback de IA
      (Gemini estimando com base em SEO/site, quando code 10 bloqueia)
    - QUALQUER feature nova que exiba scraped_ads deve mostrar essa
      distinção explicitamente (banner/badge) — nunca deixar dado
      estimado passar visualmente como se fosse concorrência real

17. NAMESPACE tRPC EM caller.createCaller() — nunca assumir, sempre grep
    no appRouter (sessão 27):
    - `server/mcpServer.ts` chamava `caller.campaigns.uploadImageToMeta`
      e `caller.campaigns.resolvePageLink` — ambos existem no código, mas
      NENHUM dos dois está montado sob `campaigns` no appRouter real
      (`_core/router.ts:13277`): `uploadImageToMeta` é `integrations`,
      `resolvePageLink` é `competitors`. Só `publishToMeta` está de fato
      em `campaigns`. Bug ficou invisível até o primeiro teste real com
      imagem de criativo — erro só aparece em runtime
      (`No procedure found on path "..."`), TypeScript não pega porque
      `createCaller` é tipado como `any` nesse ponto do MCP
    - REGRA: antes de escrever `caller.<namespace>.<procedure>`, sempre
      confirmar o namespace real via grep na composição final do
      `appRouter` (`export const appRouter = router({ ... })`), nunca
      assumir pelo nome do arquivo/router interno onde a procedure foi
      declarada — o mount key pode ser diferente do nome da const

18. MIGRATION CONTRA PRODUÇÃO — nunca rodar db:push sem confirmar schema
    declarado == banco real primeiro (sessão 27, incidente real):
    - `server/schema.ts` tem só um subconjunto das tabelas que existem em
      produção (~20 tabelas reais não declaradas: learning_base,
      oauth_tokens, oauth_clients, campaign_scores, ad_patterns,
      winner_patterns, ml_dataset, entre outras)
    - `drizzle-kit push:pg` compara schema declarado × banco real e gera
      DROP TABLE para qualquer tabela real ausente do schema — isso já
      aconteceu de verdade (20 tabelas apagadas, recuperado via Point-in-
      Time Recovery do Render)
    - REGRA: NUNCA rodar `db:push` contra produção sem antes: (1) listar
      todas as tabelas reais do banco (`information_schema.tables`) e
      confirmar que batem 1:1 com `server/schema.ts`, ou (2) aplicar
      mudança pontual via `CREATE TABLE`/`ALTER TABLE` manual direto por
      SQL, nunca via diff automático de schema inteiro

PENDÊNCIAS ABERTAS:
🔴 CRÍTICO — reconciliar server/schema.ts com o banco real (~20 tabelas de produção não declaradas) antes de qualquer novo db:push (sessão 27)
🔴 Vincular WhatsApp 47999465824 à Página 1086894187837842 no Meta Business
🔴 Adicionar website no perfil projeto 41 (Villa Serena) — websiteUrl = null
🟡 Implementar sync de metric_roas real via Pixel de conversão (946 linhas em campaign_scores, ZERO com roas>0 — confirmado sessão 26)
🟡 Testar createLookalikeAudience em produção com semente real
🟡 GA4_SERVICE_ACCOUNT_JSON — confirmar Viewer na propriedade GA4 476009199
🟡 Ads Library API code 10 — requer verificação de identidade (facebook.com/ID), cobertura comercial só UE/RU
🟡 TikTok token no Render
🟡 Gemini chaves 2+3 em projetos Google separados
🟢 Campanhas geradas antes de 5b13463 com budget antigo → regerar ou ajustar Módulo 4
🟢 Migrar ~50 linhas antigas de learning_base com nicho não-normalizado pras linhas novas (opcional, sessão 26)

CUSTOS REAIS (logs produção, sessão 20 — não remedido sessão 21):
- Gemini+Groq: US$0,0021/campanha
- Imagens: R$0 (Pixabay/Google fallback gratuito) — reavaliar com fotos reais (Cloudinary)
- Margem: >99% em qualquer escala até 1M clientes
```
