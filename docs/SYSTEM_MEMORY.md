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
| Último commit | `a95b560` | ML loop de aprendizado completo |

---

## 📊 Score de Prontidão (sessão 13)

**Score geral: ~88%** ← subiu de 85%

| Módulo | Score | Delta |
|---|---|---|
| Infraestrutura | 94% | — |
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
| Meta Token | ⚠️ Expira 25/05 | **RECONECTAR EM BREVE** |
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
│   └── AutonomousAgent.tsx    ← Copy Engine toggle UI (3 cards)
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
Último commit: a95b560. Michel — Balneário Camboriú/SC.
Score atual: ~88%. ML loop fechado. Copy Engine toggle ativo.
Prioridade: Meta Token (exp 25/05) + copies 2→6 + análise resultados.
```
