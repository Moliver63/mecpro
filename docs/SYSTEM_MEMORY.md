# 🧠 MecProAI — Memória Técnica do Sistema

> **Para Claude:** Leia este arquivo NO INÍCIO de cada sessão antes de qualquer análise.
> Contém o estado atual, bugs conhecidos, decisões de arquitetura e padrões estabelecidos.
> Atualizar após cada sessão significativa.
>
> **Última atualização:** 2026-05-03 (sessão 6)

---

## 🏗️ Stack & Deploy

| Camada | Tecnologia | Detalhe |
|---|---|---|
| Frontend | React + Vite + TypeScript | `/client/src/` |
| Backend | Node.js + Express + tRPC | `/server/_core/router.ts` (>10k linhas) |
| Banco | PostgreSQL + Drizzle ORM | Render.com managed DB |
| Auth | JWT + Google OAuth | `/server/_core/context.ts` |
| IA Principal | Google Gemini (5 chaves) | fallback: Groq → Genspark → mock |
| Deploy | Render.com | `render.yaml` — build: `npm run build`, start: `tsx server/_core/index.ts` |
| Repo | GitHub | `github.com/Moliver63/mecpro.git` |
| URL Produção | `https://www.mecproai.com` | |
| Último commit | `b2d755d` | god-mode: 3 fixes sistêmicos |

---

## ⚡ Estado Atual do Sistema (2026-05-03)

### Integrações
| Serviço | Status | Motivo | Ação Necessária |
|---|---|---|---|
| Meta Ads Library API | ❌ `code=10` | App sem permissão Ads Library | Solicitar em developers.facebook.com → App → Ads Library API |
| Meta Token | ✅ Válido | Expira 2026-05-25 | Reconectar antes de expirar |
| Gemini API | ✅ Operacional | Reset às 00:00 UTC diário | 5 chaves com rotação, esgotam ~21h de uso intenso |
| Groq API | ✅ Fallback ativo | llama-3.3-70b-versatile | OK |
| Google Ads API | ✅ Funcionando | URL corrigida v19_1→v19 | OK |
| Asaas (Pix) | ✅ Configurado | `ASAAS_API_KEY` set | Fluxo Pix corrigido (getCheckoutPix) |
| HuggingFace Proxy | ⚠️ Inacessível | scrape-website retorna "fetch failed" | Timeout reduzido 8s, pipeline continua sem bloquear |
| Cache DB (ai_cache) | ✅ Ativo | TTL: campaign=7d, market=3d, seo=2d | Isolado por userId+projectId |

### Circuit Breakers Ativos
```
Meta CB: OPEN após code=10 — reset em 30min
         Aciona: fetchViaWebsiteScraping → fetchViaSEOAnalysis como fallbacks
```

### Estado do ML
```
Camada 1 — Score ponderado:     ✅ Ativo
Camada 2 — Aprendizado (learning_base): ✅ 174+ entradas
Camada 3 — Dataset ML (ml_dataset):    ⚠️ 0 amostras (patternsExtracted ainda corrigindo)
winner_patterns:                        ⚠️ Sendo populado (DELETE+INSERT implementado)
```

---

## 🐛 Bugs Conhecidos & Resolvidos

### CRÍTICOS (já corrigidos)

#### BUG-001: Rules of Hooks — Layout.tsx
- **Causa:** `trpc.public.getUIConfig.useQuery()` estava após `if (isPublic) return`
- **Sintoma:** Tela "Algo deu errado" em TODAS as páginas autenticadas
- **Solução:** Hook movido para antes do early return; visibilidade usa `sessionStorage` no Layout
- **Padrão:** Hooks NUNCA após `return` condicional
- **Arquivo:** `client/src/components/layout/Layout.tsx`

