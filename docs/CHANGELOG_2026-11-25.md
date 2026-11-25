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

## Revisão Goldfish (diff, 2 rodadas, agente sem histórico)
- Rodada 1: 2 BLOQUEANTES (pergunta sobre tráfego publicava como tráfego; pergunta/hipótese após a prévia publicava pela rota sem modelo) e 6 RISCOS (MCP trocava vendas por tráfego; FFmpeg não ligado; HEVC cru sem sonda; SSRF; prévia frouxa; idempotência tela × chat). Todos corrigidos (commit 8a851cb).
- Rodada 2: 3 BLOQUEANTES restantes (recusa "vendas sim, trafego jamais" autorizava tráfego; "não, 200 por dia é muito" publicava com R$ 200; IPv6 `[::ffff:169.254.169.254]` passava no filtro) e riscos (redirecionamento para rede interna; HEVC fora do Cloudinary; republicação única; marcador estreito). Corrigidos depois da rodada 2, com teste para cada caso relatado. **Não houve terceira rodada** (o procedimento limita a 2): Michel decide.
- Forma final: confirmação, autorização de tráfego e valor só contam quando a mensagem INTEIRA é uma forma fechada de aceite; pergunta, hipótese, recusa ou hesitação nunca publicam.
- Risco residual documentado: troca de DNS entre a checagem de URL e a leitura do ffprobe/download (DNS rebinding).

---

# Parte 2 (25/11, tarde) — Permissões do TikTok Ads, Pixel e eventos

Branch: `feat/tiktok-permissoes-pixel`. Pedido de Michel: correção definitiva do erro
`TikTok [pixel/list/] 40001: advertiser does not grant you /pixel/list/:GET permission`.

## Causa
- O token do TikTok carrega as permissões (Scope of permission) marcadas no **aplicativo** do MecProAI no portal de desenvolvedor do TikTok for Business (My Apps) **no momento em que o anunciante autorizou**. A URL de autorização (`portal/auth?app_id&redirect_uri&state`) não tem parâmetro de escopo.
- O token da conta 7620542434560344082 é de 03/11 (OAuth). As chamadas de anúncios funcionam (campanha, grupo, upload, identidade), então o app tem Ads Management, mas `/pixel/list/:GET` é negado: falta o grupo **Measurement** (Pixel e eventos) no app, ou ele foi marcado depois da autorização.
- Não é problema de conta nem de token: é de **permissão do app**. Correção: marcar Measurement no app (pode exigir aprovação do TikTok) e **reautorizar** (o token antigo não ganha permissão nova).

## O que mudou
- `server/tiktokDiagnostico.ts` (novo): `classificarErroTikTok` separa permissão da API (com endpoint e grupo de permissão), token inválido/expirado, conta não autorizada; `diagnosticarPixels` separa Pixel inexistente, Pixel sem evento, vários Pixels (escolher), evento sem atividade em 30 dias (`pixel/event/stats`); `diagnosticarTikTok` testa só com leituras: lista de contas autorizadas do app (`oauth2/advertiser/get`), conta, campanhas, identidade, biblioteca de vídeos e Pixel. Diz se está pronto para tráfego e para vendas.
- Evento de compra: nome atual do TikTok **Purchase** (antigo CompletePayment, aceito indefinidamente); lead: **Lead** (antigo SubmitForm). Otimização da API: `SHOPPING` e `FORM`.
- Validação e publicação usam o diagnóstico. **Problema de autorização nunca vira tráfego**, nem com `autorizarTrafego`; a prévia do chat não oferece mais tráfego em nenhum caso.
- Pixel escolhido por projeto: coluna nova `client_profiles.tiktokPixelId` (migração aditiva `ADD COLUMN IF NOT EXISTS`). Escolha pelo chat (`pixelId`) ou MCP (`set_tiktok_pixel`); usado por padrão nas próximas publicações.
- OAuth: lê os ids de permissão concedidos (`scope`) e registra no log na reconexão (sem token).
- Reautorização: página Integrações > TikTok Ads ganhou "Diagnosticar permissões" com o motivo e as instruções de cada problema e o botão "Reconectar e aprovar as permissões". O callback `/auth/tiktok/callback` agora conclui a troca do código também fora do popup (link do assistente/MCP).
- MCP (todos os clientes): `diagnose_tiktok_ads`, `list_tiktok_pixels`, `set_tiktok_pixel`, `tiktok_reauthorize_link`; `validate_tiktok_campaign` usa o Pixel salvo. Chat: `diagnosticar_tiktok` nos três provedores.

