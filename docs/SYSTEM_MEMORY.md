# 🧠 MecProAI — Memória Técnica do Sistema

> **Para Claude:** Leia este arquivo NO INÍCIO de cada sessão antes de qualquer análise.
> **Última atualização:** 2026-05-07 (sessão 13)

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
| Último commit | `c370b76` | Groq pool 10 chaves + round-robin + quota RPD correto |

---

## 📊 Score de Prontidão (sessão 13)

**Score geral: ~89%** ← subiu de 88% (observabilidade completa)

| Módulo | Score | Delta |
|---|---|---|
| Infraestrutura | **97%** | ⬆️ +3% token observability |
| Financeiro | 87% | — |
| ML / Inteligência | **92%** | ⬆️ +10% loop fechado + copy engine |
| Meta Ads | 88% | — |
| Geração de Campanhas IA | **96%** | ⬆️ +3% inteligência de mercado + sazonalidade |
| Análise de Concorrentes | 78% | — |
| TikTok Ads | 70% | — |
| Google Ads | 78% | — |

---

## ⚡ Estado das Integrações

| Serviço | Status | Detalhe |
|---|---|---|
| Cloudflare Workers AI | ✅ ATIVO | FLUX.1-schnell; 10k neurons/dia; reset 21h BRT |
| JSON2Video | ✅ ATIVO | MP4 + voz PT-BR Azure; 600 créditos |
| Pollinations.AI | ✅ Fallback | Retry 2x, timeout 35s, logs detalhados |
| Genspark | ❌ REMOVIDO | fetch failed 100% |
| BrasilAPI CNPJ | ✅ ATIVO | 14 campos; gratuita; funciona no Render |
| Meta Token | ✅ Renovado 07/05 | Válido até 06/07/2026 |
| Meta Ads Library | ❌ code=10 | Aguardando Facebook |
| Google Ads | ✅ Search+Display+Video+PMax | |
| TikTok | ⚠️ Parcial | Token não configurado |
| Asaas | ✅ Pix+Cartão | |
| Gemini | ✅ 5 chaves | Cache RAM+DB |
| Groq/Llama 3.3 70B | ✅ Fallback + modo direto | Toggle admin |

---

## 🧠 Consciência do MecProAI (sessão 13)

O sistema agora sabe, em cada geração:

| Dado | Fonte | Status |
|---|---|---|
| Perfil completo cliente (25 campos) | ClientProfile | ✅ |
| productName/Price/Differentials/ProofPoints/CTA | ClientProfile | ✅ |
| CNPJ → 14 campos automáticos | BrasilAPI | ✅ |
| 3 Personas geradas automaticamente | Gemini background | ✅ |
| Sazonalidade (data/estação/eventos) | temporalContext | ✅ |
| Nível de consciência do público | audienceConsciousness | ✅ |
| Desejo emocional / Objeção / Mecanismo único | Inteligência de mercado | ✅ |
| Dados reais Meta (CPC/CPM/CTR/CPL) | Meta Insights API | ✅ |
| Anúncios dos concorrentes | M2 | ✅ |
| Benchmarks 12 nichos (WordStream BR) | resolveNicheBenchmarks | ✅ |
| Winner patterns por engine (Gemini/Groq) | ml_dataset | ✅ |
| CTR/CPL real pós-campanha | syncMetaCampaignMetrics | ✅ |

---

## ✍️ Copy Engine Toggle (NOVO — sessão 13)

**Localização:** Agente Autônomo → seção "Engine de Copy"

| Engine | Temperatura | Quando usar |
|---|---|---|
| 🟢 Gemini | 0.6-0.7 | Qualidade máxima, compliance Meta, default |
| 🟡 Groq/Llama 3.3 70B | 0.85 | Copies fracas/genéricas — mais direto e humano |
| 🔵 ML-First | 0.5 | Após acumular dados — combina winners Gemini+Groq |

