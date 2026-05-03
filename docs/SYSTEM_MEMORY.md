# 🧠 MecProAI — Memória Técnica do Sistema

> **Para Claude:** Leia este arquivo NO INÍCIO de cada sessão antes de qualquer análise.
> Contém o estado atual, bugs conhecidos, decisões de arquitetura e padrões estabelecidos.
> Atualizar após cada sessão significativa.
>
> **Última atualização:** 2026-05-03 (sessão 7)

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
| Último commit | `ad93345` | fix asaas QR Code + botões billing |

---

## ⚡ Estado Atual do Sistema (2026-05-03 — sessão 7)

### Integrações
| Serviço | Status | Detalhe |
|---|---|---|
| Meta Ads Library API | ❌ `code=10` | Aguardando aprovação Facebook |
| Meta Token | ✅ Válido até 2026-05-25 | Reconectar antes de expirar |
| Gemini API | ✅ Operacional | 5 chaves, reset 00:00 UTC |
| Groq API | ✅ Fallback | llama-3.3-70b-versatile |
| Google Ads API | ✅ URL corrigida | `/v19/` (era v19_1) |
| Asaas (Pix) | ✅ Fluxo corrigido | nextDueDate=hoje; QR Code direto; botões sem duplicata |
| HuggingFace imagens | ❌ Todos modelos mortos | FLUX.1-dev=410, schnell=404, SD3.5=400; HF DESABILITADO |
| HF Space scraping | ⚠️ Inacessível | timeout 8s, continua para SEO |
| HeyGen imagens | ❌ Desabilitado | /v2/image.generate retorna 404 permanente |
| Genspark imagens | ❌ fetch failed | inacessível do Render |
| Pollinations.AI | ✅ ÚNICO gerador ativo | download + upload Cloudinary → URL estável |
| Cache DB (ai_cache) | ✅ Ativo | TTL: campaign=7d, market=3d; isolado por userId+projectId |

### Pipeline de Geração de Imagens (estado real)
```
Provider configurado: huggingface (env var)
Fluxo real:
  1. HF → null imediato (desabilitado — todos modelos mortos)
  2. Genspark → fetch failed
  3. Pollinations.AI → download imagem → upload Cloudinary → URL estável ✅

Tempo médio: ~2s (Pollinations direto)
Formatos: feed (1080×1350) + stories (1080×1920) + square (1080×1080) em paralelo
          demais criativos: só feed sequencial
```

### Estado do ML
```
Camada 1 — Score ponderado:     ✅ Ativo
Camada 2 — learning_base:       ✅ 286+ amostras (cosméticos), 24 (academia)
Camada 3 — winner_patterns:     ✅ patternsExtracted: 72 (DELETE+INSERT funcionou!)
Camada 4 — ml_dataset:          ✅ sendo populado (auto-score corrigido)
```

### Circuit Breakers
```
Meta CB: OPEN após code=10 → fallback para SEO/Gemini
```

---

## 🐛 Bugs Resolvidos (sessão 7)

#### BUG-027: publishToMeta — "Nenhuma mídia disponível"
- **Causa:** Pollinations retornava URL dinâmica que Meta rejeita para criar imageHash
- **Solução:** Pollinations faz download da imagem → upload Cloudinary → URL estável (res.cloudinary.com)
- **Arquivo:** `server/imageGeneration.ts` — `tryPollinations()`
- **Commit:** 0bc49f2

#### BUG-028: HF FLUX.1-dev 410 + schnell 404 + SD3.5 400
- **Causa:** HF hf-inference desativou todos os modelos de imagem
- **Tentativa:** FAL-AI via HF router também falhou ("Model not supported by provider fal-ai")
- **Solução:** HF completamente desabilitado no pipeline — retorna null imediatamente
- **Arquivo:** `server/imageGeneration.ts` — provider huggingface retorna null
- **Commits:** 2dbacc0, 8da8538

#### BUG-029: HeyGen /v2/image.generate 404 permanente
- **Causa:** HeyGen mudou a API de geração de imagem
- **Solução:** HeyGen desabilitado do pipeline
- **Commit:** 2dbacc0

