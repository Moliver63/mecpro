# 🧠 MecProAI — Memória Técnica do Sistema

> **Para Claude:** Leia este arquivo NO INÍCIO de cada sessão antes de qualquer análise.
> **Última atualização:** 2026-06-22 (sessão 20)

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
| Último commit | `5b13463` | budget mínimo viável na geração |

---

## 📊 Score de Prontidão (sessão 19)

**Score geral: ~96%** ← subiu de 95%

| Módulo | Score | Delta |
|---|---|---|
| Infraestrutura | 98% | — |
| Meta Ads | **98%** | ⬆️ description, budget/adSet, WA fixes |
| Geração de Campanhas IA | 96% | — |
| Imagens | 94% | — |
| Copies | **97%** | ⬆️ description campo correto |
| Financeiro | 87% | — |
| ML / Inteligência | 92% | — |
| Google Ads | 78% | — |
| TikTok Ads | 70% | — |

---

## ⚡ Estado das Integrações

| Serviço | Status | Detalhe |
|---|---|---|
| Cloudflare Workers AI | ✅ ATIVO + RAG | FLUX.1-schnell; 10k neurons/dia; reset 00:00 UTC |
| Pixabay | ✅ ATIVO | CC0; re-hospeda Cloudinary antes Meta |
| Google Images | ✅ ATIVO | CC0 |
| Meta Token | ✅ Ativo | Válido até 06/07/2026 |
| Google Ads | ✅ Search+Display+Video+PMax | |
| TikTok | ⚠️ Parcial | Token não configurado no Render |
| Asaas | ✅ Pix+Cartão | |
| Gemini | ✅ 5 chaves | fallback: Groq |
| Groq/Llama 3.3 70B | ✅ Fallback | |

---

## 🎯 Meta Ads — Estado Atual (sessão 19)

### Fluxo WhatsApp

```
WA vinculado no Meta Business (_connectedPhone preenchido):
  → OUTCOME_LEADS + CONVERSATIONS
  → whatsapp_phone_number + destination_type: WHATSAPP

WA NÃO vinculado (mais comum):
  → OUTCOME_LEADS + LINK_CLICKS
  → link_data.link = wa.me diretamente
  → SEM whatsapp_phone_number (erro 1487246)
  → SEM destination_type: WHATSAPP (erro 2490408)

DETECÇÃO: _connectedPhone via Graph API whatsapp_connected_id
```

### Erros Meta resolvidos (sessões 18+19)

| Erro | Causa | Fix |
|---|---|---|
| 2061015 | wa.me em link_data.link | safeLink() usa website/FB |
| 2061015 | linkUrl=null | fallback obrigatório |
| 2061015 | OUTCOME_LEADS + FB page link | mensagem clara: use formulário/WA/site |
| 1487246 | whatsapp_phone_number sem vínculo | só envia quando _connectedPhone |
| 2490408 | CONVERSATIONS sem WA vinculado | LINK_CLICKS quando hasLinkedWA=false |
| 1885272 | budget < R$5.10 | mínimo R$6 quando elevado automaticamente |
| Graph 400 | phone_number campo inválido | removido frontend+backend |

### Campo description (IMPLEMENTADO)

```
link_data.description = shortDescription (max 30 chars)
video_data.link_description = shortDescVideo (max 30 chars)

buildShortDesc() — prioridade:
  1. adCopy.feed.description (campo IA dedicado)
  2. selectedDescription
  3. auditedHeadline.slice(0, 30) ← fallback seguro (nunca texto longo)

NUNCA usa: copy completa, hook, ou primaryText como descrição
```

### Objetivo da campanha

```
correctedObjective — independe de WhatsApp vinculado:
  imoveis/saude/servicos/academia → "leads"
  ecommerce/moda/alimentacao → "sales"
  b2b/infoprodutos → "leads"
  sem segmento → "leads" (padrão global)

resolveObjectiveAndGoal:
  leads + WA vinculado   → OUTCOME_LEADS + CONVERSATIONS
  leads + WA não vinc.   → OUTCOME_LEADS + LINK_CLICKS
  leads + site + pixel   → OUTCOME_LEADS + OFFSITE_CONVERSIONS
  leads + site sem pixel → OUTCOME_LEADS + LINK_CLICKS
  sales + pixel          → OUTCOME_SALES + OFFSITE_CONVERSIONS
  sales sem pixel        → OUTCOME_TRAFFIC + LANDING_PAGE_VIEWS
```

### Budget validation (CORRIGIDO sessão 19)

```
BACKEND: valida budget do adSet ATUAL (input.adSetIndex), não todos
  currentAdSet = allAdSets[input.adSetIndex]
  currentBudget extraído do rawBudget: "R$ 13/dia (100%)" → 13
  se currentBudget < R$5,11 → erro específico do conjunto

FRONTEND pre-flight (antes do upload):
  soma rawBudget dos adSets selecionados
  se total < 5.11 × count → toast + return (sem upload)

ERRO ANTERIOR: contava c.adSets.length (todos da campanha = 4)
  mesmo ao publicar 1 adSet bloqueava "Com 4 conjunto(s)"
```

