# 🛠️ MECPro AI — Guia de Troubleshooting & Correções

> Documento criado em 22/03/2026 — registra todos os erros encontrados em produção, soluções aplicadas e validações.
> **REGRA:** Todo erro novo resolvido DEVE ser registrado aqui antes do commit.

---

## 📋 Índice

1. [Publicação Meta — destino obrigatório incorreto](#1-publicação-meta--destino-obrigatório-incorreto)
2. [Upload de imagem — [object Object]](#2-upload-de-imagem--object-object)
3. [Upload de imagem — t[i] is not a function](#3-upload-de-imagem--ti-is-not-a-function)
4. [Upload de imagem — prefixo base64 não removido](#4-upload-de-imagem--prefixo-base64-não-removido)
5. [Upload de imagem — tamanho não validado](#5-upload-de-imagem--tamanho-não-validado)
6. [Multi-upload com foto destaque](#6-multi-upload-com-foto-destaque)
7. [OUTCOME_LEADS exige URL incorretamente](#7-outcome_leads-exige-url-incorretamente)
8. [Aviso visual por objetivo no modal](#8-aviso-visual-por-objetivo-no-modal)
9. [Página branca — variável campData inexistente](#9-página-branca--variável-campdata-inexistente)
10. [Símbolos duplicados no ai.ts](#10-símbolos-duplicados-no-aits)
11. [Gemini quota esgotada](#11-gemini-quota-esgotada)
12. [Meta Ads Library sem permissão](#12-meta-ads-library-sem-permissão)

---

## 1. Publicação Meta — destino obrigatório incorreto

### ❌ Erro
```
Não foi possível definir automaticamente o destino do anúncio.
Cadastre o site ou WhatsApp do cliente no Perfil do Cliente.
```

### 🔍 Causa
O código exigia URL de destino para **todos** os objetivos. Mas cada objetivo tem regras diferentes da Meta:

| Objetivo | Precisa de URL externa? | Por quê |
|----------|------------------------|---------|
| `OUTCOME_LEADS` | ❌ Não | Usa formulário nativo do Facebook |
| `OUTCOME_AWARENESS` | ❌ Não | Aponta para a Página do Facebook |
| `OUTCOME_ENGAGEMENT` | ❌ Não | Aponta para a Página do Facebook |
| `OUTCOME_TRAFFIC` | ✅ Sim | Precisa de site/landing page |
| `OUTCOME_SALES` | ✅ Sim | Precisa de site/checkout |

### ✅ Solução — `server/router.ts`
```typescript
const noLinkRequired = [
  "OUTCOME_AWARENESS",
  "OUTCOME_LEADS",
  "OUTCOME_ENGAGEMENT",
].includes(campaignObjective);

if (!effectiveLink && !noLinkRequired) {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "Informe a URL de destino para campanhas de Tráfego ou Vendas.",
  });
}

// Fallback: usa URL da Página do Facebook quando não há link externo
const finalLink = effectiveLink || `https://www.facebook.com/${input.pageId}`;
```

### ✅ Validado em produção
```
[meta] Image uploaded OK {"hash":"9e435b31...","fileName":"DALCELIS.jpg"}
[meta] Image uploaded OK {"hash":"72391d47...","fileName":"DALCELIS1.jpg"}
[meta] Campaign payload debug {"objective":"OUTCOME_TRAFFIC",...}
```
**Status:** ✅ Resolvido — 23/03/2026

---

## 2. Upload de imagem — [object Object]

### ❌ Erro
```
❌ Upload falhou: [object Object]
```

### 🔍 Causa
Frontend chamava `/api/meta/upload-media` — endpoint REST que **não existia**. Retornava HTML 404 que ao ser parseado virava objeto, e `data.error` exibia `[object Object]`.

### ✅ Solução — `client/src/pages/CampaignResult.tsx`
Substituir fetch REST pelo tRPC `integrations.uploadImageToMeta`:

```typescript
// ❌ ERRADO
const res = await fetch("/api/meta/upload-media", { method: "POST", body: formData });
const data = await res.json();
toast.error(`❌ Upload falhou: ${data.error}`); // data.error é objeto!

// ✅ CORRETO
const base64: string = await new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload  = () => resolve((reader.result as string).split(",")[1] ?? "");
  reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
  reader.readAsDataURL(mediaFile);
});
const result = await uploadImageMutation.mutateAsync({
  imageBase64: base64,
  fileName: mediaFile.name,
});
```

### 💡 Regra geral
> Sempre exibir erros como `e?.message` — nunca como `e` ou `data.error` direto.
> Verificar se endpoint REST existe antes de chamar; preferir tRPC.

**Status:** ✅ Resolvido — 22/03/2026

---

## 3. Upload de imagem — t[i] is not a function

### ❌ Erro
```
❌ Upload falhou: t[i] is not a function
```

### 🔍 Causa
Erro de minificação React/Vite. O código chamava `.mutate()` diretamente no cliente tRPC **fora de um hook React**:

```typescript
// ❌ ERRADO — .mutate() não existe direto no cliente tRPC
const result = await (trpc as any).integrations.uploadImageToMeta.mutate({ ... });
```

### ✅ Solução — `client/src/pages/CampaignResult.tsx`
Declarar hook `useMutation` dentro do componente:

```typescript
// ✅ CORRETO — declarar no topo do componente
const uploadImageMutation = (trpc as any).integrations?.uploadImageToMeta?.useMutation?.()
  ?? { mutateAsync: null };

// Na função de upload:
if (!uploadImageMutation.mutateAsync) {
  toast.error("Função de upload indisponível. Recarregue a página.");
  return;
}
const result = await uploadImageMutation.mutateAsync({ imageBase64: base64, fileName });
```

### 💡 Regra geral
> tRPC no React **SEMPRE** precisa de hook `useMutation()` declarado dentro do componente.
> Nunca chamar `.mutate()` ou `.mutateAsync()` diretamente no cliente sem o hook.

**Status:** ✅ Resolvido — 23/03/2026

---

## 4. Upload de imagem — prefixo base64 não removido

### ❌ Erro
```
Meta adimages: Invalid image data
```

### 🔍 Causa
O `FileReader.readAsDataURL()` retorna `data:image/jpeg;base64,/9j/...` mas a Meta só aceita o base64 puro sem o prefixo.

### ✅ Solução — `server/router.ts`
```typescript
// Remove prefixo data:image/...;base64, automaticamente
const base64Clean = input.imageBase64
  .replace(/^data:image\/[a-zA-Z]+;base64,/, "")
  .trim();
```

### 💡 Regra geral
> Sempre remover o prefixo `data:image/...;base64,` antes de enviar para a Meta API.
> Fazer no servidor (mais seguro) não no frontend.

**Status:** ✅ Resolvido — 22/03/2026

---

## 5. Upload de imagem — tamanho não validado

### ❌ Comportamento
Upload trava ou falha silenciosamente para imagens grandes.

### 🔍 Causa
Sem validação de tamanho antes de enviar para a Meta. A Meta rejeita imagens acima de ~4MB.

### ✅ Solução — `server/router.ts`
```typescript
const sizeBytes = Math.ceil(base64Clean.length * 0.75);
if (sizeBytes > 4 * 1024 * 1024) {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `Imagem muito grande (${(sizeBytes/1024/1024).toFixed(1)}MB). Limite: 4MB.`,
  });
}

if (!base64Clean || base64Clean.length < 100) {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "Dados da imagem inválidos ou corrompidos.",
  });
}
```

**Status:** ✅ Resolvido — 22/03/2026

---

## 6. Multi-upload com foto destaque

### 📋 Feature implementada
Usuário pode enviar até 5 fotos e escolher qual é o **destaque** (usada no criativo principal).

### ✅ Implementação — `client/src/pages/CampaignResult.tsx`

**Estados adicionados:**
```typescript
const [mediaFiles,      setMediaFiles]      = useState<File[]>([]);
const [mediaPreviews,   setMediaPreviews]   = useState<string[]>([]);
const [uploadedHashes,  setUploadedHashes]  = useState<string[]>([]);
const [featuredIndex,   setFeaturedIndex]   = useState<number>(0);
const [uploadingIndex,  setUploadingIndex]  = useState<number | null>(null);
```

**Lógica principal:**
- Grid de miniaturas 3 colunas
- Clique em foto → define como destaque (borda azul + badge ⭐)
- Badge ✅ por foto enviada com sucesso
- Botão "Enviar X foto(s)" envia todas pendentes em sequência
- Hash da foto destaque vai para `uploadedHash` usado no `publishToMeta`

### ✅ Validado em produção
```
[meta] Image uploaded OK {"hash":"9e435b31...","fileName":"DALCELIS.jpg"}
[meta] Image uploaded OK {"hash":"72391d47...","fileName":"DALCELIS1.jpg"}
```

**Status:** ✅ Implementado e validado — 23/03/2026

---

## 7. OUTCOME_LEADS exige URL incorretamente

### ❌ Erro
```
Não foi possível definir automaticamente o destino do anúncio.
```
Para campanhas de **Captação de Leads**.

### 🔍 Causa
`OUTCOME_LEADS` foi tratado como se precisasse de URL externa, mas o formulário de leads do Facebook é **nativo** — fica dentro da plataforma, não precisa de site.

### ✅ Solução — `server/router.ts`
Ver item 1 — `OUTCOME_LEADS` adicionado à lista `noLinkRequired`.

Bloco específico para LEADS sem URL:
```typescript
} else if (campaignObjective === "OUTCOME_LEADS" && !effectiveLink) {
  storySpec = {
    page_id: input.pageId,
    link_data: {
      message: (creative?.copy || c.name).slice(0, 2000),
      name:    (creative?.headline || c.name).slice(0, 255),
      link:    `https://www.facebook.com/${input.pageId}`,
      call_to_action: { type: "LEARN_MORE" },
    },
  };
}
```

### 💡 Regra geral
> LEADS no Facebook = formulário interno. Não confundir com "leads via site".
> Só TRAFFIC e SALES precisam de URL externa obrigatória.

**Status:** ✅ Resolvido — 23/03/2026

---

## 8. Aviso visual por objetivo no modal

### 📋 Feature implementada
Modal de publicação mostra aviso contextual por objetivo, evitando confusão do usuário.

### ✅ Mensagens por objetivo — `client/src/pages/CampaignResult.tsx`

| Objetivo | Badge | Mensagem |
|----------|-------|----------|
| `leads` | 🟢 OPCIONAL | "O formulário fica dentro do próprio Facebook — não precisa de site." |
| `branding/engagement` | 🟢 OPCIONAL | "O anúncio aponta para sua Página do Facebook." |
| `traffic/sales` sem URL | 🔴 OBRIGATÓRIO | "Cadastre o site no Perfil do Cliente, ou informe abaixo." |
| `traffic/sales` com URL | 🔵 RECOMENDADO | "Usando automaticamente: [url do perfil]" |

**Status:** ✅ Implementado — 23/03/2026

---

## 9. Página branca — variável campData inexistente

### ❌ Erro
```
⚠️ Algo deu errado — Ocorreu um erro inesperado nesta página.
```

### 🔍 Causa
Correção anterior usou `campData` como nome da variável mas o nome real no componente é `campaign`:

```typescript
// ❌ ERRADO — variável não existe
const campaignObj = (campData as any)?.objective || "";

// ✅ CORRETO
const campaignObj = (campaign as any)?.objective || "";
```

### 💡 Regra geral
> Antes de usar uma variável em JSX, confirmar o nome exato com `grep -n "const camp\|data: camp" arquivo.tsx`.
> Página branca no React geralmente = variável/prop inexistente ou erro de tipo.

**Status:** ✅ Resolvido — 23/03/2026

---

## 10. Símbolos duplicados no ai.ts

### ❌ Erro nos logs
```
Transform failed with 2 errors:
ERROR: The symbol "NICHE_BENCHMARKS" has already been declared
ERROR: The symbol "getBenchmarks" has already been declared
```

### 🔍 Causa
Constantes ou funções declaradas duas vezes no mesmo arquivo `server/ai.ts`.

### ✅ Solução
```bash
# Encontrar todas as ocorrências
grep -n "NICHE_BENCHMARKS\|getBenchmarks" server/ai.ts

# Remover a segunda declaração (manter a primeira)
```

### 💡 Regra geral
> Ao editar `server/ai.ts`, sempre verificar se já existe antes de adicionar.
> Usar `grep -n "nomeDaFuncao" server/ai.ts` para confirmar unicidade.

**Status:** ✅ Identificado — arquivo em produção estava desatualizado em relação ao GitHub.

---

## 11. Gemini quota esgotada

### ❌ Erro nos logs
```
Gemini: You exceeded your current quota, please check your plan and billing details
rate_limit_error — Todos os modelos Gemini indisponíveis
```

### 🔍 Causa
Chave da API Gemini atingiu o limite do plano gratuito.

### ✅ Solução imediata
1. Acesse **aistudio.google.com** → API Keys
2. Verifique uso e limite da chave `GEMINI_API_KEY`
3. Faça upgrade para plano pago ou aguarde reset (meia-noite horário EUA)

### ✅ Solução definitiva — rotação de chaves
Adicionar no `.env`:
```env
GEMINI_API_KEY=chave1
GEMINI_API_KEY_2=chave2
GEMINI_API_KEY_3=chave3
```

Implementar em `server/ai.ts`:
```typescript
const GEMINI_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter(Boolean);

let keyIndex = 0;
function getNextGeminiKey() {
  return GEMINI_KEYS[keyIndex++ % GEMINI_KEYS.length];
}
```

**Status:** ✅ Implementado — 23/03/2026

### ✅ O que foi implementado em `server/ai.ts`
- `_exhaustedKeys` — Set que rastreia chaves com quota esgotada
- `_exhaustedAt` — Map com timestamp de quando a chave esgotou
- Reset automático após 1 hora (`QUOTA_RESET_MS = 60 * 60 * 1000`)
- `markGeminiKeyExhausted(key)` — marca chave ao detectar erro 429/quota
- `getGeminiKey()` — retorna apenas chaves disponíveis (não esgotadas)
- Log claro: `"Gemini key marcada como esgotada { keyPrefix, totalExhausted, availableKeys }"`

### ⚙️ Configurar no Render
Adicione as variáveis de ambiente:
```
GEMINI_API_KEY=AIza...chave1
GEMINI_API_KEY_2=AIza...chave2
GEMINI_API_KEY_3=AIza...chave3
```

---

## 12. Meta Ads Library sem permissão

### ❌ Erro nos logs
```
Meta API error — code=10 type=OAuthException
Application does not have permission for this action
META ERRO 10: App não tem acesso à Ads Library API
```

### ✅ Solução
1. Acesse **developers.facebook.com**
2. Selecione seu App
3. Vá em **Produtos → Marketing API**
4. Solicite acesso à **Ads Library API**
5. Aguarde aprovação (pode levar dias)

**Status:** ⚠️ Pendente — requer aprovação do Facebook

---

## 🏗️ Arquitetura de integração Meta Ads

```
Frontend (React/CampaignResult.tsx)
    ↓ uploadImageMutation.mutateAsync (tRPC hook)
server/router.ts → integrations.uploadImageToMeta
    ↓ POST /act_xxx/adimages (base64 limpo, sem prefixo)
graph.facebook.com/v19.0/
    ↓ retorna { images: { filename: { hash, url } } }
Frontend → armazena hash em uploadedHash

Frontend → publishMutation.mutateAsync (tRPC hook)
server/router.ts → campaigns.publishToMeta
    ↓
    1. POST /act_xxx/campaigns  → metaCampaignId
    2. POST /act_xxx/adsets     → metaAdSetId
    3. POST /act_xxx/adcreatives (com image_hash) → metaCreativeId
    4. POST /act_xxx/ads        → metaAdId
    ↓
Campanha criada com status PAUSED no Gerenciador de Anúncios
```

---

## 🔧 Variáveis de ambiente

```env
# Banco
DATABASE_URL=

# Auth
JWT_SECRET=
SESSION_SECRET=

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# IA — pode esgotar quota, adicionar KEY_2 e KEY_3 para rotação
GEMINI_API_KEY=
GEMINI_API_KEY_2=
GEMINI_API_KEY_3=

# Pagamentos
STRIPE_SECRET_KEY=

# App
APP_URL=https://www.mecproai.com
NODE_ENV=production
```

---

## 📅 Histórico de commits desta sessão

| Commit | Data | Descrição |
|--------|------|-----------|
| `e11fc29` | 22/03/2026 | fix: OUTCOME_AWARENESS sem destino + upload imagem via tRPC |
| `33b67fd` | 22/03/2026 | fix: validação destino no frontend + log diagnóstico |
| `9c79936` | 23/03/2026 | fix: corrige variável campData → campaign |
| `5025b58` | 23/03/2026 | fix: OUTCOME_LEADS e ENGAGEMENT sem URL obrigatória |
| `f19ceae` | 23/03/2026 | fix: storySpec correto por objetivo |
| `8ac8f53` | 23/03/2026 | feat: aviso claro de destino por objetivo no modal |
| `60f7b40` | 23/03/2026 | fix: log diagnóstico no uploadImageToMeta |
| `2ed3b76` | 23/03/2026 | fix: uploadImageToMeta usando useMutation hook corretamente |
| `370b2d4` | 23/03/2026 | feat: multi-upload de fotos com destaque |
| `6ab6eba` | 23/03/2026 | docs: cria TROUBLESHOOTING.md |

---

## 📌 Regras para novos erros

1. **Reproduzir** o erro e anotar a mensagem exata do log
2. **Identificar** o arquivo e linha exata com `grep -n`
3. **Corrigir** o código
4. **Testar** em produção e confirmar no log do Render
5. **Registrar** aqui antes de fechar a tarefa

---

*Última atualização: 23/03/2026 — rotação Gemini implementada*

---

## 13. Ads Library — anúncios estimados em vez de reais

### ❌ Comportamento
Todos os anúncios aparecem com badge **⚠️ Estimado** — gerados por IA, não coletados do Facebook.

### 🔍 Causa
O Facebook bloqueia requisições de servidores (Render) na Ads Library pública. A URL que funciona no navegador não funciona no servidor porque:
- O navegador tem **cookies de sessão** do Facebook
- O Facebook detecta IPs de servidores e retorna vazio
- Sem Page ID cadastrado, a API oficial não é acionada

### ✅ Soluções por ordem de eficácia

**1. Cadastrar o Page ID do concorrente** ← mais rápido
- Página Facebook do concorrente → Sobre → ID da Página
- MECPro → Concorrentes → editar → campo Page ID
- Ativa a Meta API Oficial que já está conectada

**2. Solicitar permissão Ads Library API** ← mais completo
- developers.facebook.com → App → Marketing API → Ads Library API
- Aprovação leva 3-7 dias

**3. Melhoria aplicada nos parâmetros de busca** ← já implementado
```typescript
// Params agora idênticos ao link do navegador
search_type: "keyword_unordered",
"sort_data[mode]": "total_impressions",
"sort_data[direction]": "desc",
is_targeted_country: "false",
// Tenta também com @handle além do nome
variants: [keyword, `@${keyword}`]
```

### 💡 Regra geral
> O Facebook bloqueia scraping de servidores intencionalmente.
> A única solução confiável é a API oficial com permissão aprovada + Page ID cadastrado.

**Status:** ⚠️ Parcialmente resolvido — params melhorados, mas bloqueio do Facebook persiste sem Page ID ou permissão da API

---

*Última atualização: 23/03/2026 — diagnóstico Ads Library adicionado*

---

## 14. Arquivo de router errado — server/router.ts vs server/_core/router.ts

### ❌ Erro
```
No procedure found on path "competitors.discoverPageId"
```
Mesmo após múltiplos deploys com o fix aplicado.

### 🔍 Causa
O projeto tem **dois arquivos de router**:
- `server/router.ts` — arquivo duplicado, **NÃO é usado pelo servidor**
- `server/_core/router.ts` — **arquivo real**, importado pelo `server/_core/index.ts`

```typescript
// server/_core/index.ts
import { appRouter } from './router.js'; // = server/_core/router.ts ← ESTE
```

Todas as correções foram aplicadas no arquivo errado por semanas.

### ✅ Solução
1. Aplicar todos os fixes em `server/_core/router.ts`
2. Deletar `server/router.ts` para evitar confusão futura

### 💡 Regra geral
> Sempre verificar qual arquivo o `index.ts` importa antes de editar.
> Usar `grep -n "import.*router" server/_core/index.ts` para confirmar.
> **O arquivo correto é sempre `server/_core/router.ts`**

**Status:** ✅ Resolvido — 23/03/2026 — server/router.ts deletado

---

*Última atualização: 23/03/2026 — arquivo router duplicado identificado e removido*

---

## 15. Regra obrigatória — tRPC mutations no React

### ❌ Erro recorrente
```
t[i] is not a function
```

### 🔍 Causa
Toda vez que adicionamos um novo endpoint tRPC e tentamos chamá-lo diretamente no evento `onClick` sem declarar o hook `useMutation` primeiro.

### ✅ Padrão obrigatório

**SEMPRE declarar o hook no topo do componente:**
```typescript
// ✅ CORRETO — declarar como hook no componente
const minhaMutation = (trpc as any).rota?.endpoint?.useMutation?.({
  onSuccess: (data) => { toast.success(data.message); refetch(); },
  onError: (e) => toast.error("❌ " + e?.message),
}) ?? { mutate: () => {}, isPending: false };

// No onClick:
onClick={() => (minhaMutation as any).mutate({ param: valor })}
```

**NUNCA chamar direto no onClick:**
```typescript
// ❌ ERRADO — causa "t[i] is not a function"
onClick={async () => {
  const result = await (trpc as any).rota.endpoint.mutate({ param: valor });
}}
```

### 💡 Regra geral
> Todo novo endpoint tRPC adicionado ao `server/_core/router.ts` precisa de um hook `useMutation` declarado **dentro do componente React** que vai usá-lo, **nunca** chamado diretamente.

**Status:** ✅ Regra documentada — 23/03/2026

---

## 16. PayloadTooLargeError — imagem muito grande

### ❌ Erro
```
PayloadTooLargeError: request entity too large
```

### 🔍 Causa
O Express tinha limite padrão de 100kb no body parser. Upload de imagens em base64 facilmente ultrapassa isso.

### ✅ Solução — `server/_core/index.ts`
```typescript
app.use(json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
```

**Status:** ✅ Resolvido — 23/03/2026

---

## 17. OUTCOME_SALES — optimization_goal inválido sem pixel

### ❌ Erro
```
Você não pode usar a meta de desempenho selecionada com seu objetivo da campanha.
error_subcode: 2490408 — blame_field: optimization_goal
```

### 🔍 Causa
`OUTCOME_SALES` com `OFFSITE_CONVERSIONS` exige **Facebook Pixel** configurado. Sem pixel a Meta rejeita.

### ✅ Solução — `server/_core/router.ts`
```typescript
// Com pixel → OFFSITE_CONVERSIONS
// Sem pixel → LINK_CLICKS (funciona sem pixel)
if (o === "sales") return pixelId ? "OFFSITE_CONVERSIONS" : "LINK_CLICKS";
```

### 💡 Regra geral
> Para campanhas de Vendas com otimização real, configure o Facebook Pixel no campo correspondente no modal de publicação. Sem pixel, usa LINK_CLICKS como fallback.

**Status:** ✅ Resolvido — 23/03/2026

---

## 18. Carrossel Meta Ads — implementação

### 📋 Feature implementada
Publicação automática em formato **carrossel** quando o usuário envia 2 ou mais fotos.

### ✅ Regras Meta seguidas

| Regra | Valor |
|-------|-------|
| Mínimo de cards | 2 |
| Máximo de cards | 10 |
| Cada card tem | link + imagem + título + CTA |
| `multi_share_end_card` | `false` — remove card automático de perfil |
| `multi_share_optimized` | `false` — mantém ordem das fotos |

### ✅ Lógica automática
- **1 foto** → imagem simples
- **2-10 fotos** → carrossel automático
- **>10 fotos** → usa as primeiras 10

### ✅ Campos adicionados ao input
```typescript
imageHashes: z.array(z.string()).optional() // array de hashes para carrossel
imageUrls:   z.array(z.string()).optional() // array de URLs para carrossel
```

**Status:** ✅ Implementado — 23/03/2026

---

## 19. Melhorias aplicadas com base em análise de log — 23/03/2026

### 🔍 Problemas identificados no log

| Problema | Frequência | Impacto |
|----------|-----------|---------|
| `discoverPageId` sempre falha para Triadi/Embraed | Alta | Page ID não encontrado |
| Gemini chamado repetidamente para o mesmo concorrente | Alta | Quota esgota rapidamente |
| `pages_read_engagement` não disponível no token | Alta | Estratégia 0b sempre falha |
| Meta Ads Library bloqueada no Render | Permanente | Dados sempre estimados |

### ✅ Melhorias aplicadas

**1. `discoverPageId` — nova estratégia 0: HTML do Facebook**
```
Acessa facebook.com/{handle} diretamente
Extrai page_id de padrões no HTML:
  - "pageID":"123..."
  - "page_id":"123..."
  - "entity_id":"123..."
Sem precisar de permissão especial
```

**2. Cache Gemini 5 minutos**
```typescript
// Antes: mesmo prompt chamado 3-5x em sequência
// Depois: resultado cacheado por 5 minutos
// Economia: ~80% das chamadas redundantes eliminadas
const cached = getCachedGemini(cacheKey);
if (cached) return cached; // sem chamada à API
```

**3. Limite de 50 entradas no cache**
- Evita consumo excessivo de memória no servidor Render

### 💡 Observações do log

- **Boutique Pão de Ló** → website scraping funcionou bem (6 anúncios)
- **Triad** → Page ID `248724168983172` já cadastrado mas Meta API bloqueada
- **Embraed** → Page ID `100063715809053` cadastrado, mesma situação
- O Gemini (2.5-flash) está funcionando quando não está em quota

**Status:** ✅ Melhorias aplicadas — 23/03/2026

---

## 📋 SESSÃO 25/03/2026 — Integrações, Modal Meta, Copy e Análise de Concorrentes

---

### ❌ ERRO: Modal Meta Ads vertical (maxWidth 500px)
**Sintoma:** Modal de publicação estreito, configurações e mídia empilhadas verticalmente  
**Causa:** `maxWidth: 500` sem layout de colunas  
**Solução:** Redesign para horizontal 2 colunas (`maxWidth: 960`)
- Coluna esquerda: PlacementSelector + ad set + página FB + destino URL
- Coluna direita: upload mídia + botões de ação
- Botões reorganizados: Meta (principal) → Cancelar → Google + TikTok lado a lado

**Commits:** `3a7b58c`, `53374fe`

---

### ❌ ERRO: Upload de fotos não conectado no modal Meta
**Sintoma:** Botão "Enviar fotos" não fazia nada  
**Causa:** `handleUploadMedia()` usava `mediaFile` (estado antigo, vazio) em vez de `mediaFiles[i]` (array novo)  
**Solução:** `handleUploadMedia(fileOverride?: File)` aceita arquivo direto
```typescript
// Antes (errado):
await handleUploadMedia(); // usava mediaFile vazio

// Depois (correto):
const hash = await handleUploadMedia(mediaFiles[i]); // passa o arquivo real
newHashes[i] = hash;
setUploadedHashes([...newHashes]);
```
**Commit:** `ead3a76`

---

### ❌ ERRO: Post orgânico — token da página inválido
**Sintoma:** `"Não foi possível obter o token da página"` com ID da conta de anúncios  
**Causa:** Endpoint `/{pageId}?fields=access_token` não funciona com ID de conta de anúncios  
**Solução:** Usa `GET /me/accounts` para buscar o page token correto
```typescript
// Antes (errado):
fetch(`/v19.0/${pageId}?fields=access_token`) // só funciona com page ID real

// Depois (correto):
fetch(`/v19.0/me/accounts?fields=id,name,access_token`)
// Encontra a página pelo ID na lista e pega o token dela
```
**Commit:** `54d1a70`

---

### ❌ ERRO: Post orgânico — `attached_media[0][media_fbid] must be a valid media id`
**Sintoma:** Erro `(#100)` ao publicar post com imagem  
**Causa:** Hash do `/adimages` é exclusivo para anúncios pagos — inválido para posts orgânicos  
**Solução:** Upload via `/{page-id}/photos?published=false` que retorna `photo_id` correto
```
FLUXO ERRADO:
uploadImageToMeta → /adimages → hash "9e435b31..."
publishOrganicPost → attached_media[media_fbid] = hash → (#100) ERRO

FLUXO CORRETO:
Frontend envia imageBase64
publishOrganicPost → /{page-id}/photos → photo_id "1234567..."
POST /{page-id}/feed → attached_media[media_fbid] = photo_id → ✅ OK
```
**Commit:** `2186c9f`

---

### ❌ ERRO: Post orgânico — `(#200) pages_manage_posts`
**Sintoma:** Erro ao publicar post orgânico mesmo com page token correto  
**Causa:** Permissão `pages_manage_posts` não aprovada no app Meta  
**Solução (código):** Aviso claro no modal com passos de resolução  
**Solução (Meta):**
1. `developers.facebook.com` → App → App Review → Permissions
2. Solicitar `pages_manage_posts` + `pages_read_engagement` → Advanced Access
3. **Alternativa imediata:** App Roles → Testers → adicionar conta pessoal

**Nota:** Este erro NÃO tem solução via código — é barreira do Facebook  
**Commit:** `d572306`

---

### ✅ MELHORIA: Copy direcionado nos anúncios pagos
**Problema:** Meta/Google/TikTok usavam `c.strategy` (texto interno) como copy do anúncio  
**Solução:** Função `buildAdCopy()` em `router.ts` extrai dos criativos reais:

| Campo | Fonte |
|-------|-------|
| `message` (Meta) | `hook + "\n\n" + copy` do criativo |
| `name` (Meta) | `cr.headline` |
| H1 Google | `cr.headline` (30 chars) |
| H2 Google | `cr.hook` (30 chars) |
| H3 Google | CTA traduzido (30 chars) |
| D1 Google | `cr.copy` (90 chars) |
| TikTok adText | `hook curto + copy` (100 chars) |

**Commit:** `e0c8e7c`

---

### ✅ MELHORIA: Post orgânico com mensagem gerada dos criativos
**Antes:** Usava `c.strategy.slice(0, 500)` — texto técnico de planejamento  
**Depois:** Função `generateOrganicMessage()` monta:
1. Hook de abertura (`cr.hook`)
2. Proposta de valor (`cr.headline`)
3. Desenvolvimento (`cr.copy` até 280 chars)
4. Público (`adSets[0].audience`)
5. CTA natural (`👉 Saiba mais`, `📝 Cadastre-se`, etc.)
6. Hashtags automáticas por nicho detectado

**Commit:** `2af1889`

---

### ❌ ERRO: `discoverPageId my_pages_match` retorna página errada
**Sintoma:** Busca por "Ademicon" retorna "OTM-Veículos&Motos" (sua própria página)  
**Causa:** Match parcial — `rawSimple.includes(u)` aceitava qualquer substring  
**Solução:** Match EXATO — `u === raw || u === rawSimple || n === companySlug`
```typescript
// Antes (bugado):
return u === raw || u === rawSimple ||
       n.includes(rawSimple) || n.includes(companySlug) ||
       rawSimple.includes(u) || companySlug.includes(u); // PERIGOSO

// Depois (correto):
return u === raw || u === rawSimple || n === companySlug; // match exato
```
**Commit:** `8645a15`

---

### ✅ MELHORIA: discoverPageId v3 — estratégias reescritas
**Problema:** 5 das 6 estratégias falhavam no Render  

| # | Estratégia | Status Anterior | Status Novo |
|---|-----------|-----------------|-------------|
| 1 | Graph direto | ✅ OK | ✅ igual |
| 2a | Instagram oEmbed | ❌ Graph API bloqueado | ✅ `instagram.com/oembed` público |
| 2b | IG Business API | ❌ não existia | ✅ novo |
| 3 | Minhas páginas | ❌ falso positivo | ✅ match exato |
| 4 | Pages search | ❌ endpoint depreciado | ✅ slug variations |
| 5b | Variações de slug | ❌ não existia | ✅ novo |
| 6 | Gemini | ⚠️ prompt vago | ✅ temperature=0, regras rígidas |

**Commit:** `7a8445a`

---

### ✅ NOVO RECURSO: Google Ads Keyword Planner no analisador
**O que faz:** Busca keywords reais do nicho/concorrente via Google Ads API  
**Pipeline:** Roda SEMPRE (independente de `shouldFetch`), pula se já tiver keywords salvas  
**Dados retornados por keyword:**
- Volume mensal de buscas
- CPC médio em BRL
- Nível de competição (🔴 Alta / 🟡 Média / 🟢 Baixa)

**Requisitos:** Google Ads conectado em Configurações com:
- Developer Token
- Customer ID
- Refresh Token
- Client ID + Secret

**Commit:** `e6d967a`, `8645a15`

---

### ❌ ERRO: Meta Ads Library — code=10 (permanente)
**Sintoma:** `"Application does not have permission for this action"`  
**Causa:** A Ads Library API exige processo de aprovação SEPARADO de `ads_read`  
**Solução definitiva:**
1. Acesse `facebook.com/ads/library/api`
2. Clique "Access the API" → selecione seu app
3. Complete processo de verificação de identidade em `facebook.com/ID`
4. Aguarde aprovação

**Workaround atual:** Fallback para Gemini SEO analysis (anúncios estimados)  
**Status:** ⏳ Aguardando aprovação do Facebook

---

### 📊 Credenciais configuradas (25/03/2026)

| Plataforma | Status | Observação |
|-----------|--------|-----------|
| **Meta Ads** | ✅ Conectado | Token expira ~17/05/2026 |
| **Google Ads** | ✅ Conectado | Developer Token em modo Test |
| **TikTok Ads** | ⏳ Pendente | Falta Access Token + Advertiser ID |

**Google Ads credenciais salvas:**
- Customer ID: `723-157-8425` (conta real) / `385-699-2760` (MCC)
- Developer Token: configurado no Render
- OAuth: Client ID + Secret do projeto `mecproai` no Google Cloud