```
Padrões:
getCopyEngine() → "gemini" | "groq" | "ml_first"
Persiste no banco via saveAdminSetting("copy_engine", ...)
Carregado no boot via loadCopyEngineFromDB()
Aplicado em: generateCampaign + generateCampaignPart
```

---

## 🔄 Loop de Aprendizado ML (NOVO — sessão 13)

### Fluxo completo

```
1. Campanha gerada → ml_dataset salva:
   feature_strategy_type  ← audienceConsciousness
   feature_hook_type      ← tipo do primeiro hook
   feature_angle          ← tipo do primeiro ângulo
   feature_copy_structure ← AIDA|PAS|Storytelling|etc
   feature_has_personas   ← 1 se personas existem
   feature_copy_engine    ← gemini|groq|ml_first

2. Campanha publicada no Meta

3. syncMetaCampaignMetrics (botão no painel):
   → busca CTR/CPC/CPL/ROAS reais da Meta API
   → UPDATE ml_dataset SET real_ctr, real_cpl, real_leads...
   → marca label_is_winner=1 se CTR≥1.5% e CPL≤R$15

4. ML-First lê winners por engine:
   WINNERS GEMINI: [1] CTR real 2.8% [angulo: urgencia] [hook: dor]
   WINNERS GROQ:   [1] CTR real 1.9% [angulo: prova_social]
   → injeta no SYSTEM_MECPRO antes de gerar
```

### Colunas ml_dataset (completas)
```sql
feature_platform, feature_objective, feature_niche
feature_ad_format, feature_budget_range, feature_duration
feature_has_video, feature_has_carousel
feature_used_urgency, feature_used_social_proof
feature_copy_type, feature_creative_type
feature_copy_engine       ← NOVO sessão 13
feature_strategy_type     ← NOVO sessão 13
feature_hook_type         ← NOVO sessão 13
feature_angle             ← NOVO sessão 13
feature_copy_structure    ← NOVO sessão 13
feature_has_personas      ← NOVO sessão 13
feature_has_market_data   ← NOVO sessão 13
real_ctr, real_cpc, real_cpl, real_roas, real_spend, real_leads ← NOVO
feedback_applied_at, feedback_source ← NOVO
label_score, label_ctr, label_cpc, label_roas
label_is_winner, label_success_probability, split_group
```

---

## 🎯 Inteligência de Mercado (NOVO — sessão 13)

Adicionado ao SYSTEM_MECPRO como diagnóstico obrigatório pré-geração:

```
1. Nível de consciência: inconsciente|problema_consciente|
                          solucao_consciente|produto_consciente
2. Desejo emocional principal (status/segurança/alívio/pertencimento)
3. Objeção principal → quebrada dentro da copy
4. Mecanismo único → herói da campanha

PROIBIDO: "melhor da região", "qualidade garantida", "não perca"
OUTPUT OBRIGATÓRIO: 3 ângulos, 5 hooks, 2 copies, 2 headlines, criativo
```

**UI CampaignResult — 3 novas seções:**
- 🧠 Inteligência de Mercado (4 cards: consciência/desejo/objeção/mecanismo)
- 🎯 Ângulos de Campanha (3 estratégias)
- 📢 Headlines

---

## 📋 Personas Automáticas (NOVO — sessão 13)

```
Trigger: salvar ClientProfile com targetAudience preenchido
Processo: Gemini gera 3 personas em background (não bloqueia resposta)
Campos:   nome, idade, profissão, dor, desejo, objeção, gatilho, linguagem
Armazena: coluna personas (text JSON) no clientProfiles
Injeta:   buildPersonasBlock() no prompt de toda campanha
UI:       seção "🎭 Personas geradas pela IA" no ClientProfile
```

---

## 🔍 CNPJ — 14 campos automáticos (sessão 13)

