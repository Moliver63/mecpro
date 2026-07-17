# 🧠 MecProAI — Memória Técnica do Sistema

> **Para Claude:** Leia este arquivo NO INÍCIO de cada sessão antes de qualquer análise.
> **Última atualização:** 2026-07-08 (sessão 21)

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
| Último commit | `36a898d` | fotos reais do cliente viram carrossel no Meta |

---

## 📊 Score de Prontidão (sessão 19 — NÃO reavaliado na sessão 21)

**Score geral: ~96%** (última medição — sessão 21 não rodou o Conselho de reavaliação de score; recomenda-se reavaliar Imagens e Copies dado o volume de mudanças abaixo)

| Módulo | Score | Delta |
|---|---|---|
| Infraestrutura | 98% | — |
| Meta Ads | 98% | — |
| Geração de Campanhas IA | 96% | — |
| Imagens | 94% | ⚠️ pendente reavaliação (fotos reais + drag-reorder) |
| Copies | 97% | ⚠️ pendente reavaliação (anti-alucinação + quality-gate) |
| Financeiro | 87% | — |
| ML / Inteligência | 92% | — |
| Google Ads | 78% | — |
| TikTok Ads | 70% | — |

---

## ⚡ Estado das Integrações

*(sem mudanças na sessão 21 — ver sessão 20 para última tabela completa)*

---

## 🖼️ Fotos Reais do Cliente (upload mode) — NOVO sessão 21

Cadeia completa implementada: upload → análise Vision → geração → publicação Meta.

```
Step 6 "Fotos" no Campaign Builder (STEPS: Segmento, Objetivo, Plataforma,
Orçamento, Detalhes, Fotos, Match IA, Gerar — fluxo 1→8):

1. Modo explícito (form.creativeMode: 'auto' | 'upload', default 'auto')
   - "📸 Usar minhas fotos" → uploader aparece
   - "✨ Deixar a IA criar" → comportamento padrão (FLUX), uploader oculto

2. Upload: input file nativo, JPG/PNG/WEBP/HEIC, máx 8MB/arquivo, limite 10
   fotos (alinhado ao máximo real do carrossel Meta)
   - Drag-to-reorder (HTML5 nativo) + fallback de setas ◀▶ no mobile
   - 1ª imagem = card principal / capa do carrossel (badge ★ 1º)
   - imageRightsConfirmed: checkbox obrigatório de direito de uso (risco jurídico)

3. Análise em background: endpoint tRPC integrations.uploadCampaignImage
   (Cloudinary + analyzeImageWithVision na mesma chamada; falha na análise
   NÃO falha o upload) — badge ✓ Qualidade N/100 + adequação por canal
   (Meta: alerta texto >40 chars; Google: alerta quality_score<40; TikTok:
   recomenda foto limpa)

4. Geração (server/ai.ts): quando modo=upload com imagens válidas,
   enrichCreativesWithScoresAndImages atribui cada foto real a
   feedImageUrl/storyImageUrl/squareImageUrl (ciclando se menos fotos que
   criativos) e RETORNA ANTES do bloco FLUX — pula 100% da geração sintética

5. Publicação (server/_core/router.ts): effectiveImageUrls agora coleta
   TODAS as feedImageUrl únicas dos criativos com usesRealPhoto=true
   (dedup, limite 10). Prioridade: input.imageUrls explícito → realPhotoUrls
   do modo upload → fallbackPublishMedia.imageUrls (fluxo automático)
   - ≥2 fotos → carrossel (child_attachments, copy por card)
   - 1 foto → anúncio de imagem simples

BUG RAIZ CORRIGIDO (commit 36a898d): cada criativo tinha sua feedImageUrl
individual, mas o carrossel exige um array imageUrls[] com TODAS as fotos
no mesmo ad — effectiveImageUrls vinha vazio no modo upload e publicava
sem criativo visual. Log de confirmação: "Carrossel com fotos reais do
cliente: N fotos" (antes aparecia "Cloudflare FLUX OK" mesmo com upload).
```

