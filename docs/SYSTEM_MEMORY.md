# 🧠 MecProAI — Memória Técnica do Sistema

> **Para Claude:** Leia este arquivo NO INÍCIO de cada sessão antes de qualquer análise.
> Atualizar após cada sessão significativa.
>
> **Última atualização:** 2026-05-03 (sessão 8)

---

## 🏗️ Stack & Deploy

| Camada | Tecnologia | Detalhe |
|---|---|---|
| Frontend | React + Vite + TypeScript | `/client/src/` |
| Backend | Node.js + Express + tRPC | `/server/_core/router.ts` (>10k linhas) |
| Banco | PostgreSQL + Drizzle ORM | Render.com managed DB |
| Auth | JWT + Google OAuth | `/server/_core/context.ts` |
| IA Principal | Google Gemini (5 chaves) | fallback: Groq → Genspark → mock |
| Deploy | Render.com | build: `npm run build`, start: `tsx server/_core/index.ts` |
| Repo | GitHub | `github.com/Moliver63/mecpro.git` |
| URL Produção | `https://www.mecproai.com` | |
| Último commit | `a4dbe26` | fix overlay + prompt imagem |

---

## ⚡ Estado Atual (2026-05-03 — sessão 8)

### Integrações
| Serviço | Status | Detalhe |
|---|---|---|
| Meta Ads Library API | ❌ `code=10` | Aguardando aprovação Facebook |
| Meta Token | ✅ Válido até 2026-05-25 | Reconectar antes de expirar |
| Gemini API | ✅ Operacional | 5 chaves, reset 00:00 UTC |
| Groq API | ✅ Fallback | llama-3.3-70b-versatile |
| Google Ads API | ✅ `/v19/` | Funciona para Search |
| Asaas (Pix + Cartão) | ✅ Completo | QR Code direto + cartão CREDIT_CARD |
| HuggingFace imagens | ❌ DESABILITADO | Todos modelos mortos (410/404/400) |
| HeyGen imagens | ❌ DESABILITADO | /v2/image.generate 404 permanente |
| Genspark imagens | ❌ fetch failed | Inacessível do Render |
| Pollinations.AI | ✅ ÚNICO gerador ativo | download → Cloudinary → URL estável |
| Cloudflare Workers AI | ⏳ Aguardando config | Account ID: 5ff9748220abb541704e480a75d33a09 — falta API Token |
| FAL.AI | ⏳ Aguardando liberação | Chave: aab5a9dc...:a40c3d66... — "Host not in allowlist" |

### Pipeline de Geração de Imagens (estado real)
```
Fluxo atual:
  HF → null imediato → Genspark → falha → Pollinations → Cloudinary ✅

Prompt: noTextPrefix NO INÍCIO + noTextFix repetido 2x + negative prompt na URL
Parâmetros Pollinations: notext=true&enhance=true&negative=text,words,letters...
3 formatos paralelos: feed(1080×1350) + stories(1080×1920) + square(1080×1080)
Custo: R$0,00 (Pollinations grátis + Cloudinary free 25GB/mês)

PROBLEMA CONHECIDO: Pollinations ainda gera texto alucinado às vezes
SOLUÇÃO PARCIAL: Overlay CSS gradiente escuro cobre 70% da imagem
SOLUÇÃO DEFINITIVA: Implementar Cloudflare Workers AI (FLUX real, sem texto)
```

### Overlay de Texto — CampaignResult.tsx
```
Implementado: gradiente bottom-to-top (0.85→0.55→0.15→transparent)
Cobre: 70% da imagem — esconde texto alucinado gerado pelo modelo
Exibe: headline (branco bold) + copy/hook (stories) + CTA (botão azul Meta)
Toggle: "👁 Com texto" / "🖼 Só imagem" no topo dos criativos
Tamanho: stories=19px headline, feed/square=14px
```

### Estado do ML
```
learning_base:    ✅ 286 amostras (cosméticos), 24 (academia), 24 (imobiliário)
winner_patterns:  ✅ 72 padrões (DELETE+INSERT funcionou)
campaign_scores:  ✅ auto-score funcionando (userId fallback via projects)
ml_dataset:       ✅ sendo populado
Score automático: ✅ "Score ML calculado automaticamente" confirmado nos logs
```

