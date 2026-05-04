# 🧠 MecProAI — Memória Técnica do Sistema

> **Para Claude:** Leia este arquivo NO INÍCIO de cada sessão antes de qualquer análise.
> Atualizar após cada sessão significativa.
>
> **Última atualização:** 2026-05-04 (sessão 10 — solução derradeira)

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
| Último commit | `d460b2d` | Google Display/Video/PMax desbloqueados |

---

## 📊 Análise de Prontidão (2026-05-04 — atualizada sessão 10)

**Score geral: ~82%** ← subiu de 78.7% após Google Display/Video/PMax

| Módulo | Score | Peso | Status |
|---|---|---|---|
| Infraestrutura | 94% | 5% | ✅ |
| Financeiro (Pagamentos) | 87% | 10% | ✅ |
| ML / Inteligência | 82% | 5% | ✅ |
| Meta Ads (Publicação) | 88% | 20% | ✅ |
| Geração de Campanhas IA | 88% | 25% | ✅ |
| Análise de Concorrentes | 74% | 15% | ⚠️ |
| TikTok Ads | 70% | 10% | ⚠️ |
| Google Ads | 78% | 10% | ⚠️ (+38% nesta sessão) |

**O que ainda puxa para baixo:**
- Meta Ads Library `code=10` → aguardando aprovação Facebook (fora do controle)
- TikTok metrics → TIKTOK_ACCESS_TOKEN não configurado (ação do usuário)
- Meta Token expira 2026-05-25 → reconectar antes (ação do usuário)

**Se esses 3 resolvidos → ~88%**

---

## ⚡ Estado Atual das Integrações

| Serviço | Status | Detalhe |
|---|---|---|
| Meta Ads Library API | ❌ `code=10` | Aguardando Facebook |
| Meta Token | ✅ Válido até 2026-05-25 | Reconectar antes de expirar |
| Gemini API | ✅ 5 chaves | Reset 00:00 UTC |
| Groq API | ✅ Fallback | llama-3.3-70b-versatile |
| Google Ads API | ✅ `/v19/` | Search + Display + Video + PMax |
| Asaas | ✅ Completo | Pix QR + Cartão CREDIT_CARD |
| Cloudflare Workers AI | ✅ ATIVO | FLUX.1-schnell; 10k neurons/dia; reset 21h BRT |
| JSON2Video | ✅ ATIVO | MP4 com voz PT-BR Azure (gratuito); 600 créditos |
| Pollinations.AI | ✅ Fallback imagem | Quando CF com quota esgotada |
| HuggingFace/HeyGen/Genspark | ❌ DESABILITADOS | Mortos ou inacessíveis |
| FAL.AI | ⏳ Pendente | "Host not in allowlist" — adicionar Render no FAL dashboard |

---

## 🎬 Pipeline de Geração de Vídeo (NOVO — sessão 10)

```
Imagem FLUX (Cloudflare) → botão "🎬 Gerar vídeo com IA"
    ↓
JSON2Video API (a393GciY...)
  Payload:
    resolution: "custom" + width/height por formato
    fill: "cover" — imagem preenche 100% sem barras
    zoom: 3 + pan: "right" — Ken Burns
    type: "text" style:"001" — headline + CTA
    type: "voice" model:"azure" voice:"pt-BR-FranciscaNeural" — narração grátis
  effectiveFormat: detecta formato real da imagem (evita barras pretas)
    ↓
Polling 5s × 18 tentativas (máx 90s)
    ↓
MP4 → cr.videoUrl + cr.feedVideoUrl/storyVideoUrl
    ↓
Player aparece imediatamente no CampaignResult
```

**Custo vídeo:** JSON2Video free = 600 créditos totais (~60 vídeos)
**Custo narração:** Azure TTS = gratuito em todos os planos JSON2Video
**Custo imagem:** CF FLUX free = 10k neurons/dia (~30 imagens); fallback Pollinations grátis

---

## 🌐 Google Ads — Display/Video/PMax (DESBLOQUEADO — sessão 10)

```
SEARCH:          channel=2, adGroup=2, ad=responsive_search_ad (RSA)
DISPLAY:         channel=3, adGroup=17, ad=responsive_display_ad + imagePath
VIDEO:           channel=6, adGroup=6, ad=video_responsive_ad + YouTube URL
PERFORMANCE_MAX: channel=10, adGroup=2, ad=assetGroups.create() + fallback RSA

Frontend:
  Display  → campo URL imagem (auto-preenchido com feedImageUrl da IA)
  Video    → campo URL YouTube (usuário preenche)
  PMax     → info "Google distribui automaticamente" (usa headlines/descriptions)
  
imagePath passado em buildAdsFromCreatives:
  Display: feedImageUrl || squareImageUrl || imageUrl
  Video/PMax: "" (usuário preenche ou não precisa)
```

---

## 📢 Auditoria de Criativo (CampaignResult)

```
Meta Story 9:16: storyImageUrl || storyImageHash || feedImageUrl (fallback)
Feed:            feedImageUrl || feedImageHash
Square 1:1:      squareImageUrl || squareImageHash
TikTok/Reels:    publishMedia.videoId || videoUrl || feedVideoUrl || storyVideoUrl
Google Search:   headlines + descriptions presentes
```

---

## 🐛 Bugs Resolvidos (sessão 10)

#### BUG-046: generateCreativeVideo FORBIDDEN
- **Causa:** `campaign.userId` não existe — campaigns tem `projectId` → verifica via `getProjectById`
- **Commit:** 4410771

