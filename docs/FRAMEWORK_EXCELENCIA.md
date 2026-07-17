# 🏆 FRAMEWORK DE EXCELÊNCIA — MecProAI

> Guia técnico de padrões, decisões arquiteturais e lições aprendidas em produção.
> Baseado em sessões reais de desenvolvimento — do problema ao fix confirmado nos logs.

---

## MISSÃO

Entregar soluções completas, seguras, escaláveis e prontas para produção.
Nunca responder de forma superficial. Garantir a qualidade final da entrega.

---

## REGRA 1 — ENTENDIMENTO

Antes de executar qualquer tarefa:

1. Analisar o contexto completo
2. Identificar o objetivo principal
3. Identificar objetivos secundários
4. Listar possíveis riscos
5. Detectar inconsistências
6. Detectar requisitos ausentes

Se faltar informação crítica → solicitar esclarecimentos antes de implementar.

---

## REGRA 2 — PLANEJAMENTO

Antes de gerar qualquer solução:

1. Criar plano de execução
2. Dividir em etapas
3. Identificar dependências
4. Identificar impactos
5. Priorizar segurança e estabilidade

**Nunca implementar diretamente sem planejamento.**

---

## REGRA 3 — ANTI-ALUCINAÇÃO

É proibido:
- Inventar informações, funcionalidades, APIs, tabelas, endpoints ou resultados
- Assumir que uma tabela existe sem verificar o schema
- Assumir que um campo existe sem confirmar no banco
- Usar `platform` quando o campo é `provider` (api_integrations)
- Usar `isActive` quando o campo é `accessToken IS NOT NULL`
- **Publicar copy com placeholder não substituído** ([cidade], {preço}, EMPRESA_AQUI) — mesmo com score de qualidade alto (sessão 21)
- **Afirmar claims factuais sem base** ("resultado comprovado", "dados reais", "eficiência garantida") coladas genericamente pela variação de tom (sessão 21)

Quando não souber: **"Informação não confirmada."**
Quando necessário: **"Preciso validar esta informação."**

### Casos reais de alucinação evitados no MecProAI

| Alucinação | Realidade | Como verificar |
|---|---|---|
| `integrations` tabela | `api_integrations` | `grep pgTable schema.ts` |
| `i.platform = 'meta'` | `i.provider = 'meta'` | Ler schema antes de usar |
| `i.isActive = true` | `i.accessToken IS NOT NULL` | Ler schema |
| `db.getPool()` | `await getPool()` (import direto) | Verificar imports no topo |
| `import("./_core/adminIntelligenceRouter")` | `import("./adminIntelligenceRouter")` | Checar path relativo |

### Alucinação de copy — 3 fontes eliminadas (sessão 21)

```
FONTE 1 — Placeholder não substituído:
  Antes: auditCopy só detectava e logava warning, publicava mesmo assim.
  Agora: placeholder é BLOQUEANTE no quality gate.
    1. Força regeneração via LLM com instrução explícita de remover
    2. Se persistir → stripPlaceholders() sanitiza (remove placeholder +
       limpa fragmentos órfãos: preposições soltas, pontuação solta)
    3. Se ainda sobrar → needsReview=true (nunca publica sujo)

FONTE 2 — Claims fabricados em applyToneVariation:
  Antes: prefixos "📊 Resultado comprovado:", "✅ Dados reais:" colados
  em qualquer copy sem base factual (risco de compliance Meta).
  Agora: variações de TOM sem afirmação factual
  ("Vale a pena conferir:", "A escolha certa:").

FONTE 3 — fillTemplate deixava frases quebradas:
  {cidade} sem valor → "Seu imóvel em  por " (buraco + preposição órfã).
  Agora: limpa espaços duplos, preposições órfãs e pontuação solta
  após qualquer substituição de template.

ESTRATÉGIA GERAL: regenerar > sanitizar > marcar para revisão humana.
Nunca publicar silenciosamente algo suspeito.
```

---

## REGRA 4 — VALIDAÇÃO DE CÓDIGO

Todo código deve ser analisado quanto a:
- Bugs e edge cases
- Performance (N+1 queries, loops desnecessários)
- Escalabilidade (pool de conexões, lazy init)
- Segurança (SQL injection, XSS, secrets expostos)
- Legibilidade e manutenção futura
- **Coerção de tipo em campos `any`** — TS não pega erro de runtime quando o tipo é mascarado (sessão 21)