### Placements

```
facebook_positions: [feed, story, marketplace, search]
instagram_positions: [stream, story, explore, reels]
Excluídos: audience_network, threads, whatsapp_status, messenger_stories
```

### Botão Site/landing page

```
userChoseDestinationRef = true no onClick
useEffect só aplica padrão quando ref=false (primeira abertura do modal)
Ref reseta quando modal fecha
```

---

## 🖼️ Imagens — Estado Atual

```
1. Cloudflare FLUX → RAG → aprovado → Cloudinary
   (quota: 10k neurons/dia; reset 00:00 UTC = 21h BRT)
2. Pixabay CC0 → Cloudinary rehost → RAG
3. Google Images CC0
4. Pollinations / Mock

RAG thresholds: confidence=0.50, product_match=0.40
Pool: lazy init getImageDbPool()/getRagPool()
```

---

## 🐛 Bugs Resolvidos (sessão 19)

| Bug | Fix | Commit |
|---|---|---|
| Budget "Com 4 conjunto(s)" ao publicar 1 | valida adSet atual não todos | `c741211` |
| Pre-flight não bloqueava antes upload | suggestedBudgetDaily=null; agora soma rawBudget dos adSets | `7bd1709` |
| 8 chamadas simultâneas budget error | return antes do loop | `78a4542` |
| Campo Descrição com texto completo | buildShortDesc() garante ≤30 chars | `d5d2513` |
| Descrição vazia em anúncio com vídeo | link_description no video_data | `344b7a3` |
| 2061015 OUTCOME_LEADS sem destino | mensagem clara 3 opções | `4b3b5c6` |
| Botão WA abria Facebook | wa.me como link quando não vinculado | `319678b` |

---

## 🐛 Bugs Resolvidos (sessão 20 — 22/06)

| Bug | Causa raiz | Fix | Commit |
|---|---|---|---|
| Cards do carrossel com "Insira a descrição" vazio | `child_attachments` usava `description=""` para todos exceto card 1 | `getCardCopy(idx)` mapeia cada card ao `creative[idx%length]` com headline+desc próprios | `dc3a05b` |
| Carrossel com headline repetido em todos os cards | `name` era `selectedHeadline+(idx)` igual para todos | Cada card recebe headline único do criativo correspondente | `dc3a05b` |
| Upload 10 fotos mas só 4 copies → cards 5-10 repetidos | Rotação `idx%4` repetia copies idênticas | Cards extras recebem variação de ângulo (Saiba mais, Confira, Oportunidade...) | `eb87b66` |
| **Falso positivo de texto descartava fotos REAIS** | Heurística `highFreqRatio>0.08` marcava fotos detalhadas (praia/prédio) do Pixabay/FLUX como alucinação → retries infinitos → timeout | Threshold `0.08→0.18`, diff `180→200`: só texto MUITO denso dispara | `31e8ab5` |
| Mensagem de budget pouco clara | Só dizia mínimo por adSet | Calcula e informa orçamento mensal mínimo exato (`META_MIN × nAdSets × 30 × 1.1`) | `31e8ab5` |
| **adSets gerados abaixo do mínimo Meta** | Orçamento dividido em 4 adSets (25% cada) sem garantir R$5,11/dia/adSet → R$4,25/dia | Na geração: `MIN_VIABLE_MONTHLY = R$5,11×4×30×1,1 ≈ R$675`; eleva budget automaticamente se abaixo | `5b13463` |

### Detalhes técnicos — sessão 20

**Carrossel (commit `dc3a05b`, `eb87b66`):**
- `getCardCopy(idx)` em `router.ts`: mapeia card → `creativeList[idx % nCreatives]`
- Headline max 40 chars, description max 30 chars (limites Meta)
- Cards repetidos (idx ≥ nCreatives) recebem sufixo de variação para não duplicar
- Prompt IA atualizado: HEADLINE e DESCRIPTION únicos entre os 4 criativos
- `MAX_META_CAROUSEL_ITEMS = 10` no frontend (já existia)

**Detecção de texto em imagem (commit `31e8ab5`):**
- `imageHasHallucinatedText()` em `imageGeneration.ts`
- Primário: Google Vision API (se `GOOGLE_API_KEY` configurado)
- Fallback heurístico: analisa terço inferior (65%-90% do buffer), conta transições de byte > 200
- Threshold 0.18 — fotos reais ficam em 0.08-0.12, texto alucinado real passa de 0.20
- LIÇÃO: heurística agressiva demais causa mais dano (descarta foto boa) que benefício

**Budget mínimo viável (commit `5b13463`):**
- `generateCampaign()` em `ai.ts`
- `MIN_VIABLE_MONTHLY = Math.ceil(5.11 × 4 × 30 × 1.1)` ≈ R$675
- Se `input.budget < MIN_VIABLE_MONTHLY` → eleva para o mínimo + loga warning
- `suggestedBudgetMonthly` salva `effectiveBudget` (corrigido), não o input bruto
- Campanhas geradas ANTES deste fix mantêm budget antigo — precisam regerar ou ajustar Módulo 4

