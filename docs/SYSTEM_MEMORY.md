# 🧠 MecProAI — Memória Técnica do Sistema

> **Para Claude:** Leia este arquivo NO INÍCIO de cada sessão antes de qualquer análise.
> **Última atualização:** 2026-05-05 (sessão 11)

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
| Último commit | `bd17e38` | fix Zod null campos produto |

---

## 📊 Análise de Prontidão (atualizada sessão 11)

**Score geral: ~85%** ← subiu de 82% com motor de copy + produto + CNPJ

| Módulo | Score | Peso | Sessão 11 |
|---|---|---|---|
| Infraestrutura | 94% | 5% | — |
| Financeiro | 87% | 10% | — |
| ML / Inteligência | 82% | 5% | — |
| Meta Ads | 88% | 20% | — |
| Geração de Campanhas IA | 93% | 25% | ⬆️ +5% motor copy nicho |
| Análise de Concorrentes | 78% | 15% | ⬆️ +4% SWOT dinâmico |
| TikTok Ads | 70% | 10% | — |
| Google Ads | 78% | 10% | — |

**Pendências críticas:**
- Meta Token expira 2026-05-25 → reconectar (ação do usuário)
- Meta Ads Library `code=10` → aguardando Facebook
- TikTok token → configurar no Render

---

## ⚡ Estado das Integrações

| Serviço | Status | Detalhe |
|---|---|---|
| Cloudflare Workers AI | ✅ ATIVO | FLUX.1-schnell; 10k neurons/dia; reset 21h BRT |
| JSON2Video | ✅ ATIVO | MP4 + voz PT-BR Azure grátis; 600 créditos |
| Pollinations.AI | ✅ Fallback | Quando CF quota esgotada |
| Genspark | ❌ REMOVIDO | fetch failed 100% → removido do pipeline |
| BrasilAPI CNPJ | ✅ ATIVO | gratuita, sem auth, funciona do Render |
| Meta Token | ✅ válido até 25/05 | Reconectar antes |
| Meta Ads Library | ❌ code=10 | Aguardando Facebook |
| Google Ads | ✅ Search+Display+Video+PMax | Todos desbloqueados |
| TikTok | ⚠️ Parcial | Token não configurado |
| Asaas | ✅ Pix+Cartão | |
| Gemini | ✅ 5 chaves | Cache RAM+DB |

---

## 🎯 Motor de Copy (NOVO — sessão 11)

### Prompt estruturado Meta Ads
```
Inputs mapeados:
  Segmento → niche
  Situação → pain (dor principal)
  Desejo   → transformation || uvp
  Oferta   → product + productPrice
  Diferencial → productDifferentials
  Prova    → productProofPoints
  Tom      → direto, linguagem natural

Output obrigatório:
  3 hooks: curiosidade | dor | oportunidade (+ variações)
  2 shortCopies: headline + body + CTA
  1 primaryCTA (máx 5 palavras)

PROIBIDO: "não perca", "imperdível", "oportunidade única", linguagem de IA
```

### Motor por nicho — 12 segmentos (getNicheContext)
```
imoveis     → ROI/Airbnb/escassez/valorização | investidor/comprador/remarketing
educacao    → transformação/urgência/ROI | aspirante/profissional/retargeting
saude       → resultado/credibilidade/geo | dor aguda/estético/retargeting
fitness     → anti-clichê/identidade | iniciante/retornante/avançado
ecommerce   → escassez/prova social | descoberta/carrinho/recorrente
financeiro  → medo perder/simplicidade | desinformado/insatisfeito/avançado
alimentacao → sensorial/conveniência | impulso/planejador/frequente
juridico    → direito desconhecido/urgência | PF/empresa/retargeting
pet         → amor/saúde/culpa | tutor novo/experiente/culpado
tech        → ROI/dor operacional/trial | decisor/usuário/pós-trial
turismo     → FOMO/ocasião | casal/família/solo
construcao  → resultado visual/garantia | proprietário/comprador/empresa
```

