# Imagens no chat - 2026-10-02

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
