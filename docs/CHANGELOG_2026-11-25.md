# Changelog 25/11/2026 — Auditoria da integração TikTok Ads

Branch: `feat/tiktok-auditoria-completa` (inclui `fix/tiktok-sim-no-servidor` e `fix/tiktok-proporcao-video`, ainda sem deploy).
Pedido de Michel: auditoria completa da integração com a API oficial do TikTok Ads, caso de validação Shadia Hasan Black Friday (#828). Sem merge, deploy ou publicação real sem autorização.

## Fontes oficiais consultadas
- Especificação de vídeo In-Feed (leilão): https://ads.tiktok.com/help/article/video-ads-specifications — 9:16, 16:9 ou 1:1; mínimo 540x960 / 960x540 / 640x640; .mp4/.mov/.mpeg/.3gp/.avi; até 500 MB; até 10 min; bitrate ≥ 516 kbps; legenda sem link, @ ou hashtag.
- SDK oficial `tiktok/tiktok-business-api-sdk` (campos de `campaign/create`, `adgroup/create`, `ad/create`, `pixel/list`): `pixel_id` exige `optimization_event`; `landing_page_url`, `utm_params`, `click_tracking_url` e `tracking_app_id` ficam no criativo do anúncio.
- Mínimo de orçamento: https://ads.tiktok.com/help/article/budget (grupo acima de US$ 20/dia).
- O portal business-api.tiktok.com renderiza por JavaScript e não pôde ser lido; valores de enum vieram do SDK e de referência de integração (Markifact). Itens não confirmados por página oficial renderizada estão marcados abaixo.

## Achados da auditoria (com evidência)
1. **Erro original truncado.** `chatTikTok` cortava a mensagem do TikTok em 400 caracteres (registro 316 do caso 828 terminava em "Creative Lib"). Por isso a causa exata da recusa do anúncio não pôde ser separada.
2. **"Click tracking URL doesn't match"**: o MecProAI nunca envia `click_tracking_url` nem `tracking_app_id`. A linha veio no pacote de validações que o `ad/create` devolve junto. Com o erro inteiro registrado, a próxima recusa mostra a causa sem ambiguidade.
3. **Reaproveitamento de vídeo pelo nome original** (`IMG_7994.mov`) podia pegar material da biblioteca que o TikTok recusa no anúncio ("This TikTok post can't be selected"). Nome original não identifica o arquivo.
4. **Proporção nunca conferida antes do upload**; capa vinha da capa automática do TikTok ("images must be recommended sizes").
5. **Vendas viravam tráfego** em silêncio: o publicador só criava `TRAFFIC`.
6. **Rota da tela `publishToTikTok`** (TikTokCampaignCreator) com todos os defeitos antigos: `PULL_FROM_URL`, location `"BR"`, grupo criado ATIVO, `CONVERSIONS` sem Pixel, sem identidade, URL usada como `video_id`, erro de upload engolido.
7. **Upload de vídeo do chat em memória** (`multer.memoryStorage` + cópia para `Uint8Array`): 100 MB viravam ~3x na RAM; já houve OOM no Render (512 MB).
8. Celular Android às vezes manda `.3gp` ou tipo vazio/`application/octet-stream`: recusado antes de olhar o conteúdo.

## O que mudou
- `server/tiktokVideo.ts` (novo): sonda por `ffprobe` direto na URL (só o cabeçalho trafega); plano por especificação oficial; adaptação no Cloudinary (`c_pad,b_blurred` preserva o quadro; `c_fill,g_auto` preenche), `vc_h264,ac_aac,q_auto:good`; capa tirada do vídeo adaptado (`so_1`, mesmas dimensões); espera a transformação ficar pronta (423); vídeo fora do Cloudinary é importado pelo próprio Cloudinary; sem Cloudinary, FFmpeg em arquivo temporário e envio `UPLOAD_BY_FILE` em stream (`fs.openAsBlob`). Nome no TikTok determinístico (`mecpro_<hash da fonte+adaptação>_<nome>_<proporção>.mp4`): duplicado só é reaproveitado se for o MESMO nome nosso.
- `server/tiktokUrl.ts` (novo): URL única para todos os anúncios; https; UTMs `utm_source=tiktok`, `utm_medium=paid_social`, `utm_campaign=__CAMPAIGN_NAME__`, `utm_term=__AID_NAME__`, `utm_content=__CID_NAME__` acrescentadas sem sobrescrever as do cliente; checa se a página responde. (Macros `__CAMPAIGN_NAME__`, `__AID_NAME__`, `__CID_NAME__`: confirmar no primeiro clique real.)
- `server/tiktokObjetivos.ts` (novo): vendas/conversões → `WEB_CONVERSIONS` + `CONVERT` + `OCPM` + Pixel + `SHOPPING` (Purchase/CompletePayment); leads → mesmo, com `FORM`; tráfego → `TRAFFIC`/`CLICK`/`CPC`; reconhecimento → `REACH`/`REACH`/`CPM`. `pixel/list` lido de forma tolerante; sem o evento, bloqueia com o motivo. Formulário instantâneo (promotion_type LEAD_GENERATION) não suportado ainda.
- `server/tiktokValidacao.ts` (novo): validação prévia sem criar nada: objetivo e Pixel, mínimo diário na moeda da conta, identidade autorizada, destino, texto (tira link, # e @, ≤100 sem cortar palavra), cada vídeo. Devolve bloqueios, correções automáticas, avisos e a entrada corrigida.
- `server/tiktokConsulta.ts` (novo): situação da campanha (campanha, grupos, anúncios, revisão/recusa).
- `server/tiktokPublicar.ts`: `ErroTikTok` guarda `code`, mensagem inteira, `request_id` e `data`; objetivo real com Pixel; vendas sem Pixel param antes de subir qualquer coisa; campanha antiga com o mesmo nome e outro objetivo não é reaproveitada; capa do vídeo adaptado; conferência final de proporção no material do TikTok.
- `server/chatTikTok.ts` + `server/chat.ts`: prévia = validação técnica; confirmação só depois dela; "autorizo tráfego" lido pelo servidor; objetivo do rascunho mantido; `consultar_tiktok` nos três provedores; erro original no log e no registro de idempotência (até 8000 caracteres).
- `server/mcpServer.ts`: `validate_tiktok_campaign` (somente leitura), `get_tiktok_campaign` (somente leitura), `publish_tiktok_campaign` com objetivo/Pixel/evento/autorizarTrafego/enquadramento e validação antes de reservar idempotência.
- `server/_core/router.ts`: `publishToTikTok` da tela passa pela mesma validação e pelo mesmo publicador, com idempotência (`ui_tiktok_publish`) e uma única página de destino.
- Upload de vídeo do chat: `multer.diskStorage`, validação lendo só 64 bytes + `ffprobe` no arquivo, SHA em stream, envio ao Cloudinary em partes de 20 MB (`uploadVideoFileToCloudinary`), arquivo temporário removido ao fim da resposta. Aceita 3GP/M4V e tipo genérico quando o conteúdo é vídeo de verdade.

## Testes
- `server/__tests__/tiktokAuditoria.test.ts` (24): URL, objetivos, Pixel, plano de vídeo (inclui sonda real com ffprobe), Cloudinary, importação, texto, validação do caso 828, publicação 828 com `WEB_CONVERSIONS`, erro original, consulta, upload em partes.
- Suíte completa: 1236 testes, 1235 passam, 0 falham, 1 pulado (já pulado antes). `tsc` servidor: 43 erros (linha de base 43); cliente: 64 (base 65).

## Pendências e o que confirmar no primeiro envio real (pausado, sem gasto)
- Enum `SHOPPING`/`FORM` e campos do `pixel/list` (eventos): confirmados em referência de integração e SDK, não em página oficial renderizada.
- Formulário instantâneo do TikTok para leads.
- Campanha `… · #828` de tráfego criada em 24/11 (pausada, sem anúncios) continua na conta; a nova publicação de vendas cria outra com nome único e avisa.