#### BUG-030: campaign_scores + ml_dataset — ON CONFLICT sem constraint
- **Causa:** Tabelas existentes sem UNIQUE(campaign_id); ON CONFLICT falhava
- **Solução:** DELETE + INSERT em todos os lugares (winner_patterns, campaign_scores, ml_dataset, syncMetaCampaignMetrics)
- **Commits:** 1abd41f, 2dbacc0

#### BUG-031: Score automático — "null value in column user_id"
- **Causa:** project.userId undefined quando projeto não encontrado
- **Solução:** fallback — busca userId via `SELECT FROM projects WHERE id = projectId`
- **Arquivo:** `server/ai.ts` — setImmediate auto-score
- **Commit:** 8da8538

#### BUG-032: Asaas createCheckout sem CPF (Billing.tsx)
- **Causa:** `Billing.tsx` chamava `createCheckout.mutate({ planSlug, billing })` sem cpfCnpj
- **Solução:** quando gateway=asaas, redireciona para `/checkout/asaas?plan=X&billing=Y`
- **Arquivo:** `client/src/pages/Billing.tsx`
- **Commit:** 653767d

#### BUG-033: admin.listUserBalances — "column u.isSuspended does not exist"
- **Causa:** Coluna não existe na tabela users
- **Solução:** `false AS "isSuspended"` na query
- **Arquivo:** `server/_core/router.ts` — `listUserBalances`
- **Commit:** 653767d

#### BUG-034: Asaas QR Code não aparecia — enviava por email
- **Causa:** `nextDueDate = amanhã` → Asaas não gera QR imediato, envia email
- **Solução:** `nextDueDate = hoje`; `sendPaymentByPostalService: false`; backend busca pixQrCode imediatamente após criar assinatura; retorna `{ pixCode, pixQr }` diretamente sem redirect
- **Arquivo:** `server/paymentService.ts` — `AsaasProvider.createSubscription()`
- **Commit:** ad93345

#### BUG-035: Billing.tsx — dois botões Pix, sem cartão
- **Causa:** Substituição do botão cartão por Pix não removeu o segundo botão de Pix original
- **Solução:** Quando asaas: 1 botão "⚡ Pagar com Pix" + nota explicativa; Quando stripe: botão cartão + Pix opcional
- **Arquivo:** `client/src/pages/Billing.tsx`
- **Commit:** ad93345

---

## 🐛 Bugs Anteriores (sessões 1-6)

#### BUG-001 a BUG-026: [Ver histórico de commits — todos corrigidos]
- BUG-001: Rules of Hooks — Layout.tsx
- BUG-002: Optional chaining em hooks
- BUG-003: const websiteUrl imutável
- BUG-004: Procedures duplicados no router
- BUG-020: patternsExtracted=0 — ON CONFLICT DO NOTHING
- BUG-021: Google Ads API /v19_1/ → /v19/
- BUG-025: Botão editar M2 — modal não abria
- BUG-026: TabLearning/ML/Ranking crash

---

## 🏛️ Decisões de Arquitetura

### DA-001: Layout sem hook tRPC
- Layout.tsx NÃO faz chamadas tRPC; usa `sessionStorage` para ui_visibility

### DA-002: Pipeline M2 (7 camadas)
```
Camada 1-3: Meta Ads API     ← BLOQUEADA (code=10)
Camada 4:   Instagram/Nome   ← Funciona parcialmente
Camada 5:   Web Scraping     ← HF Space down; scraping direto funciona
Camada 6:   SEO/IA (Gemini)  ← ✅ PRINCIPAL FALLBACK ATIVO
Camada 7:   Mock por Nicho   ← Último recurso
```

### DA-003: Website discovery automático
- `enrichWithWebsite()`: Instagram bio → Facebook page → Gemini grounding

### DA-004: Payment Gateway (Asaas vs Stripe)
```
Interface: PaymentProvider com StripeProvider e AsaasProvider
Gateway ativo: lido do banco (app_settings.payment_gateway) com cache 60s

Asaas:
  - Pix apenas (cartão requer tokenização PCI — não implementado)
  - nextDueDate = hoje → QR Code gerado imediatamente
  - sendPaymentByPostalService = false → não envia email automático
  - createSubscription retorna { pixCode, pixQr } direto (sem redirect)
  - Fallback: retorna { url: /checkout/asaas?sub=xxx } se QR não disponível

Stripe:
  - Cartão de crédito + Pix opcional
  - Abre checkout hospedado
```

