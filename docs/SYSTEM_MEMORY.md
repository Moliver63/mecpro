# 🧠 MecProAI — Memória Técnica do Sistema

> **Para Claude:** Leia este arquivo NO INÍCIO de cada sessão antes de qualquer análise.
> **Última atualização:** 2026-06-04 (sessão 18)

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
| Último commit | `ce412c6` | Budget validation R$5.11 real |

---

## 📊 Score de Prontidão (sessão 18)

**Score geral: ~95%** ← subiu de 93%

| Módulo | Score | Delta |
|---|---|---|
| Infraestrutura | **98%** | ⬆️ pool lazy fix |
| Meta Ads | **97%** | ⬆️ +1% WA flow, description, budget |
| Geração de Campanhas IA | **96%** | — |
| Imagens | **94%** | — |
| Copies | **96%** | ⬆️ description field |
| Financeiro | 87% | — |
| ML / Inteligência | **92%** | — |
| Google Ads | 78% | — |
| TikTok Ads | 70% | — |

---

## ⚡ Estado das Integrações

| Serviço | Status | Detalhe |
|---|---|---|
| Cloudflare Workers AI | ✅ ATIVO + RAG | FLUX.1-schnell; 10k neurons/dia; reset 00:00 UTC |
| Pixabay | ✅ ATIVO | CC0; re-hospeda Cloudinary antes Meta |
| Google Images | ✅ ATIVO | CC0; GOOGLE_API_KEY + GOOGLE_CSE_ID |
| Meta Token | ✅ Ativo | Válido até 06/07/2026 |
| Google Ads | ✅ Search+Display+Video+PMax | |
| TikTok | ⚠️ Parcial | Token não configurado no Render |
| Asaas | ✅ Pix+Cartão | |
| Gemini | ✅ 5 chaves | Cache RAM+DB |
| Groq/Llama 3.3 70B | ✅ Fallback + modo direto | |

---

## 🎯 Meta Ads — Estado Atual (sessão 18)

### Fluxo WhatsApp (CORRIGIDO sessão 18)

```
REGRAS:
  WA vinculado no Meta Business:
    → OUTCOME_LEADS + CONVERSATIONS + whatsapp_phone_number + destination_type: WHATSAPP

  WA NÃO vinculado (atual Villa Serena):
    → OUTCOME_LEADS + LINK_CLICKS
    → link_data.link = wa.me diretamente
    → SEM whatsapp_phone_number (causa erro 1487246)
    → SEM destination_type: WHATSAPP (causa erro 2490408)

DETECÇÃO:
  _connectedPhone = null → hasLinkedWA=false → LINK_CLICKS
  _connectedPhone = "47999465824" → hasLinkedWA=true → CONVERSATIONS
```

### Erros Meta corrigidos (sessão 18)

| Erro | Causa | Fix |
|---|---|---|
| 2061015 | wa.me em link_data.link | safeLink() usa website/FB |
| 2061015 | linkUrl=null | safeLink() fallback obrigatório |
| 1487246 | whatsapp_phone_number sem vínculo | só envia quando _connectedPhone |
| 2490408 | CONVERSATIONS sem WA vinculado | LINK_CLICKS quando hasLinkedWA=false |
| 1885272 | budget < R$5.10 | mínimo R$6/adSet quando elevado |
| Graph 400 | phone_number campo inválido | removido frontend+backend |

### Campo description (NOVO sessão 18)

```
link_data.description = shortDescription (max 30 chars)
Fonte: adCopy.feed.description || hook.slice(0,30)
IA instrução: description obrigatório ex "Vista Mar • Locação Anual"
```

### Objetivo da campanha (CONFIRMADO sessão 18)

```
correctedObjective → independe de WhatsApp vinculado
  imoveis/saude/servicos/academia → "leads"
  ecommerce/moda/alimentacao → "sales"
  b2b/infoprodutos → "leads"
  sem segmento → "leads" (padrão global)

resolveObjectiveAndGoal:
  leads + WA vinculado   → OUTCOME_LEADS + CONVERSATIONS
  leads + WA não vinc.   → OUTCOME_LEADS + LINK_CLICKS ← novo
  leads + site + pixel   → OUTCOME_LEADS + OFFSITE_CONVERSIONS
  leads + site sem pixel → OUTCOME_LEADS + LINK_CLICKS
  sales + pixel          → OUTCOME_SALES + OFFSITE_CONVERSIONS
  sales sem pixel        → OUTCOME_TRAFFIC + LANDING_PAGE_VIEWS
```

