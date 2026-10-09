# Imagens no chat - 2026-10-02

## 2026-10-07/08 - proporcao, custo e estado da fila (substitui pontos do bloco de 03/10 abaixo)

Quatro correcoes. As tres primeiras mudam o que o bloco de 03/10 descreve.

### Formato por criativo, nao por chamada

O bloco abaixo diz "Formato padrao feed". Era literal: `campaignImageJobs` usava
um `args.format || "feed"` pra chamada inteira e nunca olhava a `orientation` de
cada criativo. Na campanha 797 isso enfileirou as dez tarefas como `feed`, com
quatro criativos `vertical_9_16` e tres `quadrado_1_1`.

Agora `formatoPorOrientacao(orientacao, formatoPedido)` deriva **por criativo**:
`vertical_9_16` → stories, `quadrado_1_1` → square, `feed_4_5` → feed. Formato
pedido explicitamente ainda ganha, porque um criativo guarda as tres proporcoes.
`horizontal_16_9` cai em feed: a fila tem tres formatos, acoplados em quatro
lugares (`FORMAT_DIMENSIONS`, `imageField`, enum da ferramenta, coluna do banco)
— um quarto e mudanca de schema, nao de mapeamento.

A checagem de "ja tem imagem" passou a olhar o campo do formato **derivado**.
Olhando sempre o feed, um card de Stories com `storyImageUrl` seria
reenfileirado e sobrescrito.

### A imagem era quadrada nos tres formatos

Dois motivos somados, os dois verificados: o `flux-1-schnell` **nao aceita**
`width`/`height` (schema oficial com so `prompt` e `steps`, e
`"additionalProperties": false`), e o `uploadImageBufferToCloudinary` **nao
aplica transformacao nenhuma** — sobe o buffer cru. O comentario em
`CF_MODELOS_SEM_DIMENSOES` afirmava que o tamanho era "normalizado depois, no
upload do Cloudinary". Nao era.

Agora `urlCloudinaryNaProporcao(url, format)` recorta por transformacao de
entrega: **custo zero**, sem reupload e sem neuron. Usa `c_lfill` e nao
`c_fill` — o `lfill` recorta na proporcao e **nunca amplia**: de um quadrado de
1024, 4:5 vira 819x1024 e 9:16 vira 576x1024, acima dos minimos da Meta
(600x750 e 500x888) e sem inventar nitidez. `g_auto` recorta por conteudo, pra
nao decepar o assunto.

Aplicada em `generateCampaignImageCandidate`, **nao** dentro do upload (que
tambem sobe foto anexada pelo usuario, e recortar foto real seria destrutivo), e
**antes da validacao**, porque o validador precisa julgar o que vai ao ar.
Idempotente: o worker reaproveita `candidate_url` nas retentativas, e empilhar
transformacao daria recorte sobre recorte.

Risco conhecido e nao verificado: o validador faz `fetch(url, { redirect:
"error" })`. Se o Cloudinary responder 302 na primeira geracao de uma
transformacao nova, a validacao falha — e os motivos nomeados abaixo dizem qual
(`:download_http_302` ou `:excecao`).

### Passos de difusao: 8 → 4

Estava fixo em `steps: 8` com o comentario "mais passos = maior qualidade".
Procede pra difusao comum; o FLUX.1 **schnell** e a variante destilada, treinada
pra 1-4 passos, e a doc da Cloudflare da `steps` com default 4 e maximo 8. Preco
oficial: 9,60 neurons por passo + 4,80 por tile de 512x512.

| | neurons/imagem | imagens/dia no gratuito | campanhas de 10 cards |
|---|---|---|---|
| `steps: 8` | 96,0 | ~104 | ~10 |
| `steps: 4` | 57,6 | ~173 | ~17 |

Em env (`CLOUDFLARE_IMAGE_STEPS`) pra voltar a 8 pelo painel se a qualidade em 4
nao servir, **sem deploy**. Teto por modelo (8 no flux-1 pelo schema, 20 fora
dele) e valor invalido caindo no default.

### `visual_validator_unavailable` agora diz a causa

