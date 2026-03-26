# 📋 CODING RULES — MECPro

> Regras obrigatórias antes de qualquer commit. Violações causam deploy quebrado.

---

## ⚠️ REGRA #1 — VERIFICAR TYPESCRIPT ANTES DE COMMITAR

```bash
cd /tmp/mecpro && npx tsc --noEmit --skipLibCheck 2>&1 | grep -v "node_modules\|Cannot find module\|jsx-runtime\|implicitly has"
```

**Critério de aprovação:** Nenhuma linha com `error TS` nos arquivos do projeto.

Erros aceitáveis (ambiente do container, não afetam build):
- `Cannot find module 'wouter'`
- `Cannot find module '@tanstack/react-query'`
- `Cannot find module 'sonner'`
- `Cannot find module 'react'`
- `jsx-runtime`

❌ **NUNCA commitar se aparecer:**
- `error TS` em qualquer arquivo de `client/src/pages/`
- `error TS` em qualquer arquivo de `server/`
- `Unterminated regular expression`
- `Expression expected`
- `Expected corresponding JSX closing tag`

---

## ⚠️ REGRA #2 — NUNCA USAR REGEX COM LOOKAHEAD EM JSX

❌ **PROIBIDO em JSX/TSX:**
```tsx
// Quebra o esbuild/vite
{text.split(/\n\n|\n(?=[A-Z])/).map(...)}
```

✅ **CORRETO — usar função auxiliar:**
```tsx
{(() => {
  const parts = text.split("\n\n").filter(p => p.trim());
  return parts.map((p, i) => <div key={i}>{p}</div>);
})()}
```

---

## ⚠️ REGRA #3 — VERIFICAR LINHAS ÓRFÃS APÓS SUBSTITUIÇÃO

Quando usar Python para substituir blocos grandes, **sempre verificar** se não ficaram linhas do bloco antigo:

```bash
# Após qualquer substituição, verificar contexto das linhas alteradas
sed -n '610,660p' client/src/pages/CampaignResult.tsx
```

Sinais de linhas órfãs:
- `} : (` solto
- `</div>` sem abertura correspondente
- `) : (` dentro de JSX sem contexto

---

## ⚠️ REGRA #4 — TRPC: SEMPRE USAR useMutation HOOK

❌ **NUNCA chamar diretamente no onClick:**
```tsx
onClick={async () => {
  const result = await (trpc as any).rota.endpoint.mutate({ ... });
}}
```

✅ **SEMPRE declarar como hook no componente:**
```tsx
// No topo do componente:
const minhaMutation = (trpc as any).rota?.endpoint?.useMutation?.({
  onSuccess: (data) => { toast.success(data.message); refetch(); },
  onError: (e) => toast.error("❌ " + e?.message),
}) ?? { mutate: () => {}, isPending: false };

// No onClick:
onClick={() => (minhaMutation as any).mutate({ param: valor })}
```

---

## ⚠️ REGRA #5 — NUNCA APAGAR COMPONENTES AO REESCREVER

Quando reescrever um componente com Python/script, **verificar que todos os componentes ainda existem:**

```bash
grep -n "^function \|^export default function " client/src/pages/CompetitorAnalysis.tsx
```

Componentes obrigatórios em `CompetitorAnalysis.tsx`:
- `CascadeStatus`
- `AdDetailModal`
- `AddCompetitorForm`
- `EditCompetitorForm`
- `RaioX`
- `CompetitorAnalysis` (default export)

---

## ⚠️ REGRA #6 — ARQUIVO CORRETO DO ROUTER

O arquivo real do router é **`server/_core/router.ts`**.

O arquivo `server/router.ts` foi deletado (commit `623ed6e`).

Sempre editar: `server/_core/router.ts`

---

## ⚠️ REGRA #7 — TEMPLATE LITERALS ANINHADOS

❌ **PROIBIDO — backtick dentro de backtick:**
```typescript
const prompt = `texto ${condicao ? `aninhado ${var}` : ""}`;
```

✅ **CORRETO — variável separada:**
```typescript
const parte = condicao ? ` aninhado ${var}` : "";
const prompt = `texto${parte}`;
```

---

## ⚠️ REGRA #8 — LIMITE DO BODY PARSER

O Express está configurado com limite de **20MB** para suportar upload de imagens base64.

Localização: `server/_core/index.ts`
```typescript
app.use(json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
```

Nunca reduzir esse limite.

---

## ⚠️ REGRA #9 — META ADS: OBJECTIVE + OPTIMIZATION_GOAL

Combinações válidas:

| Objetivo | Com Pixel | Sem Pixel |
|----------|-----------|-----------|
| `OUTCOME_LEADS` | `LEAD_GENERATION` | `LEAD_GENERATION` |
| `OUTCOME_SALES` | `OFFSITE_CONVERSIONS` | usa `OUTCOME_TRAFFIC` + `LANDING_PAGE_VIEWS` |
| `OUTCOME_TRAFFIC` | `LANDING_PAGE_VIEWS` | `LANDING_PAGE_VIEWS` |
| `OUTCOME_ENGAGEMENT` | `POST_ENGAGEMENT` | `POST_ENGAGEMENT` |
| `OUTCOME_AWARENESS` | `REACH` | `REACH` |

❌ `OUTCOME_SALES` + `LINK_CLICKS` = **erro 2490408**

---

## ⚠️ REGRA #10 — STEPS DO CAMPAIGNBUILDER

Ordem correta dos steps:

| Step | Tela |
|------|------|
| 1 | Segmento |
| 2 | Objetivo |
| 3 | Plataforma |
| 4 | Orçamento (slider) |
| 5 | Detalhes (nome da campanha) |
| 6 | Match IA |
| 7 | Gerar |

O nome da campanha é coletado no **step 5**. Nunca mover para step anterior.

---

## 🚀 CHECKLIST PRÉ-COMMIT

```bash
# 1. Verificar TypeScript
npx tsc --noEmit --skipLibCheck 2>&1 | grep "src/" | grep "error TS"

# 2. Verificar componentes obrigatórios
grep -c "^function " client/src/pages/CompetitorAnalysis.tsx

# 3. Verificar router correto
ls server/_core/router.ts

# 4. Confirmar arquivo de destino
git diff --name-only
```

Se tudo OK → commitar e registrar em `TROUBLESHOOTING.md`.

---

## 📌 ARQUIVOS CRÍTICOS

| Arquivo | Descrição |
|---------|-----------|
| `server/_core/router.ts` | Router principal (único válido) |
| `server/_core/index.ts` | Servidor Express + body parser |
| `server/ai.ts` | Gemini + pipeline de coleta |
| `client/src/pages/CampaignResult.tsx` | Resultado da campanha |
| `client/src/pages/CompetitorAnalysis.tsx` | Módulo 2 |
| `client/src/pages/CampaignBuilder.tsx` | Construtor de campanhas |
| `TROUBLESHOOTING.md` | Registro de erros resolvidos |

---

*Última atualização: 24/03/2026*
