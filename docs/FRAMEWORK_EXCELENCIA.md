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
| `dbMod.db.getAllProjects()` | `dbMod.getAllProjects()` — db.ts não exporta objeto `db`, só named exports | Comparar com `import * as db from "../db"` já usado em router.ts |
| `campaigns.createdAt` | `campaigns.generatedAt` — createdAt nunca existiu nessa tabela | `grep pgTable` no schema real, não supor nome convencional |
| `campaigns.budget` / `campaigns.duration` | `suggestedBudgetDaily` / `durationDays` — os primeiros não existem, viram `undefined` silenciosamente (sem erro) | Mesmo cuidado acima — acesso a campo inexistente em objeto JS não quebra, só falha silenciosamente |

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

FONTE 4 — dado ESTIMADO exibido como se fosse REAL (sessão 23):
  Ads Library sem permissão (code 10) cai no fallback de estimativa via
  IA (Gemini simulando com base em SEO/site). Antes: UI mostrava como
  sucesso normal, toast verde, sem diferenciação.
  Agora: getAdSource()/isRealAdSource() (ai.ts, exportadas) classificam
  cada item. Toda tela que exibe scraped_ads precisa mostrar a origem
  explicitamente — banner de aviso + badge "· estimado" por item quando
  não é fonte real. Nunca deixar dado simulado passar visualmente como
  concorrência real.

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

1. Ler `AGENTS.md`
2. Ler `docs/SYSTEM_MEMORY.md`
3. Ler `docs/FRAMEWORK_EXCELENCIA.md`
4. Ler `docs/MEC_PRO_AI_CURRENT_STATE.md`
5. Verificar último commit (`git log --oneline -5`)
6. Identificar arquivos críticos:
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

## REGRA 13 — STOP SLOP (texto sem cara de IA)

Copy com marcas de IA performa pior: o leitor reconhece o padrão e ignora.
Vale para copy de anúncio gerada pelo sistema E para qualquer texto escrito
para o usuário (e-mails, mensagens, propostas, UI).

**Proibido:**
- Travessão longo (—) como separador de oração → use vírgula
- Conectores de transição: "além disso", "vale ressaltar/destacar/lembrar",
  "é importante notar", "em suma", "por fim", "dito isso", "nesse sentido",
  "dessa forma", "no mundo de hoje", "nos dias de hoje"
- Construção "não só X, mas também Y" → escreva "X e Y"
- Clichês motivacionais: "descubra o poder de", "desvende os segredos",
  "mergulhe no mundo de", "transforme sua vida", "leve ao próximo nível"
- Verbos inflados: "potencialize" (use melhore), "revolucione" (use mude)
- Fillers: "sem dúvida", "cada vez mais", "verdadeiramente", "simplesmente"

**Implementação no código:** `deslopify()` em `server/adAudit.ts`, aplicada no
pipeline de publicação (router.ts, junto do dedupeSentences).

**REGRA DE OURO ao remover slop:** substituir preservando a sintaxe, nunca só
deletar. Remover clichê do meio da frase deixa fragmento sem sentido
("...e transforme sua vida hoje" → "...e hoje"). Cada padrão precisa de um
substituto que mantenha a frase gramaticalmente válida.

---

## REGRA 14 — UI/UX PRO MAX

Interfaces com padrão profissional. Nada de layout genérico com cara de
template.

- Hierarquia visual clara: um único ponto focal por tela, tamanhos de fonte
  com escala intencional (não 3 tamanhos aleatórios)
- Espaçamento consistente: usar múltiplos de uma unidade base (4 ou 8px),
  nunca valores arbitrários misturados
- Tipografia e cores intencionais: cada cor tem função (sucesso, alerta,
  erro, neutro). Cinza para secundário, não para "quase tudo"
- Estados sempre tratados: carregando, vazio, erro, sucesso. Tela que só
  funciona no caminho feliz está incompleta
- Densidade adequada ao contexto: painel admin pode ser denso, onboarding não
- Feedback imediato: toda ação do usuário responde em menos de 100ms, nem que
  seja um estado de carregamento

**Escopo de aplicação:** telas NOVAS nascem neste padrão. Telas existentes só
são reestilizadas quando já houver motivo para mexer nelas — reestilização em
massa é risco de quebra sem ganho proporcional.

