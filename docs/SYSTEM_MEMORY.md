# 🧠 MecProAI — Memória Técnica do Sistema

> **Para Claude:** Leia este arquivo NO INÍCIO de cada sessão antes de qualquer análise.
> Contém o estado atual, bugs conhecidos, decisões de arquitetura e padrões estabelecidos.
> Atualizar após cada sessão significativa.
>
> **Última atualização:** 2026-05-01 (sessão 3)

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

---

## ⚡ Estado Atual do Sistema (2026-05-01)

### Integrações
| Serviço | Status | Motivo | Ação Necessária |
|---|---|---|---|
| Meta Ads Library API | ❌ `code=10` | App sem permissão Ads Library | Solicitar em developers.facebook.com → App → Ads Library API |
| Meta Token | ⚠️ `code=190` | Token expirado/sessão inválida | Reconectar em Configurações → Meta Ads |
| Gemini API | ⚠️ Quota limitada | 5 chaves com rotação, esgotam em uso intenso | Monitorar — fallback Groq ativo |
| Groq API | ✅ Fallback ativo | llama-3.3-70b-versatile | OK |
| Google Ads API | ✅ Funcionando | gRPC configurado | OK |
| Asaas (Pix) | ✅ Configurado | `ASAAS_API_KEY` set | OK |
| HuggingFace Proxy | ⚠️ Timeout frequente | /scrape-ads-library demora >10s | Circuit breaker após 3 falhas |

### Circuit Breakers Ativos
```
Meta CB: OPEN após code=10 — reset em 30min
         Aciona: fetchViaWebsiteScraping como prioridade 1
```

---

## 🐛 Bugs Conhecidos & Resolvidos

### CRÍTICOS (já corrigidos)

#### BUG-001: Rules of Hooks — Layout.tsx
- **Causa:** `trpc.public.getUIConfig.useQuery()` estava após `if (isPublic) return`
- **Sintoma:** Tela "Algo deu errado" em TODAS as páginas autenticadas
- **Solução:** Hook movido para antes do early return; visibilidade usa `sessionStorage` no Layout
- **Padrão:** Hooks NUNCA após `return` condicional
- **Arquivo:** `client/src/components/layout/Layout.tsx`

#### BUG-002: Optional chaining em hooks (`?.useQuery?.()`)
- **Causa:** `(trpc as any).x?.y?.useMutation?.()` é hook condicional mesmo antes do return
- **Sintoma:** Crash em runtime — React conta hooks diferentes entre renders
- **Solução:** Usar `trpc.namespace.procedure.useMutation()` tipado direto
- **Ocorreu em:** Layout, AdminCampaignIntelligence (11 hooks), competitorForms (2 hooks)
- **Regra:** NUNCA usar `?.useMutation?.()` ou `?.useQuery?.()` — sempre hook real incondicional

#### BUG-003: `const websiteUrl` não atualizava após descoberta
- **Causa:** `const websiteUrl = competitor.websiteUrl` é imutável; descoberta salvava em `competitor.websiteUrl` mas não na variável
- **Sintoma:** Web scraping nunca executava mesmo após descobrir o site
- **Solução:** Alterado para `let websiteUrl`; atualiza a variável E persiste no banco
- **Arquivo:** `server/ai.ts` — `_analyzeCompetitorImpl()`

#### BUG-004: Procedures duplicados no router
- **Causa:** `discoverCompetitors` e `saveUIConfig` foram adicionados fora do router correto
- **Sintoma:** `No procedure found on path` + TS1117 (multiple properties)
- **Solução:** Verificar SEMPRE que o `adminRouter` fecha na L4299 antes de adicionar procedures
- **Regra:** Usar script Python para verificar: `content.find('adminRouter') + depth counting`

#### BUG-005: `t is not defined` em adminIntelligenceRouter
- **Causa:** `getRecommendation: t.procedure.use(...)` — `t` é instância local que pode não estar resolvida no ESM
- **Solução:** Substituído por `adminProcedure` que é derivado de `t` mas avaliado corretamente
- **Arquivo:** `server/_core/adminIntelligenceRouter.ts:689`

#### BUG-006: Google Ads TOO_LONG em headlines
- **Causa:** Emojis multi-byte (`⏰` = length 2) → `slice(0, 30)` não remove emoji → headline passa de 30 chars no Google
- **Solução:** `stripEmojis()` antes do `slice(0, 30)` em `normalizeAssetTexts`
- **Arquivo:** `server/_core/router.ts` — `normalizeAssetTexts()`

