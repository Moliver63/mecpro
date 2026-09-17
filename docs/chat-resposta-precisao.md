# Precisão e poder de resposta do chat — temperature, limites de saída, thinking e disciplina de fonte

Branch: `feat/chat-resposta-precisao` · Pedido de Michel (17/09): "preciso ajustar minha ia do chat para dar mais poder de resposta e precisão".

## Diagnóstico

Auditoria da cadeia de provedores do chat (`server/chat.ts`) encontrou 4 lacunas de precisão/poder:

1. **Gemini sem `temperature` declarada** — o padrão do `gemini-flash-latest` é 1.0, alto demais para um assistente factual com function calling (variação desnecessária nas respostas e nas escolhas de ferramenta). Groq e DeepSeek já rodavam a 0.3; o Gemini era o elo mais "criativo" justamente no provedor principal.
2. **Nenhum provedor com limite de saída declarado** — sem `maxOutputTokens`/`max_tokens`, respostas longas (ex: modo de velocidade "lenta") podiam ser cortadas no meio, e o usuário recebia resposta mutilada sem nenhum sinal de truncamento.
3. **Modo "lenta" sem orçamento de raciocínio** — o usuário troca velocidade por profundidade, mas a configuração de geração era idêntica à do modo médio.
4. **Sem disciplina de fonte para fatos gerais** — a policy conversacional proibia inventar métricas do usuário, mas não orientava o que fazer com número/preço/data vindo de conhecimento do modelo ou de pesquisa web (a ferramenta `pesquisar_web` entrou no dia anterior).

## Mudanças

### 1. Gemini: temperature 0.4 + maxOutputTokens 2048 em todos os modos

`server/chat.ts` — nova função pura e exportada `configGeminiChat(velocidade)` centraliza a `GenerateContentConfig`: `temperature: 0.4` (alinhada com os fallbacks, ainda natural) e `maxOutputTokens: 2048`. `chamarGeminiComRetry` passa a usá-la. Exportada pura justamente para ser testada sem chamar a API de verdade.

### 2. Groq: max_tokens 2048

`chamarGroqComRetry` agora declara `max_tokens: 2048` (mesmo motivo: evitar truncamento silencioso no modo lenta).

### 3. DeepSeek: max_tokens por modo

`chamarDeepSeekChat` ganhou parâmetro `maxTokens` (padrão 1400, comportamento anterior). `tentarComDeepSeek` passa 2048 só no modo "lenta" — mídia/rápida seguem sem mudança de custo.

### 4. Modo "lenta": thinking + modelo mais capaz (opt-in)

- `configGeminiChat("lenta")` liga `thinkingConfig: { thinkingBudget: 2048 }` — orçamento de raciocínio para confirmação de fatos e respostas mais elaboradas. Só aplicado nesse modo; mídia/rápida seguem exatamente como antes.
- Novo env opt-in `GEMINI_CHAT_MODEL_SLOW`: aponta um modelo mais capaz (ex: um Pro) só para o modo lenta. Sem configurar, o modo lenta usa o mesmo modelo dos demais — zero mudança de custo/comportamento para quem não optou. Não reordena a cadeia de fallback.
- `NOTA_VELOCIDADE_LENTA` estendida: "Pense com cuidado antes de responder: confira fatos, números e datas antes de afirmar."

### 5. Nova regra "Precisão de fatos" na policy conversacional

`server/chatReasoning.ts` — `CONVERSATION_POLICY` ganhou uma bala: antes de afirmar número, preço, data, estatística ou regra específica em QUALQUER resposta, confirar se o dado veio de ferramenta, de briefing confirmado ou de pesquisa citada; sem fonte, apresentar como conhecimento geral ou estimativa — nunca como fato certo do negócio do cliente; dado de pesquisa deve ser atribuído ("segundo dados públicos...").

`.env.example` documenta `GEMINI_CHAT_MODEL` e `GEMINI_CHAT_MODEL_SLOW` (sem valores sensíveis).

## Validação

- `npm run check:server`: 37 erros TS pré-existentes, **zero novos** (idêntico ao baseline da main).
- Suites de chat: `chatPrecision.test.ts` (novo, 4 testes) + `chatReasoning.test.ts` (2 asserções novas) + demais suites de chat: **25/25**.
- Regressão ampla (7 suites): resultados idênticos ao baseline — as 2 falhas pré-existentes (campaignPublish/imageGeneration, dependentes de ambiente) falham igual na main sem estas mudanças.
- `npm run build`: passa.

## Deploy

Sem migration e sem variável obrigatória nova. `GEMINI_CHAT_MODEL_SLOW` é opt-in — o sistema funciona igual sem ela.