---

## REGRA 15 — TASK OBSERVER (correção vira padrão)

Correção feita hoje vira regra daqui pra frente. Se o usuário corrigir algo
uma vez, aquilo não deve precisar ser corrigido de novo.

**Como aplicar:**
1. Ao receber uma correção ou preferência, registrá-la neste arquivo antes de
   seguir para a próxima tarefa
2. Ler este arquivo no início de cada sessão (já é a Regra 10)
3. Nunca repetir um erro que já foi apontado — se repetir, o registro falhou

**Correções já incorporadas (histórico):**
- Nunca reduzir threshold de detecção de texto em imagem abaixo de 0.18
- esbuild rejeita newline literal em regex/split
- `api_integrations` usa `provider`, não `platform`
- Budget pode vir number ou string em runtime — normalizar antes de `.match()`
- Comentário JSX `{/* */}` é inválido dentro de expressão ternária
- `<noscript><img>` não é permitido dentro de `<head>` (spec HTML)
- Regex com flag `/g`: `.test()` antes de `.replace()` avança lastIndex e
  quebra o replace — aplicar replace direto e comparar antes/depois
- Nunca gravar validade de token sem confirmar no `/debug_token` do Meta
- Filtro de copy só tem efeito se a variável limpa for usada NO PAYLOAD, não
  apenas na auditoria (bug real encontrado em 2026-07-22)

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

### Token Meta — validade real, nunca prazo fixo (sessão 22-23)

```typescript
// ❌ ERRADO: grava "60 dias" para QUALQUER token, mesmo um curto do
// Graph Explorer (vive 1-2h). Sistema mente sobre validade até o
// token morrer em produção enquanto a UI ainda garante "válido até".
tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)

// ✅ CORRETO: consulta /debug_token da própria Meta para a validade real.
// expires_at=0 = sem expiração (grava null). Ausente/erro = grava null
// (validade desconhecida) — nunca inventar prazo.
const dbg = await fetch(`/debug_token?input_token=${token}&access_token=${appId}|${appSecret}`);
const expiresAt = dbg.data?.expires_at;
tokenExpiresAt = typeof expiresAt === "number" ? (expiresAt === 0 ? null : new Date(expiresAt * 1000)) : null;
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

### Endpoints de UPDATE nunca reconstroem estado do zero (CRÍTICO, sessão 23)

```
BUG DE NEGÓCIO GRAVE encontrado: updateAdSetPlacements (editar posicionamento
de um ad set já publicado) reconstruía o targeting do zero a cada chamada,
com fallback fixo (age 18-65, countries:["BR"]) sempre que o frontend não
enviava um campo. O frontend só mandava { adSetId, placements, placementMode }
— nunca idade/geo. Resultado: toda edição de posicionamento APAGAVA
SILENCIOSAMENTE a segmentação geográfica E etária real da campanha,
revertendo para "Brasil inteiro, 18-65 anos" com o mesmo orçamento.
Sem erro, sem aviso — só descoberto rastreando a cadeia até o fim.

REGRA: qualquer endpoint de UPDATE parcial deve buscar o estado ATUAL
no provedor (Meta) antes de reconstruir, e usar como base — só
sobrescrevendo campos com intenção EXPLÍCITA no input:

  // ❌ ERRADO: reconstrói tudo, campo ausente = fallback fixo
  targeting: {
    age_min: input.ageMin ?? 18,
    geo_locations: input.regions?.length ? {...} : { countries: ["BR"] },
  }

  // ✅ CORRETO: busca o real primeiro, preserva o que não foi pedido
  const current = await fetch(`/{id}?fields=targeting`).then(r => r.json());
  const hasExplicitIntent = !!(input.regions?.length || input.cities?.length);
  const geo = hasExplicitIntent ? rebuildFromInput(input) : current.targeting.geo_locations;
  const ageMin = input.ageMin ?? current.targeting.age_min ?? 18; // só fallback se AMBOS ausentes