### Padrões obrigatórios no MecProAI

```typescript
// ✅ Pool lazy init — evita crash no boot
const pool = await getPool();
if (!pool) return [];

// ✅ Try/catch em JSON.parse sempre
let creatives: any[] = [];
try { creatives = JSON.parse(campaign.creatives || "[]"); } catch {}

// ✅ Regex sem newlines literais — esbuild rejeita
// ❌ ERRADO: .split(/[,\n\r]/)
// ✅ CORRETO: .split(",")[0].split("\n")[0]

// ✅ Normalizar tipo antes de chamar método específico de tipo (sessão 21)
// ❌ ERRADO: currentAdSet.budget.match(...) — quebra se budget vier number
// ✅ CORRETO:
const raw = currentAdSet.budget;
const budgetNum = typeof raw === "number" && Number.isFinite(raw)
  ? raw
  : parseBudgetString(String(raw)); // trata "." como milhar, "," como decimal
```

---

## REGRA 5 — SEGURANÇA

Verificar sempre:
- SQL Injection → usar `$1, $2` parametrizado, nunca interpolação
- XSS → sanitizar input do usuário antes de renderizar
- CSRF → tokens em mutations
- Autenticação → `protectedProcedure` em todo endpoint privado
- `adminProcedure` em endpoints admin
- Secrets → nunca logar tokens completos (usar `.slice(0,10) + "..."`)
- Upload → validar mime type e tamanho antes de processar
- **Direito de uso de imagem** → checkbox obrigatório de confirmação quando o usuário faz upload de fotos próprias (risco jurídico, sessão 21)

### Padrão de log seguro

```typescript
// ✅ Token seguro nos logs
log.info("meta", "Campaign payload", {
  tokenPrefix: token.slice(0, 10) + "...",
  accountId
});

// ❌ NUNCA
log.info("meta", "Token", { token }); // expõe token completo
```

---

## REGRA 6 — AUDITORIA OBRIGATÓRIA

Após concluir qualquer solução, responder:

1. ✅ A solução funciona? (testar localmente ou verificar nos logs)
2. ✅ Existem falhas? (edge cases, campos null, timeouts)
3. ✅ Existem riscos? (breaking changes, migrations)
4. ✅ Existe redundância? (código duplicado)
5. ✅ Existe alternativa melhor?

### Checklist de deploy no MecProAI

```
[ ] TypeScript compila sem erros (npx tsc --noEmit)
[ ] Nomes de tabelas conferidos no schema.ts
[ ] Nomes de campos conferidos no schema.ts
[ ] Imports de path relativo corretos
[ ] Regex sem newlines literais
[ ] JSON.parse com try/catch
[ ] Pool verificado antes de usar
[ ] Campos "any" com tipo real coerçado antes de métodos específicos (.match, .split)
[ ] Commit com mensagem descritiva
[ ] Push para main
[ ] Aguardar deploy ~3min no Render
[ ] Verificar logs de boot (sem crash)
```

---

## REGRA 7 — DOCUMENTAÇÃO

Toda solução deve conter:
- **Objetivo** — o que resolve
- **Causa raiz** — por que estava quebrado
- **Estrutura** — o que foi mudado
- **Dependências** — o que pode ser afetado
- **Riscos** — o que ainda precisa atenção
- **Melhorias futuras** — o que pode evoluir

---

## REGRA 8 — SISTEMAS SAAS (MecProAI específico)

Sempre validar ao modificar fluxos críticos:

| Módulo | Validações obrigatórias |
|---|---|
| Autenticação | Login, logout, JWT, Google OAuth |
| Pagamentos | Asaas Pix/Cartão, webhook, planos |
| Permissões | `protectedProcedure`, `adminProcedure` |
| Admin | Logs de auditoria, isolation por userId |
| Meta Ads | budget mínimo, optimization_goal, creative fields |
| ML | learning_base match, niche normalization |
| **Upload de fotos** | mime type, tamanho ≤8MB, limite 10 imagens, `imageRightsConfirmed` (sessão 21) |

---

## REGRA 10 — ANÁLISE DE REPOSITÓRIO

Ao analisar o repo MecProAI:

1. Ler `docs/SYSTEM_MEMORY.md` primeiro
2. Verificar último commit (`git log --oneline -5`)
3. Identificar arquivos críticos:
   - `server/_core/router.ts` — todo o backend tRPC
   - `server/_core/index.ts` — boot e crons
   - `server/ai.ts` — geração de campanhas
   - `server/schema.ts` — fonte da verdade do banco
   - `server/imageRAG.ts` — análise Vision (frágil a erro de sintaxe em split, sessão 21)
   - `shared/subsegments.ts` — SUBSEGMENTS (isolado, não plugado, sessão 21)
   - `client/src/pages/CampaignResult.tsx` — publicação Meta
4. Checar schema antes de qualquer query SQL
5. Verificar imports antes de qualquer path

---

## REGRA 11 — RESPOSTA FINAL

Toda entrega deve conter:

### Diagnóstico
O que foi encontrado — causa raiz, não sintoma.

### Solução
O que foi feito — código, commit, deploy.

### Riscos
O que ainda precisa atenção.

### Melhorias
O que pode ser aprimorado.

### Nível de confiança
- **Alto** — testado nos logs, confirmado em produção
- **Médio** — lógica correta mas não confirmado em prod
- **Baixo** — hipótese, precisa validar

---

## REGRA 12 — PADRÃO DE QUALIDADE

Antes de finalizar:
1. Verificar novamente
2. Segunda auditoria
3. Buscar inconsistências
4. Corrigir problemas
5. Entregar apenas a melhor versão possível

**Nunca priorizar velocidade sobre qualidade.**

---

## DECISÕES ARQUITETURAIS CONFIRMADAS EM PRODUÇÃO

### Meta Ads — Fluxo WhatsApp

```
WA vinculado ao Meta Business:
  → OUTCOME_LEADS + CONVERSATIONS
  → whatsapp_phone_number no adSet
  → destination_type: WHATSAPP

WA NÃO vinculado (mais comum):
  → OUTCOME_LEADS + LINK_CLICKS
  → link_data.link = wa.me diretamente
  → SEM whatsapp_phone_number (erro 1487246)
  → SEM destination_type (erro 2490408)

Objetivo SALES + WhatsApp (NOVO, sessão 21):
  Antes: caía no branch "sales sem pixel" → OUTCOME_TRAFFIC +
  LANDING_PAGE_VIEWS — otimizava para page view numa campanha de conversa,
  queimando budget.
  Agora, branch dedicado ANTES do check de pixel:
    sales + WA vinculado    → OUTCOME_ENGAGEMENT + CONVERSATIONS
    sales + WA sem vínculo  → OUTCOME_TRAFFIC + LINK_CLICKS
```

### Budget por adSet

```
Meta mínimo real: R$5,11/adSet/dia
Validação backend: por adSet individual (não soma total)
Validação frontend: ANTES do upload de vídeo/imagem
Pre-flight: soma rawBudget dos adSets selecionados

COERÇÃO DE TIPO (NOVO, sessão 21):
  currentAdSet.budget pode vir NUMBER ou STRING em runtime, mesmo com
  type annotation ": string" — o objeto pai é "any" e o TS não pega.
  Chamar .match() direto num number quebra 100% da publicação.
  SEMPRE normalizar tipo antes de processar.
  Parser trata "." como separador de milhar e "," como decimal:
  "R$ 1.250,50" → 1250.5 (não 1.25).
```

### Description field

```
Prioridade:
  1. ai.description (campo dedicado IA, diferente do headline)
  2. CTA label (ex: "Garantir meu crédito")
  3. Primeira frase do hook
  4. Ângulo do criativo
  5. VAZIO (melhor que repetir headline)

NUNCA: usar headline truncado como description
NUNCA: usar texto principal como description
LIMITE: 30 chars exibidos pelo Meta
```

### Fotos reais do cliente (creativeMode='upload') — NOVO sessão 21