#### BUG-002: Optional chaining em hooks (`?.useQuery?.()`)
- **Causa:** `(trpc as any).x?.y?.useMutation?.()` é hook condicional mesmo antes do return
- **Sintoma:** Crash em runtime — React conta hooks diferentes entre renders
- **Solução:** Usar `trpc.namespace.procedure.useMutation()` tipado direto
- **Ocorreu em:** Layout, AdminCampaignIntelligence, competitorForms, CompetitorAnalysis
- **Regra:** NUNCA usar `?.useMutation?.()` ou `?.useQuery?.()` — sempre hook real incondicional

#### BUG-003: `const websiteUrl` não atualizava após descoberta
- **Causa:** `const websiteUrl = competitor.websiteUrl` é imutável
- **Solução:** Alterado para `let websiteUrl`
- **Arquivo:** `server/ai.ts` — `_analyzeCompetitorImpl()`

#### BUG-004: Procedures duplicados no router
- **Causa:** Procedures adicionados fora do router correto
- **Regra:** Verificar SEMPRE que o `adminRouter` fecha na L4299

#### BUG-005 a BUG-013: [Corrigidos em sessões anteriores — ver commits]

#### BUG-014: winner_patterns — coluna `pattern_score` inexistente
- **Solução:** `pattern_score` → `score`
- **Commit:** b8a3ffa

#### BUG-015: syncMetaCampaignMetrics — `userId` não existe em campaigns
- **Solução:** JOIN com projects
- **Commit:** b8a3ffa

#### BUG-016: patternsExtracted=0 — detectFalseWinner bloqueava tudo
- **Solução:** `qualifiedByCopy` — extrai padrão mesmo sem métricas reais
- **Commit:** 4e8984b

#### BUG-017: winner_patterns — `multiple assignments to same column "score"`
- **Causa:** ON CONFLICT DO UPDATE tinha `score` duplicado
- **Solução:** Removida duplicata; adicionado statistical_conf e volume_weight
- **Commit:** fbb2952

#### BUG-018: winner_patterns — `no unique constraint matching ON CONFLICT`
- **Causa:** Constraint `uniq_winner_patterns_campaign` não existia no banco live
- **Solução:** `ON CONFLICT DO NOTHING` + migration `ADD CONSTRAINT IF NOT EXISTS`
- **Commit:** 1abd41f

#### BUG-019: campaign_scores — `column "updated_at" does not exist`
- **Causa:** Coluna não existia na tabela criada antes da migration
- **Solução:** Removida do UPDATE; migration `ADD COLUMN IF NOT EXISTS updated_at`
- **Commit:** 1abd41f

#### BUG-020: patternsExtracted=0 — ON CONFLICT DO NOTHING ignorava silenciosamente
- **Causa:** campaign_id já existia → DO NOTHING não atualizava nem contava
- **Solução:** DELETE + INSERT (upsert real) — garante dados atualizados em cada execução
- **Commit:** b2d755d

#### BUG-021: Google Ads Keyword Planner — HTTP 404 em 100%
- **Causa:** URL usava `/v19_1/` que não existe — versão correta é `/v19/`
- **Sintoma:** Keywords nunca coletadas para nenhum concorrente
- **Solução:** `v19_1` → `v19` em `kpUrl`
- **Arquivo:** `server/ai.ts` — `fetchKeywordsViaKeywordPlanner()`
- **Commit:** b2d755d

#### BUG-022: scrape-website — bloqueava pipeline por 15s sem resultado
- **Causa:** HF Space inacessível do Render; timeout máximo de 15s bloqueava todo o pipeline
- **Solução:** Timeout reduzido para 8s; try/catch explícito; falha rápida e silenciosa
- **Commit:** b2d755d

#### BUG-023: Checkout Asaas — página 404
- **Causa:** Rota `/checkout/asaas` nunca foi registrada no `App.tsx`
- **Solução:** Rota adicionada; `getCheckoutPix` procedure criado; `onSuccess` deprecated → `useEffect`
- **Commit:** 4200251