---

## 📋 Pendências

| Prioridade | Item | Responsável |
|---|---|---|
| 🔴 | Vincular WhatsApp 47999465824 à Página 1086894187837842 | Michel |
| 🔴 | Adicionar website no perfil projeto 41 (Villa Serena) | Michel |
| 🟡 | TikTok token no Render | Michel |
| 🟡 | Gemini chaves 2+3 em projetos separados | Michel |
| 🟡 | syncMetaCampaignMetrics (avgScore=100 sem CTR real) | Dev |
| 🟢 | Campanhas geradas antes de `5b13463` têm budget antigo — regerar ou ajustar Módulo 4 | Michel |
| 🟢 | (RESOLVIDO) Budget mínimo viável agora garantido na geração `5b13463` | — |

---

## 💡 Prompt de Início de Sessão

> Cole isso no início de cada nova sessão com Claude para garantir contexto completo.

```
Antes de qualquer coisa, leia o arquivo docs/SYSTEM_MEMORY.md do repositório
MecProAI (github.com/Moliver63/mecpro.git) — ele contém o estado técnico
completo do sistema, bugs resolvidos, regras críticas e pendências.

Stack: React 19 + Vite + TypeScript / Node.js + Express + tRPC / PostgreSQL + Drizzle / Render.com
Repo local: /home/claude/mecpro (se já clonado na sessão)
Último commit: 9b327ea | Score: ~96% | Sessão: 20 (22/06/2026)

ARQUIVOS CRÍTICOS (verificar antes de editar):
- server/schema.ts          ← fonte da verdade do banco (SEMPRE consultar antes de query SQL)
- server/_core/router.ts    ← backend tRPC completo
- server/_core/index.ts     ← boot, crons ML, webhooks
- server/ai.ts              ← geração de campanhas (Gemini → Groq)
- server/imageGeneration.ts ← FLUX → Pixabay → Google
- client/src/pages/CampaignResult.tsx ← publicação Meta

REGRAS CRÍTICAS — NÃO VIOLAR:

1. BUDGET:
   - Backend valida adSet ATUAL (input.adSetIndex), nunca todos
   - Frontend pre-flight soma rawBudget dos adSets selecionados
   - Mínimo Meta: R$5,11/adSet/dia
   - Geração garante MIN_VIABLE_MONTHLY ≈ R$675 (4 adSets × R$5,11 × 30 × 1,1)

2. CARROSSEL:
   - getCardCopy(idx) → creativeList[idx % nCreatives]
   - Headline max 40 chars, description max 30 (limites Meta)
   - Cards extras (idx ≥ nCreatives) recebem variação de ângulo, nunca répetidos

3. DETECÇÃO DE TEXTO EM IMAGEM:
   - Threshold heurístico: 0.18 (NÃO reduzir — 0.08 causava falso positivo em fotos reais de praia/prédios)
   - diff > 200 (NÃO reduzir para 180)

4. WHATSAPP:
   - WA vinculado → OUTCOME_LEADS + CONVERSATIONS + whatsapp_phone_number
   - WA não vinculado → OUTCOME_LEADS + LINK_CLICKS + wa.me (sem phone_number)

5. DESCRIPTION:
   - Prioridade: ai.description ≠ headline | CTA label | 1ª frase hook | ângulo | VAZIO
   - NUNCA repetir headline como description
   - NUNCA usar texto principal (copy) como description
   - Max 30 chars

6. REGEX — esbuild:
   - NUNCA usar newline literal em regex: /[,\n\r]/
   - CORRETO: .split(",")[0].split("\n")[0]

7. ANTI-ALUCINAÇÃO:
   - Verificar schema.ts ANTES de qualquer query SQL
   - Tabela: api_integrations (NÃO integrations)
   - Campo: provider (NÃO platform), accessToken IS NOT NULL (NÃO isActive)
   - Import: getPool() direto (NÃO db.getPool())
   - Path adminIntelligenceRouter: "./adminIntelligenceRouter" (NÃO "./_core/...")

PENDÊNCIAS ABERTAS:
🔴 Vincular WhatsApp 47999465824 à Página 1086894187837842 no Meta Business
🔴 Adicionar website no perfil projeto 41 (Villa Serena) — websiteUrl = null
🟡 TikTok token no Render
🟡 Gemini chaves 2+3 em projetos Google separados
🟡 syncMetaCampaignMetrics para avgScore real (atualmente 100 sem CTR)
🟡 Campanhas geradas antes de 5b13463 com budget antigo → regerar ou ajustar Módulo 4

CUSTOS REAIS (logs produção):
- Gemini+Groq: US$0,0021/campanha
- Imagens: R$0 (Pixabay/Google fallback gratuito)
- Margem: >99% em qualquer escala até 1M clientes
```