Vale para qualquer campo futuro adicionado a um endpoint de edição
(interesses, públicos, orçamento) — ausência de campo no input nunca
deve significar "resetar", só "não mexer".
```

### publishStatus='success' ≠ campanha ativa na Meta (CRÍTICO, sessão 24)

```
CONFUSÃO REAL que custou uma sessão inteira de debug: publishStatus='success'
no nosso banco significa "a chamada de CRIAÇÃO funcionou na Meta" — não
significa "a campanha está ativa e gastando agora". São dois conceitos
completamente diferentes que se confundiram durante uma investigação de
campaign_metrics vazio.

CAUSA REAL do incidente: 5 campanhas de clientes reais estavam com
effective_status='PAUSED' na Meta (falta de crédito) havia dias, todas
marcadas 'success' no nosso banco — e ninguém sabia, porque nada monitora
esse tipo de divergência.

REGRA: ao investigar "por que não tem dado real de uma campanha", SEMPRE
checar o effective_status atual na Meta antes de suspeitar do código:

  GET /{campaign-id}?fields=name,status,effective_status

Valores possíveis além de ACTIVE: PAUSED, PENDING_REVIEW, DISAPPROVED,
WITH_ISSUES, ARCHIVED — todos resultam em insights vazio, sem erro.

FIX ESTRUTURAL (não pontual): checkPausedCampaigns (index.ts, cron a
cada 2h) avisa por e-mail assim que detecta essa divergência, com
debounce via campaigns.pauseNotifiedAt — nunca mais depender de alguém
notar por acaso.
```

### curl com JSON em query string — usar --data-urlencode (sessão 24)

```bash
# ❌ ERRADO: colar {"since":"...","until":"..."} direto na URL do curl
# quebra de forma inconsistente dependendo do shell/terminal (chaves e
# vírgulas podem sofrer expansão ou escape incorreto, às vezes disparando
# a chamada em duplicidade sem erro visível)
curl "...&time_range={\"since\":\"$SINCE\",\"until\":\"$TODAY\"}&..."

# ✅ CORRETO: montar a string numa variável separada, depois usar
# curl -G --data-urlencode (deixa o curl fazer o URL-encoding)
TR="{\"since\":\"$SINCE\",\"until\":\"$TODAY\"}"
curl -s -G "https://graph.facebook.com/v21.0/$ID/insights" \
  --data-urlencode "time_range=$TR" \
  --data-urlencode "access_token=$TOKEN"
```

### Cadeia de commit via GitHub API — salvar resposta em arquivo (sessão 24)

```bash
# ❌ FRÁGIL: capturar resposta HTTP em variável de shell via $() e fazer
# pipe pro python — falha de forma intermitente (JSONDecodeError sem
# causa clara, ou push retorna 422 sem motivo aparente)
COMMIT=$(curl ... | python3 -c "import json,sys; print(json.load(sys.stdin)['sha'])")

# ✅ ROBUSTO: salvar em arquivo com -o, inspecionar antes de parsear
curl -s -X POST ... -o /tmp/commitresp.json
python3 -c "import json; print(json.load(open('/tmp/commitresp.json'))['sha'])"
# Se falhar, dá pra abrir o arquivo e ver a resposta bruta antes de
# tentar de novo — mais fácil de debugar no meio da cadeia
# blob → tree → commit → PATCH ref.
```

---

### Tools MCP acionam procedures tRPC reais via createCaller (CRÍTICO, sessão 25)

```
Ao construir o servidor MCP (server/mcpServer.ts), a tentação é
reimplementar a lógica de negocio (targeting da Meta, resolução de
imagem/carrossel, checkPlanLimit) direto na tool. NUNCA fazer isso —
essa lógica já existe, já foi testada, e duplicar cria dois lugares
pra divergir com o tempo (mesma classe de bug já vista nesta sessão
com syncMetaCampaignMetrics/autoSyncMLMetrics duplicados).

PADRÃO: appRouter.createCaller({ req, res, user }) invoca o MESMO
procedure tRPC que a interface chama — literalmente o mesmo código
rodando, só acionado por uma tool MCP em vez de um clique. O helper
getCaller() busca o usuário (db.getUserById) e cria o caller sob
demanda, porque criar o McpServer é síncrono mas buscar o usuário é
assíncrono.

  const caller = appRouter.createCaller({ req: {} as any, res: {} as any, user });
  const result = await caller.campaigns.publishToMeta({ ...input });