### DA-005: ML Pipeline
```
DELETE + INSERT em TUDO (não ON CONFLICT):
  winner_patterns, campaign_scores, ml_dataset, syncMetaCampaignMetrics
Motivo: tabelas existentes sem UNIQUE constraint — ON CONFLICT sempre falha
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

### DA-008: Sync de métricas Meta → ML
```
publishToMeta → salva metaCampaignId/metaAdSetId/metaAdId
syncMetaCampaignMetrics → GET /v21.0/{metaCampaignId}/insights → campaign_scores.metric_*
Sequência admin: "📊 Sincronizar Métricas Meta" → "🧠 Analisar Histórico Completo"
```

### DA-009: Localização e escopo geográfico
```
clientProfile: businessScope, city, state, country, averageTicket
discoverCompetitors: prioriza região; copy menciona cidade
```

### DA-010: Cache persistente de respostas IA
```
Tabela: ai_cache (cache_key SHA-256 com userId+projectId, response, expires_at)
TTLs: campaign=7d, market=3d, seo=2d, competitor=1d, scraping=4h
```

### DA-011: Planos MecProAI
```
Free:    maxProjects=1,  maxCompetitors=3,  maxCampaigns=0
Basic:   maxProjects=3,  maxCompetitors=8,  maxCampaigns=8    R$97/mês
Premium: maxProjects=10, maxCompetitors=15, maxCampaigns=∞    R$197/mês (Google+TikTok)
VIP:     maxProjects=∞,  maxCompetitors=∞,  maxCampaigns=∞    R$397/mês
Custo de IA por usuário Basic: R$0,05/mês
```

### DA-012: Botão editar concorrente — modal drawer raiz
```
position=fixed, inset=0, z-index=2000, FORA do .map()
Busca em competitors[] (não filteredCompetitors)
setEditing(c.id) sempre — sem toggle
```

### DA-013: Pipeline de imagem (estado 2026-05-03)
```
HF: DESABILITADO — todos modelos mortos (410/404/400)
HeyGen: DESABILITADO — API mudou
Genspark: inacessível
Pollinations: ÚNICO ATIVO → download Buffer → Cloudinary upload → URL estável
generateWithHuggingFace: retorna string|null (não Buffer)
3 formatos em paralelo: feed+stories+square (Promise.allSettled)
```

---

## 📐 Padrões Estabelecidos

### Hooks React
```tsx
// ❌ NUNCA
(trpc as any).x?.y?.useMutation?.() ?? fallback
// ✅ SEMPRE
trpc.x.y.useMutation({ onSuccess, onError })
// ✅ onSuccess deprecated no React Query v5
useEffect(() => { if (data?.field) doSomething(data) }, [data])
```

### DB — INSERT padrão para tabelas ML
```sql
-- NUNCA: ON CONFLICT (pode falhar se constraint não existe)
-- SEMPRE: DELETE + INSERT
DELETE FROM tabela WHERE campaign_id = $1;
INSERT INTO tabela (...) VALUES (...);
```

### Arquivo corrompido — protocolo de recuperação
```bash
git show COMMIT:path/to/file.tsx > /tmp/clean.tsx
wc -l /tmp/clean.tsx
# Aplicar APENAS a mudança necessária
npx tsc --noEmit 2>&1 | grep "FileName" | grep "error TS"
```

### Edição de arquivos — verificar estado ANTES
```python
with open('file.tsx') as f: c = f.read()
print(c.count('variavel'))  # deve ser 1, não 0 ou 2
```

### Timeouts e Render.com
- Limite HTTP: 30s; Padrão: 25s timeout → `{ timedOut: true }` → polling
- Polling: `GET /api/competitors/status?competitorId=X&after=TIMESTAMP`

### Modais mobile (bottom sheet)
```tsx
<div style={{ position:"fixed", inset:0, zIndex:2000, display:"flex",
  alignItems:"flex-end", background:"rgba(0,0,0,0.5)" }}>
  <div style={{ width:"100%", borderRadius:"20px 20px 0 0",
    maxHeight:"92vh", overflowY:"auto", animation:"slideUp 0.22s ease" }}>
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
│   ├── router.ts              ← adminRouter ~L4300; getCheckoutPix; syncMetaCampaignMetrics
│   │                            listUserBalances: isSuspended=false (coluna inexistente)
│   ├── adminIntelligenceRouter.ts ← ML; DELETE+INSERT (não ON CONFLICT)
│   ├── migrations.ts          ← ai_cache; client_profiles scope/city; constraints ML
│   └── index.ts               ← cleanExpiredCache() no boot
├── ai.ts                      ← kpUrl=/v19/; auto-score com userId fallback via projects
│                                3 formatos em paralelo; DELETE+INSERT para campaign_scores/ml_dataset
├── aiCache.ts                 ← buildCacheKey(prompt, fn, projectId, userId)
├── imageGeneration.ts         ← HF desabilitado; HeyGen desabilitado; Pollinations→Cloudinary
│                                generateWithHuggingFace retorna string|null (não Buffer)
├── paymentService.ts          ← Asaas: nextDueDate=hoje; busca pixQrCode direto; sem email automático
└── db.ts                      ← PLAN_LIMITS; checkPlanLimit inclui "tiktok"