### UI CampaignResult — seção "Copies Prontas para Meta Ads"
```
[CTA Principal em azul Meta]
Cards roxos: headline + body + CTA + botão 📋 copiar
Hook cards com cores: 🔵 curiosidade | 🔴 dor | 🟢 oportunidade
```

---

## 📦 Campos de Produto (NOVO — sessão 11)

### Schema DB (6 novos campos)
```sql
productName          varchar(150)  -- nome do produto anunciado
productPrice         varchar(80)   -- "R$ 997", "a partir de R$ 200/mês"
productDifferentials text          -- 3 diferenciais
productProofPoints   text          -- provas sociais, números, resultados
productCTA           varchar(100)  -- CTA preferido: "Falar no WhatsApp"
copyStructure        varchar(30)   -- AIDA|PAS|STORYTELLING|CONTRASTE|URGENCIA|mixed
```

### Zod schema: todos os 6 com `.nullish()` (aceita null do banco)

### UI ClientProfile — seção azul destacada
```
📦 PRODUTO ANUNCIADO
  Nome do produto * | Preço | CTA preferido
  3 diferenciais (textarea)
  Provas sociais (textarea)
  Select: Mista | AIDA | PAS | Storytelling | Contraste | Urgência
```

### Injeção no prompt da IA
```
PRODUTO ANUNCIADO: "{productName}" ← USE ESTE NOME
Preço/Oferta: {productPrice}
PROVAS SOCIAIS (USE ESTES NÚMEROS): {productProofPoints}
Diferenciais: {productDifferentials}
CTA preferido: "{productCTA}"
Estrutura de copy: {copyStructure} (obrigatório se não-mixed)
```

### CampaignBuilder — produto em destaque
```
Step 5 Detalhes: bloco verde/amarelo com dados do produto
Step 7 Gerar: card verde com productName em 16px bold + preço + CTA
```

---

## 🔍 CNPJ Auto-preenchimento (NOVO — sessão 11)

```
API: BrasilAPI (brasilapi.com.br/api/cnpj/v1/{cnpj})
     Gratuita, sem auth, funciona do Render.com
     Substituiu: opencnpj.org (bloqueada no Render)

Campos preenchidos automaticamente:
  companyName    → nome_fantasia || razao_social
  niche          → CNAE → 9 categorias (Imóveis, Saúde, Educação...)
  city           → municipio
  state          → uf
  businessScope  → porte (MEI→local, ME→regional, demais→national)
  productService → descricao_atividade_principal
  websiteUrl     → email da empresa
  socialLinks    → phone + email

NÃO vêm do CNPJ (usuário preenche):
  productName, productPrice, productDifferentials,
  productProofPoints, targetAudience, mainPain, uvp
```

---

## 🐛 Bugs Resolvidos (sessão 11)

#### BUG-058: InstagramVerifier not defined (M2 crash)
- competitorComparison.tsx e competitorForms.tsx sem import
- **Commit:** a9aefcd

#### BUG-059: SWOT myScores hardcoded ≤5
- scores fixos sem dados reais; agora usa mesma fórmula do concorrente
- **Commit:** edd2099

#### BUG-060: SW crash "Failed to convert value to Response"
- caches.match() retornava undefined → respondWith(undefined) crashava toda a página
- **Commit:** b62f080

#### BUG-061: regenerateCreativeImage não chegava no Pollinations
- isProviderExhausted retornava null imediato sem tentar Pollinations
- **Fix:** ao detectar 429, chama tryPollinations direto com inferPrompt completo
- **Commit:** 9f0aa9b

#### BUG-062: Genspark fetch failed em 100% das chamadas
- **Fix:** removido do pipeline; novo fluxo: CF FLUX → Pollinations
- **Commit:** 17866d2

#### BUG-063: hooks/copies/adSets sem contexto de nicho
- **Fix:** getNicheContext(niche, product) injetado nos 3 prompts
- **Commit:** 185c042

#### BUG-064: Google negativeKeywords sempre vazios
- **Fix:** 3 camadas de extração + defaults por objetivo
- **Commit:** 11f31ea

