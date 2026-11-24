# Sessão 23–24/11/2026: chat multimodal, cortes, provedores de visão, geração e publicação

Registro do que entrou em produção nesta sessão, por que e como. Cada item
nasceu de um caso real, quase todos das campanhas Black Friday da Shadia
Hasan (projeto 49, campanhas 820 a 823). Nenhum valor abaixo foi estimado:
contagens de teste, commits, deploys e IDs foram lidos na hora.

## Linha do tempo dos deploys

| Deploy Render | Commit na main | O que levou |
|---|---|---|
| `dep-dc2cts97lnhs73e331f0` | `db136e1` | Chat multimodal com fotos e vídeos |
| `dep-dc2fra67bikc738i9h50` | `cd5cceb` | Cortes com prévia e aprovação, cadeia de visão, ffmpeg embutido, anexos universais |
| `dep-dc2ggsp7lnhs73edj91g` | `26b02dc` | Status de vídeo/visão/transcrição no boot; sondagem MCP 2026-07-28 deixa de ser alerta |
| `dep-dc2lfqk0916s73ag8550` | `b8a10b0` | 7 correções de geração/publicação + troca de capa de anúncio publicado |

Merges sempre por fast-forward. Todos os deploys foram autorizados pelo Michel
na conversa, um por um.

## 1. Chat multimodal e anexos universais (`db136e1`, `cd5cceb`)

**O quê.** O chat recebe fotos e vídeos de qualquer aparelho, mostra prévia,
envia com progresso por arquivo e usa os arquivos na criação de anúncios.

**Como.**
- Botão "+" ao lado do campo com 4 opções: fotos, vídeos, arquivos e câmera.
  Cada opção abre o seletor nativo do sistema (`<input type=file>` com
  `multiple`; câmera com `capture="environment"`). Nada de galeria própria: no
  iPhone abre o painel nativo com seleção múltipla.
- Miniatura com nome e tamanho, contagem, remover/cancelar por arquivo, botão
  "tentar novamente" no arquivo que falhou. O texto digitado volta ao campo se
  a conexão cair no envio.
- HEIC/HEIF do iPhone: o servidor detecta pelo conteúdo (`ftyp`) e converte
  para JPEG antes de validar (`server/chatHeic.ts`, pacote `heic-convert`).
  MOV, MP4 e WEBM continuam aceitos.
- Limite de requisições separado para mídia (`CHAT_RATE_LIMIT_MIDIA`, 90/min)
  e para mensagens (20/min): um upload de vários arquivos não bloqueia mais a
  conversa.

**Testes.** E2E real no navegador (Playwright, servidor + Postgres de verdade)
com 14 cenários, incluindo iPhone emulado, HEIC, MOV, falha e retomada, e
isolamento entre usuários. Suíte unitária verde.

**Limites conhecidos.** Testado em Chromium emulado. Safari, Android real,
Windows e macOS não foram testados em aparelho. Upload em partes/retomável não
foi feito: um envio interrompido recomeça do zero.

## 2. Cortes de vídeo com prévia e aprovação (`3c76875`)

**O quê.** Ao receber um vídeo, a IA sugere trechos para Stories/Reels (9:16),
Feed (4:5) e quadrado (1:1). O usuário vê as prévias e só depois aprova.

**Como.** `server/chatCortes.ts`: ffmpeg detecta cenas
(`select='gt(scene,0.28)'`) e silêncios (`silencedetect`), a visão avalia um
quadro por cena (qualidade, gancho, posição do assunto), e a janela escolhida
termina num silêncio. Prévias em 360p. A aprovação só acontece por clique do
usuário autenticado (`POST /cortes/:id/aprovar`); o modelo não consegue
aprovar sozinho. `adaptar_video` com `propostaId` processa só os formatos
aprovados.

**Limites.** As propostas ficam em memória por 2 horas e somem se o servidor
reiniciar. Durações-alvo (15s/20s/15s) são heurística do produto, não regra da
Meta.

## 3. Cadeia de visão com fallback (`3c76875`, `26b02dc`)

**O quê.** Fotos e quadros de vídeo são analisados por Gemini e, se ele
falhar, por NVIDIA Nemotron VL, OpenRouter (Nemotron VL free) e Groq (Llama 4
Scout), nessa ordem. `CHAT_VISION_PROVIDERS` muda a ordem ou desliga.