### Budget validation (CORRIGIDO sessão 18)

```
Mínimo real Meta: R$5,11/adSet/dia
Validação: ceil(5.11 × adSetCount)
  1 adSet → R$6 mínimo (quando elevado automaticamente)
  4 adSets → R$21/dia (era R$24 — bloqueava R$23)
  5 adSets → R$26/dia
```

### Placements (CONFIRMADO)

```
facebook_positions: [feed, story, marketplace, search]
instagram_positions: [stream, story, explore, reels]
Excluídos: audience_network, threads, whatsapp_status, messenger_stories
```

---

## 🖼️ Imagens — Estado Atual

### Fluxo

```
1. Cloudflare FLUX → RAG → aprovado → Cloudinary
   (quota: 10k neurons/dia; reset 00:00 UTC)
2. Pixabay CC0 → Cloudinary rehost → RAG
3. Google Images CC0
4. Pollinations
5. Mock
```

### RAG thresholds (AJUSTADOS sessão 17/18)

```
confidence: 0.50, product_match: 0.40, branding: 0.50
segment: truncado 50 chars (era ctaRule completo → scoring errado)
Pool: lazy init getImageDbPool()/getRagPool() (evita crash boot)
```

---

## 🐛 Bugs Resolvidos (sessão 18)

| Bug | Fix | Commit |
|---|---|---|
| Botão WA abria Facebook | isWhatsApp mantido sem vínculo, wa.me como link | `319678b` |
| Erro 1487246 WA not linked | phone_number só quando _connectedPhone | `68b29fd` |
| Erro 2490408 opt_goal incompatível | LINK_CLICKS quando hasLinkedWA=false | `a099d2b` |
| Botão Site/landing volta | userChoseDestinationRef | `8d3b601` |
| Graph API 400 phone_number | removido frontend+backend | `7ba5397` |
| React is not defined | React.useRef → useRef | `fdc0ec6` |
| Description vazia Gerenciador | shortDescription no link_data | `a73954b` |
| Deploy crash pool lazy | getImageDbPool()/getRagPool() | `cefe9da` |
| Budget R$23 bloqueava 4 adSets | ceil(5.11×N) em vez de 6×N | `ce412c6` |
| OUTCOME_TRAFFIC em vez de LEADS | correctedObjective independe WA | `2eed4a1` |
| leadsSegs duplicado | merged allLeadsSegs | `5dd4b8d` |
| Graph API 400 phone_number backend | removido campos inválidos | `09efebf` |

---

## 📋 Pendências Atualizadas (sessão 18)

| Prioridade | Item | Responsável |
|---|---|---|
| 🔴 | Vincular WhatsApp 47999465824 à Página 1086894187837842 no Meta Business | Michel |
| 🔴 | Adicionar website no perfil projeto 41 (Villa Serena) | Michel |
| 🟡 | TikTok token — configurar no Render | Michel |
| 🟡 | Gemini chaves 2+3 em projetos Google separados | Michel |
| 🟡 | syncMetaCampaignMetrics (avgScore=100 sem CTR real) | Dev |
| 🟢 | Copies 2→6 (PAS/AIDA/Storytelling/Objeção/Escassez) | Dev |
| 🟢 | Análise de resultados com diagnóstico IA | Dev |

---

## 💡 Prompt de Início de Sessão

```
Leia docs/SYSTEM_MEMORY.md do MecProAI antes de começar.
Stack: React+Vite+tRPC+PostgreSQL. Deploy: Render.com.
Último commit: ce412c6. Michel — Balneário Camboriú/SC.
Score: ~95%.

FLUXO WHATSAPP (crítico):
- WA vinculado → OUTCOME_LEADS + CONVERSATIONS + whatsapp_phone_number
- WA não vinculado → OUTCOME_LEADS + LINK_CLICKS + wa.me como link
- NUNCA enviar whatsapp_phone_number sem _connectedPhone (erro 1487246)
- NUNCA CONVERSATIONS sem WA vinculado (erro 2490408)

PENDÊNCIAS:
1. Vincular WA 47999465824 à Página 1086894187837842
2. Website no perfil projeto 41
3. TikTok token no Render
```