client/src/
├── pages/
│   ├── Billing.tsx            ← gateway=asaas: 1 botão Pix → /checkout/asaas
│   │                            gateway=stripe: cartão + Pix opcional
│   ├── CompetitorAnalysis.tsx ← Modal editar: raiz da página, z-index 2000
│   ├── AdminCampaignIntelligence.tsx ← ErrorBoundary 4 abas
│   ├── CheckoutAsaas.tsx      ← subId param; useEffect para Pix; loading states
│   ├── ClientProfile.tsx      ← businessScope, city, state, averageTicket
│   └── About.tsx              ← Planos sincronizados
├── components/competitors/
│   ├── competitorForms.tsx    ← EditCompetitorForm — hooks tipados
│   └── competitorCards.tsx    ← qualityMap badges
├── hooks/usePlanLimit.ts      ← PLAN_LIMITS espelho; hasTikTok
└── App.tsx                    ← rota /checkout/asaas registrada
```

---

## 🔑 Variáveis de Ambiente

```bash
DATABASE_URL / JWT_SECRET / SESSION_SECRET
GEMINI_API_KEY (+ KEY2..5) / GROQ_API_KEY / GENSPARK_API_KEY
META_APP_ID / META_APP_SECRET
GOOGLE_ADS_CLIENT_ID / CLIENT_SECRET / DEVELOPER_TOKEN=saxm5SH_...
STRIPE_SECRET_KEY / ASAAS_API_KEY / ASAAS_WEBHOOK_TOKEN
HUGGINGFACE_API_KEY  ← tem chave mas HF desabilitado para imagens
CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET  ← obrigatório para imagens
APP_URL=https://www.mecproai.com
MECPRO_AI_URL  ← HF Space inacessível do Render
IMAGE_PROVIDER=huggingface  ← valor no env, mas HF desabilitado; Pollinations é o real
```

---

## 📋 Pendências

| Prioridade | Item | Status |
|---|---|---|
| 🔴 | Meta App — permissão Ads Library API | Aguardando aprovação Facebook |
| 🔴 | Meta Token — reconectar antes de 2026-05-25 | Ação do usuário |
| 🔴 | Asaas — testar QR Code em produção após fix nextDueDate | Testar com usuário real |
| 🟡 | Gerador de imagens — HF morto, Pollinations é único | Avaliar D-ID ou Replicate como alternativa real |
| 🟡 | ML — rodar Sincronizar Métricas + Analisar Histórico | Confirmar patternsExtracted>0 nos logs |
| 🟡 | Cartão de crédito no Asaas | Requer tokenização PCI — complexo; usar Stripe para CC |
| 🟢 | Mercado Livre API | Aguardando credenciais |
| 🟢 | ZAP Imóveis — feed XML | Não implementado |

---

## 💡 Prompt de Início de Sessão

```
Leia docs/SYSTEM_MEMORY.md do MecProAI antes de começar.
Stack: React+Vite+tRPC+PostgreSQL. Deploy: Render.com.
Último commit: ad93345. Michel trabalha em Windows/PowerShell, Balneário Camboriú/SC.
```