### Auditoria de Publicação nas 3 Plataformas
```
META ADS:   ✅ COMPLETO
  Envia: objective, adSets, creatives, imagens, vídeo, placements,
         segmentação, pixels, leads, feedImageUrl/storyImageUrl/squareImageUrl
  Limitação: imagem gerada pela IA precisa ser uploadada manualmente
             (Meta exige imageHash, não URL direta da Cloudinary)

GOOGLE ADS: ⚠️ PARCIAL
  Envia: campaignName, type, biddingStrategy, budget, dates, locations,
         keywords, headlines[3], descriptions[2], finalUrl
  Funciona: apenas SEARCH
  Bloqueado: Display/Video/Performance Max (exigem assets visuais)
  Faltando: negativeKeywords nunca preenchido pela IA

TIKTOK ADS: 🔴 CRÍTICO
  Envia: campaignName, objective, budget, placements, ageMin/Max, adText, CTA
  PROBLEMA: videoUrl sempre vazio "" — TikTok exige vídeo obrigatoriamente
  PROBLEMA: coverImageUrl sempre vazio ""
  feedImageUrl/storyImageUrl NÃO são passados para o TikTok
  Resultado: publicação falha sem vídeo
```

---

## 🐛 Bugs Resolvidos (sessão 8)

#### BUG-036: Botão "Pagar com Pix" duplicado na Billing.tsx
- **Solução:** Botões reestruturados → "Assinar" simples; método escolhido no checkout
- **Commit:** 8d4881b

#### BUG-037: Asaas cartão de crédito não existia
- **Solução:** `CreateSubscriptionData` com `paymentMethod + card`; rota CREDIT_CARD usa `creditCard + creditCardHolderInfo`; aprovação → redirect `/my-subscription?success=1`
- **Arquivo:** `server/paymentService.ts`, `server/_core/router.ts`
- **Commit:** ad286ef

#### BUG-038: CheckoutAsaas seletor Pix/Cartão não aparecia
- **Causa:** Seletor inserido fora do bloco JSX correto — React não renderizava
- **Solução:** Reescrita completa do CheckoutAsaas.tsx com seletor visual Pix|Cartão correto
- **Commit:** a82a005

#### BUG-039: Pessoa sem cabeça na imagem gerada
- **Causa:** Pollinations gerava composição livre cortando o corpo
- **Solução:** compositionFix por formato: stories="full body head to toe", feed="face always visible"
- **Arquivo:** `server/imageGeneration.ts` — `inferPrompt()`
- **Commit:** 9858ff8

#### BUG-040: Texto alucinado em inglês/nonsense na imagem
- **Causa:** Pollinations ignora `notext=true`; modelo FLUX gera texto inventado
- **Solução em camadas:**
  1. noTextPrefix no INÍCIO do prompt (maior peso)
  2. noTextFix repetido 2x (início e fim)
  3. `negative=text,words,letters...` na URL do Pollinations
  4. Overlay CSS gradiente 85%→55%→15% cobre área onde texto aparece
- **Commit:** a4dbe26

#### BUG-041: regenerateCreativeImage não chegava ao Pollinations
- **Causa:** Usava detecção manual de provider — parava no Genspark
- **Solução:** Config inline idêntica ao ai.ts; generateAdImage inclui cascata completa
- **Arquivo:** `server/_core/router.ts` — `regenerateCreativeImage`
- **Commit:** 8a31162

---

## 🐛 Bugs Anteriores (sessões 1-7)
Ver commits anteriores. Principais:
- BUG-001/002: Rules of Hooks; optional chaining em hooks
- BUG-020/021: ON CONFLICT sem constraint; Google Ads /v19_1/
- BUG-025/026: Modal editar M2; TabRanking crash
- BUG-027-035: Pollinations→Cloudinary; HF desabilitado; Asaas QR Code; isSuspended

---

## 🏛️ Decisões de Arquitetura

### DA-001: Layout sem hook tRPC
- Layout.tsx NÃO faz chamadas tRPC; usa `sessionStorage` para ui_visibility

