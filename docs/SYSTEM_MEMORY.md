# 🧠 MecProAI — Memória Técnica do Sistema

> **Para Claude:** Leia este arquivo NO INÍCIO de cada sessão antes de qualquer análise.
> Atualizar após cada sessão significativa.
>
> **Última atualização:** 2026-05-04 (sessão 9)

---

## 🏗️ Stack & Deploy

| Camada | Tecnologia | Detalhe |
|---|---|---|
| Frontend | React + Vite + TypeScript | `/client/src/` |
| Backend | Node.js + Express + tRPC | `/server/_core/router.ts` (>10k linhas) |
| Banco | PostgreSQL + Drizzle ORM | Render.com managed DB |
| Auth | JWT + Google OAuth | `/server/_core/context.ts` |
| IA Principal | Google Gemini (5 chaves) | fallback: Groq → mock |
| Deploy | Render.com | build: `npm run build`, start: `tsx server/_core/index.ts` |
| Repo | GitHub | `github.com/Moliver63/mecpro.git` |
| URL Produção | `https://www.mecproai.com` | |
| Último commit | `7ef6912` | fix overlay topo + negative_prompt CF |

---

## ⚡ Estado Atual (2026-05-04 — sessão 9)

### Integrações
| Serviço | Status | Detalhe |
|---|---|---|
| Meta Ads Library API | ❌ `code=10` | Aguardando aprovação Facebook |
| Meta Token | ✅ Válido até 2026-05-25 | Reconectar antes de expirar |
| Gemini API | ✅ Operacional | 5 chaves, reset 00:00 UTC |
| Groq API | ✅ Fallback | llama-3.3-70b-versatile |
| Google Ads API | ✅ `/v19/` | Funciona para Search apenas |
| Asaas | ✅ Completo | Pix (QR direto) + Cartão (CREDIT_CARD) |
| Cloudflare Workers AI | ✅ **ATIVO EM PRODUÇÃO** | FLUX.1-schnell confirmado nos logs — 3 formatos OK |
| Pollinations.AI | ✅ Fallback | Para quando CF falha |
| HuggingFace imagens | ❌ DESABILITADO | Todos modelos mortos |
| HeyGen imagens | ❌ DESABILITADO | API mudou |
| Genspark imagens | ❌ fetch failed | Inacessível |
| FAL.AI | ⏳ Pendente | Chave existe mas "Host not in allowlist" — adicionar Render no allowlist |
| Geração de Vídeo | ⏳ Pendente | JSON2Video (grátis) recomendado — Michel criar conta |

### Pipeline de Geração de Imagens (CONFIRMADO FUNCIONANDO)
```
Cloudflare Workers AI FLUX.1-schnell (ATIVO ✅)
  → JSON: { result: { image: "base64..." } }
  → Buffer → Cloudinary → URL estável
  → negative_prompt: "text, words, letters, typography, watermark..."
  → num_steps: 8
  → 3 formatos paralelos: feed(631KB) + stories(620KB) + square(612KB)
  → regenerateCreativeImage: ~1s por imagem

Fallback: Genspark (falha) → Pollinations → Cloudinary

Credenciais no Render:
  CLOUDFLARE_ACCOUNT_ID = 5ff9748220abb541704e480a75d33a09
  CLOUDFLARE_API_TOKEN  = <definido no Render.com — não documentar aqui>
```

### Overlay de Texto — CampaignResult.tsx
```
Gradiente DUPLO (cobre topo E base):
  to bottom: rgba(0,0,0,0.65) topo → 0.10 centro → 0.75 base → 0.92 rodapé
  Razão: texto alucinado aparecia no TOPO — gradiente anterior só cobria base

Exibe: headline (branco bold) + copy/hook (stories) + CTA (botão azul Meta)
Badge: formato no topo direito (9:16 / 1:1 / 4:5)
Toggle: "👁 Com texto" / "🖼 Só imagem" — state showOverlay (padrão: true)
```

### Estado do ML
```
learning_base:    ✅ 286 amostras (cosméticos), 24 (academia), 24 (imobiliário)
winner_patterns:  ✅ 72 padrões
campaign_scores:  ✅ auto-score com userId fallback
ml_dataset:       ✅ populando
Cache DB:         ✅ hits confirmados (key 878a2776, hits 2/3/4)
```

