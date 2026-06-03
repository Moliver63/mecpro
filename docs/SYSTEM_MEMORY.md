# 🧠 MecProAI — Memória Técnica do Sistema

> **Para Claude:** Leia este arquivo NO INÍCIO de cada sessão antes de qualquer análise.
> **Última atualização:** 2026-06-03 (sessão 17)

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
| Último commit | `c9c7a88` | OUTCOME_LEADS como padrão global |

---

## 📊 Score de Prontidão (sessão 17)

**Score geral: ~93%** ← subiu de 89% (Meta Ads alinhado, imagens, copies)

| Módulo | Score | Delta |
|---|---|---|
| Infraestrutura | **97%** | — |
| Financeiro | 87% | — |
| ML / Inteligência | **92%** | — |
| Meta Ads | **96%** | ⬆️ +8% OUTCOME_LEADS, placements, WhatsApp, auditoria |
| Geração de Campanhas IA | **96%** | — |
| Imagens | **94%** | ⬆️ +12% RAG, Pixabay, Google Images, Cloudinary |
| Análise de Concorrentes | 78% | — |
| TikTok Ads | 70% | — |
| Google Ads | 78% | — |

---

## ⚡ Estado das Integrações

| Serviço | Status | Detalhe |
|---|---|---|
| Cloudflare Workers AI | ✅ ATIVO + RAG | FLUX.1-schnell; 10k neurons/dia; RAG anti-alucinação |
| Pixabay | ✅ ATIVO | CC0; 100 req/min; re-hospeda Cloudinary antes Meta |
| Google Images | ✅ ATIVO | CC0; 100 req/dia; GOOGLE_API_KEY + GOOGLE_CSE_ID |
| JSON2Video | ✅ ATIVO | MP4 + voz PT-BR Azure; 600 créditos |
| BrasilAPI CNPJ | ✅ ATIVO | 14 campos; gratuita; server-side via tRPC |
| Meta Token | ✅ Ativo | Válido até 06/07/2026 |
| Meta Ads Library | ❌ code=10 | Aguardando Facebook |
| Google Ads | ✅ Search+Display+Video+PMax | |
| TikTok | ⚠️ Parcial | Token não configurado no Render |
| Asaas | ✅ Pix+Cartão | |
| Gemini | ✅ 5 chaves | Cache RAM+DB |
| Groq/Llama 3.3 70B | ✅ Fallback + modo direto | Round-robin 10 slots |

---

## 🎯 Meta Ads — Estado Atual (sessão 17)

### Objetivo da campanha (CORRIGIDO)

```
ANTES: todas as campanhas = OUTCOME_TRAFFIC
DEPOIS: objetivo por segmento + input do usuário

Fluxo:
  Frontend → publishPayload.objective (passado explicitamente)
  Backend  → input.objective || c.objective || "leads"
  correctedObjective → por segmento (independente de WhatsApp)
  resolveObjectiveAndGoal → OUTCOME_LEADS + optimization_goal

Tabela final:
  imoveis_venda/locacao  → OUTCOME_LEADS + CONVERSATIONS (WhatsApp)
  imoveis sem WhatsApp   → OUTCOME_LEADS + LINK_CLICKS
  saude/servicos/auto    → OUTCOME_LEADS + CONVERSATIONS
  ecommerce/moda         → OUTCOME_SALES
  b2b/infoprodutos       → OUTCOME_LEADS
  Default global         → OUTCOME_LEADS (era OUTCOME_TRAFFIC)
```

### Placements (CORRIGIDO)
- Advantage+: publisher_platforms explícito [facebook+instagram]
- Posições seguras: facebook[feed,story,marketplace,search] + instagram[stream,story,explore,reels]
- Excluídos: audience_network, threads_feed, whatsapp_status, messenger_stories

### WhatsApp (IMPLEMENTADO)
- buildWhatsAppMessage(): mensagem pré-configurada por segmento/produto/CTA
- wa.me não mais usado como link_data.link (Meta rejeita) → usa websiteUrl ou página FB
- Aviso na UI quando página sem WhatsApp vinculado
- Aviso quando websiteUrl null no perfil

### CTA por segmento (IMPLEMENTADO)
- normalizeMetaCta agora recebe segment como 3° parâmetro
- imoveis_locacao → WHATSAPP_MESSAGE (não mais BUY_NOW)
- SEGMENT_DEFAULT_CTA: mapa completo por segmento

### Auditoria de criativos (NOVO — adAudit.ts)
- META_LIMITS: headline 40, primaryText 125, description 30
- sanitizeText/sanitizeHeadline: remove zero-width chars, encoding
- auditAndFixCopy(): 8 validações auto-corrige antes de enviar
- auditImageForMeta(): URL vazia, bytes, ratio, hotlink
- Integrado no publishToMeta: copy corrigida antes do Meta

---

## 🖼️ Imagens — Estado Atual (sessão 17)