```
Campos existentes (8): companyName, niche, city, state, businessScope,
                        productService, websiteUrl, socialLinks(phone)

Campos novos (6):
  productName       ← nome_fantasia (quando ≠ razão social)
  productProofPoints← "X anos de mercado · Fundada por [sócio]"
  productDifferentials← atividades secundárias (cnaes_secundarios)
  bairro/logradouro/cep → socialLinks (segmentação geográfica)
  telefone2         ← ddd_telefone_2
  Preview card      ← mostra todos os campos importados antes de salvar
```

---

## 🐛 Bugs Resolvidos (sessão 12)

#### BUG-068 a 071 — Ver memória anterior

---

## 🐛 Bugs Resolvidos (sessão 13)

#### BUG-072: useSafeMutation — loading travado + redirect quebrando
- **Fix:** hook padrão para todas mutations; isMounted + setLoading antes redirect
- **Commit:** edaf2ee

#### BUG-073: ClientProfile edição não persiste na UI
- **Fix:** initialized.current=false no onSuccess → useEffect re-sincroniza
- **Commit:** c41def5

#### BUG-074: Geração trava na tela (generating never false)
- **Fix:** redirect em handleGenerate, flag redirected, finally seguro
- **Commit:** c41def5

#### BUG-075: 404 após geração com Groq fallback
- **Fix:** tRPC timeout 25s→55s; pollForCampaign 6×3s→12×(3-5s)=60s
- **Commit:** 788b32a

#### BUG-076: Pollinations falha silenciosa
- **Fix:** retry 2x, timeout 35s, .catch com log.warn
- **Commit:** f5534bf

#### BUG-077: CampaignBuilder mobile — 10 bugs de layout
- **Fix:** @media 640px, touchAction, grid collapse, stepper labels
- **Commit:** d3372ec

#### BUG-078: 401 no polling /api/campaigns/latest
- **Fix:** rota específica registrada ANTES de /:id no Express
- **Commit:** 71a0c08

#### BUG-079: regenerateMutation crash (null is not object evaluating n.part)
- **Fix:** Rules of Hooks; isLoading→isPending; guard null showRegenModal
- **Commit:** 71a0c08

---

## 🏛️ Padrões Estabelecidos

```tsx
// useSafeMutation — padrão ÚNICO para todas as mutations
const { execute, loading } = useSafeMutation(
  (input) => mutation.mutateAsync(input),
  {
    redirectTo:     (data) => data?.id ? `/path/${data.id}` : null,
    invalidateKeys: [refetch],
    successMessage: "Sucesso!",
    onError:        (e) => console.error(e),
  }
);

// Zod: campos que podem ser null do banco
productName: z.string().nullish()

// CNPJ: BrasilAPI (não opencnpj.org)
fetch("https://brasilapi.com.br/api/cnpj/v1/" + digits)

// Hooks: NUNCA optional chaining, SEMPRE isPending (não isLoading)
trpc.x.y.useMutation()

// DB: SEMPRE DELETE + INSERT

// Copy Engine toggle via admin
getCopyEngine() → "gemini" | "groq" | "ml_first"

// ML dataset: registrar engine em TODA campanha
getCopyEngine() → feature_copy_engine no INSERT
```

---

## 📁 Arquivos Críticos