#### BUG-007: competitorForms.tsx corrompido (conteúdo duplicado)
- **Causa:** Substituição de string Python inseriu novo código sem remover o antigo → `export function` apareceu dentro de outra função
- **Sintoma:** Vite build falhou com `Unexpected "export" at line 62`
- **Solução:** Restaurar do git (`git show HASH:path > /tmp/file`) e reaplicar apenas a mudança necessária
- **Lição:** Para correções em arquivos grandes, SEMPRE restaurar do git antes de reaplicar


#### BUG-009: M2 — hooks condicionais em 6 arquivos do Módulo 2
- **Causa:** `?.useMutation?.()` + `?? { mutate: () => {} }` em CompetitorAnalysis, AdInputAnalyzer, competitorVerifiers, useCompetitorData, ClientAdsCollector
- **Sintoma:** Crash intermitente ao renderizar qualquer componente do Módulo 2
- **Solução:** Substituídos por `trpc.namespace.procedure.useMutation()` tipados direto; removidos todos ?? fallbacks
- **Regra reforçada:** Buscar `?.useMutation?.` + `?? { mutate:` antes de qualquer deploy do M2
- **Commit:** b6c6358

#### BUG-010: TikTok button usando instagramUrl em vez de tiktokUrl
- **Causa:** `const handle = (c.instagramUrl || "")` no botão de coleta TikTok
- **Sintoma:** Busca TikTok com handle de Instagram → falha ou dados errados
- **Solução:** `c.tiktokUrl || c.instagramUrl` — prioriza campo correto com fallback
- **Arquivo:** `client/src/pages/CompetitorAnalysis.tsx L1431`
- **Commit:** b6c6358


#### BUG-011: M2 — mensagem técnica de erro exposta ao usuário
- **Causa:** Banner de falha mostrava `code=10`, URL `facebook.com/ads/library/api`, detalhes OAuth
- **Sintoma:** Usuário via texto técnico incompreensível quando todas as camadas falhavam
- **Solução:** Mensagem genérica amigável; dicas de melhoria específicas por camada via qualityMap
- **Arquivo:** `CompetitorAnalysis.tsx` + `competitorCards.tsx`
- **Commit:** 00bf14a

#### BUG-008: `Unable to transform response` na análise de concorrentes
- **Causa:** Pipeline de 7 camadas pode levar 60-90s; Render corta conexão em 30s
- **Solução:** Timeout 25s no procedure → `{ timedOut: true }` → frontend faz polling via `/api/competitors/status`
- **Arquivo:** `server/_core/router.ts` — `competitors.analyze`

---

## 🏛️ Decisões de Arquitetura

### DA-001: Layout sem hook tRPC
- **Decisão:** `Layout.tsx` NÃO faz nenhuma chamada tRPC direta
- **Motivo:** É o componente mais crítico — wrappa todas as páginas; qualquer crash derruba tudo
- **Implementação:** `UIConfigLoader` em `App.tsx` carrega config → `sessionStorage` → Layout lê sessão

### DA-002: Pipeline de análise de concorrentes (7 camadas)
```
Camada 1: Meta Ads API Oficial (token OAuth)
Camada 2: HF Proxy → Ads Library
Camada 3: Ads Library Direta (Render)
Camada 4: Instagram / Busca por Nome
Camada 5: Web Scraping do Site ← PRIORIDADE quando CB aberto
Camada 6: Análise SEO/IA (Gemini)
Camada 7: Mock por Nicho
```
- **Quando Meta CB aberto:** Prioridade 1 = web scraping, Prioridade 2 = /posts com pageId
- **Quando token=190 (expirado):** Verifica token em 3s antes de entrar no pipeline → pula direto para scraping

### DA-003: Website discovery automático
- **Fluxo:** Se `websiteUrl = null` → `geminiWithGrounding` busca site → salva no banco → usa para scraping
- **`enrichWithWebsite()`:** 3 estratégias: (1) Instagram bio scraping, (2) Facebook page scraping, (3) Gemini grounding

### DA-004: Payment Gateway abstrato
- **Interface:** `PaymentProvider` com `StripeProvider` e `AsaasProvider`
- **Gateway ativo:** Lido do banco (`app_settings.payment_gateway`) com cache 60s
- **Trocar gateway:** Admin → Configurações → Forma de Pagamento → invalida cache automaticamente