### Auditoria de Publicação
```
META:   ✅ COMPLETO — todos os campos enviados
GOOGLE: ⚠️ apenas SEARCH funciona; Display/Video bloqueados
TIKTOK: 🔴 videoUrl="" sempre — publicação falha sem vídeo
         coverImageUrl="" — feedImageUrl/storyImageUrl não passados
```

### Geração de Vídeo (NOVO — sessão 9)
```
Necessidade: TikTok exige vídeo; Meta aceita vídeo nos criativos
Opção recomendada: JSON2Video
  - Plano free: 600 créditos (~10 min renderizado), sem cartão
  - API REST: image-to-video (usa imagem FLUX como base)
  - Suporte: 9:16 TikTok, 4:5 Meta, 1:1 Square
  - Free tier tem watermark pequena; pago desde $49.95/mês
  - Status: aguardando Michel criar conta em json2video.com

Alternativa: Magic Hour
  - 400 créditos iniciais + 100/dia renováveis, sem cartão
  - Melhor para protótipos

Fluxo planejado:
  Imagem FLUX (Cloudflare) → JSON2Video image-to-video → MP4
  → Cloudinary → TikTok/Meta Ads
```

---

## 🐛 Bugs Resolvidos (sessão 9)

#### BUG-042: Cloudflare API retornava JSON ignorado
- **Causa:** Código esperava `Content-Type: image/png`; CF retorna `application/json` com `{result:{image:"base64..."}}`
- **Solução:** Detecta JSON → extrai base64 → Buffer → Cloudinary
- **Commit:** aaa2665

#### BUG-043: regenerateCreativeImage — botão "Gerar IA" não funcionava
- **Causa:** `(trpc as any)?.useMutation?.()` — hook condicional
- **Solução:** `trpc.campaigns.regenerateCreativeImage.useMutation()` direto; `isLoading→isPending`
- **Commit:** 3b0c9a7

#### BUG-044: Texto alucinado no TOPO da imagem
- **Causa:** Overlay gradiente só cobria base; topo ficava transparent
- **Solução:** Gradiente duplo cobre topo(0.65) + centro(0.10) + base(0.92)
- **Commit:** 7ef6912

#### BUG-045: Cloudflare sem negative_prompt
- **Solução:** `negative_prompt` dedicado no payload + `num_steps: 8`
- **Commit:** 7ef6912

---

## 🐛 Bugs Anteriores (sessões 1-8) — resumo
- BUG-001/002: Rules of Hooks; optional chaining
- BUG-020/021: ON CONFLICT; Google Ads /v19_1/
- BUG-025/026: Modal editar M2; TabRanking crash
- BUG-027-035: Pollinations→Cloudinary; HF desabilitado; Asaas QR; isSuspended
- BUG-036-041: Billing botões; Asaas cartão; CheckoutAsaas JSX; imagem cabeça; overlay

---

## 🏛️ Decisões de Arquitetura

### DA-001: Layout sem hook tRPC
### DA-002: Pipeline M2 (Camada 6 SEO/Gemini ativa)
### DA-004: Payment Gateway (Asaas Pix+Cartão / Stripe)
### DA-005: ML — DELETE+INSERT em tudo
### DA-013: Pipeline de imagem
```
CF FLUX (principal) → Genspark (falha) → Pollinations (fallback)
CF payload: prompt + negative_prompt + num_steps:8 + width/height
CF response: JSON base64 → Buffer → Cloudinary
generateWithHuggingFace: retorna string|null (não Buffer)
3 formatos paralelos + demais criativos sequencial (só feed)
```
### DA-014: Overlay de texto
```
Gradiente duplo: topo(0.65)→centro(0.10)→base(0.92)
Badge formato: topo direito (9:16/1:1/4:5)
Toggle showOverlay padrão true
```
### DA-015: Auditoria publicação
```
Meta ✅ / Google ⚠️ Search-only / TikTok 🔴 sem vídeo
```
### DA-016: Geração de vídeo (planejada)
```
JSON2Video: image-to-video; free 600 créditos; 9:16/4:5/1:1
Fluxo: CF FLUX → JSON2Video → MP4 → Cloudinary → TikTok/Meta
Aguardando: Michel criar conta json2video.com
```