Era o mesmo rotulo pra oito falhas: sem chave, host fora do Cloudinary, download
falhado, mime inesperado, imagem grande demais, modelo invalido, resposta nao-ok
do Gemini, excecao. Sem distinguir, nao havia como saber se a acao era **esperar**
(Gemini em 503) ou **configurar** (chave faltando).

Agora o motivo e `visual_validator_unavailable:<causa>` —
`sem_chave_gemini`, `host_nao_permitido`, `download_http_<status>`,
`mime_inesperado`, `imagem_grande_demais`, `corpo_vazio`, `modelo_invalido`,
`gemini_http_<status>`, `timeout`, `excecao`. A decisao nao muda: segue
`pending_validation`, preservando o candidato, sem nunca aprovar por falta de
leitura.

### Resposta da ferramenta ganhou `estado`

O teto de tres tentativas e regra do SELECT do worker, invisivel pra quem le as
linhas de `jobs` — e em 05/10 o chat preencheu a lacuna dizendo "status queued,
aguarde 10-15 minutos" pra dez tarefas em `pending_validation` com as tentativas
esgotadas, que a fila **nunca** voltaria a pegar.

`resumoDeTarefasDeImagem(rows)` devolve `filaVaiAgir` (booleano
deterministico), `porStatus`, `paradasSemTentativa` e `destravar` (a acao
concreta quando a fila nao vai mais agir). `MAX_TENTATIVAS_VALIDACAO` e
compartilhada entre o SELECT e o resumo: se divergirem, o resumo passa a mentir.

Instrucao de prompt sozinha nao bastou — ver
[travas deterministicas](deterministic-reply-guards.md).

### Correcao de diagnostico importante

O validador novo (`campaignImageValidator.ts`) usa **Gemini vision**
(`IMAGE_VALIDATION_GEMINI_API_KEY || GEMINI_API_KEY`), nao Cloud Vision. O
billing do projeto Google Cloud que foi apontado por dias como bloqueio da
validacao **nao bloqueia este caminho**. O Cloud Vision segue no fluxo legado.

### O que ficou diagnosticado e nao corrigido

- **Cinco blocos de "NO TEXT" no prompt.** Encoder de difusao nao tem negacao, e
  o schnell nao aceita negative prompt: repetir
  "text/words/letters/typography/watermark" cinco vezes condiciona **para**
  texto, e o validador reprova em `hasText`. Mecanismo solido, magnitude
  empirica — precisa de 10 geracoes com e 10 sem, contando quantas saem com
  letra.
- **Gate `issues.length === 0`** do validador: qualquer ressalva cosmetica
  reprova, e um modelo de visao com campo `issues` obrigatorio tende a
  preencher. Precisa ler um `rejected` real pra separar bloqueio de ressalva.
- **Assunto em portugues** indo pro encoder do FLUX, predominantemente ingles.
- **Prompt nao e persistido por criativo**: sem ele nao da pra auditar por que
  uma imagem saiu como saiu.
- ~~`IMAGE_PROVIDER (efetivo): huggingface` no boot~~ — **corrigido em 09/10**.
  O boot separa a fila de campanha (Cloudflare FLUX, fallback Pixabay) dos
  caminhos legados, e marca huggingface como desabilitado no codigo
  (`HF_MODELS` vazio faz `generateWithHuggingFace` iterar lista vazia e devolver
  null) em vez de dar ✅ num provedor que nao gera imagem.


## 2026-10-03 - fila persistente (substitui o fluxo sincrono do chat abaixo)

- gerar_imagem_campanha aceita campaignId; omitir creativeIndex enfileira todos
  os cards sem imagem (1 a 10). Formato padrao feed. action=status consulta;
  action=revalidate reinicia somente a validacao de candidatos pendentes.
- Migration cria campaign_image_jobs. Worker inicia depois das migrations,
  consulta a cada 15 segundos e processa um card por vez usando advisory lock
  PostgreSQL compartilhado entre replicas. Nao exige servico de fila externo.
- Snapshot inclui segmento, fatos, objetivo e tema do card. Chave unica evita
  duplicar a mesma tarefa. Mudanca do briefing cancela a tarefa antiga.