### DA-002: Pipeline M2 (7 camadas)
```
Camada 1-3: Meta Ads API     ← BLOQUEADA (code=10)
Camada 4:   Instagram/Nome   ← Funciona parcialmente
Camada 5:   Web Scraping     ← HF Space down
Camada 6:   SEO/IA (Gemini)  ← ✅ PRINCIPAL FALLBACK ATIVO
Camada 7:   Mock por Nicho   ← Último recurso
```

### DA-004: Payment Gateway
```
Asaas:
  - Pix: nextDueDate=hoje → QR Code imediato → retorna {pixCode, pixQr}
  - Cartão: billingType=CREDIT_CARD + creditCard + creditCardHolderInfo
  - sendPaymentByPostalService: false
  - Checkout: /checkout/asaas?plan=X&billing=Y

Stripe:
  - Cartão + Pix opcional via checkout hospedado

Billing.tsx: gateway=asaas → botão "Assinar" → /checkout/asaas
             gateway=stripe → botão "Assinar" → Stripe checkout
```

### DA-005: ML Pipeline
```
DELETE + INSERT em TUDO (não ON CONFLICT):
  winner_patterns, campaign_scores, ml_dataset, syncMetaCampaignMetrics
```

### DA-013: Pipeline de imagem
```
HF/HeyGen/Genspark: DESABILITADOS
Pollinations: ÚNICO ATIVO
  → download Buffer → Cloudinary upload → URL estável
  → notext=true&enhance=true&negative=text,words...
  → prompt: noText no INÍCIO e FIM + compositionFix por formato

Próximo passo: Cloudflare Workers AI (FLUX real)
  Account ID: 5ff9748220abb541704e480a75d33a09
  Token: pendente (Michel vai gerar com Workers AI → Read, No expiration)
  Modelo: @cf/black-forest-labs/flux-1-schnell
  Free: 10.000 neurons/dia (~30 imagens) → $0.011/1k neurons acima
```

### DA-014: Overlay de texto nas imagens (NOVO)
```
Implementado em CampaignResult.tsx sobre cada criativo com imagem:
  - Gradiente: rgba(0,0,0,0.85) → 0.55 → 0.15 → transparent
  - Cobre 70% da imagem (esconde texto alucinado do modelo)
  - Exibe: headline + copy/hook (stories) + CTA (botão azul)
  - Toggle: "👁 Com texto" / "🖼 Só imagem"
  - State: showOverlay (padrão: true)
```

### DA-015: Auditoria de publicação (NOVO — sessão 8)
```
Meta:   ✅ completo — todos os campos enviados corretamente
Google: ⚠️ apenas SEARCH funciona; Display/Video bloqueados no frontend
TikTok: 🔴 videoUrl sempre vazio — publicação falha sem vídeo
         coverImageUrl sempre vazio — feedImageUrl/storyImageUrl não passados
```

---

## 📐 Padrões Estabelecidos

### Hooks React
```tsx
// ❌ NUNCA: (trpc as any).x?.y?.useMutation?.()
// ✅ SEMPRE: trpc.x.y.useMutation()
// ✅ useEffect em vez de onSuccess (React Query v5)
useEffect(() => { if (data?.field) doSomething(data) }, [data])
```

### DB — INSERT padrão
```sql
-- SEMPRE: DELETE + INSERT (nunca ON CONFLICT)
DELETE FROM tabela WHERE campaign_id = $1;
INSERT INTO tabela (...) VALUES (...);
```

### Edição de arquivos
```python
# Verificar estado ANTES de editar
with open('file.tsx') as f: c = f.read()
print(c.count('variavel'))  # deve ser 1, não 0 ou 2
```

---

## 📁 Mapa de Arquivos Críticos

