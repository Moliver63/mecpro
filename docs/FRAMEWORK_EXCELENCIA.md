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

---

## REGRA 4 — VALIDAÇÃO DE CÓDIGO

Todo código deve ser analisado quanto a:
- Bugs e edge cases
- Performance (N+1 queries, loops desnecessários)
- Escalabilidade (pool de conexões, lazy init)
- Segurança (SQL injection, XSS, secrets expostos)
- Legibilidade e manutenção futura

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
```

### Budget por adSet

```
Meta mínimo real: R$5,11/adSet/dia
Validação backend: por adSet individual (não soma total)
Validação frontend: ANTES do upload de vídeo/imagem
Pre-flight: soma rawBudget dos adSets selecionados
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

### Niche normalization — ML

```typescript
// Sempre normalizar antes de query no learning_base
const nicheKey = niche.toLowerCase()
  .replace(/corretagem.*(imóveis?|imoveis?)/i, "imoveis")
  .replace(/compra.*venda.*(imóveis?|imoveis?)/i, "imoveis")
  .split(",")[0].split("\n")[0].trim().slice(0, 50);
```

### Regex — esbuild constraint

```typescript
// ❌ esbuild rejeita newlines literais em regex
.split(/[,\n\r]/)

// ✅ Usar string split
.split(",")[0].split("\n")[0]
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

## ERROS META ADS — SOLUÇÕES CONFIRMADAS

| Código | Mensagem | Causa | Fix |
|---|---|---|---|
| 2061015 | "campo link obrigatório" | wa.me em link_data ou linkUrl null | safeLink() com fallback |
| 1487246 | "phone not linked" | whatsapp_phone_number sem vínculo | só enviar quando _connectedPhone |
| 2490408 | "optimization_goal incompatível" | CONVERSATIONS sem WA vinculado | LINK_CLICKS quando !hasLinkedWA |
| 1885272 | "orçamento muito baixo" | budget < R$5,10 | mínimo R$6/adSet |
| 100/2061015 | "link obrigatório OUTCOME_LEADS" | FB page como link | usar website ou wa.me |
| Graph 400 | "phone_number inválido" | campo não existe em Page | usar whatsapp_connected_id |

---

## CRONS E TIMINGS

```
ML sync Meta:    5min após boot → a cada 24h
ML análise:     10min após boot → a cada 48h
Cloudflare FLUX: reset quota 00:00 UTC (21h BRT)
Meta token:      válido até 06/07/2026
```

---

## PENDÊNCIAS TÉCNICAS ABERTAS

| Prioridade | Item |
|---|---|
| 🔴 | Vincular WhatsApp 47999465824 à Página 1086894187837842 |
| 🔴 | Website no perfil projeto 41 (Villa Serena) |
| 🟡 | TikTok token no Render |
| 🟡 | Gemini chaves 2+3 em projetos Google separados |
| 🟡 | syncMetaCampaignMetrics para avgScore real |
| 🟢 | Fine-tuning MECPRO_AI_URL (HuggingFace) — 500+ campanhas |

---

*Atualizado: 2026-06-22 (sessão 20) | Score: ~96% | Último commit: 5b13463*