## Pré-voo da #828 (sem criar nada no TikTok)
- Objetivo: vendas (sales → WEB_CONVERSIONS + SHOPPING). Mantido.
- Conta: 7620542434560344082, autorizada via OAuth em 03/11; leitura de anúncios OK.
- Pixel e evento de compra: **bloqueado** por permissão (Measurement) — não foi possível listar.
- Rastreamento de conversões no site: **o site shadiahasan.com não tem Pixel do TikTok nem Events API**. Hoje só a Meta recebe compra (Conversions API pelo servidor, `event_id` = id da cobrança no Asaas). Mesmo com a permissão liberada, o evento Purchase não vai disparar até o site enviar.
- URL: https://shadiahasan.com/cursos (página geral; a campanha é de Black Friday).
- Criativos: 4 vídeos do chat, conferidos e adaptados na publicação.
- Orçamento: mínimo do TikTok R$ 124/dia hoje; rascunho com R$ 38/dia e conjuntos herdados da Meta com valores mistos. Público: 25 a 60 (TikTok: faixas 25-34 a 55+).

## Recomendação para o site da Shadia (não implementada; outro repositório)
- Pixel do TikTok no navegador só para PageView/ViewContent e para guardar `ttclid` e o cookie `_ttp` no checkout.
- Compra pelo servidor (Events API) no webhook do Asaas confirmado, com `event_id` = id da cobrança (o mesmo padrão já usado na Meta). Sem Purchase no navegador: não há duplicação.

## Depende de ação manual no TikTok
1. Portal de desenvolvedor (business-api.tiktok.com/portal/apps) > app do MecProAI > Scope of permission > marcar Measurement. Pode exigir revisão do TikTok.
2. Reautorizar em MecProAI > Integrações > TikTok Ads.
3. Criar/confirmar o Pixel da Shadia e o evento Purchase.

## Revisão Goldfish da Parte 2 (2 rodadas)
- Rodada 1: 2 BLOQUEANTES corrigidos (CSRF no OAuth com state previsível → HMAC com segredo do servidor; erro 40001 com outro texto ou falha de leitura virava tráfego → só "TikTok afirma que não há Pixel/evento" + autorização do usuário). Riscos corrigidos: prévia coerente, 40100 = limite, Pixels ambíguos, migração primeiro, avisos de identidade, Pixel salvo que sumiu, limpar Pixel, redirect configurável.
- Rodada 2: sem BLOQUEANTE. Riscos corrigidos depois (sem 3ª rodada): 40001 de conta reconhecido como conta; endpoint pelo caminho; "too many ads" não é limite; Pixels misturados pedem escolha; diagnóstico trata Pixel salvo como a publicação; falha de leitura não mostra OK; falta de segredo vira erro claro.
- Risco residual aceito: o state (assinado) vale 30 min e não é de uso único; o link do MCP deve ser tratado como pessoal.

## Parte 3: TikTok Pixel + Events API universal, minimo por nivel (branch feat/tiktok-pixel-universal)

- `server/tiktokPixelSetup.ts`: `estadoPixelTikTok` (Pixel do projeto, evento de compra, eventos recebidos em 30 dias, problemas com instrucao; somente leitura), `gerarGuiaDeInstalacao` (Pixel, site, plataforma e gateway do cliente; PageView/ViewContent/InitiateCheckout no navegador, Purchase so pelo servidor com event_id = id do pagamento; LGPD; sem nenhum segredo) e recusa do id numerico (o site usa o `pixel_code`).
- `interpretarPixels` passou a devolver `codigo` (pixel_code).
- MCP: `tiktok_pixel_status`, `tiktok_install_guide`. tRPC: `tiktokPixelStatus`, `setTikTokPixel`, `tiktokInstallGuide` (todos conferem o dono do projeto). Chat: `diagnosticar_tiktok` aceita `pixelEEventsApi`, `guiaInstalacao`, `plataforma`, `gateway`. UI: cartao "TikTok Pixel e Events API" em Integracoes > TikTok.
- Credenciais: o token da Events API fica no servidor do site do cliente; o MecProAI nao guarda nem devolve. Nenhuma resposta traz token.
- Orcamento: `detalharMinimo` (grupo > US$ 20/dia vale; campanha > US$ 50 nao vale porque a campanha nasce sem orcamento; vitalicio = dias x minimo diario). A API nao oferece consulta previa do valor exato na moeda da conta; o valor exato so aparece na resposta dela ao criar. O MecProAI confere antes (margem de 5%) e NAO altera o orcamento (no chat o valor so sobe com "sim" do usuario a uma previa que mostrou o minimo).
- Testes: `tiktokPixelSetup.test.ts` (14), `tiktokOrcamento828.test.ts`. Total 1300 testes, 1299 passam, 0 falham, 1 pulado; tsc server 43, client 64 (sem erros novos).