#### BUG-024: CheckoutAsaas — variáveis duplicadas no build
- **Causa:** Edições encadeadas inseriram `subId` e `subStatus` duas vezes
- **Solução:** Restaurado do git e reaplicado cirurgicamente
- **Lição:** Verificar estado atual do arquivo ANTES de qualquer edição
- **Commit:** 5b2df76

#### BUG-025: Botão editar concorrente (M2) — não abria modal
- **Causa 1:** Modal estava dentro do `.map()` filtrado — se concorrente fora do filtro, `editComp=null`
- **Causa 2:** Botão fazia toggle — fechava imediatamente se já estava ativo
- **Causa 3:** z-index insuficiente; modal no nível errado da árvore
- **Solução:** Modal movido para raiz da página (z-index 2000); botão sempre abre; busca em `competitors` (não filtrado)
- **Commit:** 17841c1

#### BUG-026: TabLearning/TabML/TabRanking — crash sem ErrorBoundary
- **Causa:** query.isError não tratado; dados com formato inesperado do banco
- **Solução:** ErrorBoundary em todas as 4 abas; EmptyState quando isError; guards de tipo
- **Commits:** 43a0528, fbb2952, 4505766

---

## 🏛️ Decisões de Arquitetura

### DA-001: Layout sem hook tRPC
- Layout.tsx NÃO faz chamadas tRPC; usa `sessionStorage` para ui_visibility

### DA-002: Pipeline de análise de concorrentes (7 camadas)
```
Camada 1: Meta Ads API Oficial (token OAuth)      ← BLOQUEADA (code=10)
Camada 2: HF Proxy → Ads Library                 ← BLOQUEADA (code=10)
Camada 3: Ads Library Direta (Render)             ← BLOQUEADA (code=10)
Camada 4: Instagram / Busca por Nome              ← Funciona parcialmente
Camada 5: Web Scraping do Site                    ← HF Space down, scraping direto funciona
Camada 6: Análise SEO/IA (Gemini)                 ← ✅ PRINCIPAL FALLBACK ATIVO
Camada 7: Mock por Nicho                          ← Último recurso
```

### DA-003: Website discovery automático
- `enrichWithWebsite()`: Instagram bio → Facebook page → Gemini grounding

### DA-004: Payment Gateway abstrato
- `PaymentProvider` com `StripeProvider` e `AsaasProvider`
- Gateway ativo lido do banco (`app_settings.payment_gateway`) com cache 60s

### DA-005: ML Pipeline
```
Tabelas: campaign_scores, winner_patterns, learning_base, ml_dataset
Fluxo:   Sincronizar Métricas Meta → runFullAnalysis → winner_patterns → learning_base
INSERT:  DELETE + INSERT (não ON CONFLICT) — garante upsert real
```

### DA-006: Visibilidade do menu (AdminUIConfig)
- Config em `app_settings.ui_visibility` → `sessionStorage` → Layout

### DA-007: Indicadores de qualidade M2
```
Camadas 1-3 → badge "Real"
Camadas 4-5 → badge "Parcial"
Camada 6    → badge "Estimado IA"
Camada 7    → badge "Estimado"
```

### DA-008: Sync de métricas reais Meta → ML
```
publishToMeta → salva metaCampaignId/metaAdSetId/metaAdId
syncMetaCampaignMetrics → GET /v21.0/{metaCampaignId}/insights
                        → salva em campaign_scores.metric_*
runFullAnalysis → detectFalseWinner usa métricas reais
```
- Sequência: "📊 Sincronizar Métricas Meta" → "🧠 Analisar Histórico Completo" (3-4x)

### DA-009: Localização e escopo geográfico
```
clientProfile: businessScope (local/regional/national/global), city, state, country, averageTicket
discoverCompetitors: prioriza concorrentes da região
buildCampaignFromAds: copy menciona cidade, targeting por escopo
```