```
server/
├── _core/router.ts     ← syncMetaCampaignMetrics: fecha loop ML com dados reais
│                          getCopyEngine/setCopyEngine admin procedures
│                          clientProfile.upsert: async, persona background
├── _core/migrations.ts ← personas, feature_copy_engine, 8 novas colunas ML
├── _core/index.ts      ← loadCopyEngineFromDB no boot; /api/campaigns/latest
│                          antes de /:id
├── ai.ts               ← getCopyEngine/setCopyEngine/loadCopyEngineFromDB
│                          generateCampaign + generateCampaignPart: usa engine
│                          ML-First: winners separados Gemini/Groq com CTR real
│                          temporalContext (sazonalidade); buildPersonasBlock
│                          inteligência de mercado obrigatória no SYSTEM_MECPRO
│                          getNicheContext (12 nichos)
├── imageGeneration.ts  ← tryPollinations: retry 2x, timeout 35s, logs
└── schema.ts           ← personas + 6 campos produto

client/src/
├── hooks/useSafeMutation.ts   ← padrão único para mutations
├── pages/
│   ├── ClientProfile.tsx      ← CNPJ 14 campos; personas UI; useSafeMutation
│   ├── CampaignBuilder.tsx    ← mobile CSS; pollForCampaign 60s; executeGenerate
│   ├── CampaignResult.tsx     ← 3 seções novas; regenerateMutation direto
│   ├── AutonomousAgent.tsx    ← Copy Engine toggle UI (3 cards) + link Tokens IA
│   └── AdminTokenAnalytics.tsx  ← Dashboard 5 tabs Token Analytics
├── components/layout/Layout.tsx  ← NAV_ADMIN + atalho admin: 🔭 Tokens IA
```

---

## 🔑 Variáveis de Ambiente (Render.com)

```bash
DATABASE_URL / JWT_SECRET / SESSION_SECRET
GEMINI_API_KEY (+ KEY2..5) / GROQ_API_KEY
META_APP_ID / META_APP_SECRET
GOOGLE_ADS_CLIENT_ID / CLIENT_SECRET / DEVELOPER_TOKEN=saxm5SH_...
STRIPE_SECRET_KEY / ASAAS_API_KEY / ASAAS_WEBHOOK_TOKEN
CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
CLOUDFLARE_ACCOUNT_ID=5ff9748220abb541704e480a75d33a09  ✅
CLOUDFLARE_API_TOKEN=<definido no Render>               ✅
JSON2VIDEO_API_KEY=a393GciY...                          ✅
APP_URL=https://www.mecproai.com
# PENDENTE:
TIKTOK_ACCESS_TOKEN + TIKTOK_ADVERTISER_ID
```

---

## 🔭 Token Analytics (NOVO — sessão 14)

### Infraestrutura completa de observabilidade

```
server/tokenTelemetry.ts  ← módulo fire-and-forget (setImmediate)
  logTokens()             ← INSERT assíncrono na ai_token_log
  estimateCost()          ← preços reais: Gemini flash-lite $0.075/1M, Groq $0.059/1M

Tabela: ai_token_log (20 colunas + 4 índices)
  provider, model, endpoint, prompt_tokens, completion_tokens
  estimated_cost_usd, latency_ms, cache_hit, cache_type
  copy_engine, user_id, project_id, campaign_id
  status, retry_count, system_prompt_tokens

Tracking injetado em:
  gemini()        ← usageMetadata real (promptTokenCount/candidatesTokenCount)
  callGroqAPI()   ← usage.prompt_tokens / completion_tokens reais
  cache RAM hit   ← cacheHit: true, latencyMs: 0

Contexto passado: _userId, _projectId, _campaignId, _endpoint
Router: getTokenStats + getTokenLogs (ambos adminProcedure)
```

### Dashboard /admin/tokens — 5 abas

| Aba | Conteúdo |
|---|---|
| 📊 Visão Geral | KPIs (tokens/custo USD+BRL/latência/cache%), timeline, por engine, top projetos |
| 🤖 Por Modelo | Tabela Gemini vs Groq — tokens, custo, latência, cache hits, erros |
| ⚙️ Por Endpoint | Ranking por consumo (generateCampaign/matchScore/etc) |
| 🔍 Eficiência | Prompts pesados (ratio > 0.5) + sugestões automáticas |
| 📋 Logs | Tabela paginada, filtros modelo/endpoint, auto-refresh 30s |

### Navegação
```
Menu lateral (qualquer página, para admins):
  ── Admin ──────────
  ⊛  Painel Admin
  🔭 Tokens IA  ← NOVO

NAV_ADMIN (em /admin/*):
  ▣  Analytics
  🔭 Tokens IA  ← NOVO
  ⋈  Assinaturas

AutonomousAgent: link "🔭 Ver consumo de tokens →"
```

