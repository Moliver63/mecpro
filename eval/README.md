# Evals do MecProAI (Promptfoo)

Ferramenta de teste/comparação **fora do servidor de produção** — não está em
nenhum caminho de geração real. O Promptfoo mede o resultado; a geração e a
correção continuam sendo responsabilidade do próprio MecProAI (reaproveita os
validadores reais, não duplica regras).

## Dois configs, para perguntas diferentes

- **`promptfooconfig.pipeline.yaml`** — "meu pipeline evita o bug de novo?"
  Roda `buildCampaignFromAds`/`buildCampaignFacts` de verdade e reaplica
  `validateCampaignFactIntegrity`/`getCarouselEditorialIssues` de verdade.
  Não precisa de nenhuma API key — não faz nenhuma chamada de rede.

  ```
  npm run eval:pipeline
  ```

- **`promptfooconfig.rawmodel.yaml`** — "qual modelo escreve melhor de raiz?"
  Chama Gemini e DeepSeek direto, sem nenhum validador do MecProAI no meio.
  Precisa de `GEMINI_API_KEY` e `DEEPSEEK_API_KEY` no ambiente (nunca commitar
  chave em arquivo).

  ```
  export GEMINI_API_KEY=...
  export DEEPSEEK_API_KEY=...
  npm run eval:rawmodel
  ```

Ver o resultado depois de rodar: `npm run eval:view`.

## Por que os dois são separados

Se você misturar os dois, o resultado engana: se o modelo tenta gerar "casa
própria" pra locação comercial mas o Fact Guard corrige antes de salvar, o
eval de pipeline passa (corretamente — é isso que ele mede) mas isso não diz
nada sobre qual modelo escreve melhor de raiz. Use o de pipeline pra decidir
se pode liberar uma mudança sem repetir um bug já corrigido; use o de modelo
cru pra decidir entre Gemini e DeepSeek.

## Adicionando um novo caso de regressão

1. Adicione um bloco em `tests:` no `promptfooconfig.pipeline.yaml` com o
   `clientProfile`/`input` reais da campanha problemática.
2. As asserções padrão (`defaultTest`) já reaplicam Fact Guard + editorial.
   Só adicione uma asserção `javascript` extra se o bug específico não for
   coberto por nenhum dos dois (ex.: checar um campo específico do resumo).
3. Rode `npm run eval:pipeline` e confirme que falha ANTES da correção, e
   passa DEPOIS — isso prova que o eval realmente pega o bug, não só que
   "está tudo verde".

## Custo

`eval:rawmodel` consome cota real de API a cada rodada. Use uma chave
separada da rotação de produção do Gemini, e rode sob demanda (antes de
mudar prompt/pipeline), não em todo commit.