**Como.** `server/chatVision.ts` reaproveita a cadeia do chat
(`executarCadeia`) com saúde própria (`visao:<nome>`), para uma falha de visão
não derrubar o chat de texto. Resposta fora do formato conta como falha e
passa para o próximo.

**Boot.** Desde `26b02dc` o log de subida diz se ffmpeg/ffprobe existem, de
onde vieram, a ordem da visão e se há transcrição. Em produção (24/11):
ffmpeg 5.1.9 do sistema; visão Gemini → OpenRouter → Groq (sem
`NVIDIA_API_KEY`); transcrição Groq Whisper.

**Não verificado.** Nenhum provedor foi testado com chave real nesta sessão.
O script `scripts/benchmark-provedores-ia.mts` mede velocidade, custo e
validade com as chaves do Michel. O id exato do modelo NVIDIA no NIM não foi
confirmado. O endpoint `:free` do OpenRouter registra os prompts.

## 4. Correções na geração de campanha (`81b0b62`)

Todos os casos saíram da geração das campanhas 820 a 823. Testes em
`server/__tests__/geracaoShadia24nov.test.ts`.

| Problema real | Causa | Correção | Arquivo |
|---|---|---|---|
| Perfil de cursos com "Diário de presente" virou **alimentação** | Vencia a palavra-chave mais longa ("presentes", 9 letras) | Vence o segmento com mais palavras-chave distintas no texto; a mais longa só desempata. "Loja de doces e brigadeiros" continua alimentação | `shared/segmentConfig.ts` |
| Copy com "24 aulas" marcada "sem sinais do segmento infoprodutos" | Regras escritas no singular (`\baula\b`) | Texto comparado também com os plurais no singular (`singularizarPlurais`) | `server/ai.ts` |
| "R$ 57 (de R$ 197)" barrado como alegação fora do briefing | Só 1 preço aceito por campanha | Aceita todo preço citado no briefing atual (`confirmedPrices`) e o preço "de" do briefing quando a copy também o usa como "de" (`originalPrices`). "valor de R$ 180" não conta como preço riscado. Preço inventado continua barrado | `server/campaignFactGuard.ts` |
| R$ 70 em 7 dias virou 2 conjuntos "R$ 35/dia" | Prompt chamava o total de "mensal" e não limitava conjuntos | Prompt diz total do período, diário e quantos conjuntos cabem (mínimo de R$ 6/dia por conjunto). Se vierem mais, ficam os primeiros e o diário é redistribuído, com registro em `budgetPlan.conjuntosRemovidos` | `server/ai.ts`, `shared/orcamentoDoRascunho.ts` |
| Copy de 500+ caracteres derrubava a campanha inteira | O corte seguro recusava cortar se o texto já tinha qualquer conflito | O corte só não pode criar conflito novo; os antigos seguem para o fluxo normal | `server/creativeRewriteGuard.ts` |
| Gemini cortado em 22s caía no Groq, que errava tamanho e preço | Limite único de 22s ("Render tem timeout de 30s") | Geração principal da campanha espera 45s (`AI_TIMEOUTS.geracaoDeCampanhaMs`); o resto continua 22s | `server/ai.ts` |

## 5. Correções na publicação Meta (`e4d6a41`, `b8a10b0`)

| Problema real | Causa | Correção | Arquivo |
|---|---|---|---|
| As 4 campanhas de tráfego falharam com `CAMPAIGN_OBJECTIVE_CONFLICT` | Nicho com "cursos" trocava tráfego por leads, e a trava de integridade recusava a troca | Objetivo confirmado no rascunho não é trocado pelo segmento | `server/_core/router.ts` |
| 823 recusada pela Meta ("idade máxima como sugestão") | Público "interessados em..." não virava interesse, ligava Advantage+ e mandava idade máx. 60 | `termosDeInteresse` aceita "interesses", "interesse em", "interessados em". Com Advantage+ ligado vai idade máx. 65 e mín. até 25, com aviso no log | `server/metaTargeting.ts`, `server/_core/router.ts` |
| Republicar dizia "1/1 publicado" e nada mudava na Meta | Trava de duplicidade devolvia o resultado antigo, e o resumo do MCP não diferenciava | Resumo diz "Nada novo publicado" / "♻️ já estava publicado" | `server/mcpServer.ts` |
| Não havia como trocar a capa de anúncio já publicado | Só existia publicar de novo (bloqueado pela trava) | Nova ferramenta MCP `replace_published_ad_thumbnail`: lê o `object_story_spec` do criativo, cria um igual com `video_data.image_url` novo e aponta o MESMO anúncio para ele. Conjunto, orçamento, público e status não mudam | `server/metaTrocaCapa.ts`, `metaCampaigns.trocarCapaDoAnuncio`, `server/mcpServer.ts` |