O papel da tool MCP é só ORQUESTRAR (validar posse, resolver dependências
como imagem/página, chamar na ordem certa) — nunca decidir regra de
negócio.
```

### Antes de simplificar uma tool nova, conferir se já existe regra documentada (sessão 25)

```
Construi publish_campaign (MCP) usando só a imagem do primeiro
criativo — pareceu uma simplificação razoável. O usuário apontou "o
mecproai já tem isso parametrizado" e pediu pra ler docs/ antes de
responder. A Regra 2 deste arquivo (carrossel) já documentava
exatamente o comportamento correto (coletar TODAS as imagens dos
criativos, dedup, limite 10) — com histórico de um bug real
idêntico já resolvido antes (sessão 21).

LIÇÃO: ao construir qualquer coisa nova que toca um fluxo já
existente (publicação, geração, targeting), grep nas Regras Críticas
deste arquivo E no SYSTEM_MEMORY.md ANTES de decidir uma simplificação
"razoável" — ela pode já ter sido tentada e corrigida antes, com o
porquê documentado.
```

### Servidor OAuth próprio — 2 vulnerabilidades reais a sempre checar (sessão 25)

```
Construindo server/oauthServer.ts (autorização do conector MCP do
Claude), 2 vulnerabilidades reais foram encontradas e corrigidas ANTES
do commit — vale checar sempre que mexer em fluxo de autorização novo:

1. XSS na tela de consentimento: redirect_uri/code_challenge/state/
   resource vêm da query string (controláveis por quem monta o link)
   — NUNCA interpolar direto no HTML sem escapar (escapeHtml()).

2. Redirecionamento aberto: se o fluxo tem um caminho de "negar"/
   "cancelar" que também faz redirect, a validação de que o
   redirect_uri pertence ao client registrado precisa rodar ANTES de
   QUALQUER redirect — inclusive no caminho de negação. Validar só no
   caminho de sucesso deixa a rota funcionar como redirecionador
   aberto via o caminho de erro.

Teste mínimo antes de confiar em fluxo de autorização novo: PKCE
S256 real (gerar/derivar/validar/rejeitar verifier errado) + os 4
ataques clássicos (reuso de código, verifier errado, client_id
roubado, redirect_uri adulterado).
```

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
| 🔴 | Testar `publish_campaign` (MCP) contra a Meta real — só validado isolado até agora |
| 🔴 | Recarregar crédito das 5 campanhas pausadas (imobiliária, psicóloga, cosméticos) — descoberto por acaso na sessão 24 |
| 🔴 | Ads Library API code 10 — requer verificação de identidade (facebook.com/ID); bloqueia dado real em 2 fluxos (Módulo 2 e winner_patterns) |
| 🔴 | Vincular WhatsApp 47999465824 à Página 1086894187837842 |
| 🔴 | Website no perfil projeto 41 (Villa Serena) |
| 🟡 | Integrar buildPublishMediaFromCreative no publish_campaign (MCP) — trata vídeo + 2º mecanismo de carrossel, encontrado mas não integrado |
| 🟡 | Conectar inferOfferType + SUBSEGMENTS ao resolveCampaignProfile — learning_base só grava niche='geral' |
| 🟡 | TikTok token no Render |
| 🟡 | Gemini chaves 2+3 em projetos Google separados |
| 🟡 | Testar createLookalikeAudience em produção com audiência-semente real |
| 🟢 | Fine-tuning MECPRO_AI_URL (HuggingFace) — 500+ campanhas |

~~Confirmar validade do Meta Token~~ — resolvido estruturalmente (sessão 22):
token nunca mais grava prazo fixo, sempre consulta `/debug_token` da própria
Meta. Ver padrão em "Token Meta — validade real" acima.

~~syncMetaCampaignMetrics para avgScore real~~ — resolvido (sessão 24):
campaign_metrics diário rodando via cron automático (autoSyncMLMetrics),
com log de erro/resumo visível. Ver padrão "publishStatus='success' ≠
campanha ativa" acima para a causa raiz real de dado vazio.

~~Conector MCP do Claude falhava com 404~~ — resolvido (sessão 25):
servidor OAuth 2.1 próprio, ver seção "Servidor OAuth próprio" acima.

---

*Atualizado: 2026-08-05 (sessão 25) | Score: ~96% (não reavaliado) | Último commit: e515c82*