### Boot log adicionado
```
[BOOT] Copy Engine ativo: 🟢 Gemini  ← confirma engine no boot
```

---

## 🐛 Bugs Resolvidos (sessão 14)

#### BUG-080: Meta API erro 3858504 — bloqueava 100% das publicações
- **Causa:** `degrees_of_freedom_spec.creative_features_spec.standard_enhancements` descontinuado pela Meta em mai/2026
- **Fix:** Removido completamente do `creativeBody` (havia 2 ocorrências: uma no body base, outra no bloco pixelId)
- **Commits:** `29c6a80` + `1977c21`

---

## 🎛️ Painel Admin (sessão 14)

### Auditoria realizada — NAV_ADMIN expandido 11 → 17 itens

**Adicionados ao menu lateral:**
- 🧠 Inteligência ML → `/admin/intelligence`
- 🔍 Auditoria → `/admin/auditoria`
- ⚙️ Configurações → `/admin/settings`
- 📋 Pedidos Plano → `/admin/plan-requests`
- 🔑 Permissões → `/admin/roles`
- 🎨 UI Config → `/admin/ui-config`

**Não adicionados (intencionalmente):** LMS (`students`/`courses`/`lessons`/`programs`), `appointments`, `cashback-requests` — não são core do MecProAI.

---

## 📋 Pendências

| Prioridade | Item | Responsável |
|---|---|---|
| 🔴 | **Meta Token — reconectar antes 25/05** | Michel |
| 🔴 | TikTok token — configurar no Render | Michel |
| 🔴 | Meta App — Ads Library code=10 | Aguardando Facebook |
| 🟡 | Copies 2→6 (PAS/AIDA/Storytelling/Objeção/Escassez/Lifestyle) | Dev |
| 🟡 | Análise de resultados (cola CPL/CTR → diagnóstico IA) | Dev |
| 🟡 | Carrossel slide-a-slide (5 slides com roteiro) | Dev |
| 🟡 | Cronograma de otimização dia 1-15 | Dev |
| 🟢 | UTMs automáticas | Dev |
| 🟢 | Pergunta qualificadora por nicho no formulário | Dev |

---

## 🧭 Regra: "Qual o próximo passo?"

Orientar por: 🔴 crítico → 🟡 score → 🟢 qualidade
Formato: score atual (~88%) + 3 itens em ordem de impacto + o que precisa.

---

## 💡 Prompt de Início de Sessão

```
Leia docs/SYSTEM_MEMORY.md do MecProAI antes de começar.
Stack: React+Vite+tRPC+PostgreSQL. Deploy: Render.com.
Último commit: 84abe84. Michel — Balneário Camboriú/SC.
Score atual: ~88%. ML loop fechado. Copy Engine toggle ativo.
Prioridade: Meta Token (exp 25/05) + copies 2→6 + análise resultados.
```

---

## 🐛 Bugs Resolvidos (sessão 15)

#### BUG-085: botão "Editar perfil" causava 503
- **Causa 1:** `href="/projects/ID/profile"` — rota não existe no App.tsx (correta é `/client`)
- **Causa 2:** `<a href>` faz request HTTP ao servidor em SPA → 503
- **Fix:** `<button onClick={() => setLocation('/projects/ID/client')}>`
- **Commit:** c646a06

#### BUG-086: TabAIManager — useEffect não importado → ErrorBoundary
- **Causa:** `import React, { useState }` faltava `useEffect`
- **Fix:** `import React, { useState, useEffect }`
- **Commit:** d2a2656

#### BUG-087: ve.replace is not a function (linha 2619 CampaignResult)
- **Causa:** `metrics?.estimatedCPC?.replace("R$ ","")` — CPC vem como number do banco
- **Fix:** `typeof val === "string" ? val.replace(...) : String(val || "")`
- **Commit:** 1992645