#### BUG-047: JSON2Video quality inválido
- **Causa:** `quality: 8` (número) → API aceita `"low"|"medium"|"high"`
- **Commit:** 20895eb

#### BUG-048: JSON2Video `style:"kenburns"` não existe
- **Causa:** API usa `zoom: 3 + pan: "right"`; `type:"html"` com `fade_in` não existe
- **Commit:** eac714b

#### BUG-049: Imagem no canto com barras pretas
- **Causa:** 2 cenas separadas + sem `fill:"cover"`
- **Solução:** 1 cena única + `fill:"cover"` + `width/height=dims`
- **Commit:** acb820f

#### BUG-050: `black.png` 404
- **Causa:** URL inventada não existe no JSON2Video
- **Solução:** elemento `html` com gradiente CSS inline
- **Commit:** 834282b

#### BUG-051: `Error rendering video` genérico
- **Causa:** `x_anchor`, `x:"50%"`, `fps:25` — propriedades inválidas
- **Solução:** payload minimalista com só propriedades confirmadas pela doc
- **Commit:** 66bea11

#### BUG-052: `refetch` não encontrado no vídeo
- **Causa:** `refetch()` → variável se chama `_refetch()`
- **Commit:** 7c47145

#### BUG-053: Meta Story 9:16 sempre "Falta"
- **Causa:** audit não aceitava feedImageUrl como fallback
- **Solução:** `story = storyImageUrl || storyImageHash || feedImageUrl`
- **Commit:** 97f0005

#### BUG-054: TikTok/Reels "Falta" mesmo com vídeo gerado
- **Causa:** audit verificava só `publishMedia.videoId` (Meta)
- **Solução:** inclui `videoUrl || feedVideoUrl || storyVideoUrl`
- **Commit:** 97f0005

#### BUG-055: createLeadForm "Button text is missing"
- **Causa:** Meta exige `button_text` quando `button_type=VIEW_WEBSITE`
- **Solução:** adicionado `button_text: "Ver site"`
- **Commit:** 97f0005

#### BUG-056: Barras pretas por aspect ratio errado
- **Causa:** canvas 9:16 com imagem 4:5
- **Solução:** `effectiveFormat` detecta formato real da imagem disponível
- **Commit:** 93dc1ce

#### BUG-057: Google Display/Video/PMax bloqueados
- **Causa:** throw SEARCH-only no backend + toast no frontend
- **Solução:** removidos; implementados responsive_display_ad, video_responsive_ad, assetGroups
- **Commit:** d460b2d

---

## 🏛️ Padrões Estabelecidos

```tsx
// Hooks: NUNCA optional chaining
trpc.x.y.useMutation() — isPending não isLoading
useEffect em vez de onSuccess (React Query v5)

// DB: SEMPRE DELETE + INSERT
// Verificar estado ANTES de editar arquivos

// JSON2Video: só propriedades confirmadas pela doc
// zoom + pan (não style:"kenburns")
// type:"text" style:"001" (não type:"html" com fade_in)
// fill:"cover" para imagens preencherem o canvas
// resolution:"custom" + width/height explícitos
// quality: "low"|"medium"|"high" (não número)
```

---

## 📁 Arquivos Críticos

```
server/
├── _core/router.ts         ← publishToGoogle: Display/Video/PMax; generateCreativeVideo
├── imageGeneration.ts      ← CF FLUX + JSON2Video (vídeo+voz); effectiveFormat
├── ai.ts                   ← fallback feed→story/square após geração paralela
├── paymentService.ts       ← Asaas Pix+Cartão
└── db.ts                   ← PLAN_LIMITS

client/src/pages/
├── CampaignResult.tsx      ← overlay; video preview; audit; showOverlay toggle
├── GoogleCampaignCreator.tsx ← Display/Video/PMax campos; imagePath auto
├── TikTokCampaignCreator.tsx ← videoUrl/coverImageUrl automáticos
├── CheckoutAsaas.tsx       ← Pix|Cartão
└── Billing.tsx             ← "Assinar" → gateway
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
TIKTOK_ACCESS_TOKEN + TIKTOK_ADVERTISER_ID  ← usuário configurar
```

---

## 📋 Pendências

| Prioridade | Item | Responsável |
|---|---|---|
| 🔴 | Meta Token — reconectar antes 2026-05-25 | Michel |
| 🔴 | Meta App — Ads Library API `code=10` | Aguardando Facebook |
| 🔴 | TikTok token — configurar no painel | Michel |
| 🟡 | Testar vídeo com narração PT-BR em produção | Teste |
| 🟡 | Testar Asaas cartão em produção | Teste |
| 🟡 | Google negativeKeywords extrair do aiResponse | Dev |
| 🟡 | FAL.AI — adicionar Render no allowlist | Michel |
| 🟢 | Mercado Livre API | Aguardando credenciais |
| 🟢 | ZAP Imóveis feed XML | Backlog |

---

## 🧭 Regra: "Qual o próximo passo?"

Sempre orientar por este documento seguindo a ordem:
1. 🔴 Pendências críticas (bloqueiam receita ou funcionamento)
2. 🟡 Aumentam o score de prontidão
3. 🟢 Melhorias de qualidade

Formato: score atual → 3 itens em ordem de impacto → o que precisa para resolver.

---

## 💡 Prompt de Início de Sessão

```
Leia docs/SYSTEM_MEMORY.md do MecProAI antes de começar.
Stack: React+Vite+tRPC+PostgreSQL. Deploy: Render.com.
Último commit: d460b2d. Michel — Balneário Camboriú/SC.
Score atual: ~82%. Prioridade: Meta Token (exp 25/05) + TikTok token.
```