---

## 🐛 Bugs Resolvidos / Features (sessão 21 — 06 a 08/07)

| Item | Causa raiz / Descrição | Fix | Commit |
|---|---|---|---|
| Mismatch de objetivo WhatsApp (queimava budget) | `sales + WhatsApp` caía no branch "sales sem pixel" → `OUTCOME_TRAFFIC + LANDING_PAGE_VIEWS` (otimizava page view numa campanha de conversa) | Branch novo antes do check de pixel: `sales+WA vinculado→OUTCOME_ENGAGEMENT+CONVERSATIONS`; `sales+WA sem vínculo→OUTCOME_TRAFFIC+LINK_CLICKS` | `ea9cdaf` |
| Frases redundantes na copy | "Não perca essa oportunidade / Você não quer perder a oportunidade" | `dedupeSentences()`: remove sentenças consecutivas com >60% overlap de palavras | `ea9cdaf` |
| Headline idêntica entre personas do mesmo segmento | "Aproveite o melhor valor" igual para TOF_Investidor e TOF_Lifestyle anulava a segmentação | `personalizeHeadlineForAdSet()` deriva persona do nome do adSet e adapta vocabulário (≤40 chars) | `ea9cdaf` |
| Score baixo publicava com só um warning decorativo | `finalScore<75` não bloqueava nem melhorava | Gate: score<75 → LLM reescreve usando `recommendations` do scoring engine (máx 2 tentativas); persiste baixo → `needsReview=true` (nunca trava a geração) | `f8b70c2` |
| Description ecoava a headline | `rawDesc === selectedDescription === adCopy.feed.description` sempre | `buildDescription()` com cascata: description explícita da IA (se ≠ headline) → frase 10-60 chars da copy → hook → fallback contextual por objetivo | `f8b70c2` |
| `imageRAG.ts` não compilava em build estrito | linha 391: `split("<newline>")` literal em vez de `split("\n")` escapado — análise de visão inteira inacessível | Corrigido split; desbloqueou Step 6 | `395c4df` |
| Endpoint de upload 404 em produção | `uploadCampaignImage` foi inserido dentro do `integrationsRouter`, path real é `integrations.uploadCampaignImage` | Frontend corrigido: `trpc.uploadCampaignImage` → `trpc.integrations.uploadCampaignImage` | `05abda1` |
| **Fotos reais nunca chegavam à geração** | Modo upload só passava descrição textual das fotos — backend sempre gerava FLUX sintético, mesmo com upload confirmado | Cadeia completa upload→geração→Meta (ver seção acima) | `62d1735` |
| **Carrossel publicava sem imagem no modo upload** | `effectiveImageUrls` vinha vazio (só usava `input.imageUrls` ou fallback, nenhum dos dois populado no modo upload) | Coleta `feedImageUrl` de todos os criativos com `usesRealPhoto=true`, dedup, limite 10 | `36a898d` |
| **Budget numérico quebrava 100% da publicação** | `currentAdSet.budget` tipado `string` mas podia vir `number` em runtime (adSet gerado com budget numérico) → `.match()` num number lançava erro; `any` mascarava do TS | Normaliza número vs string antes de processar; brinde: parser agora trata `.` como milhar e `,` como decimal (`R$ 1.250,50` → `1250.5`, antes virava `1.25`) | `1a37c2d` |
| **Placeholders vazando para o Meta** ([cidade], {preço}, EMPRESA_AQUI) | `auditCopy` só detectava e logava warning — publicava com placeholder visível | Placeholder vira bloqueante no quality gate → força regeneração LLM → se persistir, `stripPlaceholders()` sanitiza como último recurso → se ainda sobrar, `needsReview=true` | `278ebd0` |
| Claims fabricados na copy | Prefixos tipo "📊 Resultado comprovado:", "✅ Dados reais:" colados sem base factual (risco de compliance Meta) | Substituídos por variações de tom sem afirmação factual ("Vale a pena conferir:", "A escolha certa:") | `278ebd0` |
| Frases quebradas por template vazio | `{cidade}` sem valor virava "Seu imóvel em  por " (buraco + preposição órfã) | Limpa espaços duplos, preposições órfãs e pontuação solta após substituição | `278ebd0` |