#### BUG-088: opts is not defined no matchScore
- **Causa:** `cacheAs` adicionado usava `opts?.projectId` mas `opts` não existe naquele contexto
- **Fix:** Removido `opts?.projectId` do `cacheAs` do matchScore
- **Commit:** 1992645

#### BUG-089: Cloudflare prompt > 2048 chars
- **Causa:** Prompt para Cloudflare FLUX excede limite de 2048 caracteres
- **Fix:** `safePrompt()` que trunca para 2000 chars antes de enviar
- **Commit:** 1992645

#### BUG-090: Pollinations 429 em múltiplos formatos simultâneos
- **Causa:** 4 formatos gerados ao mesmo tempo → todos batem no rate limit
- **Fix:** Delay escalonado entre requests Pollinations
- **Commit:** 1992645

#### BUG-091: Groq gerando copy errada — "guia grátis" em imobiliária
- **Causa:** groqMinimalPrompt não incluía segmento, CTAs corretos por nicho nem palavras proibidas
- **Fix:** `SEGMENT_COPY_RULES` + `getSegmentInstruction()` + `detectSegmentFromNiche()`
- **Commits:** a36647a, ad7f349

---

## 🎯 SEGMENT_COPY_RULES (NOVO — sessão 15)

Tabela central de regras de copy por segmento — aplicada em Groq e motor híbrido:

```typescript
// server/ai.ts
SEGMENT_COPY_RULES[segment] → {
  ctaLeads:   string[]  // CTAs corretos para leads
  ctaSales:   string[]  // CTAs corretos para sales
  copyHook:   string    // diretriz de hook ideal
  forbidden:  string[]  // palavras proibidas no segmento
  compliance: string    // regra Meta específica
  nicheKeys:  string[]  // detecção automática por niche
}

detectSegmentFromNiche(niche) → string  // "imóveis venda" → imoveis_venda
getSegmentInstruction(segment, niche, objective) → string // injeta no prompt
```

9 segmentos cobertos:
- imoveis_venda   → "Agendar visita" | NUNCA guia/ebook/download
- imoveis_locacao → "Ver disponibilidade" | "Consultar valores"
- ecommerce       → "Comprar agora" | "Frete grátis"
- servicos_locais → "Agendar agora" | "Reservar horário"
- infoprodutos    → "Vaga gratuita" | "Aula grátis" ← único onde "baixar" é válido
- saude_estetica  → "Avaliação gratuita" | NUNCA before/after/cura
- alimentacao     → "Pedir agora" | "Ver cardápio"
- moda_varejo     → "Comprar agora" | "Frete grátis"
- b2b             → "Demo gratuita" | "Ver case" | "Calcular ROI"

3 pontos do sistema usando as regras:
1. groqMinimalPrompt → getSegmentInstruction() injetado
2. buildCampaignFromAds → detectSegmentFromNiche() + filtro de CTAs proibidos
3. Detecção automática por niche quando segment não é passado

---

## 🚨 Sistema de Logs de Erros (NOVO — sessão 15)

```
server/errorTelemetry.ts  ← fire-and-forget (setImmediate)
  logError(severity, area, code, message, ctx)
  getSuggestion()  → 12+ sugestões automáticas por código
  getErrorStats()  → summary + recent + topErrors

Tabela: system_errors
  severity (critical|error|warn), area, code, message
  fingerprint UNIQUE → upsert agrupa erros repetidos
  occurrence_count → quantas vezes ocorreu
  suggestion → sugestão automática de fix
  resolved, resolved_at, resolved_by

Interceptores ativos:
  ai.ts: campaign parse error, hybrid mode, quota exhausted, Groq 429, Groq 413
  index.ts: tRPC onError global (INTERNAL_SERVER_ERROR + TIMEOUT)
  router.ts: getSystemErrors, resolveError, resolveAllErrors (adminProcedure)

Dashboard: aba 🚨 Erros em /admin/tokens
  KPIs: não resolvidos / 24h / críticos / warnings / total
  Sugestão automática por erro
  ×N contador de ocorrências
  Botão "Resolver" + "Resolver todos"
  Auto-refresh 30s
```