```
server/
├── _core/
│   ├── router.ts              ← listUserBalances: isSuspended=false
│   │                            regenerateCreativeImage: config inline com Pollinations
│   │                            createCheckout: paymentMethod + card (Zod schema)
│   ├── adminIntelligenceRouter.ts ← ML; DELETE+INSERT
│   └── migrations.ts          ← ai_cache; client_profiles; constraints ML
├── ai.ts                      ← auto-score userId fallback; DELETE+INSERT ML
├── imageGeneration.ts         ← HF/HeyGen desabilitados; Pollinations→Cloudinary
│                                noTextPrefix início; noTextFix 2x; compositionFix
│                                negative prompt na URL; notext=true&enhance=true
├── paymentService.ts          ← Asaas: Pix(QR direto) + Cartão(CREDIT_CARD)
└── db.ts                      ← PLAN_LIMITS; checkPlanLimit

client/src/
├── pages/
│   ├── CampaignResult.tsx     ← overlay gradiente texto; toggle showOverlay
│   │                            4499 linhas; handlePublish envia todos os campos Meta
│   ├── Billing.tsx            ← botão "Assinar" → /checkout/asaas ou Stripe
│   ├── CheckoutAsaas.tsx      ← seletor Pix|Cartão; form cartão completo; validação
│   ├── GoogleCampaignCreator.tsx ← buildAdsFromCreatives; apenas SEARCH funciona
│   ├── TikTokCampaignCreator.tsx ← videoUrl sempre vazio (PENDENTE CORREÇÃO)
│   ├── CompetitorAnalysis.tsx ← Modal editar: raiz z-index 2000
│   └── AdminCampaignIntelligence.tsx ← ErrorBoundary 4 abas
├── components/competitors/
│   ├── competitorForms.tsx    ← EditCompetitorForm tipado
│   └── competitorCards.tsx    ← qualityMap badges
├── hooks/usePlanLimit.ts      ← PLAN_LIMITS espelho; hasTikTok
└── App.tsx                    ← rota /checkout/asaas registrada
```

---

## 🔑 Variáveis de Ambiente

```bash
DATABASE_URL / JWT_SECRET / SESSION_SECRET
GEMINI_API_KEY (+ KEY2..5) / GROQ_API_KEY
META_APP_ID / META_APP_SECRET
GOOGLE_ADS_CLIENT_ID / CLIENT_SECRET / DEVELOPER_TOKEN=saxm5SH_...
STRIPE_SECRET_KEY / ASAAS_API_KEY / ASAAS_WEBHOOK_TOKEN
HUGGINGFACE_API_KEY  ← tem chave mas HF desabilitado para imagens
CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
APP_URL=https://www.mecproai.com
IMAGE_PROVIDER=huggingface  ← valor no env; Pollinations é o real ativo
# PENDENTE ADICIONAR NO RENDER:
CLOUDFLARE_ACCOUNT_ID=5ff9748220abb541704e480a75d33a09
CLOUDFLARE_API_TOKEN=<pendente — Michel vai gerar>
```

---

## 📋 Pendências

| Prioridade | Item | Status |
|---|---|---|
| 🔴 | TikTok: videoUrl vazio → publicação falha | Corrigir TikTokCampaignCreator + avisar que exige vídeo |
| 🔴 | Meta App — permissão Ads Library API | Aguardando aprovação Facebook |
| 🔴 | Meta Token — reconectar antes 2026-05-25 | Ação do usuário |
| 🔴 | Cloudflare Workers AI — implementar | Michel gera token Workers AI → Read; eu implemento |
| 🟡 | Google: Display/Video/PMax bloqueados | Implementar asset upload para desbloquear |
| 🟡 | Google: negativeKeywords nunca preenchido | Extrair do aiResponse da campanha |
| 🟡 | Pollinations: texto alucinado ainda aparece | Solução definitiva: Cloudflare Workers AI |
| 🟡 | FAL.AI: liberação de domínio | Michel adiciona Render no allowlist do dashboard FAL |
| 🟢 | Mercado Livre API | Aguardando credenciais |
| 🟢 | ZAP Imóveis — feed XML | Não implementado |

---

## 💡 Prompt de Início de Sessão

```
Leia docs/SYSTEM_MEMORY.md do MecProAI antes de começar.
Stack: React+Vite+tRPC+PostgreSQL. Deploy: Render.com.
Último commit: a4dbe26. Michel — Balneário Camboriú/SC.
PRIORIDADE: TikTok videoUrl vazio + Cloudflare Workers AI.
```