Testes: `server/__tests__/metaTrocaCapa.test.ts` (4), mais os de publicação em
`geracaoShadia24nov.test.ts`.

## 6. Validação antes do último deploy

- Suíte completa: 1170 testes, 1169 passando, 0 falhas (1 pulado: o de banco
  que exige `TEST_DATABASE_URL`).
- `tsc` servidor 43 e cliente 65 erros, iguais à base anterior.
- Boot de `b8a10b0` sem erro nem aviso.

## 7. Fatos operacionais aprendidos

- **Memória do Render.** Em 24/11 às 08:37 UTC o serviço foi morto por OOM
  (limite 512 MB) com 3 envios de vídeo de 11 a 25 MB em paralelo. Voltou em
  20s. Um por vez não deu problema. Ainda não há fila nem limite de
  concorrência para upload de vídeo.
- **Ferramenta MCP nova.** Depois do deploy, o conector do Claude continuou
  com a lista antiga (56) até o Michel atualizar o conector; aí apareceram 57.
- **Thumbnail por hash.** `POST /act_x/adimages?url=` responde
  "(#3) Application does not have the capability". A capa vai por
  `video_data.image_url`, o que funciona.
- **Um anúncio por conjunto.** `publishToMeta` publica só o criativo 0 de cada
  conjunto. Os outros criativos do rascunho NÃO vão para a Meta: não há teste
  A/B de copies hoje.
- **Sondagem MCP 2026-07-28.** O 400 para `server/discover` é o comportamento
  correto de servidor da versão anterior (o cliente volta ao `initialize`).
  Agora fica em INFO. Suporte real ao protocolo novo exige o SDK 2.x.
- **Chaves Google.** `GOOGLE_API_KEY` e `GEMINI_API_KEY` são chaves diferentes
  em produção: SDK do Google usa uma, chat/visão usa outra. Decisão pendente do
  Michel.

## 8. Estado das campanhas da Shadia ao fim da sessão

Perfil do projeto 49 reescrito com os 4 cursos e os preços de Black Friday
lidos do banco do site (Permita-se R$ 197, Pensamentos Automáticos, Código
Interno e A vida responde R$ 57, aula de entrada R$ 19,90). Nicho em
"programas online de autoconhecimento", sem a palavra "curso", para não
acionar a troca de objetivo antes do deploy `b8a10b0`.

| Campanha | Vídeo | Meta campaign | Status |
|---|---|---|---|
| 820 | Pensamentos Automáticos (neurônios) | 120250580350530375 | Pausada, capa final |
| 821 | Permita-se, prisões sem grades | 120250580352900375 | Pausada, capa final |
| 822 | Permita-se, 7 módulos | 120250580353670375 | Pausada, capa final |
| 823 | Permita-se, decisão | 120250583003520375 | Pausada, capa final |

R$ 10/dia cada, 7 dias, 1 conjunto, tráfego para `/collections/9` (820) e
`/collections/1` (demais). Vídeos convertidos para H.264 720p e capas no
branch `assets-shadia-bf`.

## 9. Pendências abertas

1. Publicar o 2º criativo de cada conjunto como anúncio próprio (hoje só o 1º
   vai para a Meta).
2. Limite de concorrência ou streaming no upload de vídeo para não estourar
   512 MB.
3. Propostas de corte persistidas no banco (hoje em memória, 2h).
4. Rodar o benchmark de provedores com chaves reais; confirmar o id NVIDIA.
5. Decidir entre `GOOGLE_API_KEY` e `GEMINI_API_KEY`.
6. `server/imageRAG.ts` envia a chave do Google na query string (`?key=`),
   risco de vazar em log. Não alterado.