### Isolado / não plugado ainda (risco zero, aguardando próxima etapa do Conselho)

| Item | Descrição | Status | Commit |
|---|---|---|---|
| `inferOfferType()` | Inferência determinística de tipo de oferta (10 tipos: locação, venda, lançamento, temporada, leilão, serviço, consulta, delivery, curso, produto) via regex de alto sinal. 12/12 casos-teste corretos | Função existe em `server/ai.ts`, **NÃO conectada** a nenhum fluxo | `b4c48c4` |
| `SUBSEGMENTS` | Config escalável de subsegmentos para os 9 segmentos existentes (`shared/subsegments.ts`), com `signals`, `hookOverride`, `ctaOverride` por subsegmento. 15/15 casos-teste corretos | Dado/config novo, **NÃO plugado** no fluxo de geração | `0d40136` |

**Próximo passo natural:** ligar `inferOfferType` + `SUBSEGMENTS` ao `resolveCampaignProfile` — é a semente do "Perfil da Campanha" (Entrega 1 do veredito do Conselho ainda pendente).

---

## 📋 Pendências (atualizado sessão 21)

| Prioridade | Item | Responsável |
|---|---|---|
| 🔴 | Vincular WhatsApp 47999465824 à Página 1086894187837842 | Michel |
| 🔴 | Adicionar website no perfil projeto 41 (Villa Serena) | Michel |
| 🟡 | Conectar `inferOfferType` + `SUBSEGMENTS` ao fluxo real (`resolveCampaignProfile`) | Dev |
| 🟡 | Reavaliar score de Imagens e Copies após mudanças da sessão 21 | Dev |
| 🟡 | TikTok token no Render | Michel |
| 🟡 | Gemini chaves 2+3 em projetos separados | Michel |
| 🟡 | syncMetaCampaignMetrics (avgScore=100 sem CTR real) | Dev |
| 🟢 | Campanhas geradas antes de `5b13463` têm budget antigo — regerar ou ajustar Módulo 4 | Michel |

---

## 💡 Prompt de Início de Sessão (atualizado)