### DA-010: Cache persistente de respostas IA (ai_cache)
```
Tabela: ai_cache (cache_key SHA-256, response, fn_name, niche, project_id, user_id, expires_at)
TTLs: campaign=7d, market=3d, seo=2d, competitor=1d, scraping=4h
Isolamento: cache_key inclui userId+projectId — evita vazar copy entre clientes
Cleanup: cleanExpiredCache() no boot do servidor
Integração: gemini() verifica DB antes de chamar API; salva após resposta
```

### DA-011: Planos MecProAI (rebalanceados sessão 6)
```
Free:    maxProjects=1,  maxCompetitors=3,  maxCampaigns=0    (exploração)
Basic:   maxProjects=3,  maxCompetitors=8,  maxCampaigns=8    R$97/mês
Premium: maxProjects=10, maxCompetitors=15, maxCampaigns=null R$197/mês (Google+TikTok)
VIP:     maxProjects=∞,  maxCompetitors=∞,  maxCampaigns=∞   R$397/mês
```
- TikTok Ads: Premium+ apenas
- Google Ads: Premium+ apenas
- Custo de IA por usuário Basic: R$0,05/mês (irrelevante operacionalmente)

### DA-012: Botão editar concorrente — modal drawer
```
Modal: position=fixed, inset=0, z-index=2000, align=flex-end (bottom sheet)
Posição: nível raiz da página — FORA do .map() dos competidores
Busca: competitors (lista completa) — não filteredCompetitors
Abertura: setEditing(c.id) sempre — sem toggle
```

---

## 📐 Padrões Estabelecidos

### Hooks React
```tsx
// ❌ NUNCA
(trpc as any).x?.y?.useMutation?.() ?? fallback
hook?.isPending / (hook as any).mutate()

// ✅ SEMPRE
trpc.x.y.useMutation({ onSuccess, onError })
hook.mutate() / hook.isPending

// ✅ onSuccess deprecated no React Query v5 — usar useEffect
const { data } = trpc.x.y.useQuery(input)
useEffect(() => { if (data?.field) doSomething(data) }, [data])
```

### Arquivo corrompido — protocolo de recuperação
```bash
# SEMPRE restaurar do git antes de reaplicar edições
git show COMMIT:client/src/pages/File.tsx > /tmp/clean.tsx
# Verificar linhas
wc -l /tmp/clean.tsx
# Aplicar APENAS a mudança necessária via Python replace
# Verificar TS
npx tsc --noEmit 2>&1 | grep "FileName" | grep "error TS"
```

### Edição de arquivos — verificar estado atual ANTES
```python
# Antes de qualquer replace, verificar o que existe
with open('file.tsx', 'r') as f: content = f.read()
print(content.count('variavel_a_verificar'))  # deve ser 1, não 0 ou 2
```

### Timeouts e Render.com
- Limite HTTP: 30s no Render Free/Starter
- Padrão: Timeout 25s → `{ timedOut: true }` → frontend faz polling
- Polling: `GET /api/competitors/status?competitorId=X&after=TIMESTAMP`

### Modais em mobile (bottom sheet)
```tsx
// Padrão para modais que devem funcionar em iPhone
<div style={{ position:"fixed", inset:0, zIndex:2000,
  display:"flex", alignItems:"flex-end",
  background:"rgba(0,0,0,0.5)" }}>
  <div style={{ width:"100%", borderRadius:"20px 20px 0 0",
    maxHeight:"92vh", overflowY:"auto",
    animation:"slideUp 0.22s ease" }}>
    {/* handle bar */}
    <div style={{ width:40, height:4, background:"#e2e8f0",
      borderRadius:99, margin:"12px auto 20px" }} />
    {/* conteúdo */}
  </div>
</div>
```

---

## 📁 Mapa de Arquivos Críticos