```
Modo explícito no Step 6 "Fotos" (form.creativeMode: 'auto' | 'upload',
default 'auto' — não quebra rascunhos antigos):

  auto   → comportamento padrão, geração FLUX sintética
  upload → pula 100% do FLUX quando há imagens válidas

CADEIA (upload → análise → geração → publicação):
  1. Upload nativo (JPG/PNG/WEBP/HEIC, ≤8MB, limite 10 fotos — máximo
     real do carrossel Meta), com drag-to-reorder + fallback de setas mobile
  2. imageRightsConfirmed obrigatório antes de continuar
  3. Endpoint integrations.uploadCampaignImage: Cloudinary + Vision na
     mesma chamada; falha na análise NÃO falha o upload
  4. Geração (ai.ts): realImages[] atribuídas a feedImageUrl/storyImageUrl/
     squareImageUrl de cada criativo (ciclando), RETORNA ANTES do bloco FLUX
  5. Publicação (router.ts): effectiveImageUrls coleta TODAS as feedImageUrl
     únicas dos criativos com usesRealPhoto=true (dedup, limite 10)
     — prioridade: input.imageUrls > realPhotoUrls > fallbackPublishMedia

ARMADILHA JÁ CAÍDA: cada criativo com sua feedImageUrl individual NÃO é
suficiente para o carrossel — ele exige um array imageUrls[] com TODAS
as fotos no mesmo ad. effectiveImageUrls vazio = publica sem visual.
```

### Niche normalization — ML

```typescript
// Sempre normalizar antes de query no learning_base
const nicheKey = niche.toLowerCase()
  .replace(/corretagem.*(imóveis?|imoveis?)/i, "imoveis")
  .replace(/compra.*venda.*(imóveis?|imoveis?)/i, "imoveis")
  .split(",")[0].split("\n")[0].trim().slice(0, 50);
```

### Segmentação — inferOfferType + SUBSEGMENTS (NOVO, ISOLADO, sessão 21)

```
Entregas 2 e 4 do veredito do Conselho, implementadas isoladas
(risco zero — não alteram nenhum fluxo existente ainda):

inferOfferType(text, segment?) → { offerType, confidence, matched[] }
  10 tipos por regex de alto sinal (locacao, venda, lancamento, temporada,
  leilao, servico, consulta, delivery, curso, produto)
  12/12 casos-teste corretos, incl. conflito venda↔locação → confiança baixa

SUBSEGMENTS (shared/subsegments.ts)
  9 segmentos com subsegmentos próprios, signals (regex), hookOverride,
  ctaOverride — adicionar subsegmento = 1 entrada no array (dado, não código)
  15/15 casos-teste corretos

STATUS: nenhum dos dois está plugado no fluxo real de geração.
Próximo passo: ligar ao resolveCampaignProfile (semente do "Perfil da
Campanha"). NÃO assumir que campanhas atuais já usam essa inferência.
```

### Regex — esbuild constraint

```typescript
// ❌ esbuild rejeita newlines literais em regex
.split(/[,\n\r]/)

// ✅ Usar string split
.split(",")[0].split("\n")[0]

// Também vale para strings literais (armadilha real, sessão 21):
// ❌ ERRADO: text.split("<newline>")  — string mágica, nunca dá match real
// ✅ CORRETO: text.split("\n")        — quebra de linha escapada de verdade
```

### Pool lazy init — evitar crash no boot

```typescript
// ❌ Pool no módulo top-level → crash se DB não conectou ainda
const pool = new Pool({ connectionString: DATABASE_URL });

// ✅ Lazy init — só conecta quando necessário
export async function getPool(): Promise<Pool | null> {
  if (!_pool) _pool = new Pool({ connectionString: DATABASE_URL });
  return _pool;
}
```

---

## ERROS META ADS — SOLUÇÕES CONFIRMADAS

### Carousel — copy por card (sessão 20)

```
Cada card do carrossel usa um criativo diferente:
  card[idx] -> creativeList[idx % nCreatives]
  headline proprio (max 40 chars Meta)
  description propria (max 30 chars Meta)

Quando ha MAIS fotos que criativos (ex: 10 fotos, 4 copies):
  cards extras recebem variacao de angulo
  (Saiba mais, Confira, Oportunidade, Agende visita...)
  NUNCA repetir headline identico entre cards
```

### Carrossel sem imagem no modo upload (NOVO, sessão 21)

```
BUG: effectiveImageUrls vinha vazio no modo creativeMode='upload' —
publicava anúncio sem nenhum criativo visual (log mostrava "Cloudflare
FLUX OK" mesmo quando o usuário tinha feito upload de fotos próprias).

FIX: antes de montar effectiveImageUrls, coletar todas as feedImageUrl
únicas dos criativos com usesRealPhoto=true, dedup, limite 10 (máximo Meta).
  ≥2 fotos → carouselUrls → child_attachments
  1 foto   → effectiveImageUrl → anúncio de imagem simples
```

### Deteccao de texto alucinado em imagem — CUIDADO COM FALSO POSITIVO (sessão 20)