### Fluxo de fallback
```
1. Cloudflare FLUX → RAG (Google Vision TEXT_DETECTION) → rejeita se texto
2. Pixabay foto (CC0) → re-hospeda Cloudinary → approved_images
3. Pixabay vídeo thumbnail
4. Google Images (CC0/domínio público)
5. Pollinations
6. Mock
```

### RAG Anti-alucinação (imageRAG.ts)
- Google Vision: TEXT_DETECTION, LABEL_DETECTION, SAFE_SEARCH, IMAGE_PROPERTIES
- 7 scores: quality, product_match, campaign_match, branding, visual_similarity, conversion, overall
- Thresholds: confidence=0.75, product=0.70, branding=0.65
- approved → salva em `approved_images`; rejected → fallback Pixabay
- `image_rag_logs`: auditoria completa por decisão
- Dynamic import para evitar "not defined" em runtime tsx

### Banco de imagens aprovadas (approved_images)
- Se ≥3 imagens no segmento+formato → reutiliza aleatoriamente (diversidade garantida)
- Economiza neurons Cloudflare e quota Pixabay

### productContext nas imagens
- generateAdImage recebe productName/productService/niche/city
- getPixabayQuery usa COPY_TO_VISUAL (22+ padrões) para query específica
- Google Images usa productName direto na query

---

## ✍️ Copies — Estado Atual (sessão 17)

### Alinhamento Módulo 1 → Módulo 4
- sanitizeService(): remove endereço/horário/CEP do productService antes do prompt
- prodAnchor: productName, Differentials (200c), ProofPoints (200c), CTA, City, mainObjections, targetAudience
- 4 copies por funil: TOF=descoberta, MOF=diferencial, BOF=urgência, SCALE=prova social
- Headlines: instrução 25-40 chars obrigatório, exemplos ruins/bons

### Fallback Groq
- generateCampaignPart: prompt expandido com âncora obrigatória do módulo 1
- enrichCreativesWithScoresAndImages: "input is not defined" corrigido
- productContext passado em todas as chamadas generateAdImage

---

## 🗃️ Tabelas novas (sessão 17)

| Tabela | Uso |
|---|---|
| `approved_images` | Imagens validadas pelo RAG para reutilização |
| `image_rag_logs` | Auditoria de cada decisão RAG (status/score/labels) |

---

## 🐛 Bugs Resolvidos (sessão 17)

| Bug | Fix | Commit |
|---|---|---|
| wa.me rejeitado como link Meta (2061015) | websiteUrl ou URL página Facebook | `128e01a` |
| effectiveVideoId before initialization | Removida referência prematura | `c83e33c` |
| 4 avisos Advantage+ | publisher_platforms explícito seguro | `7ff2ca8` |
| runImageRAG is not defined | dynamic import() | `981ba8a` |
| SVG texto corrompido (ã→&#227;) | Removida substituição non-ASCII | `c203374` |
| log is not a function (Pixabay) | log.info() | `aa183f5` |
| objective is not defined (buildLink) | c?.objective fallback | `aa93840` |
| Cannot access effectiveVideoId | Escopo corrigido | `c83e33c` |
| Multi-adSet = múltiplas campanhas | existingMetaCampaignId | `50b70b5` |
| CNPJ não funciona (CORS) | tRPC server-side | `533beb7` |
| Dados falsos landing (500+ agências) | Substituídos por dados reais | `c919da3` |
| OUTCOME_TRAFFIC em vez de LEADS | objective no publishPayload | `762766d` |
| leadsSegs declarado duas vezes | merged em allLeadsSegs | `5dd4b8d` |
| correctedObjective dependia de WhatsApp | independe agora | `2eed4a1` |
| leads sem pixel → TRAFFIC | OUTCOME_LEADS+LINK_CLICKS | `c9c7a88` |

---

## 📋 Pendências Atualizadas (sessão 17)

| Prioridade | Item | Status |
|---|---|---|
| 🔴 | TikTok token — configurar no Render | Michel |
| 🔴 | Vincular WhatsApp à Página Facebook (projeto 15) | Michel |
| 🔴 | Adicionar website no perfil cliente projeto 15 | Michel |
| 🟡 | Gemini chaves 2+3 em projetos Google separados | Michel |
| 🟡 | Aprovar winner_patterns no admin | Michel |
| 🟡 | Aumentar orçamento Villa Serena (R$0,86/dia → R$30+/dia) | Michel |
| 🟢 | Copies 2→6 (PAS/AIDA/Storytelling/Objeção/Escassez) | Dev |
| 🟢 | Análise de resultados com diagnóstico IA | Dev |

---

## 💡 Prompt de Início de Sessão (atualizado)

```
Leia docs/SYSTEM_MEMORY.md do MecProAI antes de começar.
Stack: React+Vite+tRPC+PostgreSQL. Deploy: Render.com.
Último commit: c9c7a88. Michel — Balneário Camboriú/SC.
Score: ~93%. OUTCOME_LEADS ativo. RAG imagens ativo. adAudit.ts ativo.
Prioridade: TikTok token + Gemini chaves separadas + WhatsApp vinculado projeto 15.
```