---

## ⚙️ Admin — Estado Atual (sessão 15)

### NAV_ADMIN (17 itens — completo)
Todos os itens agora visíveis no menu lateral admin.

### AdminUIConfig — "Expor no Frontend"
3 seções: Expor no Frontend (12 toggles) + Features Ativas (5) + Manutenção (1)
Key corrigida: meta-campaigns → showMetaCampaigns (alinhado NAV_USER)

### AdminCampaignIntelligence — aba ⚡ Gerenciar IA
4 cards: Gemini (toggle persiste banco), Groq, Claude (inativo), ML Score
Fluxo fallback visual interativo
Ações rápidas: máxima qualidade / modo econômico / atualizar

### Meta App (novo — sessão 15)
META_APP_ID: 903722219227781
META_APP_SECRET: c5d2ab8cda2cf9548d97ebb87a1a4fe7
Atualizar no Render + reconectar token em mecproai.com/meta-campaigns

---

## 📊 Quota IA — Cálculo Correto (sessão 16)

### Descoberta crítica: limite por projeto/organização, não por chave

```
GEMINI: limite por PROJETO Google, não por chave
  → 3 projetos × 250 RPD (Flash) = 750 req/dia
  → ÷ 2 chamadas/campanha = 375 campanhas/dia

GROQ: limite por ORGANIZAÇÃO, não por chave
  → 2 organizações × 14.400 RPD = 28.800 req/dia
  → ÷ 2 chamadas/campanha = 14.400 campanhas/dia
  → REAL: limitado por TPM (6.000/org) = 2 campanhas/min

TOTAL REAL: ~14.775 campanhas/dia (era 248 — estava 59x menor)
```

### Groq round-robin implementado (c370b76)
```
getAvailableGroqKey() lê: GROQ_API_KEY + KEY_01..KEY_09 (10 slots)
Round-robin distribui carga entre chaves disponíveis
429 → chave marcada como bloqueada por 62s → próximas vão para outras
```

### Limites reais por engine (confirmado Michel — mai/2026)
- Gemini: 3 projetos separados ✅
- Groq: 2 organizações × ~3 chaves cada

### Aviso Groq
Groq free: 30 RPM / 6.000 TPM / 1.000 RPD por organização
(fonte: console.groq.com/docs/rate-limits — abr/2026)
Para escalar: Developer tier = 10x mais limite + 25% desconto tokens

---

## 📋 Pendências Atualizadas (sessão 15)

| Prioridade | Item | Status |
|---|---|---|
| 🔴 | Atualizar META_APP_ID + META_APP_SECRET no Render | Michel |
| 🔴 | Reconectar token Meta após novo app | Michel |
| 🔴 | Habilitar produtos Facebook: Marketing API, Ads Library, Instagram, Webhooks | Michel |
| 🔴 | TikTok token — configurar no Render | Michel |
| 🟡 | Gemini chaves 2+3 em projetos Google separados (AIzaSyCv duplicado) | Michel |
| 🟡 | Aprovar winner_patterns no admin → melhora qualidade ML | Michel |
| 🟢 | Copies 2→6 (PAS/AIDA/Storytelling/Objeção/Escassez/Lifestyle) | Dev |
| 🟢 | Análise de resultados (cola CPL/CTR → diagnóstico IA) | Dev |

---

## 💡 Prompt de Início de Sessão (atualizado)

```
Leia docs/SYSTEM_MEMORY.md do MecProAI antes de começar.
Stack: React+Vite+tRPC+PostgreSQL. Deploy: Render.com.
Último commit: c370b76. Michel — Balneário Camboriú/SC.
Score: ~89%. SEGMENT_COPY_RULES ativo. Sistema de logs implementado.
Prioridade: Meta novo app (ID 903722219227781) + TikTok token + Gemini chaves separadas.
```