#### BUG-065: productName/price/etc bloqueados pelo Zod
- `.optional()` → `.nullish()` + null→undefined no submit
- **Commits:** 541483f, bd17e38

#### BUG-066: opencnpj.org bloqueada no Render
- **Fix:** BrasilAPI + mapCNPJToForm completo com 9 nichos
- **Commit:** 3c896ab

#### BUG-067: GitHub divergiu (17 commits remotos vs 13 locais)
- **Fix:** force push para sincronizar
- **Commit:** force push `3c896ab`

---

## 🏛️ Arquitetura — Padrões

```tsx
// Zod para campos que podem ser null do banco: .nullish() não .optional()
productName: z.string().nullish()

// Submit: converte null → undefined para campos string
const stringFields = ["productName", "productPrice", ...];
for (const k of stringFields) {
  if (cleanForm[k] === null) cleanForm[k] = undefined;
}

// Hooks React: NUNCA optional chaining
trpc.x.y.useMutation() — isPending não isLoading

// DB: SEMPRE DELETE + INSERT

// CNPJ: BrasilAPI (não opencnpj.org)
fetch("https://brasilapi.com.br/api/cnpj/v1/" + digits)
```

---

## 📁 Arquivos Críticos

```
server/
├── _core/router.ts         ← lookupCNPJ; generateCreativeVideo; publishToGoogle
│                             clientProfile.upsert: 6 novos campos .nullish()
├── _core/migrations.ts     ← 6 novas colunas produto; ALTER TABLE
├── ai.ts                   ← getNicheContext (12 nichos); hooks prompt estruturado
│                             productName/proofPoints/preferredCTA nos prompts
├── imageGeneration.ts      ← CF FLUX → Pollinations (sem Genspark)
│                             isProviderExhausted → tryPollinations direto
├── schema.ts               ← 6 novos campos produto no clientProfiles
└── paymentService.ts       ← Asaas Pix+Cartão

client/src/pages/
├── ClientProfile.tsx       ← CNPJ BrasilAPI; bloco 📦 PRODUTO; AIDA/PAS select
│                             handleSubmit: null→undefined + ALLOWED list
├── CampaignResult.tsx      ← shortCopies+primaryCTA; hook cards coloridos
├── CampaignBuilder.tsx     ← Step 5+7: produto em destaque
├── GoogleCampaignCreator.tsx ← Display/Video/PMax desbloqueados; imagePath
└── TikTokCampaignCreator.tsx ← videoUrl/coverImageUrl automáticos

client/src/components/competitors/
├── competitorComparison.tsx ← import InstagramVerifier; SWOT dinâmico
└── competitorForms.tsx     ← imports TikTokVerifier/GoogleVerifier/InstagramVerifier
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
| 🔴 | Meta Token — reconectar antes 25/05 | Michel |
| 🔴 | TikTok token — configurar no Render | Michel |
| 🔴 | Meta App — Ads Library code=10 | Aguardando Facebook |
| 🟡 | Testar vídeo JSON2Video + narração PT-BR | Teste |
| 🟡 | Testar Asaas cartão em produção | Teste |
| 🟡 | FAL.AI — adicionar Render no allowlist | Michel |
| 🟢 | Análise de métricas em linguagem natural | Dev |
| 🟢 | Botão "Gerar variações" do anúncio vencedor | Dev |
| 🟢 | Google negativeKeywords via IA (melhorar) | Dev |

---

## 🧭 Regra: "Qual o próximo passo?"

Orientar por: 🔴 crítico → 🟡 score → 🟢 qualidade
Formato: score atual (~85%) + 3 itens em ordem de impacto + o que precisa.

---

## 💡 Prompt de Início de Sessão

```
Leia docs/SYSTEM_MEMORY.md do MecProAI antes de começar.
Stack: React+Vite+tRPC+PostgreSQL. Deploy: Render.com.
Último commit: bd17e38. Michel — Balneário Camboriú/SC.
Score atual: ~85%.
Prioridade: Meta Token (exp 25/05) + TikTok token + testar vídeo.
```