### DA-005: ML Pipeline
- **Tabelas:** `campaign_scores`, `winner_patterns`, `learning_base`, `ml_dataset`, `intelligence_log`
- **Fluxo:** `runFullAnalysis` → scores → winner_patterns (score≥60) → learning_base → ml_dataset
- **Integração:** `buildCampaignFromAds` consulta `learning_base` antes de usar benchmarks hardcoded

### DA-006: Visibilidade do menu (AdminUIConfig)
- **Config salva em:** `app_settings.ui_visibility` (JSON)
- **Como funciona:** `UIConfigLoader` lê e salva em `sessionStorage` → `Layout` filtra `NAV_USER`
- **Admins:** Sempre veem menu completo independente da config
- **Páginas fixas:** Dashboard, Projetos, Configurações (sempre visíveis)


### DA-007: Indicadores de qualidade do M2
```
Camadas 1-3 → badge "Real"    (dados verificáveis)
Camadas 4-5 → badge "Parcial" (dados baseados em fontes secundárias)
Camada 6    → badge "Estimado IA" (gerado por IA)
Camada 7    → badge "Estimado"   (referência do nicho)
```
- Hover no badge mostra: "Camada X: [nome técnico]"
- Dica de melhoria: só aparece se qualityMap.tip != "" (específica por camada)
- Mensagens de erro: NUNCA expor code=10, URLs técnicas ou detalhes OAuth ao usuário

---

## 📐 Padrões Estabelecidos

### Hooks React
```tsx
// ❌ NUNCA — hook condicional (quebra Rules of Hooks)
(trpc as any).namespace?.procedure?.useQuery?.()
(trpc as any).namespace?.procedure?.useMutation?.() ?? fallback

// ✅ SEMPRE — hook tipado incondicional
trpc.namespace.procedure.useQuery(input, { retry: false })
trpc.namespace.procedure.useMutation({ onSuccess, onError })

// ✅ SEMPRE — hooks ANTES de qualquer return condicional
function Layout() {
  const hook1 = useState(...)   // ← antes
  const hook2 = useQuery(...)   // ← antes
  if (isPublic) return <Simple />  // ← early return depois dos hooks
  return <Full />
}
```

### Procedures tRPC — verificar posição no router
```python
# Script Python para verificar se procedure está DENTRO do router
with open('router.ts') as f: content = f.read()
start = content.find('const adminRouter = router({')
depth = 0
for i, c in enumerate(content[start:], start):
    if c == '{': depth += 1
    elif c == '}':
        depth -= 1
        if depth == 0: end = i; break
print(f"adminRouter closes at L{content[:end].count(chr(10))+1}")
```

### Correção de arquivos TypeScript
```bash
# SEMPRE restaurar do git antes de editar arquivos grandes
git show COMMIT:path/to/file.tsx > /tmp/clean_version.tsx
# Verificar que está limpo
wc -l /tmp/clean_version.tsx
# Aplicar APENAS a mudança necessária
# Verificar TypeScript
npx tsc --noEmit 2>&1 | grep "filename" | grep "error TS"
```

### Timeouts e Render.com
- **Limite HTTP:** 30s no Render Free/Starter
- **Padrão:** Timeout 25s no procedure → retorna `{ timedOut: true }` → frontend faz polling
- **Polling endpoint:** `GET /api/competitors/status?competitorId=X&after=TIMESTAMP`

---

## 📁 Mapa de Arquivos Críticos