```
server/
├── _core/
│   ├── router.ts                   ← ~10k linhas; adminRouter fecha ~L4300
│   │                                 syncMetaCampaignMetrics; getCheckoutPix
│   │                                 subscriptionsRouter inclui getCheckoutPix
│   ├── adminIntelligenceRouter.ts  ← ML procedures; INSERT usa DELETE+INSERT (não ON CONFLICT)
│   ├── migrations.ts               ← Inclui: ai_cache, client_profiles (scope/city/state),
│   │                                 winner_patterns constraint, campaign_scores updated_at
│   └── index.ts                    ← cleanExpiredCache() no boot; polling endpoints
├── ai.ts                           ← ~6k linhas; kpUrl usa /v19/ (não v19_1)
│                                     scrape-website timeout 8s; cache DB integrado
├── aiCache.ts                      ← Cache persistente; buildCacheKey(prompt, fn, projectId, userId)
├── paymentService.ts               ← AsaasProvider.createSubscription retorna { url, invoiceId }
├── campaignIntelligenceEngine.ts   ← ML scoring
└── db.ts                           ← PLAN_LIMITS; checkPlanLimit inclui "tiktok"

client/src/
├── components/
│   ├── layout/Layout.tsx           ← SEM hooks tRPC
│   └── competitors/
│       ├── competitorForms.tsx     ← EditCompetitorForm — hooks tipados, sem (as any)
│       └── competitorCards.tsx     ← qualityMap: Real/Parcial/Estimado IA/Estimado
├── pages/
│   ├── CompetitorAnalysis.tsx      ← Modal editar: nível raiz, z-index 2000, busca em competitors[]
│   ├── AdminCampaignIntelligence.tsx ← ErrorBoundary em 4 abas; TabLearning/TabML/TabRanking
│   ├── CheckoutAsaas.tsx           ← subId param; subStatus query; useEffect para Pix
│   ├── ClientProfile.tsx           ← businessScope, city, state, averageTicket
│   └── About.tsx                   ← Planos sincronizados com PLAN_LIMITS
├── hooks/usePlanLimit.ts           ← PLAN_LIMITS espelho; inclui hasTikTok
└── App.tsx                         ← rota /checkout/asaas registrada
```

---

## 🔑 Variáveis de Ambiente

```bash
DATABASE_URL=postgresql://...
JWT_SECRET=... / SESSION_SECRET=...
GEMINI_API_KEY=... (+ KEY2..5)
GROQ_API_KEY=...
GENSPARK_API_KEY=...
META_APP_ID=41805843... / META_APP_SECRET=...
GOOGLE_ADS_CLIENT_ID=791597639315-... / CLIENT_SECRET=... / DEVELOPER_TOKEN=saxm5SH_...
STRIPE_SECRET_KEY=... / ASAAS_API_KEY=... / ASAAS_WEBHOOK_TOKEN=...
HUGGINGFACE_API_KEY=...
CLOUDINARY_URL=...
APP_URL=https://www.mecproai.com
MECPRO_AI_URL=https://[hf-space-url]  ← HF Space atualmente inacessível do Render
```

---

## 📋 Pendências

| Prioridade | Item | Status |
|---|---|---|
| 🔴 | Meta App — permissão Ads Library API | Aguardando aprovação Facebook |
| 🔴 | Asaas — testar fluxo Pix completo após fixes | PENDENTE — verificar getCheckoutPix em produção |
| 🟡 | ML — popular winner_patterns e ml_dataset | DELETE+INSERT implementado — testar com runFullAnalysis |
| 🟡 | HF Space scrape-website — inacessível do Render | Investigar se URL mudou ou serviço caiu |
| 🟡 | Meta Token — reconectar antes de 2026-05-25 | Ação do usuário |
| 🟢 | Mercado Livre API | Aguardando credenciais |
| 🟢 | ZAP Imóveis — feed XML | Não implementado |

---

## 💡 Prompt de Início de Sessão

```
Leia docs/SYSTEM_MEMORY.md do MecProAI antes de começar.
Stack: React+Vite+tRPC+PostgreSQL. Deploy: Render.com.
Último commit: b2d755d. Michel trabalha em Windows/PowerShell, Balneário Camboriú/SC.
```