```
LICAO APRENDIDA: heuristica agressiva demais causa mais dano que beneficio.

Threshold 0.08 -> rejeitava fotos REAIS detalhadas (praia, predios)
do Pixabay como se fossem texto alucinado -> retries infinitos -> timeout.

Threshold correto: 0.18
  - Fotos reais ficam em 0.08-0.12 (passam)
  - Texto alucinado real do FLUX passa de 0.20 (rejeitado)

REGRA: sem Google Vision configurado, melhor deixar passar uma
imagem duvidosa do que rejeitar uma foto legitima.
```

### Budget minimo viavel — garantir na geracao (sessão 20)

```
Meta exige R$5,11/dia por adSet.
Campanha padrao = 4 adSets (TOF/MOF/BOF/SCALE) com 25% cada.

MIN_VIABLE_MONTHLY = 5,11 x 4 x 30 x 1,1 = R$675

Na geracao (ai.ts generateCampaign):
  se input.budget < MIN_VIABLE_MONTHLY -> eleva automaticamente
  suggestedBudgetMonthly salva o effectiveBudget corrigido

Assim cada adSet nasce com budget publicavel (R$5,62/dia).
Campanhas geradas antes do fix precisam regerar ou ajustar Modulo 4.
```

### Gate de qualidade de copy — regeneração automática (NOVO, sessão 21)

```
Antes: creativeScore < 75 publicava com apenas um warning decorativo.

Agora (enrichCreativesWithScoresAndImages, ai.ts):
  1. Cada criativo é scored ANTES do enriquecimento
  2. finalScore < 75 → LLM reescreve usando as recommendations do
     scoring engine como brief (máx 2 tentativas, temperature 0.8)
  3. Regras absolutas no prompt de reescrita:
     headline ≤40 chars sem CTA embutido
     description ≤30 chars complementar (nunca repete headline)
     copy ≤500 chars sem repetição
  4. Persiste <75 após 2 tentativas → needsReview=true
     (falha de LLM NUNCA trava a geração, só marca para revisão)
  5. Todo o processo logado com before/after (score, texto)
```

## ERROS META ADS — SOLUÇÕES CONFIRMADAS

| Código | Mensagem | Causa | Fix |
|---|---|---|---|
| 2061015 | "campo link obrigatório" | wa.me em link_data ou linkUrl null | safeLink() com fallback |
| 1487246 | "phone not linked" | whatsapp_phone_number sem vínculo | só enviar quando _connectedPhone |
| 2490408 | "optimization_goal incompatível" | CONVERSATIONS sem WA vinculado | LINK_CLICKS quando !hasLinkedWA |
| 1885272 | "orçamento muito baixo" | budget < R$5,10 | mínimo R$6/adSet |
| 100/2061015 | "link obrigatório OUTCOME_LEADS" | FB page como link | usar website ou wa.me |
| Graph 400 | "phone_number inválido" | campo não existe em Page | usar whatsapp_connected_id |
| — | publicação abortava sem erro Meta explícito | `.match()` chamado em `budget` number | normalizar tipo antes de `.match()` (sessão 21) |

---

## CRONS E TIMINGS

```
ML sync Meta:    5min após boot → a cada 24h
ML análise:     10min após boot → a cada 48h
Cloudflare FLUX: reset quota 00:00 UTC (21h BRT)
Meta token:      validado até 06/07/2026 — ⚠️ CONFIRMAR RENOVAÇÃO,
                 data já passou na sessão 21 (08/07)
```

---

## PENDÊNCIAS TÉCNICAS ABERTAS

| Prioridade | Item |
|---|---|
| 🔴 | Vincular WhatsApp 47999465824 à Página 1086894187837842 |
| 🔴 | Website no perfil projeto 41 (Villa Serena) |
| 🔴 | Confirmar validade do Meta Token (data de referência 06/07/2026 já vencida) |
| 🟡 | Conectar inferOfferType + SUBSEGMENTS ao resolveCampaignProfile |
| 🟡 | TikTok token no Render |
| 🟡 | Gemini chaves 2+3 em projetos Google separados |
| 🟡 | syncMetaCampaignMetrics para avgScore real |
| 🟢 | Fine-tuning MECPRO_AI_URL (HuggingFace) — 500+ campanhas |

---

*Atualizado: 2026-07-08 (sessão 21) | Score: ~96% (não reavaliado) | Último commit: 36a898d*