- Candidate Cloudflare ou Pixabay e salvo antes da validacao; nao vai para
  creatives ou biblioteca aprovada enquanto pendente. No maximo tres tentativas
  automaticas de validacao, espacadas em cinco minutos. Nao regenera em retry.
- Interrupcao sem candidato persistido exige revisao: nao e possivel garantir
  exactly-once de cobranca externa. Nao reenfileirar automaticamente essa geracao.
- Escrita do criativo aprovado usa compare-and-swap e transacao; edicoes
  concorrentes cancelam a associacao em vez de sobrescrever capa/fotos/textos.
- Foto real marcada sem URL bloqueia com orientacao de recuperar o anexo;
  nao e convertida silenciosamente em imagem sintetica. Imagens existentes ficam.
- Validacao semantica do worker usa Gemini com imagem + briefing e JSON validado.
  Modelo, evidencias e problemas retornados ficam registrados na tarefa.
  Incompatibilidade, texto, inseguranca ou qualidade insuficiente rejeitam.
  Erro, quota ou resposta incompleta deixam pending_validation e score NULL.
  Escores sao heuristicas, nao probabilidades calibradas nem garantia de compliance.
- Cloud Vision continua no fluxo legado; quando indisponivel, tenta a validacao
  Gemini. Nao fabrica mais nota 0.55 nem tenta Pixabay apos CF ficar pendente.
- Busca Pixabay passa pelo segmento canonico: copy e cidade nao mudam segmento.
  Nenhuma biblioteca antiga baseada apenas em segmento e reutilizada pelo worker.
- A fila nova e do chat. Endpoints sincronos de edicao da interface permanecem;
  seus outros fallbacks ainda precisam auditoria para equivalencia completa.

### Configuracao e operacao

Configure IMAGE_VALIDATION_GEMINI_API_KEY (opcional; fallback GEMINI_API_KEY)
e IMAGE_VALIDATION_GEMINI_MODEL (padrao gemini-2.5-flash). Cloudinary e um gerador
Cloudflare ou Pixabay precisam estar configurados. Testar permissao/quota real.
Para Cloud Vision, habilitar API e faturamento no projeto dono de
GOOGLE_VISION_API_KEY (fallback GOOGLE_API_KEY); isso e externo ao deploy.
Nao foram modificadas cobrancas, chaves, campanhas existentes ou publicacoes.

Teste em rascunho apos deploy: pedir imagens, consultar progresso, provocar
indisponibilidade de validacao, revalidar a mesma URL e confirmar fotos/capa.
Logs image-job contem ID, campanha e estado, nunca credenciais. Status devolve
as ultimas 30 tarefas, incluindo historico; nao e contagem total da campanha.
Pendencias/rejeicoes ficam para revisao; nao ha botao de aprovacao cega no chat.

Validacao automatizada local usa banco e provedores simulados; migration e
concorrencia PostgreSQL real devem passar por homologacao antes de producao.

## Historico

- gerar_imagem_campanha registrada em Gemini, DeepSeek e no dispatcher
  OpenAI-compativel (Groq, Cloudflare e OpenRouter).
- Reutiliza campaigns.regenerateCreativeImage, um criativo/formato por chamada.
  Verifica propriedade, preserva fotos reais e imagens existentes. Substituicao
  continua na tela da campanha. Nao publica nem muda a capa.
- Endpoint verifica propriedade e usa fatos/segmento salvos na campanha,
  nao o nome da campanha como segmento. Sem snapshot, exige briefing atualizado.
- O resultado nao promete origem IA: o motor pode usar banco de imagens.
- No caminho Pixabay, imagens rejeitadas/em revisao e falhas de validacao
  nao entram no cache nem na biblioteca de aprovadas. Outros fallbacks ainda
  precisam revisao propria; nao se afirma validacao uniforme do motor inteiro.
- Cloud Vision aceita GOOGLE_VISION_API_KEY separado, com fallback para
  GOOGLE_API_KEY, e detecta responses[0].error. Habilitacao/permissoes da API
  dependem da conta Google; nao foram modificadas nem testadas aqui.
- Testes simulados do chat; sem geracao paga ou publicacao real.