```
Antes de qualquer coisa, leia o arquivo docs/SYSTEM_MEMORY.md do repositório
MecProAI (github.com/Moliver63/mecpro.git) — ele contém o estado técnico
completo do sistema, bugs resolvidos, regras críticas e pendências.

Stack: React 19 + Vite + TypeScript / Node.js + Express + tRPC / PostgreSQL + Drizzle / Render.com
Repo local: /home/claude/mecpro (se já clonado na sessão)
Último commit: 36a898d | Score: ~96% (não reavaliado sessão 21) | Sessão: 21 (08/07/2026)

ARQUIVOS CRÍTICOS (verificar antes de editar):
- server/schema.ts          ← fonte da verdade do banco (SEMPRE consultar antes de query SQL)
- server/_core/router.ts    ← backend tRPC completo (publicação Meta, effectiveImageUrls)
- server/_core/index.ts     ← boot, crons ML, webhooks
- server/ai.ts              ← geração de campanhas (Gemini → Groq), inferOfferType (isolado)
- server/imageGeneration.ts ← FLUX → Pixabay → Google
- server/imageRAG.ts        ← análise Vision (corrigido sessão 21, cuidado com split("\n"))
- shared/subsegments.ts     ← SUBSEGMENTS (isolado, não plugado)
- client/src/pages/CampaignResult.tsx ← publicação Meta

REGRAS CRÍTICAS — NÃO VIOLAR:

1. BUDGET:
   - Backend valida adSet ATUAL (input.adSetIndex), nunca todos
   - currentAdSet.budget pode vir NUMBER ou STRING em runtime — sempre normalizar
     antes de .match() (bug 1a37c2d quebrava 100% da publicação)
   - Parser trata "." como milhar e "," como decimal (R$ 1.250,50 → 1250.5)
   - Mínimo Meta: R$5,11/adSet/dia
   - Geração garante MIN_VIABLE_MONTHLY ≈ R$675 (4 adSets × R$5,11 × 30 × 1,1)

2. CARROSSEL:
   - getCardCopy(idx) → creativeList[idx % nCreatives]
   - Headline max 40 chars, description max 30 (limites Meta)
   - effectiveImageUrls precisa de TODAS as feedImageUrl (usesRealPhoto=true),
     dedup, limite 10 — não usar só a foto individual do criativo

3. FOTOS REAIS DO CLIENTE (creativeMode='upload'):
   - Pula 100% da geração FLUX quando há imagens válidas (status done)
   - imageRightsConfirmed obrigatório antes de continuar (risco jurídico)
   - Limite 10 fotos (máximo real do carrossel Meta)
   - 1ª foto do preview = card principal / capa

4. DETECÇÃO DE TEXTO EM IMAGEM:
   - Threshold heurístico: 0.18 (NÃO reduzir — 0.08 causava falso positivo)
   - diff > 200 (NÃO reduzir para 180)

5. WHATSAPP:
   - WA vinculado → OUTCOME_LEADS + CONVERSATIONS + whatsapp_phone_number
   - WA não vinculado → OUTCOME_LEADS + LINK_CLICKS + wa.me (sem phone_number)
   - sales + WA vinculado → OUTCOME_ENGAGEMENT + CONVERSATIONS (novo, sessão 21)
   - sales + WA sem vínculo → OUTCOME_TRAFFIC + LINK_CLICKS (novo, sessão 21)

6. DESCRIPTION:
   - Prioridade: ai.description ≠ headline | CTA label | 1ª frase hook | ângulo | VAZIO
   - NUNCA repetir headline como description | NUNCA usar copy completa | Max 30 chars

7. REGEX — esbuild:
   - NUNCA usar newline literal em regex ou split: /[,\n\r]/ ou split("<newline>")
   - CORRETO: .split(",")[0].split("\n")[0]

8. ANTI-ALUCINAÇÃO DE COPY:
   - Placeholder não substituído ([cidade], {preço}) é BLOQUEANTE no quality gate
   - Nunca publicar copy com placeholder visível, mesmo com score alto
   - Claims fabricados ("resultado comprovado", "dados reais") proibidos sem base factual
   - Verificar schema.ts ANTES de qualquer query SQL — tabela api_integrations
     (NÃO integrations), campo provider (NÃO platform)

9. SEGMENTAÇÃO (NOVO, NÃO PLUGADO):
   - inferOfferType() e SUBSEGMENTS existem e passam nos testes, mas NÃO estão
     conectados a nenhum fluxo real ainda — não assumir que já influenciam campanhas

PENDÊNCIAS ABERTAS:
🔴 Vincular WhatsApp 47999465824 à Página 1086894187837842 no Meta Business
🔴 Adicionar website no perfil projeto 41 (Villa Serena) — websiteUrl = null
🟡 Conectar inferOfferType + SUBSEGMENTS ao resolveCampaignProfile
🟡 Reavaliar score de Imagens e Copies pós sessão 21
🟡 TikTok token no Render
🟡 Gemini chaves 2+3 em projetos Google separados
🟡 syncMetaCampaignMetrics para avgScore real (atualmente 100 sem CTR)
🟢 Campanhas geradas antes de 5b13463 com budget antigo → regerar ou ajustar Módulo 4

CUSTOS REAIS (logs produção, sessão 20 — não remedido sessão 21):
- Gemini+Groq: US$0,0021/campanha
- Imagens: R$0 (Pixabay/Google fallback gratuito) — reavaliar com fotos reais (Cloudinary)
- Margem: >99% em qualquer escala até 1M clientes
```
