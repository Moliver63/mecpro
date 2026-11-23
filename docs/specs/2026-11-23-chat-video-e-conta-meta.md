# Chat: video no criativo e conta de anuncios Meta escolhida

Branch `feat/chat-video-e-conta-meta` (a partir de `main` em d414f6d). Sem migracao.

## Problema
1. `/api/chat/upload-video` guarda o video no Cloudinary, mas o chat so recebia uma
   nota com o link. Nenhuma ferramenta do chat associava o video a um criativo; so o
   MCP (`upload_creative_video`) fazia isso.
2. A conexao Meta guarda UMA conta de anuncios por usuario (`api_integrations.adAccountId`)
   e upload de midia e publicacao usam essa conta. Quem tem varias contas publicava
   na que estivesse salva, sem o chat perguntar. O video, em particular, pertence a
   conta onde foi enviado.

## Reuso (nada reimplementado)
- Video: os mesmos dois procedimentos do MCP, via caller do usuario:
  `integrations.uploadVideoToMeta` e `campaigns.updateCreativeImage` (middleware de
  dono de `campaignId` aplicado). O handler do MCP nao foi tocado.
- Contas: `integrations.listMetaBusinesses` (portfolios) + `me/adaccounts`;
  troca com `integrations.selectMetaAdAccount` (revalida o acesso na Meta).
- Confirmacao: mesmo padrao `CONFIRMAR ... <codigo>` de `publicar_campanha` (`adsTurn`).
- Despacho unico `executarEdicaoDeCriativo` (Gemini, OpenAI-compativel, DeepSeek).

## Mudanca
- `server/chatCreativeVideo.ts`: `anexar_video_criativo` (campaignId, creativeIndex,
  format feed|stories|square, videoUrl). So aceita video que o proprio usuario enviou pelo
  chat (registro por usuario em memoria, 7 dias; URL do nosso Cloudinary, pasta
  chat-videos); so rascunho; criativo e formato explicitos; conta do rascunho = conta da
  conexao antes de baixar/enviar; o rascunho so e escrito no ultimo passo; limite 100MB e
  formatos do upload existente. Nao publica, nao edita video.
- `server/metaAdAccountChoice.ts`: `selecionar_conta_meta`. Lista contas autorizadas
  (da Meta, para o token do usuario, ativas), com varias e nenhuma escolhida pergunta, com
  uma so associa e mostra. Escolher exige a frase `CONFIRMAR CONTA META <codigo>` (codigo =
  hash de usuario+campanha+conta). Grava `campaigns.aiResponse.metaAdAccount` (merge, sem
  perder outros campos) e sincroniza a conexao. Campanha publicada nao troca de conta.
- `publishChatAds`: antes do token, `exigirContaDoRascunho` (escolhida, autorizada, ativa e
  igual a da conexao); a pre-confirmacao passa a mostrar conta, pagina, Instagram, criativos
  (imagem/video por formato), publico/conjuntos e orcamento; a conta entra no hash da frase
  de confirmacao. Sem a dependencia `contaMeta` injetada (fixtures antigos) a trava e
  pulada; em producao `injected` e undefined e ela sempre roda.
- `chat.ts`: duas ferramentas nas duas listas, despacho, registro do video no upload, prompt.

## Fora do escopo / limitacoes
- Editar video, reenquadrar para 9:16/4:5/1:1, miniatura automatica: nao implementados.
- Publicar pela tela e pelo MCP continuam usando a conta da conexao, sem a trava de rascunho.
- A conta e da conexao (uma por usuario): escolher outra conta muda a conta usada por
  uploads e publicacoes seguintes do usuario; campanhas ja publicadas nao mudam.
- Registro de videos e em memoria: reiniciar o servidor exige reenviar o video.
- Instagram: o fluxo atual nao escolhe conta de Instagram; a confirmacao diz isso.

## Dependencias de producao
Nenhuma migracao nem variavel nova. Usa `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_FOLDER` ja existentes.

## Como provar
`server/__tests__/chatVideoEContaMeta.test.ts` (33 testes); com `chat.ts` e `chatAdsTools.ts`
revertidos, 7 falham. Suite completa 979/979; tsc 43/64 igual a base.

## Revisao Goldfish
| Rodada | Fase | Bloqueantes | Riscos | Resultado |
|---|---|---|---|---|
| 1 | Implementacao (subagente de contexto limpo) | 2 | 10 | B1 corrigido: auto-associacao so com lista completa e conexao vazia ou ja na mesma conta. B2 corrigido: `error` sem metaCampaignId segue editavel; success/partial/processing/metaCampaignId travam. R1 (publicada pula a trava), R2 (limite 25s com mensagem "nada foi publicado"), R4 (aiResponse ilegivel nao e sobrescrito), R5 (rollback da conexao se a gravacao falhar), R7 (aviso de midia da conta anterior), R8 (rele e rechecha publicada antes de gravar o criativo): corrigidos e testados (9a-9h). |

### Limitacoes aceitas (R3, R6, R9, R10 e opcionais)
- Troca de conta e global por usuario (uma conexao Meta): duas abas escolhendo contas diferentes se bloqueiam pelas travas de divergencia, nao coexistem.
- Registro de videos do chat e em memoria (TTL 7 dias, 30 por usuario); reiniciar o servidor exige reenviar o video.
- Video ja enviado a Meta pertence a conta usada no envio; trocar de conta exige reenviar (aviso emitido).
- Sem segunda rodada de revisao: as correcoes acima sao pontuais e cobertas por testes.