```
server/
├── _core/
│   ├── router.ts               ← ~10k linhas; adminRouter fecha L4299; competitorsRouter L1800+
│   ├── adminIntelligenceRouter.ts  ← ML procedures; NÃO usar t.procedure direto
│   ├── migrations.ts           ← ML tables: campaign_scores, winner_patterns, learning_base
│   └── index.ts                ← Polling endpoints: /api/campaigns/latest, /api/competitors/status
├── ai.ts                       ← ~6k linhas; pipeline M2 em _analyzeCompetitorImpl()
├── paymentService.ts           ← PaymentProvider interface + Stripe/Asaas providers
├── campaignIntelligenceEngine.ts ← ML scoring (DEFAULT_WEIGHTS, calculateScore)
└── db.ts                       ← getCompetitorById, updateCompetitor, getClientProfile

client/src/
├── components/
│   ├── layout/Layout.tsx       ← SEM hooks tRPC; usa sessionStorage para ui_visibility
│   └── competitors/
│       ├── competitorForms.tsx ← AddCompetitorForm + EditCompetitorForm (467 linhas)
│       ├── competitorCards.tsx ← CascadeStatus, AdCard, AdDetailModal
│       ├── competitorHelpers.ts← Funções puras: extractPageId, buildAdsLibraryUrl, sourceBadge
│       ├── competitorComparison.tsx ← CompetitiveBanner, CompetitivePanel
│       └── competitorVerifiers.tsx  ← TikTokVerifier, GoogleVerifier, InstagramVerifier
├── pages/
│   ├── CompetitorAnalysis.tsx  ← Módulo 2; ~1450 linhas; RaioX + AdInputAnalyzer no arquivo
│   ├── AdminCampaignIntelligence.tsx ← Painel ML; todos hooks devem ser tipados diretos
│   ├── AdminUIConfig.tsx       ← Visibilidade do menu; usa trpc.admin.saveUIConfig
│   └── CheckoutAsaas.tsx       ← Checkout Pix
└── App.tsx                     ← UIConfigLoader componente; rotas /checkout/asaas, /admin/ui-config
```

---

## 🔑 Variáveis de Ambiente Necessárias

```bash
# Banco & Auth
DATABASE_URL=postgresql://...
JWT_SECRET=...
SESSION_SECRET=...

# IA
GEMINI_API_KEY=...     # + GEMINI_API_KEY2..5 (rotação)
GROQ_API_KEY=...
GENSPARK_API_KEY=...

# Meta
META_APP_ID=41805843...
META_APP_SECRET=...

# Google Ads
GOOGLE_ADS_CLIENT_ID=791597639315-...
GOOGLE_ADS_CLIENT_SECRET=...
GOOGLE_ADS_DEVELOPER_TOKEN=saxm5SH_...

# Pagamentos
STRIPE_SECRET_KEY=...
ASAAS_API_KEY=...
ASAAS_WEBHOOK_TOKEN=...

# Outros
HUGGINGFACE_API_KEY=...
CLOUDINARY_URL=...
APP_URL=https://www.mecproai.com
```

---

## 📋 Pendências Conhecidas

| Prioridade | Item | Status |
|---|---|---|
| 🔴 | Meta App — solicitar permissão Ads Library API | Aguardando aprovação Facebook |
| 🔴 | Token Meta expirado — reconectar | Ação do usuário necessária |
| 🟡 | Módulo 2 — web scraping quando sem site cadastrado | ✅ Implementado (geminiWithGrounding) |
| 🟡 | Módulo 2 — auditoria de hooks condicionais | ✅ Corrigido (commit b6c6358) |
| 🟡 | Google Ads — headlines com emoji causando TOO_LONG | ✅ Corrigido (stripEmojis) |
| 🟡 | ML — rodar `runFullAnalysis` para popular learning_base | Ação admin necessária |
| 🟢 | Mercado Livre API | Aguardando credenciais DevCenter |
| 🟢 | ZAP Imóveis — feed XML | Não implementado |
| 🟢 | Módulo 2 — extrair RaioX para arquivo próprio | Low priority (890L no main) |

---

## 🔄 Como Atualizar Esta Memória

Após cada sessão significativa, executar:

```bash
# 1. Abrir este arquivo
# 2. Adicionar bugs novos em "Bugs Conhecidos & Resolvidos"
# 3. Atualizar "Estado Atual do Sistema" se mudou
# 4. Adicionar decisões de arquitetura novas
# 5. Atualizar pendências
# 6. Commitar junto com o código
git add docs/SYSTEM_MEMORY.md
git commit -m "docs(memory): atualiza memória técnica — [descrever o que mudou]"
```

---

## 💡 Prompt de Início de Sessão (usar com Claude)

```
Leia o arquivo docs/SYSTEM_MEMORY.md do repositório MecProAI antes de começar.
Ele contém o estado atual do sistema, bugs conhecidos e decisões de arquitetura.
Stack: React+Vite+tRPC+PostgreSQL. Deploy: Render.com. Repo: github.com/Moliver63/mecpro
Michel trabalha em Windows, PowerShell, Balneário Camboriú/SC.
```