---

## 📐 Padrões Estabelecidos

```tsx
// Hooks: NUNCA optional chaining
trpc.x.y.useMutation() — sempre tipado; isPending não isLoading

// DB: SEMPRE DELETE + INSERT
DELETE FROM tabela WHERE campaign_id = $1;
INSERT INTO tabela (...) VALUES (...);

// useEffect em vez de onSuccess (React Query v5)
useEffect(() => { if (data?.field) doSomething(data) }, [data])

// Antes de editar: verificar estado atual
with open('file.tsx') as f: c = f.read()
print(c.count('variavel'))  # deve ser 1
```

---

## 📁 Mapa de Arquivos Críticos

```
server/
├── _core/router.ts         ← regenerateCreativeImage; createCheckout; listUserBalances
├── adminIntelligenceRouter.ts ← ML DELETE+INSERT
├── ai.ts                   ← auto-score userId fallback; DELETE+INSERT ML
├── imageGeneration.ts      ← CF FLUX principal; negative_prompt; compositionFix
│                             generateWithCloudflare: JSON base64 detectado
│                             HF/HeyGen desabilitados; Pollinations fallback
├── paymentService.ts       ← Asaas Pix+Cartão
└── db.ts                   ← PLAN_LIMITS

client/src/pages/
├── CampaignResult.tsx      ← overlay gradiente duplo; badge formato; showOverlay toggle
│                             regenerateCreativeImage.useMutation() real
├── Billing.tsx             ← "Assinar" → /checkout/asaas ou Stripe
├── CheckoutAsaas.tsx       ← seletor Pix|Cartão completo; form cartão; validação
├── GoogleCampaignCreator.tsx ← apenas SEARCH
├── TikTokCampaignCreator.tsx ← videoUrl="" (PENDENTE)
├── CompetitorAnalysis.tsx  ← modal editar z-index 2000
└── AdminCampaignIntelligence.tsx ← ErrorBoundary 4 abas
```

---

## 🔑 Variáveis de Ambiente

```bash
DATABASE_URL / JWT_SECRET / SESSION_SECRET
GEMINI_API_KEY (+ KEY2..5) / GROQ_API_KEY
META_APP_ID / META_APP_SECRET
GOOGLE_ADS_CLIENT_ID / CLIENT_SECRET / DEVELOPER_TOKEN=saxm5SH_...
STRIPE_SECRET_KEY / ASAAS_API_KEY / ASAAS_WEBHOOK_TOKEN
HUGGINGFACE_API_KEY   ← tem mas HF desabilitado
CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
APP_URL=https://www.mecproai.com
CLOUDFLARE_ACCOUNT_ID=5ff9748220abb541704e480a75d33a09  ✅ ATIVO
CLOUDFLARE_API_TOKEN=<definido no Render.com>  ✅ ATIVO
# PENDENTE:
JSON2VIDEO_API_KEY=<Michel criar conta json2video.com>
```

---

## 📋 Pendências

| Prioridade | Item | Status |
|---|---|---|
| 🔴 | TikTok: videoUrl vazio | Implementar após JSON2Video |
| 🔴 | Meta Token — reconectar antes 2026-05-25 | Ação do usuário |
| 🔴 | Meta App — Ads Library API | Aguardando Facebook |
| 🔴 | JSON2Video — gerar vídeo | Michel criar conta em json2video.com → me passar API key |
| 🟡 | Google Display/Video/PMax | Implementar asset upload |
| 🟡 | Google negativeKeywords | Extrair do aiResponse |
| 🟡 | FAL.AI allowlist | Adicionar Render no dashboard FAL |
| 🟢 | Mercado Livre API | Aguardando credenciais |
| 🟢 | ZAP Imóveis feed XML | Não implementado |

---

## 💡 Prompt de Início de Sessão

```
Leia docs/SYSTEM_MEMORY.md do MecProAI antes de começar.
Stack: React+Vite+tRPC+PostgreSQL. Deploy: Render.com.
Último commit: 7ef6912. Michel — Balneário Camboriú/SC.
PRIORIDADE: JSON2Video para vídeo + TikTok videoUrl.
```
