# MecProAI - Estado atual do motor

Atualizado em: 2026-09-16 (adendo Codex; secoes anteriores preservadas como historico)

## Adendo Codex - precedencia operacional

Consulte [Entrega Codex de 2026-09-16](CODEX_CHANGELOG_2026-09-16.md) para os
commits cf38880, 71ba7a9, 7f2df58, 01276de e f57f3ec, testes e pendencias.
Este adendo prevalece sobre descricoes historicas abaixo quando houver conflito.

O chat agora orienta respostas curtas, perguntas somente sobre dados ausentes e
geracao de rascunho sem confirmacao redundante. A publicacao continua separada.
Retries mais curtos nao constituem limite total de resposta. Imagens priorizam
o briefing confirmado e usam cache sensivel ao contexto.

Regras de segmento sao recuperadas localmente sem importar fatos de exemplos.
O Fact Guard valida intencao e copy; a publicacao Meta exige snapshot completo,
revalida textos e bloqueia troca automatica de objetivo. Campanhas legadas sem
snapshot precisam ser regeneradas. Isso nao modifica anuncios ja ativos.

Estado confirmado: implementacao e testes locais. Deploy, comportamento real dos
provedores e resultado comercial nao foram comprovados por estes testes.

Este documento resume o comportamento atual do MecProAI no fluxo de criacao, validacao e publicacao de campanhas. Ele complementa os documentos historicos em `docs/` e deve ser usado como referencia operacional para evitar divergencia entre briefing, criativos, MCP e Meta Ads.

## Fluxo principal de campanha

O fluxo esperado e:

1. Coletar briefing suficiente do usuario.
2. Validar se ha informacoes minimas para performar bem.
3. Gerar criativos alinhados ao segmento, objetivo e midias enviadas.
4. Validar fatos da campanha antes de salvar.
5. Enviar imagens ou videos para Cloudinary via MCP.
6. Publicar ou atualizar a campanha na Meta quando autorizado.
7. Medir resultados e alimentar a base de aprendizado.

## Fallback LLM DeepSeek

Atualizacao 2026-09-08: o motor `server/ai.ts` aceita DeepSeek como fallback operacional OpenAI-compatible quando Gemini esta sem chave, esgotado ou indisponivel. A chave deve ser cadastrada apenas no ambiente seguro do Render como `DEEPSEEK_API_KEY`; nao deve ser escrita em `.env.example`, documentacao, logs ou commits.

Configuracao:

- `DEEPSEEK_API_KEY`: chave real da DeepSeek, obrigatoria para habilitar o fallback.
- `DEEPSEEK_MODEL`: opcional, padrao `deepseek-v4-flash`.
- `DEEPSEEK_BASE_URL`: opcional, padrao `https://api.deepseek.com`.

Ordem pratica de fallback: Gemini saudavel continua sendo a IA principal. Quando ele falha por quota, ausencia de chave ou indisponibilidade, o sistema tenta DeepSeek antes de cair nos provedores economicos/legados e, por ultimo, no mock.

## Creative Media Studio

Atualizacao 2026-09-08: o resultado da campanha passa a ter um fluxo mais claro de midia criativa:

- `Gerar nova imagem`: usa o pipeline existente de `server/imageGeneration.ts`, com provedores reais quando configurados e fallback controlado.
- `Aprimorar foto`: aplica transformacoes Cloudinary na foto ja hospedada, ajustando qualidade, formato e corte para Feed, Stories/Reels ou Square.
- `Gerar video`: usa `JSON2VIDEO_API_KEY` para transformar a imagem do criativo em video curto com movimento, texto e CTA.
- `Gerar video local`: quando `VIDEO_PROVIDER=local_wangp` e `LOCAL_WANGP_ENABLED=true`, o MecProAI envia um job para um worker local WanGP/Wan2GP em `LOCAL_WANGP_URL`. Se o worker falhar e `JSON2VIDEO_API_KEY` estiver configurado, o fluxo cai para JSON2Video.
- `Upload foto/video`: continua permitindo usar arquivo real do cliente e associar ao criativo antes de publicar.

Chaves operacionais:

- `IMAGE_PROVIDER`: `huggingface`, `genspark`, `heygen` ou `mock`.
- `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`: habilitam FLUX via Cloudflare Workers AI no pipeline de imagem.
- `GENSPARK_API_KEY` + `GENSPARK_IMAGE_MODEL`: habilitam geracao de imagem via Genspark quando disponivel.
- `PIXABAY_API_KEY`: habilita busca de imagens CC0/comerciais por segmento.
- `GOOGLE_API_KEY` + `GOOGLE_CSE_ID`: fallback de imagens via Google Custom Search com filtro de direitos.
- `JSON2VIDEO_API_KEY`: habilita geracao de video a partir de imagem.
- `VIDEO_PROVIDER`: `json2video` por padrao; pode ser `local_wangp` para usar um worker local.
- `LOCAL_WANGP_ENABLED`: deve ser `true` para permitir chamadas ao worker local.
- `LOCAL_WANGP_URL`: URL do worker local, por exemplo `http://127.0.0.1:7860`; em producao web, prefira arquitetura de worker que puxa jobs ou tunnel seguro, pois o Render nao acessa o localhost do PC do usuario.
- `LOCAL_WANGP_SHARED_SECRET`: segredo opcional enviado como Bearer token para o worker local.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: habilitam upload, re-hospedagem e aprimoramento.

Regra pratica: geracao ou aprimoramento nunca deve publicar automaticamente. A midia precisa continuar passando pelos gates de campanha, Fact Guard/Quality Gate e confirmacao explicita antes da Meta.

## Conexoes Ads via MCP

Atualizacao 2026-09-08: o MCP agora expoe `get_platform_connections` tambem nos aliases `MECPROAI.get_platform_connections` e `mecproai.get_platform_connections`.

A ferramenta audita Meta Ads, Google Ads e TikTok Ads para o usuario autenticado sem retornar tokens ou segredos. Ela informa:

- se as variaveis OAuth da plataforma estao configuradas no servidor;
- se existe integracao ativa no banco;
- qual conta publica esta salva, sempre mascarada;
- o que ainda falta para usar a API;
- a URL interna do MecProAI para completar a conexao com OAuth.

O MCP nao deve receber senha, app secret ou token OAuth pelo chat. A conexao real continua passando pelas telas seguras do app:

- Meta Ads: `/settings/meta`.
- Google Ads: `/settings/google`.
- TikTok Ads: `/settings/tiktok`.

Capacidade atual:

- Meta Ads: quando ha OAuth/token valido e `adAccountId`, o MCP ja consegue publicar campanha com `publish_campaign`, sempre exigindo confirmacao explicita.
- Google Ads: a base de OAuth/refresh token, `developerToken` e `Customer ID` existe para API e relatorios, mas ainda falta uma tool MCP dedicada para publicar campanhas Google.
- TikTok Ads: a base de OAuth/token e `Advertiser ID` existe para API e relatorios, mas ainda falta uma tool MCP dedicada para publicar campanhas TikTok.

Regra pratica: antes de tentar relatorio, otimizacao ou publicacao por agente, chamar `get_platform_connections`. Se a plataforma nao estiver pronta, o agente deve orientar o usuario a abrir a URL de conexao retornada, em vez de pedir credenciais no chat.

## Assistente conversacional no app

Atualizacao 2026-09-08: o app usa `CampaignChat` como experiencia estilo ChatGPT e monta o backend em `/api/chat`.

Comportamento atual:

- envia o historico recente da conversa, nao apenas a ultima mensagem;
- exige usuario autenticado via cookie/header JWT;
- usa function calling para chamar `gerar_campanha` somente quando o briefing minimo estiver preenchido;
- a ferramenta `gerar_campanha` chama o mesmo motor oficial usado pela interface e pelo MCP (`generateCampaign`), evitando um segundo gerador paralelo;
- se o modulo de chat falhar na inicializacao, o servidor responde 503 isolado em `/api/chat` sem derrubar o restante do MecProAI;
- a interface abre em tela cheia estilo conversa, com auto-scroll, sugestoes iniciais, indicador de digitacao e link para a campanha criada.

Regra pratica: o chat pode coletar briefing e criar rascunhos pelo motor oficial. Publicacao, pausa, alteracao de verba e mudancas em campanhas ativas continuam passando pelas telas/ferramentas oficiais, Fact Guard/Quality Gate e confirmacao explicita.

O sistema nao deve reutilizar fatos de campanhas anteriores. Exemplos, padroes vencedores e memoria podem emprestar estrutura persuasiva, mas nunca metragem, endereco, preco, numero de suites, vagas, fotos, oferta ou caracteristicas especificas de outro projeto.

## Perguntas minimas por campanha

Antes de montar uma campanha, o sistema deve confirmar pelo menos:

- Objetivo: leads, vendas, trafego, engajamento ou reconhecimento.
- Segmento/nicho: imoveis, doces, academia, estetica, politica, educacao etc.
- Produto ou oferta principal.
- Publico desejado.
- Localizacao e raio.
- Orcamento diario ou total.
- Canal de conversao: WhatsApp, formulario, site ou direct.
- CTA principal.
- Status desejado: rascunho, teste ou publicar na Meta.
- Midias disponiveis: imagens, videos ou ambos.
- Foto/video de destaque, quando houver mais de uma midia.

Para imoveis, tambem deve confirmar:

- Tipo do imovel.
- Finalidade: venda, locacao anual, temporada ou lancamento.
- Preco ou condicao comercial.
- Bairro/cidade/endereco permitido.
- Metragem.
- Quartos, suites, banheiros e vagas, somente se informado.
- Diferenciais reais.
- WhatsApp de atendimento.

Para doces/alimentacao, tambem deve confirmar:

- Produto principal.
- Sabores ou linhas disponiveis.
- Formato de venda: unidade, caixa, encomenda, pronta entrega ou delivery.
- Regiao de entrega ou retirada.
- Preco ou faixa de preco, quando disponivel.
- WhatsApp de atendimento.

Para academia/atividade fisica, tambem deve confirmar:

- Modalidade ou oferta.
- Publico: iniciante, hipertrofia, emagrecimento, terceira idade, performance etc.
- Unidade/localizacao.
- Plano, promocao ou chamada principal.
- WhatsApp ou formulario.

## Guard anti-alucinacao

O arquivo `server/campaignFactGuard.ts` e responsavel por proteger o sistema contra contaminacao de dados entre campanhas.

Ele extrai fatos verificados do briefing atual e valida os criativos antes da campanha ser salva. Se encontrar conflito, bloqueia a criacao com `FACT_CONFLICT`.

Exemplos de bloqueio:

- Uma sala comercial de 50 m2 receber copy de cobertura triplex.
- Uma campanha Morebem receber `190 m2`, `3 suites`, `Praia Brava` ou `R$ 18.000` de uma campanha Edu.
- Um criativo afirmar vagas, suites, quartos, planta triplex ou alto padrao sem esses dados no briefing.
- O `creativeSystemV2.copyBank` conter texto contaminado mesmo que os cards principais estejam limpos.

O guard deve validar textos em:

- headlines;
- descricoes;
- copy;
- hooks;
- bodies;
- scripts;
- campos aninhados em `creativeSystemV2`;
- campos aninhados em `copyBank`.

Atualizacao 2026-09-02: quando houver conflito entre briefing atual e dados herdados do perfil/projeto, o briefing atual e a fonte canonica para fatos especificos como metragem, preco, endereco, tipo do imovel, suites, quartos, banheiros e vagas. Dados herdados conflitantes entram como claims proibidos. Exemplo: se o briefing atual informa `50 m2` e uma fonte antiga do perfil ainda contem `190 m2`, o Fact Guard deve esperar `50 m2` e bloquear `190 m2`, nunca o contrario.

Atualizacao 2026-09-02: a validacao de metragem compara valor canonico, nao texto literal. Formatos como `50 m2`, `50m2`, `50 m²`, `50M²` e `50 metros quadrados` representam a mesma metragem e nao devem gerar conflito. O numero continua protegido: `190 m2` deve falhar quando o briefing atual informa `50 m2`.

Atualizacao 2026-09-02: a validacao de preco tambem compara valor canonico em BRL, nao texto literal. Formatos como `R$ 5.000`, `R$5.000`, `R$ 5.000,00`, `5 mil reais` e `valor 5000` representam o mesmo aluguel quando o briefing informa esse preco. Valores diferentes continuam bloqueados, inclusive quando a copy confunde preco do aluguel com orcamento de midia.

Atualizacao 2026-09-02: foi criada uma camada reutilizavel de normalizacao canonica em `server/factNormalizer.ts`. Ela ja cobre area, dinheiro, contagem, duracao, volume e peso (`50 m2`, `BRL 5000`, `60 min`, `500 ml`, `30000 kg`). O Fact Guard imobiliario usa essa camada para area, preco, quartos/dormitorios, suites, banheiros e vagas. A evolucao correta para novos segmentos e ligar seus fatos criticos a essa camada, evitando comparacao literal de texto.

Atualizacao 2026-09-02: endereco tambem virou fato canonico. Formatos como `Rua 902, nº 144`, `Rua 902, 144`, `Rua 902 n 144` e `R. 902 nº 144` representam o mesmo endereco confirmado. Se a copy trouxer outro numero ou outra rua, o Fact Guard bloqueia. Se a copy usar so a rua confirmada sem numero, isso e tratado como forma menos especifica, nao como conflito.

Atualizacao 2026-09-02: sala comercial ampla nao autoriza especializacao inventada. Se o briefing disser apenas `sala comercial`, `atividade profissional`, `negocio`, `espaco comercial` ou publico amplo, o gerador deve evitar `consultorio`, `clinica`, `escritorio`, `salao`, `studio/estudio` e termos semelhantes. Esses termos so podem aparecer quando o briefing atual confirmar literalmente o uso.

## Quality gates operacionais

O arquivo `shared/campaignQualityGate.ts` concentra validacoes de prontidao por etapa, inspirado em padroes de agentes com gates antes de acoes criticas.

Ele avalia:

- `generate`: briefing minimo, objetivo, oferta, publico, verba, duracao e perguntas especificas por segmento.
- `media`: quantidade de midias, carrossel com pelo menos 2 itens, escolha de capa e ordem visual.
- `publish`: destino final, confirmacao explicita do usuario, criativos suficientes e resultado do fact guard.
- `optimize`: reservado para auditorias de otimizacao e proximas evolucoes.

Atualizacao 2026-09-02: quando o gate recebe os criativos gerados, carrossel passa a exigir variedade real de cards. Headlines/copies repetidas entre varios cards bloqueiam a campanha antes de salvar/publicar. O gate tambem bloqueia cards de carrossel sem imagem/video real associado quando nao ha `mediaUrls`/fotos suficientes, evitando placeholder visual ou perda de imagens na Meta.

Atualizacao 2026-09-03: o caminho real de publicacao `campaigns.publishToMeta` tambem audita carrossel antes de chamar a API da Meta. A trava valida os criativos fonte e os `child_attachments` finais, bloqueando headline/description/copy curta ou repetida. Isso fecha a diferenca entre publicacao via MCP e publicacao pelo botao do Campaign Builder.

Atualizacao 2026-09-07: o gate de midia de carrossel tambem conta imagens/videos ja anexados aos criativos gerados (`feedImageUrl`, `storyImageUrl`, `squareImageUrl`, hashes, videos e assets do `creativeSystemV2`). Isso evita bloquear falsamente campanhas com imagens geradas/re-hospedadas quando nao houve upload manual do usuario. A regra continua bloqueando carrossel sem midia real por card.

O MCP expõe esse diagnostico em `assess_campaign_briefing` e tambem retorna `qualityGateReport` em `generate_campaign`. O `generate_campaign` bloqueia quando o gate de geracao encontra informacoes obrigatorias ausentes.

Regra pratica: antes de pedir para o modelo gerar ou publicar, o cliente MCP deve chamar `assess_campaign_briefing` e usar `qualityGateReport.questions` para perguntar somente o que falta.

## Gerador de criativos

O gerador deve alinhar os criativos ao segmento da campanha.

Exemplos:

- Campanha de culinaria/doces deve usar linguagem de sabor, encomenda, presente, pronta entrega, delivery, variedade e desejo.
- Campanha de academia deve usar linguagem de treino, evolucao, rotina, meta corporal, acompanhamento e constancia.
- Campanha imobiliaria deve usar linguagem de localizacao, tipo de imovel, metragem, finalidade, diferenciais reais e atendimento.

O sistema nao deve inserir frases genericas como `ultimas unidades`, `seguranca 24h`, `valores sob consulta`, `4 vagas` ou `alto padrao` sem fonte no briefing.

Fallbacks de carrossel tambem nao podem conter fatos especificos hardcoded. Titulos como `3 suites espacosas` ou descricoes como `190 m2 privativos` so podem aparecer quando esses dados vierem do briefing atual.

Em carrossel, cada card precisa ter um angulo proprio. Repetir a mesma headline/copy em 3+ cards, como `Espaco Comercial 50m2 - Rua 902` em todos os cards, e bug de montagem criativa e deve ser bloqueado pelo quality gate. Claims como `fase final`, `processo avancado`, `condicao especial` e `por tempo limitado` so podem aparecer quando estiverem confirmados no briefing atual.

Atualizacao 2026-09-02: antes do Quality Gate final, o `generateCampaign` aplica uma reparacao deterministica quando detecta carrossel repetido. Para imoveis, ele reescreve os cards com angulos distintos e seguros: abertura com dados principais, localizacao, estrutura, condicao comercial, uso alinhado ao briefing e CTA. Para outros segmentos, ele tambem distribui angulos diferentes ate 5 cards. A reparacao preserva as midias e usa apenas fatos confirmados; se ainda houver conflito ou repeticao, o Fact Guard/Quality Gate continua bloqueando.

Atualizacao 2026-09-02: a reparacao de carrossel repetido agora tambem usa os sinais visuais de cada foto (`photoRole`, `photoCopyAngle`, `visualSignals`) para abrir a copy do card com um angulo compatível com a imagem. O Campaign Builder interno deve repassar `imageInsights` como `photoInsights`, que e o campo lido pelo `generateCampaign`.

Atualizacao 2026-09-07: o payload do Cloudflare Workers AI para FLUX deve enviar somente campos aceitos pelo modelo. Instrucao negativa contra texto/logos fica embutida no `prompt`; nao usar `negative_prompt`, pois o endpoint rejeita propriedades extras e derruba para fallback desnecessariamente.

Atualizacao 2026-09-07: quando todos os LLMs falham e o motor hibrido assume, `Confeitaria`, `doceria`, `brigadeiro`, `docinhos` e demais nichos de alimentacao devem usar templates alimentacao-especificos, nao o fallback generico `default`. O reparador de variedade de carrossel tambem deve preservar campos bons e unicos vindos do Gemini/Groq/padroes reais, substituindo apenas headline/copy/hook/description fracos, repetidos ou com linguagem interna.

Atualizacao 2026-09-07: os titulos de alimentacao precisam colocar o angulo antes do produto/empresa. Quando o produto e longo (`Brigadeiros e docinhos por encomenda`), comecar todos os titulos pelo produto faz o corte de 40 caracteres transformar cards diferentes em titulos iguais; isso ativa o reparador e troca a copy por fallback. O teste de GraKau garante quatro headlines unicas e proibe os titulos fixos `Doces para pedir hoje` e `Variedade na mesma caixa`.

Atualizacao 2026-09-07: financeiro virou segmento de primeira classe na taxonomia de copy (`server/ai.ts` e `shared/segmentConfig.ts`). Achado real na campanha #769 / Metodo 10X: educacao financeira caia em fallback generico quando o reparador de variedade entrava, gerando `hybrid_variety_repaired` com textos sem aderencia ao segmento. Corrigido com nicheKeys financeiros, regras de compliance, alinhamento de segmento, templates base e fallback de carrossel especifico. A copy financeira deve falar de metodo, clareza, organizacao, perfil, analise e orientacao; nao deve prometer renda, lucro, retorno, patrimonio garantido, multiplicar dinheiro ou investimento sem risco. Evitar ate frases negativas que repitam literalmente a promessa proibida dentro do texto publico.

Atualizacao 2026-09-08: achado real na campanha #770 / Metodo 10X: o segmento financeiro ja era reconhecido, mas o motor hibrido principal ainda montava os criativos por `buildBaseTemplate`, repetindo nome do produto (`Metodo 10X apresenta Metodo 10X`), gerando pontuacao baixa e marcando todos os cards para revisao. Corrigido com `buildFinancialCarouselAngles`, compartilhado pelo motor hibrido e pelo reparador de carrossel. Para financeiro, a revisao automatica considera o segmento regulado: copy clara, alinhada, sem placeholder, sem linguagem interna, risco baixo e score >=65 pode sair sem `needsReview`, porque a regua generica de score penaliza a ausencia de urgencia/promessa numerica — justamente o que nao deve ser inventado em campanha financeira.

Para sala comercial de uso amplo, os criativos devem usar linguagem neutra: `atividade profissional`, `rotina profissional`, `operacao`, `negocio`, `atendimento profissional` e `espaco comercial`. Nao transformar publico-alvo possivel em tipo de operacao especifica sem confirmacao.

### Correcao editorial de 2026-09-05

O fallback imobiliario e a reparacao de variedade compartilham server/carouselCopy.ts, com textos finais para o interessado e ate dez angulos distintos. A causa das copys de bastidores era deterministica: os templates continham frases como "O briefing confirma" e a reparacao adicionava uma explicacao sobre a foto antes de todos os textos. Orientacoes de criacao permanecem nos prompts/metadados, nunca no texto publico. Os fatos continuam vindo do Fact Guard; ausencia de finalidade, valor, metragem ou estrutura nao autoriza preencher esses dados.

Titulos curtos validos e descricoes factuais, como "Sala climatizada" e "50 m²", nao devem ser descartados pelo limite minimo de texto principal. O corte de campos respeita palavras, precos e unidades, sem encerrar uma palavra no meio. A ultima foto tambem preserva uma headline valida. Fotos com o mesmo papel visual recebem angulos disponiveis diferentes, sem trocar suas midias.

A finalidade canonica do briefing atual prevalece sobre um segmento herdado de venda. A deteccao compartilhada prioriza locacao quando ha sinal imobiliario. server/campaignPhotoClassification.ts separa a cena visual do contexto do negocio: "lookalike" nao e moda, "carrossel" nao e automotivo e uma cozinha ou quarto de imovel nao muda o nicho da campanha.

shared/campaignCopyQuality.ts audita linguagem interna em campos publicos e no banco V2, alem de aberturas longas repetidas. O gate final de geracao e as duas entradas de publicacao do carrossel (MCP e tRPC) usam essa auditoria. O modo economico passa pela mesma normalizacao e validacao final sem adicionar chamadas de IA. A pontuacao e recalculada depois da reparacao para refletir o texto salvo.

Regressoes: npm run test:carousel-copy, junto de test:fact-guard e test:quality-gates. Em ambientes que nao permitem o socket IPC do CLI tsx, os mesmos testes podem rodar com node --import tsx --test server/__tests__/carouselCopy.test.ts. Testes locais nao equivalem a uma nova geracao validada em producao.

### Correcao do motor eco/hibrido e orcamento/publico (branch fix/real-estate-hybrid-copy-audience-budget, PR pendente de revisao)

Achado real (campanha 747, sala comercial para locacao): o motor eco (buildCampaignFromAds em server/ai.ts, usado quando shouldUseLLM("high") e falso) gerava copy pelo template generico buildBaseTemplate, que nao distingue venda/locacao nem residencial/comercial — produzindo "o lar que voce sempre sonhou", "sonho da casa propria" e "ultima unidade disponivel" para uma sala comercial em locacao. Corrigido: quando o segmento e imobiliario e os fatos canonicos ja foram extraidos (buildCampaignFacts), buildCampaignFromAds agora usa buildRealEstateCarouselAngles (server/carouselCopy.ts), o mesmo gerador fact-safe do caminho com IA — nunca um segundo conjunto de regras.

O Fact Guard (server/campaignFactGuard.ts) ganhou dois detectores estruturais que faltavam, validos para os dois motores (eco e LLM) porque a validacao pos-geracao e compartilhada: detectScarcityOrExclusivityClaims (ultima(s) unidade(s), alto padrao, exclusivo etc., singular e plural) e detectHomeownershipClaims (casa propria, o lar que voce sempre sonhou etc., bloqueado a menos que a finalidade seja venda de imovel nao-comercial). Nenhum dos dois e proibicao cega: passam quando o proprio cliente confirmou a condicao no briefing (facts.confirmedClaimsRaw).

Tambem corrigidos, todos com causa raiz identificada em server/ai.ts: (1) o hook do carrossel (server/carouselCopy.ts e buildCampaignFromAds) era literalmente igual a headline — agora usa a primeira frase do corpo do card; CampaignResult.tsx tambem deixa de exibir o hook quando e redundante com a headline (isRedundantHookText em shared/campaignCopyQuality.ts); (2) a divisao de orcamento entre ad sets multiplicava por uma variavel que nao era 100 (era um numero de orcamento por objetivo), resultando em somas como 16%+14%+10%=40% em vez de 100% — corrigido para 40/35/25 fixos; (3) o publico exibido/salvo usava "25-50 anos" fixo e alegava "Lookalike 1-3%" sem nenhuma lookalike de fato configurada — agora usa ageMin/ageMax realmente pedidos; (4) o orcamento pedido (ex.: R$180 para 30 dias) era substituido silenciosamente por um piso interno da Meta (~R$675/mes, calculado com 4 ad sets fixos quando a estrutura real usa 3) sem avisar o cliente — o valor pedido nunca e mais reescrito; a incompatibilidade com o piso real vira uma pendencia synthetic apenas no estagio de PUBLICACAO (shared/campaignQualityGate.ts, action "publish"), nunca um bloqueio da geracao do rascunho.

Regressoes: npm run test:hybrid-engine (novo), alem de test:carousel-copy, test:fact-guard e test:quality-gates ja existentes. Validado localmente: npm run check:server sem nenhum erro novo de TypeScript (37 pre-existentes, identicos antes/depois).

### Fase 1 da fundacao de planejamento de copy compartilhado (branch feat/offer-planning-foundation, PR pendente de revisao)

Pedido: ter uma etapa de planejamento e revisao de copy compartilhada por TODOS os motores (IA, eco, templates, fallback), que usa os dados especificos da oferta pra escolher argumentos — nao um prompt isolado por caminho. Esta e a Fase 1 apenas: a ficha da oferta generalizada e o planejador de sequencia de argumentos. NAO religa ainda os 4 caminhos de geracao (isso e Fase 2, mudanca maior que toca ai.ts nos 4 pontos de geracao e e mais arriscada de validar de uma vez).

O que foi feito:

1. **Caracteristica != beneficio** (server/campaignFactGuard.ts): novo campo `confirmedCharacteristics` no CampaignFacts (clausulas curtas extraidas literalmente do briefing — o que o cliente disse que o produto TEM) e novo detector `detectUnconfirmedBenefitClaims` (economia de energia, aumenta produtividade/vendas, melhora saude, resultados garantidos etc.) — bloqueado a menos que o proprio cliente tambem tenha afirmado o EFEITO, nao so a caracteristica (mesmo gate por confirmedClaimsRaw ja usado pra escassez/exclusividade). Ex.: "dois aparelhos de ar-condicionado" nao autoriza sozinho "economia de energia" na copy.

2. **shared/offerPlanning.ts** (novo arquivo): `ARGUMENT_SEQUENCES`, uma tabela declarativa por segmento (reaproveita as chaves de shared/segmentConfig.ts — imoveis_venda, imoveis_locacao, saude_estetica, servicos_locais, alimentacao, ecommerce, infoprodutos, moda_varejo, b2b, outro — sem criar uma segunda taxonomia). `planCopyArguments(segmento, disponibilidade)` filtra a sequencia "ideal" removendo qualquer argumento (prova_social, beneficio_comprovado, localizacao, condicoes, diferencial_comprovado, estrutura_ou_ingredientes) cujo requisito nao esta confirmado nos fatos da campanha, em vez de inventar o dado que falta; produto_ou_espaco e cta_step nunca saem (sao estruturais). `buildArgumentAvailability(facts)` cruza isso com o CampaignFacts real.

Ainda nao feito (Fase 2, proxima): unificar o pipeline plan→draft→review→repair→sync→validate nos 4 caminhos de geracao (hoje cada um gera copy do seu jeito; so o caminho imobiliario dos dois motores principais usa o mesmo gerador fact-safe, corrigido na frente anterior). Tambem nao feito: aprendizado a partir de resultados reais por tipo de oferta (depende de dado que a plataforma ainda nao coleta — qualidade de lead, nao so cliques).

### Bug de extração "mais longo vence" confundindo área/preço com outro número no mesmo texto (branch fix/area-price-longest-match-bug, PR pendente de revisao)

Achado real, reportado por Michel na conferência manual: o gerador colocou 191 m² onde deveria constar 50 m². Causa raiz confirmada e reproduzida ao vivo em server/campaignFactGuard.ts: firstMatch() escolhia o match MAIS LONGO entre todas as ocorrências de um padrão no texto combinado (briefing atual + perfil do cliente) — comportamento introduzido de proposito para corrigir um bug de ENDEREÇO (onde uma string mais longa e genuinamente mais especifica, ex: "Rua 902, nº 144" > "Rua 902"), mas aplicado indiscriminadamente tambem a area, preço, andares, suites, quartos, banheiros e vagas — onde "mais longo" so significa "mais digitos", sem nenhuma relacao com estar correto. Um briefing que menciona a area da unidade (50 m²) E a area total do predio/condominio (191 m²) no mesmo texto sempre escolhia 191 m², so por ter mais caracteres.

Corrigido: firstMatch() ganhou um parametro opcional preferLongest (default false = primeira ocorrencia, correto pra fatos numericos). So o call site de ENDERECO passa { preferLongest: true } explicitamente, preservando o comportamento correto ja testado (endereco mais completo vence). Area, preço, andares, suites, quartos, banheiros e vagas passam a usar a primeira ocorrencia.

Reproduzido ao vivo antes e depois da correcao (dois cenarios: duas metragens no mesmo campo do briefing atual; e metragem errada residual no perfil do cliente com briefing atual correto) — confirmado que a correcao resolve os dois. Mesma classe de bug pode ter afetado preço da mesma forma (mesma funcao, mesmo padrao "mais longo vence"), mas nao foi reportado/reproduzido especificamente — vale ficar atento.

Testes: +2 em campaignFactGuard.test.ts (area nao confundida com area maior no mesmo briefing; area do briefing atual ainda prevalece sobre residuo maior no perfil). Validado: test:fact-guard 22/22 (o teste existente que depende do comportamento "mais longo vence" pra ENDEREÇO continua passando, sem alteracao de comportamento nesse campo), as outras 4 suites sem regressao (52/52 no total antes desta frente). check:server sem erro novo de TypeScript.

### Harness de avaliação com Promptfoo (branch feat/promptfoo-evals, PR pendente de revisao)

Adicionado promptfoo (^0.122.2) como devDependency, em uma pasta eval/ separada — NAO roda em producao, NAO esta em nenhum caminho de geracao real, e' so ferramenta de teste/comparacao fora do servidor. Nota: a OpenAI comprou o Promptfoo em marco de 2026; continua MIT/open source.

Dois configs, propositalmente separados (medem coisas diferentes):

1. **eval/promptfooconfig.pipeline.yaml** — regressao de PIPELINE COMPLETO. O provider customizado (eval/providers/pipelineProvider.ts) chama buildCampaignFromAds/buildCampaignFacts REAIS (nao mock), e as asserções (eval/assertions/factGuard.ts, editorial.ts) reaplicam validateCampaignFactIntegrity e getCarouselEditorialIssues REAIS — nenhuma regra duplicada, o eval so mede o que o proprio MecProAI ja decide. Casos: campanha 747 (sala comercial locacao, replica o achado real completo — casa propria/ultima unidade/25-50 anos/R$675) e um caso representativo da classe de bug da campanha 746 (linguagem interna vazando no card, nao e a reconstrucao literal do briefing original que nao esta documentado). Rodei de verdade (sem mock): 2/2 passando, cada asserção com motivo especifico (nao e um "passa por acidente"). Roda com `npm run eval:pipeline` (usa NODE_OPTIONS=--import=tsx porque o provider importa .ts do projeto direto).

2. **eval/promptfooconfig.rawmodel.yaml** — comparacao de MODELO CRU (Gemini vs DeepSeek via provider openai-compatible), sem nenhum validador do MecProAI por tras. Serve pra decidir qual modelo escreve melhor de raiz, nao qual pipeline entrega copy segura (isso e o outro config). Prompt simplificado (eval/prompts/copyImobiliaria.txt), NAO e o prompt literal de producao. Nao rodei de verdade — precisa de GEMINI_API_KEY/DEEPSEEK_API_KEY no ambiente, que nao tenho; a config esta pronta e validada sintaticamente, falta so a chave pra rodar.

Pendencia de operacao (nao resolvida, so documentada): rodar eval:rawmodel com frequencia consome cota real de API; recomendado usar uma chave/orcamento separado da rotacao de producao do Gemini, e rodar sob demanda (antes de mudar prompt/pipeline), nao em todo commit.

Testes: novo server/__tests__/offerPlanning.test.ts (7 testes) + 3 novos em campaignFactGuard.test.ts (caracteristica extraida como clausula literal, beneficio nao confirmado bloqueado mesmo com caracteristica relacionada, beneficio permitido quando o proprio cliente afirma o efeito). Validado: test:fact-guard 20/20, test:offer-planning 7/7, mais as suites existentes sem regressao (test:quality-gates 7/7, test:carousel-copy 13/13, test:hybrid-engine 5/5) — 52/52 no total. check:server sem erro novo de TypeScript.

## Ordem de fotos em carrossel

Quando houver multiplas fotos, o sistema deve pedir ou permitir escolher a foto de destaque.

Se o usuario nao escolher, a ordem sugerida deve seguir:

1. Foto mais forte comercialmente ou arte principal.
2. Ambiente/oferta que melhor explica o produto.
3. Diferenciais visuais.
4. Detalhes de apoio.
5. Prova visual complementar.
6. Fechamento com CTA ou contato, quando existir.

Para imoveis:

1. Fachada, vista, piscina ou melhor foto de impacto.
2. Sala/cozinha integrada.
3. Suite/quarto.
4. Diferenciais: closet, varanda, area gourmet, piscina, vista.
5. Informacoes comerciais ou card de oferta.

Para doces:

1. Bandeja/caixa mais abundante e apetitosa.
2. Variedade de sabores.
3. Close do produto.
4. Embalagem/presente.
5. Card com marca/contato, se visualmente bom.

## Upload de imagens pelo MCP

O MCP aceita imagens por `fileUrl` ou `imageBase64`.

Limite importante: o servidor do MecProAI nao consegue acessar caminhos locais do ChatGPT, como `/mnt/data` ou URLs internas `sandbox`. Para funcionar de forma confiavel, o conector precisa receber:

- bytes/Base64 reais da imagem; ou
- uma URL HTTPS publica acessivel pelo servidor; ou
- arquivo encaminhado pelo ambiente que chama o MCP.

O erro `Formato de imagem nao reconhecido` indica que o backend recebeu conteudo invalido ou placeholder, nao um JPEG/PNG/WEBP real.

O erro `fetch failed` em URL `sandbox` indica que a imagem existe no ChatGPT, mas nao esta acessivel ao servidor do MecProAI.

## Upload de videos pelo MCP

O MCP possui suporte para upload de video criativo.

O fluxo esperado e semelhante ao de imagem:

1. Receber video por URL publica ou base64/bytes.
2. Validar formato permitido.
3. Enviar para Cloudinary.
4. Associar o video ao criativo/campanha.

Assim como imagens, videos locais do ChatGPT nao devem ser enviados como caminho interno inacessivel ao servidor.

## Publicacao e atualizacao na Meta

O MecProAI pode criar rascunhos, subir midias e publicar campanhas.

Atualizacoes em campanhas ativas devem ser tratadas com cuidado, porque alteracoes de publico, localizacao, posicionamento e criativo podem afetar a fase de aprendizado na Meta.

Quando uma campanha ativa tem pouco investimento e poucos cliques, normalmente e mais seguro criar uma versao corrigida e pausar a antiga. Quando o ajuste for pequeno, pode-se atualizar diretamente o que a integracao permitir.

Nunca publicar na Meta sem confirmacao explicita do usuario.

## ML-first e base de aprendizado

O pipeline de aprendizado esta ativo quando ha escrita recente em `learning_base`.

Os dados historicos foram limpos para remover sinais antigos como:

- `avg_score=100` fixo;
- linhas sem CTR/ROAS uteis com amostras altas;
- nichos contaminados ou inconsistentes.

Observacao: ate a ultima auditoria conhecida, `campaign_scores` nao possuia ROAS real maior que zero. Portanto, o motor consegue aprender por CTR, CPC, CPM e sinais de entrega, mas ainda nao aprende ROAS real enquanto esse dado nao for gravado.

## Memoria operacional refinavel

O arquivo `server/systemMemory.ts` agora tambem oferece uma camada de licoes operacionais persistentes, semelhante ao conceito de `/refine`: o modelo em si nao muda, mas o projeto acumula regras, aprendizados e padroes reaproveitaveis como contexto.

Ferramentas MCP:

- `record_operational_lesson`: registra ou refina uma licao ativa.
- `list_operational_lessons`: lista licoes filtradas por modulo, escopo, segmento ou objetivo.

Essas licoes entram no prompt de `generateCampaign` por `buildOperationalLessonsContext`, sempre com a regra explicita: usar como processo/estrategia, nunca como fato da campanha atual.

Para inicializar as licoes padrao no banco:

```bash
npm run seed:memory
```

Exemplos de licoes validas:

- Em carrossel imobiliario, confirmar capa e ordem antes de publicar.
- Em doces, perguntar sabores, formato de encomenda e regiao de entrega.
- Se `factValidationStatus=failed`, nunca publicar antes de corrigir copy.

Exemplos que nao devem virar licao geral:

- Um preco especifico de campanha.
- Um endereco especifico.
- Uma metragem ou numero de suites de um projeto.

## Validacoes tecnicas

Comandos recomendados apos alteracoes no motor:

```bash
npm run test:fact-guard
npm run test:quality-gates
npm run check:mcp
npm run check:server
```

Resultados esperados:

- `test:fact-guard`: todos os testes passando.
- `test:quality-gates`: gates de briefing, midia, publicacao e segmentos passando.
- `check:mcp`: `mcpServer import ok`.
- `check:server`: TypeScript sem erros.

Se `npm run check` ou `npm run check:server` falhar com `JavaScript heap out of memory`, rodar com limite maior de memoria Node, conforme script atual de `check:server`.

## Estado dos testes em 2026-08-29

No commit `c859431`, o Render confirmou:

- `test:fact-guard`: 4 testes, 4 passaram, 0 falhas.
- `check:mcp`: importacao do MCP OK.

Ainda deve ser conferido o resultado completo de `npm run check:server` sempre que houver alteracao posterior.

### Quartos/suítes inventados em imóvel comercial (branch fix/commercial-property-residential-features, PR pendente de revisao)

Achado real, relatado por Michel: "como se trata de sala comercial e não um apto" — preocupacao de que caracteristicas puramente residenciais (quarto/dormitorio/suite) pudessem vazar pra copy de um imovel comercial sem nada bloquear.

Causa raiz confirmada: as checagens de contagem em server/campaignFactGuard.ts (bedrooms/suites/bathrooms/parkingSpots) so disparavam quando um numero ja estava CONFIRMADO no briefing pra comparar contra (`if (!expected) continue`). Numa sala comercial, quartos/suites nunca sao mencionados (nao existem nesse tipo de imovel) — entao `expected` nunca existia, e a checagem inteira era pulada. A IA podia inventar "3 quartos"/"2 suites" do zero pra uma sala comercial sem nenhum bloqueio estrutural (havia so uma rede de seguranca generica de nivel de palavra, ja existente, que cobre parte mas nao o padrao numerico especifico).

Corrigido: quando o tipo de imovel e comercial (sala comercial, imovel comercial) e quarto/suite aparece na copy SEM nenhum numero confirmado, a alegacao e bloqueada (`residential_feature_claim_conflict_commercial_property`) — nao e proibicao cega: banheiro e vaga continuam permitidos sem confirmacao (sao plausiveis em imovel comercial), e quartos continuam liberados normalmente pra imovel residencial de verdade.

Testes: +3 em campaignFactGuard.test.ts (bloqueia quartos/suites inventados em comercial; nao bloqueia banheiro/vaga em comercial; continua permitindo quartos em residencial). Validado: test:fact-guard 23/23, as outras 4 suites sem regressao (52/52). check:server sem erro novo de TypeScript.

### Negacao, prioridade atual/perfil, falso-positivo "cura" e variedade na regeneracao (branch fix/negation-and-regen-issues, baseada em cima de fix/area-price-longest-match-bug — PR pendente de revisao)

Relato de Michel apos conferencia manual (campanhas #749/#750/#751), 5 pontos investigados:

1. **Negacao ignorada na extracao (CORRIGIDO).** Briefing "Nao inventar 190/191 m² — a area correta e 50 m²" extraia 191 m². Causa: firstMatch() (area/preco/endereco/andares/suites/quartos/banheiros/vagas) nao tinha nenhuma consciencia de negacao, diferente de hasPositive() (so propertyType/purpose, corrigida em sessao anterior). Reaproveitada a mesma NEGATION_WORDS em firstMatch — um match cujos ~25 caracteres anteriores contem "nao"/"nunca"/"jamais"/"sem ser" e descartado. Reproduzido ao vivo antes/depois.

2. **Regeneracao sempre identica (CORRIGIDO).** Cada um dos 4 anuncios da campanha #751 saiu identico ao correspondente da #750, apesar da instrucao de novos titulos, ambos com source hybrid_real_estate. Causa: buildRealEstateCarouselAngles e pura — mesmos fatos sempre produzem os mesmos 10 angulos na mesma ordem. E consequencia direta da correcao da campanha 747 (trocamos um motor generico com variacao por tom, mas que inventava fatos, por um gerador fact-safe determinista). Corrigido: novo parametro rotate/regenerationSeed que gira a selecao dos 10 angulos (todos igualmente seguros/factuais) sem alterar nenhum fato do conteudo — sem valor explicito, usa o relogio (Date.now()), dando variedade real a cada regeneracao; com valor explicito, continua deterministico (usado nos testes). Nao garante nunca repetir um angulo ja visto pelo cliente — isso exigiria guardar historico de angulos usados por projeto, fora do escopo desta correcao.

3. **"Estrutura para massoterapia" persistindo (CORRIGIDO).** Um briefing mais enxuto (#750/#751), direcionado a divulgar a sala pra publicos diversos, continuou tendo esse uso especifico destacado. Causa: ao contrario de TODOS os fatos escalares (area, preco, endereco etc., que ja usam preferCurrentFact — atual vence sobre perfil antigo), structuralFeatures/usagePossibilities eram extraidos do texto combinado (atual+perfil) sem prioridade nenhuma — uma mencao antiga no perfil do cliente virava caracteristica confirmada pra sempre. Corrigido com o mesmo padrao current-vence-sobre-inherited ja usado pros demais fatos, e trocado has() por hasPositive() (mesma classe de bug da negacao, item 1). Perfil antigo so serve de fallback quando o briefing atual nao confirma NENHUMA caracteristica/uso.

4. **Validador confundindo "cura" com "procura" (CORRIGIDO em 4 pontos).** Reproduzido com o texto real gerado pelo proprio carouselCopy.ts ("O que voce procura..."), que disparava complianceRisk "Alto" em creativeScoringEngine.ts por causa de String.includes() (substring, sem limite de palavra) — "cura" e substring literal de "procura"/"escura". Corrigido em creativeScoringEngine.ts (HIGH_RISK_TERMS/MEDIUM_RISK_TERMS/URGENCY_TERMS), validateMetaCompliance em server/ai.ts (META_PROHIBITED_WORDS/META_SENSITIVE_WORDS), o CTA forbidden check do motor hibrido (segRulesHybrid.forbidden) e outro ponto de segRule.forbidden — todos trocados pra checagem com \\b (limite de palavra) nos dois lados. Nota registrada: isso deixa de casar formas com sufixo colado (ex.: "garantidos" nao bate mais com "garantido") — se isso importar pra algum termo especifico, o certo e adicionar a forma flexionada como item separado na lista, nao voltar pra substring solta. imageRAG.ts tambem tem uma lista "forbidden", mas so e construida, nunca comparada em lugar nenhum — nao precisou de correcao.

5. **Checagem do briefing inconsistente sobre foto em destaque/ordem (INVESTIGADO, NAO CORRIGIDO — precisa de decisao do Michel).** O retorno as vezes informa "foto 1 e destaque, ordem 1234" e simultaneamente pede pra definir esses dados. Causa raiz confirmada: featuredPhotoIndex/photoOrder NUNCA sao persistidos no banco — existem so como parametro de entrada e saida de uma UNICA chamada de ferramenta MCP (generate_campaign nao chama db.createCampaign com esses campos). assess_campaign_briefing so avalia o que a propria chamada recebeu, sem nenhuma forma de saber que uma chamada anterior de generate_campaign ja auto-decidiu esses valores. Corrigir de verdade exige persistir esses campos na campanha (mudanca de schema) ou mudar o contrato de como as ferramentas trocam estado entre si — nao mexi sem confirmacao, mesmo cuidado ja aplicado a toda mudanca de schema nesta base.

Testes: +6 em campaignFactGuard.test.ts (negacao em area/preco, prioridade atual/perfil em structuralFeatures nos 3 cenarios), +1 em hybridCampaignEngine.test.ts (seeds diferentes dao angulos diferentes sem perder seguranca factual — e o existente ajustado pra fixar regenerationSeed, ja que ficou nao-deterministico por design), novo server/__tests__/creativeScoringEngine.test.ts (4 testes: procura/escura nao disparam, cura de verdade e frase de risco continuam disparando). Validado: test:fact-guard 30/30, test:hybrid-engine 6/6, test:creative-scoring 4/4 (novo), as demais sem regressao — 67/67 no total. check:server sem erro novo de TypeScript (comparado contra origin/main de verdade, nao contra um stash parcial).

### Validado em producao (campanha #752) + 2 problemas novos corrigidos (branch fix/usage-framing-and-accents, PR pendente de revisao)

Michel gerou a campanha #752 em rascunho apos o merge da frente anterior e confirmou 4 correcoes seguraram em producao de verdade: metragem correta (50 m²), massoterapia sumiu, alerta falso de "cura" nao reapareceu mesmo com "procura" no texto, orcamento mantido (R$180/30 dias = R$6/dia). Apareceram 2 problemas novos:

1. **"Estetica" ainda direcionando 2 anuncios, contrariando a divulgacao ampla pedida (CORRIGIDO).** Causa: targetAudience e um campo PERSISTENTE do perfil do cliente (ex.: "profissionais de saude, estetica e bem-estar"), nao repetido a cada campanha — diferente de structuralFeatures (fato fisico, estavel, onde cair de volta pro perfil antigo faz sentido), enquadramento de PUBLICO e decisao editorial por campanha. A correcao anterior (item 3 da frente passada) aplicou o mesmo fallback pros dois, e isso bastou pra "estetica" do perfil antigo continuar aparecendo sempre que o briefing atual (mais enxuto) nao menciona nenhum uso/publico. Corrigido: usagePossibilities NUNCA cai de volta pro perfil — reflete so o que o briefing ATUAL confirma. structuralFeatures mantem o fallback (fato fisico continua sendo fato fisico entre campanhas).

2. **Acentuacao incorreta em "estetica" e "pe-direito" (CORRIGIDO).** Nao era erro de digitacao do cliente nem do extrator — os literais de SAIDA estavam hardcoded sem acento no codigo (`"pe-direito alto"`, `"estetica"`), independente de como o texto de entrada foi escrito. Corrigido pra `"pé-direito alto"`, `"estética"` e `"profissionais de saúde"`.

Testes: +3 em campaignFactGuard.test.ts (framing de uso nunca cai pro perfil persistente; ainda confirma quando o briefing atual pede; saida com acento correto), 1 assercao existente ajustada (esperava "pe-direito alto" sem acento). Validado: test:fact-guard 33/33, as demais 5 suites sem regressao — 70/70 no total. check:server sem erro novo de TypeScript.

### Confeitaria desviada pro gerador de imoveis por causa de "entrega em casa" (branch fix/segment-routing-false-positive, PR pendente de revisao)

Achado real (campanha #754, Gra Kau Delicias — confeitaria): o rascunho gerado tinha headline "Imovel", CTA "Agendar visita" em vez de "Consultar encomenda", e "Valor: R$ 1.500"/"Regiao DDD 47" aparecendo literalmente dentro do texto do anuncio. O perfil/publico retornaram corretamente como confeitaria, mas os textos vieram do caminho hybrid_real_estate.

Causa raiz confirmada e reproduzida ao vivo: `isRealEstate` em server/ai.ts era `initialSegment.startsWith("imoveis_") || !!campaignFacts.realEstate.propertyType` — o segundo termo (OR) bastava sozinho. `detectPropertyType()` retorna "casa" pra QUALQUER ocorrencia da palavra "casa" no texto combinado, sem entender o sentido — e "entrega em casa"/"docinhos feitos em casa" sao frases comuns de confeitaria que nao tem nada a ver com imovel. O nicho "Confeitaria" tambem nao batia com nenhuma nicheKey de alimentacao (so tinha restaurante/aliment/delivery/lanche/comida/gastronomia/bar/pizz) e caia no fallback "outro" — combinado com o match solto de "casa", a campanha inteira era desviada pro gerador de imoveis sem NENHUM outro sinal real (sem area, sem finalidade, sem endereco).

Corrigido em dois pontos: (1) extraida a logica de decisao pra uma funcao pura e testavel, `resolveIsRealEstate(initialSegment, facts)` em server/campaignFactGuard.ts — propertyType sozinho nao basta mais como sinal de imovel, precisa de pelo menos mais um fato tipicamente imobiliario (area, finalidade locacao/venda/temporada ou endereco) confirmado junto; isso vale pra QUALQUER segmento, nao e uma lista de nichos a manter. (2) ampliadas as nicheKeys de alimentacao em shared/segmentConfig.ts pra incluir confeit/doce/docinho/padaria/confeitaria/bolo/brigadeiro/cafeteria/hamburgueria, reduzindo quanta coisa cai no fallback generico "outro".

Testes: +4 em campaignFactGuard.test.ts (palavra ambigua sem prova corroborante nao vira imovel; ainda vira imovel quando corroborado por area/finalidade/endereco; segmento ja classificado como imoveis_* sempre conta; confeitaria/doceria agora classificam como alimentacao). Validado: test:fact-guard 37/37, as demais 5 suites sem regressao — 74/74 no total. check:server sem erro novo de TypeScript.

Limitacao que fica registrada: mesmo corrigido o desvio pro gerador de imoveis, confeitaria (e qualquer nicho fora de imoveis) ainda usa o motor generico hybridGenerateAds/buildBaseTemplate ou o caminho LLM sem um gerador fact-safe dedicado como o de imoveis — isso e exatamente a Fase 2 do plano de planejamento de copy compartilhado (shared/offerPlanning.ts), ainda pendente de ligar aos 4 caminhos de geracao.

### Validacao de endereco generalizada pra fora de imoveis + correcao da regex de rua com artigo (branch feat/generic-address-validation, PR pendente de revisao)

Pedido explicito do Michel apos a correcao da campanha #754: "previr outros segmentos tambem". Mapeei o que ja e generico vs. o que ainda so vale pra imoveis no Fact Guard — preco ja tinha fallback generico (genericProductPrice, achado da auditoria 03/09), escassez/exclusividade/beneficio/prova social ja sao niche-agnosticos por design. Endereco era a lacuna real: so era validado dentro de facts.realEstate, entao um negocio fora de imoveis (confeitaria, loja, servico local) com endereco errado ou inventado no anuncio nao era pego por nada.

Corrigido com o mesmo padrao ja usado pra preco: novo campo `genericAddress` no CampaignFacts, extraido do texto combinado com o mesmo addressPattern generico (so casa "rua/avenida + nome", nunca teve vocabulario imobiliario) e a mesma prioridade atual-vence-sobre-perfil. A checagem de endereco na copy agora usa `facts.realEstate.address || facts.genericAddress`, igual preco ja fazia com `facts.realEstate.price || facts.genericProductPrice`.

No caminho, achado um bug pre-existente na propria regex de endereco (nao introduzido nesta sessao, so ficou mais visivel ao testar com nomes de rua reais de outros nichos): so capturava UMA palavra depois de "rua"/"avenida" — "Rua das Palmeiras, 200" virava so "Rua das", perdendo o nome de verdade. Passava despercebido porque os fixtures de imoveis sempre usaram nome de rua numerico ("Rua 902"). Corrigida pra aceitar ate 3 palavras antes do numero final, com ou sem artigo (das/dos/da/do).

Testes: +2 em campaignFactGuard.test.ts (endereco validado fora de imoveis, com bloqueio de endereco errado e aceite do correto; extracao funcionando com nome de rua multi-palavra e artigo). Validado: test:fact-guard 39/39, as demais 5 suites sem regressao (incluindo os testes existentes de endereco de imoveis, que continuam passando sem alteracao de comportamento) — 76/76 no total. check:server sem erro novo de TypeScript.

Limitacao que continua a mesma: isso cobre a camada de VALIDACAO (bloquear fato errado), nao de GERACAO — fora de imoveis ainda nao existe um gerador fact-safe dedicado como buildRealEstateCarouselAngles. Isso e a Fase 2 do offerPlanning.ts, ainda pendente.

### Regras proibitivas de copy + sanitizacao de templates de fallback (commits diretos do Michel, 06/09, nao documentados ate agora)

Tres commits feitos direto no GitHub pelo Michel, fora do fluxo de PR desta sessao, catalogados aqui pra manter o registro completo. Achados em auditoria manual das campanhas #757, #758 e #759 (Gra Kau):

**46b7498 "adiciona regras proibitivas de copy no prompt de geracao".** O prompt principal (o que vai pro Gemini/Groq gerar a campanha) nao tinha regras explicitas contra: invencao de promocoes/urgencia ("so hoje", "condicoes especiais", "ultimas vagas"), frases genericas de autoajuda/coaching ("transforme sua vida", "o segredo para"), dados nao confirmados no briefing (precos, prazos, garantias, certificacoes, numero de clientes nao informados) e linguagem de nicho errado (tom de coaching pra confeitaria, por exemplo). Adicionado um bloco de "REGRAS DE COPY — PROIBICOES ABSOLUTAS" com lista explicita e validacao final antes de cada criativo.

**be8be590 "sanitiza templates de fallback — remove frases proibidas".** As mesmas frases proibidas pelo prompt principal ainda apareciam quando a geracao caia num TEMPLATE HARDCODED de fallback (usado quando Groq falha ou o segmento nao e reconhecido) — esses templates bypassavam as regras do prompt principal por serem texto fixo, nao gerado. Removidas "so hoje", "condicoes especiais", "ultimas vagas", "transforme sua vida", "oferta por tempo limitado", "desconto relampago", "clientes satisfeitos" (numero inventado), "vagas limitadas" (urgencia falsa) dos templates em `mockResponse`, `buildBaseTemplate` e `_staticMockAds`.

**e9bd8ab "sanitiza templates restantes — remove claims inventados e idade/duracao hardcoded".** Continuacao do commit anterior: mais frases proibidas em outros templates ("centenas escolhem", "resultados reais sem enrolacao", "metodo comprovado", "provas sociais e depoimentos verificados", "800 alunos transformados" — todos numeros/claims inventados nao verificaveis). Tambem corrigido idade (25-45 → 25-50 anos) e duracao (14 dias → 30 dias) hardcoded nos templates de estrategia de fallback, que nao tinham relacao com o briefing real do cliente.

Nota: um dos templates tocados por be8be590 introduziu o bug de `nichoLabel` indefinido (variavel que nao existe no escopo de `buildBaseTemplate`) e a string com aspas duplas que nunca interpolava — ambos encontrados e corrigidos na frente "Correcoes remanescentes apos commits paralelos" abaixo. Confirmado nesta revisao que as sanitizacoes de frase em si (o objetivo dos 3 commits) continuam intactas no codigo atual, sem terem sido revertidas por nenhuma correcao posterior.

### Correcoes remanescentes apos commits paralelos direto no GitHub (branch fix/remaining-crashes-and-price-negation, PR pendente de revisao)

Enquanto uma frente anterior desta sessao investigava o deploy quebrado e a cascata de crashes dos 6 segmentos novos (veiculos, construcao, educacao, eventos, turismo, pet), Michel fez varios commits direto na main resolvendo boa parte dos mesmos problemas em paralelo (sintaxe, estrutura dos 6 segmentos, nicheKeys de alimentacao — correcao de contagem: sao 10 commits nessa frente especifica, nao 6 como uma versao anterior deste documento registrou; contagem revisada numa auditoria posterior de toda a faixa de commits nao documentados). O PR anterior desta sessao ficou obsoleto. Reavaliado o que ainda faltava contra o estado atual da main e corrigido:

1. **Crash de runtime confirmado pelo proprio check:server (CORRIGIDO).** `nichoLabel` usado dentro de buildBaseTemplate (server/ai.ts) sem existir nesse escopo — `error TS2304: Cannot find name 'nichoLabel'`. Trocado pelo parametro `niche` que de fato existe na funcao. Achada e corrigida junto uma segunda ocorrencia (string com aspas duplas que nunca interpolava `${nichoLabel}` de verdade).

2. **Chave 'imagePath' duplicada (CORRIGIDO).** Ainda presente em GoogleCampaignCreator.tsx apos os commits paralelos — removida a logica morta (imgUrl especifico de Display nunca era usado).

3. **"buffet de casamento" ainda virava imovel (CORRIGIDO na raiz).** Mesma classe de bug do "corret"/"correta" relatado por Michel, encontrada de novo: "casa" (nicheKey de imoveis) e substring de "casamento". Corrigido com `matchesNicheKeyword()` (shared/segmentConfig.ts, limite de palavra nos dois lados), reaproveitada nos dois sistemas de segmento duplicados desta base (server/ai.ts e shared/segmentConfig.ts). A funcao tolera plural/singular (`encomenda`/`encomendas`) pra nao reabrir o problema oposto.

4. **Radicais truncados de alimentacao expandidos (CORRIGIDO).** Limite de palavra estrito quebrou "aliment"→alimentacao, "confeit"→confeitaria, "doce"→doceria, "pizz"→pizzaria (todos paravam de bater com a forma completa). Expandidos pras formas completas nos dois arquivos.

5. **Regressao de negacao em preco, de novo (CORRIGIDO).** A correcao de "orcamento vira preco" continuava numa funcao paralela (`firstMoneyMatchExcludingBudget`) sem a protecao contra negacao ja existente em `firstMatch` — reproduzido ao vivo: "nao usar R$18.000 — o correto e R$5.000" ainda extraia R$18.000. Consolidado de novo numa funcao so.

6. **price_not_confirmed_in_current_briefing (CORRIGIDO).** Ainda faltava o equivalente pra preco do que ja existia pra endereco.

7. **shared/segmentConfig.ts com os 6 segmentos novos em formato incompativel (CORRIGIDO por reescrita, nao remocao desta vez).** Ainda tinham o campo `copy` no formato errado (headline singular em vez de headlines[]). Da vez anterior a correcao removeu essas entradas por completo — mas isso quebrou detectSegmentFromNiche NESTE arquivo especificamente pros 6 nichos (confirmado por teste: "buffet de casamento" voltou a "outro"). Desta vez, reescritas no formato correto (value/label/icon/desc/copy/ui/detection completos), reaproveitando os mesmos CTAs/hookDirective/compliance ja definidos na versao de server/ai.ts — nao um terceiro conjunto de regras, so o mesmo conteudo no formato que este arquivo exige.

8. **Erro de tipo em offerPlanning.ts (CORRIGIDO).** Mesmo ajuste de narrowing da frente anterior, reaplicado (`hasExperience` extraido antes do `.every()` que causava o narrowing indevido do TypeScript).

Testes: novo server/__tests__/newSegments.test.ts (21 testes — inclui checagem de que os DOIS sistemas de segmento concordam pros 6 nichos novos). +6 em campaignFactGuard.test.ts. Validado: test:fact-guard 45/45, test:new-segments 21/21, as demais 5 suites sem regressao — 103/103 no total. npm run build confirmado passando, sem nenhum warning de chave duplicada. check:server: 37 erros, todos pre-existentes ja documentados, zero novo (confirmado que os erros de nichoLabel/offerPlanning/segmentConfig sumiram da lista).

### Copy generica e instrucao interna vazando pra confeitaria fora de imoveis (branch fix/segment-specificity-and-fallback-copy, PR pendente de revisao)

Achado real, campanha #761 (Gra Kau Delicias). Michel reportou dois problemas visiveis no rascunho: um card com texto generico (hook literal "Gra Kau Delicias — Alimentacao — confeitaria, brigadeiros e docinhos por encomenda com qualidade") e outro card ("PRINCIPAL"/destaque) com uma instrucao interna literal como corpo do anuncio: "Use o visual do produto para abrir o desejo e deixe o texto explicar beneficio, uso e caminho de compra. O cliente precisa entender rapido por que esse item vale o clique."

1. **Causa raiz do card genérico e do card com "Produto em destaque" (CORRIGIDO).** Confirmado: "Loja de doces e brigadeiros" classificava como "ecommerce" em vez de "alimentacao" — "loja" e uma nicheKey generica de ecommerce que bate em QUALQUER comercio, e o primeiro segmento verificado na ordem do objeto vencia, mesmo quando um termo bem mais especifico de outro segmento ("doces"/"brigadeiro") tambem batia no mesmo texto. Isso desviava GraKau pro fallback de ecommerce/moda_varejo, que por sua vez tinha o bug abaixo.

2. **Mecanismo de match corrigido pra "mais especifico vence" em vez de "primeiro checado vence" (CORRIGIDO).** Nova funcao `pickMostSpecificSegmentMatch()` (shared/segmentConfig.ts) — em vez de devolver o primeiro segmento cuja nicheKey bate, escaneia TODOS os segmentos e devolve o que bateu com a palavra-chave MAIS LONGA (proxy de especificidade). "confeitaria"/"brigadeiro" (mais especificas) agora vencem "loja"/"produto" (genericas o suficiente pra descrever qualquer comercio). Reaproveitada nos dois sistemas de segmento duplicados desta base.

3. **Duas listas de nicheKeys de alimentacao tinham divergido silenciosamente (CORRIGIDO).** "docinho" so existia em shared/segmentConfig.ts, nao em server/ai.ts (o sistema de fato usado na geracao) — cada sistema respondia diferente pro mesmo nicho. Unificadas numa lista so, com auditoria completa de divergencia entre os dois arquivos pra todos os segmentos (achadas e corrigidas mais 3 divergencias pequenas: "alugar" em imoveis_locacao, "shopify" em ecommerce, "corporativo" em b2b).

4. **Radicais truncados "locaç"/"alugu" ficaram mortos apos o limite de palavra (CORRIGIDO).** Efeito colateral tardio da correcao anterior de nicheKeys por substring: esses dois radicais nunca tinham forma completa que os tornasse funcionais com \b nos dois lados — paravam de bater com QUALQUER coisa (nem "locacao" nem "aluguel" mais funcionavam). Substituidos pelas formas completas.

5. **detectRealEstateSegment nao tolerava plural em "apartamento"/"casa"/etc (CORRIGIDO).** Achado ao testar a correcao de especificidade: "apartamentos" (plural) nao batia com \bapartamento\b (so singular) na regex hardcoded desse detector — "Aluguel de apartamentos" caia no fallback de nicheKeys generico, onde "apartamento" (tipo do imovel, palavra mais longa) vencia "aluguel" (finalidade, palavra mais curta) pelo criterio de especificidade, dando imoveis_venda em vez de imoveis_locacao. Corrigido tolerando plural no proprio detectRealEstateSegment, que e o check mais especifico e deveria capturar o caso primeiro. Limitacao que fica registrada: plurais irregulares em portugues (ex.: "aluguel" -> "alugueis", nao "aluguels") nao sao cobertos pela tolerancia simples de "+s" usada em toda essa correcao — nao perseguido mais fundo por ora.

6. **Instrucao interna vazando na copy de fallback (CORRIGIDO na origem + reforcada a rede de seguranca).** Confirmado que 4 dos 5 blocos de `fallbackCardsForSegment` (server/ai.ts) — alimentacao, servicos_locais/saude_estetica, infoprodutos, ecommerce/moda_varejo — tinham a copy escrita como instrucao pra um redator ("Use X para Y e deixe o texto Z", "O cliente precisa entender rapido por que...", "Comece com clareza: mostre..."), nao como anuncio de fato voltado pro cliente final. Reescritos os 4 blocos como copy real, preservando a mesma mensagem/intencao. `hasInternalCopyLanguage` (shared/campaignCopyQuality.ts) ganhou 4 padroes novos pra pegar essa classe de instrucao meta ("use X para Y", "o cliente precisa entender", "mostre/destaque/explique X:", "deixe o texto") como rede de seguranca contra qualquer ocorrencia futura parecida, nao so as ja encontradas.

Testes: +5 em campaignFactGuard.test.ts (especificidade vence generico; os dois sistemas concordam; locacao/aluguel voltam a funcionar apos o limite de palavra). +1 em carouselCopy.test.ts (rejeita a classe de instrucao meta encontrada, aceita a copy real que substituiu). Validado: test:fact-guard 48/48, test:carousel-copy 14/14, as demais 5 suites sem regressao — 107/107 no total. npm run build confirmado passando. check:server sem erro novo de TypeScript.

### Rotulo interno de organizacao sobrescrevendo hook/copy reais (branch fix/angle-label-overwrite, PR pendente de revisao)

Achado real, campanha #762 (Gra Kau Delicias, refeita apos a correcao anterior). Michel confirmou que desta vez o segmento foi identificado corretamente (alimentacao), mas as copys "ainda ficaram genericas e estao marcadas para revisao". Nos dois cards do rascunho: hook "Oferta principal da campanha"/"Variedade e escolha da campanha", copy comecando com "Oferta principal: "/"Variedade e escolha: " antes do texto real.

Causa raiz confirmada em `buildConfirmedCarouselAngles` (server/ai.ts): a copy REAL ja corrigida na frente anterior (headline "Doces para pedir hoje", hook "Doces que chamam atencao" etc.) estava sendo usada corretamente pro headline/description (essas duas ja tinham a checagem `index < baseCards.length` pra so usar o rotulo generico de angulo quando o card excede o conjunto de conteudo real disponivel) — mas copy e hook NAO seguiam a mesma checagem e SEMPRE levavam o prefixo/rotulo interno de organizacao ("Oferta principal", "Variedade e escolha" etc.), mesmo quando ja existia hook/copy reais e prontos pra aquele card especifico. Um esquecimento assimetrico: a logica certa existia, so nao foi aplicada a todos os 4 campos.

Corrigido: `copy`/`hook` agora seguem a mesma condicao `hasRealCard` que `headline`/`description` ja usavam. Extraida como funcao pura de nivel de modulo `applyAngleLabelsToFallbackCards` (nao pode ficar dentro de generateCampaign — export so e valido no topo do arquivo), pra dar pra testar isolada sem precisar rodar generateCampaign inteira. Comportamento de overflow (quando se pede mais cards do que existe conteudo pronto) continua usando o rotulo generico corretamente — validado com teste dedicado.

Testes: +2 em newSegments.test.ts (preserva hook/copy reais quando ha card disponivel; ainda usa rotulo generico pra cards alem do conjunto real). Validado: test:new-segments 23/23, as demais 6 suites sem regressao — 109/109 no total. npm run build confirmado passando. check:server sem erro novo de TypeScript.
### Auditoria da feature de chat "assistente de campanhas" (PR #15) — pool de chaves, tipos e dois bugs de UI (branch fix/chat-assistant-audit, PR pendente de revisao)

Michel pediu auditoria do PR #15 ("assistente de campanhas via chat, formato ChatGPT" — server/chat.ts + client/src/components/shared/CampaignChat.tsx, ja mergeado). Achados e corrigidos:

**O que ja estava bem construido (sem alteracao):** executarGeracaoCampanha chama o mesmo generateCampaign de server/ai.ts — todas as protecoes desta sessao (segmento, Fact Guard, quality gates) se aplicam automaticamente, sem duplicacao. Renderizacao markdown-lite (FormatarTexto) usa so JSX normal, sem dangerouslySetInnerHTML — sem risco de XSS. Montagem de /api/chat com import dinamico e falha isolada (503 em vez de derrubar o servidor) — exatamente o tipo de protecao que faltava nos crashes corrigidos em sessoes anteriores.

**1. Pool de chaves Gemini com dois problemas sobrepostos (CORRIGIDO).** `poolChavesGemini()` em chat.ts lia `process.env.GEMINI_API_KEY${i}` (sem underscore) pras chaves 2-5, mas a variavel de ambiente real e `GEMINI_API_KEY_2` (com underscore) — ou seja, esse pool NUNCA encontrava as chaves 2 a 5, so a principal, mesmo com todas configuradas no ambiente. Alem disso nem tentava ler `_07/_08/_10` (mesma lacuna ja encontrada e corrigida em server/ai.ts numa sessao anterior, mas nunca commitada — perdida num clone descartado). Corrigido definitivamente desta vez: nova constante exportada `ALL_GEMINI_KEYS` em server/ai.ts (fonte unica, nomes corretos, todas as 8 chaves), reaproveitada em chat.ts via `require("./ai")` (padrao ja usado em outros pontos do codebase pra 'pg', mesmo sob module:ESNext). Testado ao vivo com variaveis de ambiente simuladas: as 4 chaves de teste (principal, _2, _07, _10) foram todas encontradas corretamente.

**2. Tres erros novos de TypeScript, dois deles com causa raiz nao-obvia (CORRIGIDOS).** check:server foi de 37 pre-existentes pra 40 apos o PR #15.
- Dois em chat.ts: `resultado.ok ? {campanha} : {erro}` disparava TS2339 "Property 'erro' does not exist", mesmo sendo um union discriminado valido — nem ternario nem if/else explicito resolviam. Causa raiz encontrada apos investigacao extensa: `tsconfig.server.json` (usado por check:server) tem `strict: false`, diferente do `tsconfig.json` da raiz (`strict: true`) — sob strict:false, o narrowing por literal booleano (.ok true/false) nao discrimina o union de forma confiavel. O operador `"campanha" in resultado` (checagem de presenca de propriedade) faz o narrowing funcionar mesmo sob strict:false — confirmado com reproducao isolada antes de aplicar no codigo real.
- Um em campaignProfile.ts (de outro commit recente, nao do PR #15): `import { type Subsegment } from "../shared/subsegments"` falhava porque subsegments.ts so IMPORTA Subsegment de segmentConfig.ts pra uso interno, nunca reexporta. Corrigido com `export type { Subsegment };` em subsegments.ts.

Confirmado: 37/37 depois das correcoes, zero erro novo (comparado contra a main sem as mudancas desta frente).

**3. Card "✅ Campanha criada" reaparecendo em respostas sem relacao (CORRIGIDO).** CampaignChat.tsx decidia mostrar o card de confirmacao com a condicao "existe alguma campanha no estado? e a ultima mensagem?" — apos qualquer pergunta de acompanhamento que nao gerasse campanha nova, o card antigo reaparecia grudado embaixo da resposta errada, dando a impressao de que uma campanha nova tinha acabado de ser criada. Corrigido anexando a campanha direto na mensagem especifica onde foi de fato criada (`ChatMessage.campanha?`), removido o estado `campanhas`/`campanhaMaisRecente` que so servia pra essa inferencia indireta.

**4. Aviso "Entre na sua conta" nunca desaparecia depois de setado uma vez (CORRIGIDO).** Mesmo padrao do item 3: `needsLogin` virava `true` num 401 mas nunca era resetado — se a sessao expirasse no meio de uma conversa, o aviso de login ficava colado embaixo de toda resposta futura pra sempre, mesmo depois do usuario logar de novo e voltar a gerar campanhas com sucesso. Corrigido com reset otimista (`setNeedsLogin(false)`) no inicio de cada novo envio.

**5. Mapa de rate limit crescendo sem limite (CORRIGIDO).** `_rateMap` (Map em memoria, um registro por usuario unico) nunca removia entradas cuja janela ja tinha expirado — crescimento sem limite num processo de servidor de longa duracao (pequeno por entrada, mas nunca encolhe). Corrigido com faxina oportunista: a cada 200 chamadas de `rateLimitOk`, remove entradas expiradas — sem precisar de um timer proprio com ciclo de vida pra gerenciar. Testado isoladamente: 199 entradas expiradas + 1 chamada nova (a que dispara a faxina) -> mapa cai pra 1 entrada.

**6. Sem limite de tamanho por mensagem (CORRIGIDO).** O body parser global aceita ate 50mb por requisicao — um limite pensado pra upload de imagem em outras rotas, nao pra texto de chat. Sem checagem propria no endpoint de chat, uma unica mensagem gigante seria encaminhada direto pra API do Gemini/Groq em toda tentativa de retry (ate 4 tentativas), queimando custo/cota sem necessidade — uma campanha nao precisa de uma mensagem de milhares de caracteres pra ser descrita. Adicionado limite de 4000 caracteres por mensagem, com erro 400 explicito se excedido.

Validado: check:server 37/37 (sem erro novo), npm run build confirmado passando, as 7 suites de teste existentes sem regressao (117 testes). Sem suite de teste automatizado pra chat.ts/CampaignChat.tsx (nao existia antes desta auditoria) — validacao feita por leitura cuidadosa, reproducao isolada dos erros de tipo, e teste manual (pool de chaves, faxina do rate limit, limite de mensagem) com dados simulados.

### Botao flutuante do chat invisivel em iOS por falta de safe-area-inset (branch fix/chat-safe-area, PR pendente de revisao)

Michel reportou "ainda nao aparece o chat" com screenshot do mobile (Safari iOS): a tela mostrava so o widget de ajuda do WhatsApp (aba verde vertical "AJUDA"), sem sinal do botao circular do CampaignChat.

Investigado: CampaignChat.tsx SIM esta corretamente montado em App.tsx (`<CampaignChat />`, sempre ativo, dentro do ErrorBoundary global, sem nenhuma condicao escondendo) — nao era problema de montagem. Tambem descartado: nao existe componente orfao do widget antigo (MECPROAssistantChat, substituido nesta mesma cadeia de commits) ainda sendo referenciado em algum lugar; o service worker (client/public/sw.js) usa Network First pra HTML de navegacao e assets com nome hasheado por build — nao deveria servir bundle antigo num reload normal.

Causa raiz encontrada comparando com o widget de ajuda (que SIM aparecia no screenshot): `.wa-tab` (o botao de ajuda do WhatsApp, em Layout.tsx) usa `position: fixed; right: 0; top: 50%` — centralizado verticalmente, longe da base da tela. O botao do CampaignChat usava `fixed bottom-6 right-6` (24px fixos da borda inferior), SEM `env(safe-area-inset-bottom)` — o projeto ja tem esse padrao estabelecido em outros elementos fixos na base (client/src/index.css: `.app-main { padding-bottom: calc(74px + env(safe-area-inset-bottom, 0px)); }`), mas o CampaignChat nao seguiu essa convencao. Sem isso, o botao fica posicionado exatamente onde a barra inferior do Safari/indicador de home do iPhone ocupa a tela — efetivamente invisivel e inacessivel, mesmo com o codigo React renderizando ele normalmente (por isso nao aparecia erro nenhum, nem no React DevTools nem no console).

Corrigido: `bottom` do botao flutuante agora soma `env(safe-area-inset-bottom, 0px)` via style inline (Tailwind nao suporta env() nativamente em classes utilitarias). z-index tambem elevado de 40 pra 9990 (widget de ajuda do WhatsApp usa 9999 — mantem o chat abaixo dele mas bem acima do resto da UI). Mesmo ajuste aplicado no `<footer>` da caixa de texto na tela cheia do chat (`fixed inset-0`), que tinha o mesmo risco de ficar parcialmente atras da barra do navegador quando o chat esta aberto.

Validado: npm run build confirmado passando, check:server 37/37 (sem mudanca, e so CSS/posicionamento). Sem forma de testar visualmente em iOS real a partir deste ambiente — a correcao segue exatamente o mesmo padrao ja usado e validado em outros elementos fixos deste mesmo projeto.

### Chat como tela inicial de verdade, nao so widget flutuante (branch feat/chat-as-home-screen, PR pendente de revisao)

Michel pediu, depois de uma auditoria de fidelidade visual: "mude para o formato de chat agora" — resposta direta ao achado central daquela auditoria, que era: a tela inicial de um usuario logado (`/dashboard`) continuava sendo o dashboard tradicional de sempre, com o chat existindo so como bolha flutuante — bem diferente de como GPT/Claude funcionam (voce entra no site e ja esta numa conversa, sem clicar em nada).

**Decisao de escopo:** nao substitui o dashboard de estatisticas (arriscado — quebraria o habito de quem ja usa) — em vez disso, o chat virou a visao PADRAO da tela inicial, com uma aba pra alternar pro dashboard de estatisticas de sempre, que continua 100% intacto (nenhum dado, query ou funcionalidade removida, so deixou de ser o que aparece primeiro).

**Refatoracao pra evitar duplicacao (mesmo principio de "uma fonte de verdade" usado a sessao inteira):** a logica de estado/envio do chat (`useCampaignChat.ts`, novo hook) e a UI da conversa (`ChatConversationView.tsx`, novo componente) foram extraidas de dentro de CampaignChat.tsx (o widget flutuante) pra serem reaproveitadas tanto pelo widget quanto pela nova visao embutida (`ChatHomeView.tsx`). CampaignChat.tsx caiu de 391 pra ~70 linhas — vira so o invólucro de bolha/overlay, chamando o hook e o componente compartilhados. Sem isso, teria duas copias da logica de rede/erro do chat que poderiam divergir com o tempo — exatamente a classe de problema (duas fontes de verdade) encontrada e corrigida varias vezes nesta sessao em outras partes do codigo.

**Arquivos novos:**
- `client/src/hooks/useCampaignChat.ts` — estado (mensagens, input, loading, needsLogin) e a funcao `send()` que fala com `/api/chat`. Identico em comportamento ao que ja existia dentro de CampaignChat.tsx, so extraido.
- `client/src/components/shared/ChatConversationView.tsx` — a lista de mensagens + campo de texto, parametrizada por uma prop `fullScreen` (true = overlay em tela cheia com fundo solido e padding de safe-area; false = embutida dentro do layout normal da pagina).
- `client/src/components/shared/ChatHomeView.tsx` — usa o hook + o componente acima, envolvido numa caixa com altura calculada (`calc(100vh - 200px)`, minimo 480px) pra caber no espaco restante da viewport depois do cabecalho/navegacao do Layout.

**Dashboard.tsx:** adicionado estado `viewMode` ("chat" | "stats", padrao "chat"), uma alternancia de abas logo apos o cabecalho, e todo o conteudo de estatisticas existente (cards, lista de projetos/campanhas) envolvido em `{viewMode === "stats" && (...)}` — sem tocar em nenhum hook/query condicionalmente (só a renderizacao do JSX é condicional, todos os hooks continuam sendo chamados incondicionalmente no topo do componente, respeitando as regras de hooks do React).

**O que NAO foi feito nesta frente (fora de escopo, registrado pra decisao futura):** streaming de resposta (GPT/Claude mostram a resposta aparecendo palavra por palavra; aqui a resposta inteira ainda aparece de uma vez, depois de esperar — exige mudar o backend pra Server-Sent Events e o frontend pra renderizar incremental, mudanca tecnica maior que essa frente); historico de conversas persistido; acoes por mensagem (copiar/regenerar); anexo de imagem; markdown mais rico (listas, blocos de codigo, links clicaveis).

Validado: npm run build confirmado passando, npm run check (client+server) sem erro novo (70 pre-existentes, todos em arquivos nao tocados por esta frente — confirmado contra a main sem estas mudancas), check:server 37/37. Sem forma de validar visualmente o resultado final (proporcao, espacamento, altura calculada) a partir deste ambiente — vale conferir no navegador de verdade apos o deploy.

### Cascata de fallback do chat inteira quebrada: pool Gemini nao pulava chave suspensa + modelo Groq descontinuado (hotfix, urgente, branch fix/gemini-key-rotation-and-groq-model)

Michel reportou log de producao (10/09) mostrando a cascata inteira de fallback do chat falhando: Gemini -> DeepSeek -> Groq -> resposta local, todos os tres provedores externos falhando na mesma chamada.

**1. Gemini "CONSUMER_SUSPENDED" nao disparava rotacao pra outras chaves do pool (CORRIGIDO).** O erro real era `PERMISSION_DENIED`/`CONSUMER_SUSPENDED` (projeto do Google Cloud suspenso) na chave principal. Os dois classificadores existentes — `erroEhCotaDiariaEsgotada` (so reconhece RESOURCE_EXHAUSTED/exceeded quota) e `erroEhTemporario` (so reconhece 503/429/UNAVAILABLE) — nao reconheciam esse erro, entao caia direto no `throw erro` na PRIMEIRA tentativa, sem nunca tentar as outras 7 chaves do pool. Adicionado um terceiro classificador `erroEhChaveInvalidaOuSuspensa` (PERMISSION_DENIED/CONSUMER_SUSPENDED/API_KEY_INVALID/UNAUTHENTICATED) que agora dispara o mesmo comportamento de "marca essa chave, tenta a proxima". Tambem aumentado `tentativas` de 4 fixo pra `Math.max(poolChavesGemini().length, 4)` (cobre o pool inteiro de 8 chaves numa chamada so, nao so metade) — sem custo real pra erro de cota/chave suspensa (pula sem esperar), so pesa em cenario de erro temporario generalizado (ja era degradado antes). Testado isolado com o erro real do log (chave suspensa simulada) — confirma que a proxima chave valida do pool e usada com sucesso.

**2. Modelo Groq descontinuado em 6 lugares — 2 arquivos (CORRIGIDO).** `llama-3.3-70b-versatile` retornava HTTP 404 "does not exist or you do not have access to it" — confirmado via busca que o Groq descontinuou esse modelo (anuncio 17/06/2026, desligado 16/08/2026, ja passado — console.groq.com/docs/deprecations). Mesmo problema com o fallback interno `llama-3.1-8b-instant`. Substituidos pelos modelos recomendados oficialmente pelo Groq pra essa migracao: `openai/gpt-oss-120b` (no lugar do 70b) e `openai/gpt-oss-20b` (no lugar do 8b) — confirmado suporte a tool calling nos dois (essencial, o chat usa function calling) e contexto de 131k tokens (maior que os originais). Corrigido em: `server/chat.ts` (MODELO_GROQ), `server/ai.ts` (4 ocorrencias — array de modelos do motor de geracao de campanha, default de telemetria, status de health check), `server/tokenTelemetry.ts` (tabela de precos, mantendo as entradas antigas pra nao quebrar custo retroativo ja registrado).

**Achado colateral durante a correcao:** `model.includes("8b")` em `ai.ts` era logica de codigo de verdade (decide o limite de caracteres do prompt, 800 vs 25000), nao so comentario — como nenhum dos nomes novos contem "8b", teria SEMPRE caido no limite generoso de 25000, mesmo pro modelo mais barato/pequeno, se eu so tivesse trocado o nome do modelo sem checar essa linha. Corrigido invertendo a logica pra checar o modelo GRANDE especificamente (`"120b"`) e default pro lado seguro/conservador em qualquer nome inesperado, em vez do lado arriscado.

**Identificador duplicado encontrado e corrigido de passagem:** um commit paralelo ("feat(chat): add DeepSeek fallback") tinha adicionado `import { ALL_GEMINI_KEYS } from "./ai"` de novo, duplicando o import que ja existia do hotfix anterior (require->import estatico) — erro de compilacao TS2300 que ja estava na main antes desta correcao. Removida a duplicata.

Validado: check:server 37/37 (confirmado contra a main sem estas mudancas — a correcao na verdade FECHOU 2 erros de compilacao pre-existentes, nao so evitou novos), npm run build confirmado passando, as 7 suites de teste existentes sem regressao (117 testes), logica de rotacao de chave testada isoladamente com o erro real do log de producao reproduzido.

Nota de confianca: a troca de nome de modelo (Groq) e a classificacao de erro (Gemini) sao verificaveis e testadas. Os precos exatos adicionados em tokenTelemetry.ts pros modelos novos sao a melhor estimativa encontrada em fontes publicas (CloudZero/Groq docs), sem 100% de certeza do valor mais atual — vale conferir em console.groq.com/pricing se a precisao do custo importar pra alguma decisao.

### gerar_campanha quebrava com "Unexpected token 'h', \"https://ww\"... is not valid JSON" (hotfix, branch fix/social-links-malformed-json)

Michel reportou log de producao (13/09) mostrando o Gemini funcionando normalmente (sem suspensao, sem cair pro fallback), mas `gerar_campanha falhou` com esse erro toda vez que o usuario confirmava um WhatsApp.

**Causa raiz:** `confirmedChatContact()` em `server/chatContact.ts` fazia `JSON.parse(existingSocialLinks)` sem try/catch — mas `socialLinks` nem sempre e JSON de verdade. Existe um campo de texto livre em `client/src/pages/ClientProfile.tsx` (`<Field label="Redes sociais / Contatos" ... textarea>`, placeholder "Ex: Instagram: @suaempresa · Site: https://...") que salva o texto digitado DIRETO nesse campo, sem codificar como JSON — o proprio placeholder convida o usuario a digitar texto livre, nao JSON. Toda outra leitura de `socialLinks` no codebase (CampaignResult.tsx, FacebookCampaignCreator.tsx, CompetitorAnalysis.tsx, useCompetitorData.ts) ja lida com isso via try/catch, caindo pra `{}` em caso de erro — so `chatContact.ts` deixava o erro estourar sem protecao, derrubando a geracao de campanha inteira por causa de um campo auxiliar malformado.

**Corrigido:** mesmo padrao defensivo ja usado em todo o resto do codigo — `JSON.parse` envolvido em try/catch, cai pra `{}` (ignora o texto livre antigo) em vez de lancar erro. Testado isolado reproduzindo o dado real do log (`socialLinks = "https://www.exemplo.com.br"`) — confirma que o WhatsApp e salvo corretamente mesmo com o campo antigo malformado.

**Nao corrigido nesta frente (fora de escopo, registrado):** o campo de texto livre em ClientProfile.tsx que causa a raiz do problema (dado malformado sendo criado em primeiro lugar) nao foi alterado — dado que TODO o resto do codigo ja trata `socialLinks` como "pode ser JSON ou pode ser texto livre" de forma defensiva, a convencao implicita do projeto parece ser "aceitar os dois formatos e ser tolerante na leitura", entao segui essa mesma convencao em vez de tentar redesenhar o campo/migrar dados existentes (mudanca de escopo maior, decisao de produto).

**Observacao colateral, nao mexida nesta frente:** o commit `ca5cd2b` ("fix(ai): skip rejected Gemini credentials and redact provider secrets", de Michel/outra sessao, paralelo a esta) adicionou `server/providerSafety.ts` com uma classe `GeminiCredentialHealth` que resolve o mesmo problema de chave suspensa que corrigi em `server/chat.ts` numa sessao anterior — so que de forma mais precisa (rejeita a chave permanentemente ate reiniciar o processo, em vez do cooldown de 3h que uso em chat.ts, que nao faz muito sentido pra uma chave permanentemente suspensa vs. uma com cota temporariamente esgotada). `chat.ts` ainda usa sua propria logica separada (`_chavesEsgotadas` + `erroEhChaveInvalidaOuSuspensa`), nao a `GeminiCredentialHealth` nova. Duas implementacoes paralelas resolvendo o mesmo problema de jeitos ligeiramente diferentes — vale unificar numa sessao futura, mas nao e urgente (as duas funcionam, so divergem no criterio exato do cooldown).

Validado: check:server 37/37 (sem erro novo, confirmado contra a main sem esta mudanca), npm run build confirmado passando, teste isolado reproduzindo o dado real do log de producao.

### Unificacao: chat.ts passa a reaproveitar GeminiCredentialHealth de ai.ts (branch fix/unify-gemini-credential-health)

Michel pediu pra unificar as duas implementacoes paralelas de deteccao de chave suspensa (registrado como observacao na correcao anterior), priorizando a mais eficaz.

**Analise antes de unificar:** as duas implementacoes resolviam problemas ligeiramente diferentes, nao eram estritamente concorrentes — `GeminiCredentialHealth` (ai.ts) so trata rejeicao PERMANENTE (401/CONSUMER_SUSPENDED/API_KEY_INVALID/UNAUTHENTICATED/suspenso/invalido — fica banida ate reiniciar o processo); a logica antiga de chat.ts (`erroEhChaveInvalidaOuSuspensa`) tratava o MESMO conjunto de erros mas com cooldown de 3h, e separadamente `_chavesEsgotadas`/`erroEhCotaDiariaEsgotada` tratava cota esgotada (RESOURCE_EXHAUSTED — essa sim volta sozinha depois do reset, entao cooldown temporizado continua correto pra esse caso especifico). Confirmado que `ai.ts` ja usa exatamente essa combinacao (GeminiCredentialHealth pra permanente + _exhaustedKeys pra cota temporaria) — resultado da unificacao: chat.ts passa a seguir o mesmo padrao, reaproveitando a MESMA instancia (nao uma copia).

**Mudancas:**
- `server/ai.ts`: `geminiCredentialHealth` (antes `const` privada) agora `export const` — uma chave rejeitada por QUALQUER caminho do processo (geracao de campanha principal OU chat) fica conhecida pelos dois, em vez de cada um redescobrir isso de forma independente com uma chamada de API desperdicada.
- `server/chat.ts`: importa `geminiCredentialHealth` de `./ai` (mesma instancia). `proximaChaveGemini()` agora tambem filtra por `geminiCredentialHealth.available()`. `chamarGeminiComRetry()` chama `geminiCredentialHealth.reject()` primeiro (rejeicao permanente); so cai no cooldown temporizado proprio (`_chavesEsgotadas`) pra RESOURCE_EXHAUSTED especificamente. Removida a funcao `erroEhChaveInvalidaOuSuspensa` (superada pela versao compartilhada).

**Achado durante a integracao:** `GeminiCredentialHealth.reject(key, status, error)` espera `error` como string ou objeto plano (e assim que ai.ts chama, vindo do corpo ja parseado de um `fetch()` cru) — passar o objeto `Error` do SDK do `@google/genai` direto faria `JSON.stringify(error)` virar `"{}"` (Error nao serializa `.message` por padrao com JSON.stringify), perdendo o texto que o regex interno precisa pra reconhecer CONSUMER_SUSPENDED etc. Corrigido extraindo `erro.message` (string) antes de passar pra `reject()`. Testado isolado com o erro real do log — sem essa extracao, `reject()` retornava `false` incorretamente (silenciosamente nao rejeitava a chave suspensa); com a extracao, retorna `true` e a chave fica marcada corretamente.

**Seguranca, aplicado de passagem (mesmo commit que criou GeminiCredentialHealth tambem tinha `redactProviderSecrets`, nao usado em chat.ts ate agora):** os 5 pontos de log em chat.ts que expunham `erro.message` cru (incluindo o ponto exato que vazou uma API key em texto puro nos logs de producao que Michel colou nesta sessao) agora passam por `redactProviderSecrets()` antes de logar. Testado com o texto real que apareceu vazado — confirma que a chave e mascarada.

Validado: check:server 37/37 (sem erro novo), npm run build confirmado passando, teste dedicado de providerSafety.test.ts passando (3/3), as 7 suites de teste existentes sem regressao (117 testes), compartilhamento de estado entre ai.ts e chat.ts testado isolado (chave rejeitada num "lado" fica indisponivel no outro), redacao de segredo testada com o dado real que vazou.

### Persistencia do chat: salvar/excluir conversas, ultima campanha gerada, memoria entre sessoes (branch feat/chat-session-persistence)

Michel pediu tres coisas relacionadas: (1) salvar/excluir os chats de campanhas, (2) mostrar qual foi a ultima campanha gerada, (3) o chat ter memoria pra nao repetir passos. Ate aqui o chat era inteiramente sem estado no servidor — o historico so existia no estado local do React (`useCampaignChat`), perdido ao recarregar a pagina ou fechar a aba.

**Duas tabelas novas** (migracao raw SQL em `server/_core/migrations.ts`, seguindo exatamente o padrao ja usado no arquivo — `CREATE TABLE IF NOT EXISTS` com `.catch(() => {})`; definicoes espelhadas em `server/schema.ts` via Drizzle, ja que `db.ts` usa o query builder do Drizzle, nao SQL cru direto):
- `chat_sessions`: id, userId, title, lastCampaignId, lastCampaignName, lastCampaignUrl, createdAt, updatedAt
- `chat_messages`: id, sessionId (FK com ON DELETE CASCADE — excluir a sessao excluir as mensagens automaticamente), role, content, campanha (JSONB), createdAt

**server/db.ts**: funcoes novas — createChatSession, getChatSessionsByUserId, getChatSessionById, getChatMessagesBySessionId, appendChatMessage, touchChatSession (atualiza updatedAt + ultima campanha), maybeTitleChatSession (so renomeia a sessao na primeira mensagem, enquanto o titulo ainda e o padrao "Nova conversa"), deleteChatSession (com checagem de dono — so exclui se pertencer ao usuario que pediu).

**server/chat.ts**:
- POST / agora aceita `sessionId` opcional no corpo. Sem sessionId (ou um que nao pertence ao usuario), cria uma sessao nova automaticamente na primeira mensagem, usando o comeco da mensagem do usuario como titulo inicial.
- Toda troca bem-sucedida (Gemini/DeepSeek/Groq/local — os 4 pontos de retorno) passa por uma funcao auxiliar nova (`persistirTrocaEResponder`) que grava a mensagem do usuario + a resposta no banco, atualiza a sessao (incluindo ultima campanha, se uma foi gerada nesta troca) e devolve o `sessionId` na resposta.
- A mensagem do usuario e capturada ANTES da nota interna de anexo de foto ser adicionada ao texto (essa nota e instrucao pra IA, nao algo que o usuario digitou — nao devia ser persistida como se fosse).
- 3 endpoints novos: GET /sessions (lista as conversas do usuario, mais recente primeiro), GET /sessions/:id/messages (carrega o historico de uma conversa, com checagem de dono), DELETE /sessions/:id (exclui, com checagem de dono).

**client/src/hooks/useCampaignChat.ts**: 
- Novo estado: sessionId, sessoes (lista), carregandoHistorico.
- Ao montar, le o sessionId salvo no `localStorage` (SO o ID, nunca o conteudo da conversa) e restaura a conversa automaticamente — resolve o "ficar repetindo passos": sem isso, um F5 perdia tudo que ja tinha sido conversado/confirmado.
- Funcoes novas: `novaConversa()` (limpa tudo, comeca do zero), `carregarConversa(id)` (busca o historico de uma sessao especifica), `excluirSessao(id)` (exclui e, se era a sessao ativa, comeca uma nova), `carregarSessoes()` (atualiza a lista).
- `ultimaCampanha` derivada da lista de sessoes (a primeira com `lastCampaignId` preenchido, ja que a lista vem ordenada por mais recente).

**Frontend, UI nova**: `ChatHistoryPanel.tsx` (painel com a lista de conversas salvas, cada uma com titulo/campanha gerada/data, exclusao com confirmacao inline pra evitar clique acidental). Cabecalho de `CampaignChat.tsx` (widget flutuante) ganhou botoes de "nova conversa" e "historico"; `ChatHomeView.tsx` (chat embutido na tela inicial) ganhou um cabecalho proprio do zero (nao tinha nenhum antes) com os mesmos dois botoes. Banner de "ultima campanha gerada" (link clicavel pra URL real da campanha, ja resolvida pelo backend — nao reconstruida no cliente, pra nao arriscar montar uma rota errada) aparece nos dois lugares quando existe uma campanha recente.

**O que NAO foi persistido, decisao deliberada**: anexos de foto (base64) nao sao salvos no banco — mensagens carregadas de uma conversa antiga mostram so o texto, sem as miniaturas de foto que foram anexadas naquela troca. Dado que fotos em base64 sao pesadas e o caso de uso principal e "nao perder o texto da conversa ao recarregar", nao "reabrir a foto exata depois de dias", essa e uma simplificacao razoavel pra v1.

Validado: check:server 37/37 (sem erro novo), npm run build confirmado passando (CSS novo presente no bundle final, confirmado por grep), modulos carregam sem crash, as 7 suites de teste existentes sem regressao (117 testes), sintaxe JSONB/ON DELETE CASCADE confirmada identica a outras migracoes ja aplicadas com sucesso neste mesmo arquivo. Sem Postgres real disponivel neste ambiente pra testar a migracao/queries contra um banco de verdade — vale acompanhar o log de deploy do Render ("Running migrations..." / "✅ Migrations applied successfully") apos o merge pra confirmar que as duas tabelas novas sao criadas sem erro.

### Anexo de vídeo no chat, generico (sem exigir Meta conectado) (branch feat/chat-video-attachment)

Michel pediu suporte a anexo de video no chat, apontando que ja existe upload manual de video funcionando na publicacao de campanha (`/api/meta/upload-video`, usado em `CampaignResult.tsx`). Investigado antes de implementar: esse endpoint existente sobe o video DIRETO pra conta de anuncios do Meta do usuario (usando o token de acesso salvo daquela integracao) — funciona bem ali, mas exige que o usuario ja tenha conectado a propria conta Meta. Como o chat costuma ser usado logo no inicio da jornada (as vezes antes de qualquer plataforma estar conectada), reaproveitar esse endpoint direto deixaria o video inacessivel pra quem ainda nao conectou nada.

**Decisao (confirmada com Michel — opcao B):** aceitar o video mesmo sem Meta conectado, usando um caminho generico (Cloudinary, mesmo provedor ja usado pras fotos) em vez de depender de uma integracao de plataforma especifica.

**server/imageGeneration.ts**: nova funcao `uploadVideoBufferToCloudinary` — mesma logica de assinatura/upload ja usada pras fotos (`uploadImageBufferToCloudinary`), mas apontando pro endpoint de VIDEO do Cloudinary (`/video/upload`, diferente de `/image/upload` — a API do Cloudinary separa por tipo de recurso) e com timeout maior (120s, mesmo valor ja usado no upload de video pro Meta).

**server/chat.ts**:
- Novo endpoint `POST /chat/upload-video` — multipart via multer (nao base64 dentro do JSON da mensagem, diferente das fotos: um video de poucos segundos ja passa de 20-50mb, o que deixaria a requisicao do chat gigante e lenta). Limite de 100mb, com erro especifico e claro se ultrapassar (`LIMIT_FILE_SIZE` do multer tratado explicitamente, retornando 413 com mensagem em portugues em vez de deixar cair no handler de erro generico do Express). Valida o mimetype contra uma lista de formatos aceitos (MP4/MOV/WEBM/AVI/MKV).
- POST / (mensagem do chat) agora aceita `videoUrl` opcional no corpo — se presente e for uma URL http(s) valida, anexa uma nota na ultima mensagem do usuario avisando a IA que um video existe naquela URL, mas deixando EXPLICITO que ela nao consegue assistir o conteudo — pra evitar que ela invente/descreva o que aparece no video (mesma preocupacao de nao alucinar que motivou o "REGRA DE OURO" ja documentado no topo do arquivo). Testado isolado: URL valida gera a nota corretamente; string vazia ou sem protocolo http(s) (ex: `javascript:alert(1)`) nao gera nota nenhuma.
- Corrigido de passagem um comentario desatualizado no topo do arquivo que ainda dizia "Stateless... Nada e persistido no banco neste modulo" — nao e mais verdade desde a persistencia de sessoes (frente anterior).

**client/src/hooks/useCampaignChat.ts**: novo tipo `ChatVideoAttachment` (diferente de `ChatImageAttachment` — rastreia status `uploading|done|error` em vez de guardar o arquivo em base64, ja que o upload acontece assim que o arquivo e escolhido, nao so quando a mensagem e enviada). Novo estado `videoAttachment` (um video por vez, diferente das fotos que aceitam varias) e funcoes `addVideoAttachment`/`removeVideoAttachment`. Video e "anexo de uma vez so": limpo automaticamente apos qualquer envio bem-sucedido (nao acumula entre mensagens como as fotos podem).

**UI**: botao de anexar video (icone ao lado do de foto) e um chip mostrando status (girando enquanto sobe, com nome do arquivo quando pronto, com a mensagem de erro se falhar) em `ChatConversationView.tsx`, reaproveitado pelos dois lugares que usam essa view (`CampaignChat.tsx` e `ChatHomeView.tsx`). Botao de enviar fica desabilitado enquanto o video ainda esta subindo, pra nao mandar a mensagem sem a URL pronta.

**O que NAO foi feito nesta frente, decisao deliberada de escopo:** o video anexado nao vira automaticamente um criativo publicavel de campanha — o motor de geracao (`generateCampaign` em `ai.ts`) e hoje inteiramente pensado pra criativos de imagem. Fazer o video ser de fato usado na campanha gerada exigiria estender essa estrutura, um escopo maior e separado. Por enquanto, o video anexado serve pra IA saber que ele existe e mencionar isso na conversa, nao pra ser incorporado tecnicamente na campanha.

Validado: modulo chat.ts carrega sem crash com os imports novos (multer, uploadVideoBufferToCloudinary), check:server 37/37 (sem erro novo, confirmado contra a base sem estas mudancas), npm run build confirmado passando (CSS novo do chip de video presente no bundle final, confirmado por grep), logica de validacao de URL testada isolada (aceita http(s) valido, rejeita vazio e esquemas nao-http), as 7 suites de teste existentes sem regressao (117 testes).

### Chat esquecia fatos ja confirmados e vazava texto interno na conversa (branch fix/chat-history-window-and-leaks)

Michel colou uma transcricao real de uma conversa longa mostrando o assistente reperguntando coisa ja confirmada (ate voltando a perguntar qual projeto usar depois de ja ter escolhido um) e incluindo anotacoes de bastidor tipo "[aguardando resposta do usuario]" direto na mensagem. Analisado e corrigido:

**1. Janela de historico pequena demais pro proprio fluxo que o sistema pede (CORRIGIDO).** `MAX_MENSAGENS_HISTORICO` era 16 — mas o SYSTEM_PROMPT instrui explicitamente "uma pergunta por vez", e o briefing completo tem ~9-10 fatos pra coletar (projeto, objetivo, plataforma, orcamento, duracao, nicho, cidade, publico, faixa etaria, formato). So isso ja soma ~18-20 mensagens numa conversa perfeitamente bem-comportada, ANTES mesmo de chegar na geracao — ou seja, a mensagem onde o projeto foi escolhido no comeco da conversa ja saia da janela antes do briefing terminar, forcando o modelo a "esquecer" e perguntar de novo. Aumentado de 16 pra 48 (folga suficiente pra cobrir o fluxo inteiro, incluindo alguma clarificacao/retry, sem cortar o inicio da conversa).

**2. Texto de bastidor vazando na conversa (CORRIGIDO, duas camadas).** Frases como "[aguardando resposta do usuario]" e "...(aguardando sua resposta)" apareciam direto nas mensagens — nao deveriam existir nunca numa conversa real. Corrigido com o mesmo padrao ja usado nesta sessao pra copy de campanha (instrucao no prompt + verificacao no codigo, nao confiar so no modelo seguir a instrucao):
- Adicionada regra explicita no SYSTEM_PROMPT proibindo qualquer anotacao de bastidor/estado interno na resposta.
- Adicionada funcao `sanitizarRespostaChat()`, chamada no unico ponto de saida de todas as 4 respostas possiveis (Gemini/DeepSeek/Groq/local — `persistirTrocaEResponder`), que remove esse tipo de anotacao antes de mostrar OU salvar a resposta (protege tanto o que o usuario ve quanto o historico persistido).
- Regex desenhado com cuidado pra so remover a anotacao quando "aguard" aparece bem no INICIO do conteudo entre colchetes/parenteses (nao em qualquer lugar) — testado especificamente contra um falso positivo real que encontrei ao testar ("...sem aguardando" dentro de uma frase legitima nao deve ser removido, e nao e).

**Achados relacionados, registrados mas nao corrigidos nesta frente (fora de escopo, decisao consciente):**
- **Falha de geracao por linguagem de escassez/exclusividade** ("vagas limitadas", "exclusivo") — a rede de seguranca funcionou (campanha ruim nao foi salva, chat ofereceu tentar de novo), mas achei que existe pelo menos um trecho de prompt (`hookOverride: "exclusividade / sofisticacao..."` em `shared/subsegments.ts`, pro subsegmento de imoveis de alto padrao) que instrui EXPLICITAMENTE tom de exclusividade — vale revisar se esse subsegmento so dispara onde deveria.
- **Projetos quase-duplicados se acumulando** ("Sala Comercial Rua 902" / "sala comercial da rua 902" / "Morebem Imoveis — Sala Comercial Rua 902" ja existiam antes desta conversa) — confirmado que a deduplicacao na criacao e correspondencia EXATA de nome (proposital, evita fundir negocios diferentes com nome parecido por engano), entao pequenas variacoes de digitacao continuam criando projeto novo. Nao e bem um bug de logica — e uma tensao de design (seguranca contra fusao errada vs. prevencao de duplicata) que precisaria de uma solucao de UX (mostrar projetos parecidos com mais destaque antes de deixar criar mais um), nao so uma mudanca de codigo pontual.

Validado: funcao `sanitizarRespostaChat` testada isoladamente com os 3 casos reais da transcricao (todos corrigidos) mais 2 casos de falso-positivo (nao alterados, incluindo o caso real que encontrei durante o proprio teste), modulo chat.ts carrega sem crash, check:server 37/37 (sem erro novo), as 7 suites de teste existentes sem regressao (117 testes).

### Os dois achados pendentes da analise da transcricao real: linguagem de exclusividade contraditoria + projetos parecidos sem aviso (branch fix/exclusivity-wording-and-similar-projects)

Continuacao da analise da conversa colada por Michel (frente anterior corrigiu janela de historico + texto de bastidor vazando). Os outros dois achados, registrados como "fora de escopo" na frente anterior, foram investigados e corrigidos aqui, seguindo o principio de usar o mecanismo mais adequado pra cada caso em vez de aplicar a mesma solucao nos dois.

**1. Contradicao interna real entre o que o sistema PEDE pro modelo escrever e o que ele PROIBE depois (CORRIGIDO).** Confirmado com certeza: `server/campaignProfile.ts` interpola `hookOverride`/`ctaOverride` de `shared/subsegments.ts` DIRETO no prompt enviado ao modelo ("Prefira um destes CTAs: Agendar visita exclusiva..."). O subsegmento `alto_padrao` (imoveis a venda) tinha `hookOverride: "exclusividade / sofisticacao..."` e `ctaOverride: ["Agendar visita exclusiva", ...]` — mas `server/campaignFactGuard.ts` tem uma regra estrutural (com comentario proprio referenciando uma investigacao anterior, "campanha 747, sala comercial para locacao") que REJEITA `/\bexclusiv[oa]s?\b/i`, `/\balto\s+padr[aã]o\b/i`, `/\bsofisticad[oa]s?\b/i` como alegacao de escassez/exclusividade nao comprovada, a menos que o proprio cliente tenha confirmado isso no briefing. Ou seja: o sistema instruia o modelo a escrever exatamente a linguagem que sua propria rede de seguranca rejeitava depois, causando falha de geracao sem necessidade — exatamente o que aconteceu na conversa que Michel colou.

Corrigido reescrevendo o texto SUGERIDO (nao os SIGNALS de deteccao, que continuam os mesmos — reconhecer quando o proprio usuario menciona "alto padrao"/"luxo" continua legitimo) pra transmitir a mesma posicao de mercado (padrao premium) sem usar nenhuma das palavras que o fact guard rejeita: `hookOverride: "padrão superior de acabamento / localização privilegiada / estilo de vida premium"`, `ctaOverride: ["Agendar visita", "Conhecer o empreendimento"]`. Testado isolado: nenhum dos 4 padroes proibidos (`exclusiv`, `alto padrão`, `sofisticad`, `selet`) aparece mais no texto sugerido.

Verificado tambem se outros subsegmentos do mesmo arquivo tinham o mesmo problema — achado um caso (`liquidacao`, e-commerce: `hookOverride: "...estoque limitado"`), mas confirmado que "estoque limitado" nao bate em nenhum regex do fact guard atual (que so cobre "unidades limitadas"/"vagas limitadas", nao "estoque") — nao mexido, ja que nao esta causando o mesmo problema ativo.

**2. Projetos quase-duplicados criados sem aviso (CORRIGIDO).** A propria conversa colada mostrou 3 projetos quase identicos ja existentes pra mesma propriedade fisica ("Sala Comercial Rua 902" / "sala comercial da rua 902" / "Morebem Imoveis — Sala Comercial Rua 902"), resultado de pequenas variacoes de digitacao em conversas anteriores. Confirmado que a deduplicacao na criacao (`selectChatProject` em `server/chatWorkspace.ts`) so pegava nome EXATO — decisao proposital, pra nao fundir dois negocios diferentes so por coincidencia de nome parecido.

Em vez de trocar pra correspondencia fuzzy "automatica" (que arriscaria silenciosamente reaproveitar o projeto ERRADO se dois negocios genuinamente diferentes tiverem nomes parecidos), estendida a MESMA funcao que ja lanca erro em caso de nome exato duplicado (`"Ja existe um projeto com esse nome..."`) pra TAMBEM detectar nomes PARECIDOS (nao identicos) por sobreposicao de palavras significativas — ignorando acentos, pontuacao e conectivos comuns ("da", "de", "imoveis" etc.) — e lancar um erro nomeando o projeto parecido encontrado, deixando a decisao final (usar o existente ou confirmar que quer mesmo um novo) com o usuario, atraves da mesma conversa. Reaproveita o mecanismo ja existente (a funcao ja lanca erro, o chamador ja captura e repassa como mensagem) em vez de inventar um novo fluxo de confirmacao.

Nova funcao `nomesDeProjetoParecidos` (exportada de `chatWorkspace.ts`): tokeniza os dois nomes, remove conectivos comuns, e considera "parecido" quando ha pelo menos 2 palavras significativas em comum (ou 1 palavra bem especifica, >=5 letras, quando um dos nomes so tem uma palavra significativa apos filtrar — cobre o caso real "Morebem" sozinho vs "Morebem Imoveis — ..."). Testado com os 3 nomes reais da conversa (todos corretamente detectados como parecidos entre si) e 2 pares de negocios genuinamente diferentes (nenhum falso positivo). Adicionado ao SYSTEM_PROMPT uma instrucao especifica pra IA perguntar se e o mesmo negocio antes de insistir em criar um projeto novo quando esse aviso aparecer.

Testes novos adicionados a `server/__tests__/chatWorkspace.test.ts` (2 testes, cobrindo a funcao de similaridade isolada e a integracao com `selectChatProject`) — os 2 testes ja existentes no arquivo continuam passando sem alteracao.

Validado: os 5 casos de similaridade testados isolados (3 reais da conversa + 2 negativos), integracao com `selectChatProject` testada, `nomesDeProjetoParecidos` e o novo texto de `alto_padrao` verificados isoladamente, 4/4 testes em `chatWorkspace.test.ts` (2 novos + 2 existentes), check:server 37/37 (sem erro novo), npm run build confirmado passando, as 7 suites de teste existentes sem regressao (117 testes) — incluindo `hybridCampaignEngine.test.ts`, que ja tinha uma asserção validando que a copy gerada nao contem "exclusivo|alto padrão" (confirma que a mudanca esta alinhada com o que o proprio projeto ja testa).

### Nome de campo errado na API do Cloudflare (num_steps vs steps) derrubava TODA geracao de imagem via FLUX + reforco de proibicoes de copy (branch fix/cloudflare-steps-field-and-copy-rules)

Michel colou log de producao (13/09) mostrando: (1) toda tentativa de geracao de imagem via Cloudflare falhando com 400 "Additional or unevaluated properties '/num_steps'", caindo sempre pro fallback de fotos de banco de imagens (Pixabay) em vez de gerar imagem customizada pro negocio; (2) uma campanha bloqueada pela FACT_CONFLICT com tres problemas: preco alucinado (R$2.500 gerado quando o confirmado era R$5.000), "Vagas Limitadas" (mesmo padrao de escassez ja corrigido antes, mas de uma fonte diferente) e "escritorio"/"consultorio" usados no lugar de "sala comercial" (o termo que o cliente confirmou).

**1. Geracao de imagem via Cloudflare completamente quebrada — nome de campo errado pro modelo (CORRIGIDO).** A correcao anterior (10/09) ja tinha resolvido um problema de width/height sendo rejeitado por alguns modelos, com retentativa removendo essas dimensoes no segundo request. Mas o campo `num_steps` continuava presente incondicionalmente nos DOIS requests (inicial e retentativa) — e confirmado via documentacao oficial da Cloudflare (developers.cloudflare.com/workers-ai/models/flux-1-schnell) que o FLUX usa o campo `steps` (default 4, maximo 8), nao `num_steps` — esse nome e especifico da familia Stable Diffusion. Como o modelo configurado (`CF_IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell"`) rejeita `num_steps` por completo (nem reconhece o campo), TODA chamada falhava, mesmo a retentativa, caindo sempre pro fallback do Pixabay. Corrigido com uma funcao `cloudflareCampoDeSteps(model)` que escolhe o nome certo por familia de modelo (`steps` pro FLUX, `num_steps` pra Stable Diffusion/Dreamshaper), mesmo padrao ja usado pra `cloudflareModeloAceitaDimensoes`. As duas funcoes exportadas e testadas (`server/__tests__/imageGeneration.test.ts`, novo).

**2. Reforco nas proibicoes de copy que alimentam a geracao (CORRIGIDO, mitigacao — nao elimina 100% por ser comportamento probabilistico do modelo).** Dois ajustes na lista "REGRAS DE COPY — PROIBICOES ABSOLUTAS" em `server/ai.ts`:
- Adicionado "vagas limitadas" e "unidades limitadas" explicitamente na lista de termos proibidos de urgencia/escassez — a lista ja tinha "ultimas vagas" (frase parecida mas diferente), e essa variacao especifica ja apareceu em DUAS falhas reais de producao distintas nesta sessao (a conversa colada anteriormente e este log).
- Nova regra (5): "NUNCA TROQUE O TIPO DE IMOVEL/PRODUTO CONFIRMADO POR UM SINONIMO PROXIMO" — instrui explicitamente a usar o termo EXATO confirmado no briefing (ex.: "sala comercial"), nunca um sinonimo como "escritorio"/"consultorio"/"loja", e generaliza a mesma regra pra qualquer fato confirmado (preco, area, endereco).

**Nao corrigido, avaliado e descartado:** procurada logica de codigo que pudesse explicar deterministicamente o preco alucinado (R$2.500 gerado com R$5.000 confirmado, exatamente metade) — nenhuma encontrada (`grep` por divisao/multiplicacao envolvendo preco nao achou nada). Concluido que e comportamento probabilistico do modelo, nao um bug de codigo especifico — a rede de seguranca (fact guard) ja capturou e bloqueou corretamente antes de salvar, que e o resultado esperado de um sistema bem desenhado pra esse tipo de erro (prevencao perfeita de alucinacao de LLM nao e alcancavel só com mais codigo; capturar antes de chegar no cliente e a meta realista).

Validado: 2 novos testes em `imageGeneration.test.ts` (nome de campo certo por modelo, distincao FLUX vs Stable Diffusion pra dimensoes) passando, importar `imageGeneration.ts` num teste confirmado sem crash/efeito colateral, check:server 37/37 (o unico erro pre-existente relacionado a esse arquivo confirmado identico ao baseline, so mudou de numero de linha por causa das linhas inseridas), npm run build confirmado passando, as 7 suites de teste existentes sem regressao (117 testes + 2 novos = 119).

### MISSAO "agente conversacional autonomo" — Fase 1: editar campanha ja criada via chat (branch feat/chat-edit-campaign-tools)

Michel trouxe uma missao ampla (25 secoes) pra evoluir o chat de "recebe comando, chama funcao" pra um agente conversacional completo (orquestrador central, memoria em niveis, TaskState persistido, multi-step planning, auto-recovery, abstracao de provedor, streaming, prompt modular, observabilidade, suite de testes completa). Escopo de multiplas semanas de engenharia — tratado como tal: auditoria completa primeiro, decisao consciente de implementar so a fatia de maior valor/menor risco nesta sessao, resto documentado como plano faseado.

**Auditoria (resumo — relatorio completo entregue na resposta, nao neste arquivo):** o achado central foi que o chat so tinha DUAS ferramentas — `consultar_projetos_campanhas` (leitura) e `gerar_campanha` (so cria campanha NOVA, nunca edita) — o proprio SYSTEM_PROMPT ja admitia isso ("Esta conversa ainda nao edita nem publica campanhas existentes"). Isso tornava o cenario de teste da missao (criar → "use essas fotos" → "mantenha 6/dia" → "pode publicar") impossivel de completar, nao por limitacao do modelo, mas por falta de ferramenta. Confirmado que a logica de negocio pra editar orcamento (`updateAdSet`) e foto de destaque (`setFeaturedPhoto`) ja existe como procedimentos tRPC em `server/_core/router.ts` — nunca exposta como ferramenta de chat.

**Implementado (Fase 1 — a fatia de maior valor/menor risco):**
- Duas ferramentas novas de chat: `atualizar_orcamento_campanha` e `definir_foto_destaque`, reaproveitando a MESMA logica das procedimentos tRPC equivalentes (parse JSON → mutar → salvar via `db.updateCampaignField`, ja existente) — sem importar o roteador tRPC inteiro (14 mil+ linhas) dentro de `chat.ts`, evitando risco de dependencia pesada/circular.
- `ChatWorkspaceStore` (interface usada pelas ferramentas de workspace) estendida com `updateCampaignField`.
- Checagem de posse: as duas novas funcoes confirmam que a campanha pertence a um projeto do usuario que esta conversando, antes de qualquer escrita — mesmo padrao ja usado em `selectChatProject`.
- `queryChatWorkspace` (consulta de campanha especifica) agora retorna detalhe dos criativos (indice, headline, se e a foto de destaque, se tem imagem) e conjuntos de anuncios (indice, nome, orcamento, publico) — sem isso, o modelo nao tinha NENHUMA informacao pra resolver "a fachada e a principal" contra um indice real.
- Resolucao de referencia pra "essa campanha"/"a ultima": alem de contar com o modelo "lembrar" rolando o historico (nao confiavel, pode ser truncado — ver MAX_MENSAGENS_HISTORICO), injetada uma pista deterministica na mensagem do usuario sempre que a sessao ja tem uma campanha recente (reaproveitando `chat_sessions.lastCampaignId`, ja construido numa frente anterior) — mesmo padrao ja usado pra nota de anexo de foto/video.
- SYSTEM_PROMPT atualizado: removida a linha desatualizada, adicionada secao "Resolucao de referencias" com ordem de prioridade (mensagem atual → conversa recente → consulta ao workspace → so entao perguntar), e instrucao explicita pra NUNCA adivinhar qual foto e "a fachada" quando o headline/descricao do criativo nao confirmar isso — consultar e perguntar em vez de arriscar errar.

**Decisao consciente de escopo — NAO implementado nesta fase:** ferramenta de PUBLICACAO (`publicar_campanha`). Investigado o schema de `publishToMeta` (`shared/campaignCreative.schema.ts`) — exige pageId, hashes/URLs de imagem ja resolvidos, estrutura de carrossel/video corretamente montada — uma orquestracao complexa, da MESMA escala do que ja foi construido antes nesta sessao no MCP tool `publish_campaign` (server/mcpServer.ts). Dado que publicar e uma acao IRREVERSIVEL com dinheiro real envolvido, e a missao explicitamente pede cuidado extra aqui ("nao publique nenhuma campanha Meta real durante testes automatizados"), decidido nao apressar essa peca — fica documentada como o proximo passo mais concreto, reaproveitando a MESMA orquestracao ja validada no MCP tool em vez de reimplementar do zero.

**TaskState persistido, multi-step planning, orquestrador central formal, streaming, abstracao de provedor (AIProvider), prompt modular, observabilidade estruturada:** nao implementados nesta fase — cada um e, por si so, uma frente de trabalho do tamanho de uma das correcoes ja feitas nesta sessao. Ver relatorio completo (resposta ao usuario) pra prioridade recomendada.

Validado: teste isolado reproduzindo o cenario exato da missao (secao 15 — Sala Comercial Rua 902: consultar campanha → identificar indice da fachada pelo headline → definir foto de destaque → atualizar orcamento pra R$6 → confirmar que usuario sem posse da campanha e bloqueado) passou nos 4 passos. 3 novos testes unitarios em `chatWorkspace.test.ts` (consulta com detalhe de criativos, atualizacao de orcamento com checagem de posse, definicao de foto de destaque com indice invalido) — 7/7 testes no arquivo (3 novos + 4 existentes). check:server 37/37 (sem erro novo), npm run build confirmado passando, modulo chat.ts carrega sem crash, as 7 suites de teste existentes do projeto sem regressao (117 testes). Nao foi possivel testar o fluxo real multi-turn com LLM de verdade (Gemini/Groq/DeepSeek) neste ambiente — sem acesso de rede a essas APIs no sandbox.

### MISSAO "agente conversacional autonomo" — Fase 2: publicar campanha via chat (branch feat/chat-publish-campaign)

Michel confirmou publicacao via chat como prioridade apos a Fase 1 (edicao). Implementada reaproveitando a MESMA orquestracao ja construida e em uso pela ferramenta MCP `publish_campaign` (auditoria de carrossel, resolucao/upload de imagem, resolucao de link, chamada real a `campaigns.publishToMeta`) — nao uma segunda implementacao.

**server/carouselAudit.ts (novo)**: extraidas 3 funcoes puras (`getCreativeMedia`, `orderedCreativesForCarousel`, `auditCarouselCreatives`) que antes viviam SO dentro de `server/mcpServer.ts`. Achado real durante o proprio processo: importar essas 3 funcoes DE `mcpServer.ts` (mesmo so named exports especificos) arrastava os efeitos colaterais do arquivo inteiro pra qualquer outro consumidor — confirmado por um teste automatizado falhando com `connect ECONNREFUSED` mesmo sem nenhuma chamada de rede no proprio teste (modulos ES nao fazem avaliacao parcial; importar um export nomeado executa TODO o codigo de nivel superior do arquivo). Corrigido extraindo pra um modulo leve e independente, sem esse tipo de efeito colateral. `mcpServer.ts` agora IMPORTA dessas mesmas 3 funcoes (`publish_campaign` continua usando exatamente a mesma logica, comportamento identico, so o arquivo onde vivem mudou).

**server/campaignPublish.ts (novo)**: `publicarCampanhaNaMeta(userId, opts, deps?)` — a orquestracao central, com os mesmos passos ja validados no MCP: checagem de posse, checagem de conjuntos de anuncios existentes, auditoria de carrossel (bloqueia ANTES de qualquer chamada de rede se a copy for fraca/curta/repetida), resolucao/upload de imagem pra Meta, resolucao de link de destino, loop publicando cada conjunto de anuncios. `deps` (leitura de campanha/projeto) e injetavel com implementacao real como padrao — mesmo padrao ja usado com sucesso em `chatWorkspace.ts`, permitindo testar os caminhos de validacao sem tocar banco real nem rede.

**server/chat.ts**: duas ferramentas novas — `consultar_paginas_meta` (lista Paginas do Facebook conectadas, necessario pra descobrir o pageId sem o usuario precisar saber de cor) e `publicar_campanha` (a acao final). Registradas nos 3 provedores (Gemini/Groq/DeepSeek). SYSTEM_PROMPT atualizado com uma secao de REGRAS DE SEGURANCA especifica pra publicacao, sem excecao: so publicar apos confirmacao explicita NA MESMA troca da conversa (uma confirmacao antiga nao vale), resumir o que vai ser publicado antes de chamar a ferramenta, nunca inventar pageId, nunca afirmar sucesso antes da ferramenta confirmar. A campanha continua sendo criada PAUSADA (mesma protecao ja existente em `publishToMeta`) — nao comeca a rodar sozinha mesmo se publicada.

**Validado, sem publicar nada de verdade (conforme exigido pela missao):**
- 4 testes novos em `server/__tests__/campaignPublish.test.ts`: campanha inexistente, campanha de outro usuario (checagem de posse), campanha sem conjuntos de anuncios, auditoria de carrossel reprovando copy fraca/repetida (testada direto via `carouselAudit.ts`, evitando a fragilidade de importar o roteador tRPC inteiro so pra esse teste) — todos cobrindo os caminhos de VALIDACAO que rodam antes de qualquer chamada de rede real.
- Rodado 3x seguidas pra confirmar estabilidade (o problema de conexao real encontrado durante o desenvolvimento nao volta a acontecer).
- check:server 37/37 (sem erro novo, confirmado por mensagem contra a main sem estas mudancas — os erros pre-existentes em mcpServer.ts so mudaram de numero de linha por causa da remocao/import das 3 funcoes).
- npm run build confirmado passando.
- chat.ts confirmado carregando sem crash (precisa de DATABASE_URL/JWT_SECRET/SESSION_SECRET genuinos pra isso — ja presentes no ambiente real de producao, ausentes so no sandbox de teste; confirmado que isso NAO e um risco novo, ja que `_core/index.ts` ja depende dessas mesmas variaveis pra o servidor sequer iniciar).
- As 7 suites de teste existentes do projeto sem regressao (117 testes) + 11/11 em chatWorkspace.test.ts/campaignPublish.test.ts juntos.
- NAO testado (nem deveria ser, conforme a missao pede explicitamente): a chamada real a `campaigns.publishToMeta`/upload de imagem pra Meta — isso exigiria credenciais reais e gastaria dinheiro de verdade.

Com isso, o cenario de teste completo da missao (secao 15 — Sala Comercial Rua 902: criar → fotos → fachada → orcamento → publicar) tem TODAS as ferramentas necessarias existindo pela primeira vez nesta sessao. O fluxo real multi-turn com LLM de verdade continua nao testavel neste ambiente (sem acesso de rede a Gemini/Groq/DeepSeek).

### "Exclusivo" nao nomeado explicitamente na proibicao de copy + retry de melhoria de criativo desistindo na primeira falha (branch fix/exclusivo-prohibition-and-improve-retry)

Michel colou log de producao (14/09) mostrando duas coisas: uma campanha do segmento alimentacao bloqueada pelo fact guard por "exclusivos" (mesma classe de erro ja corrigida antes pro segmento imoveis, mas de uma fonte diferente — confirma que e uma tendencia geral do modelo, nao ligada a um nicho especifico); e as 4 tentativas de melhorar criativo fraco falhando 100% das vezes, com respostas de completion muito curtas (19-20 tokens).

**1. "Exclusivo" nunca foi nomeado explicitamente na lista de proibicoes de copy (CORRIGIDO).** `server/campaignFactGuard.ts` ja rejeita `/\bexclusiv[oa]s?\b/i` como alegacao de escassez/exclusividade nao comprovada (regra ja existente, documentada com referencia a uma investigacao anterior — campanha 747). Mas a lista de PROIBICOES ABSOLUTAS que vai pro prompt de geracao (server/ai.ts) nunca mencionava a palavra "exclusivo" diretamente — so termos parecidos como "condicoes especiais". Como essa palavra ja apareceu em DOIS segmentos diferentes (imoveis numa investigacao anterior, alimentacao agora), confirma ser uma tendencia geral do modelo (um adjetivo de marketing muito comum em portugues), nao um problema especifico de nicho. Adicionado "exclusivo/exclusiva/exclusivos/exclusivas/exclusividade" explicitamente na regra 1 (mesma regra que ja cobria "vagas limitadas"), com a mesma logica: so usar se o briefing confirmar explicitamente.

**2. Retry de melhoria de criativo desistia na primeira falha, nunca tentando a segunda (CORRIGIDO).** `MAX_IMPROVE_ATTEMPTS = 2` e o laco e desenhado pra ate 2 tentativas (log ja mostrava "tentativa 1/2"), mas o bloco `catch` chamava `break` — saindo do laco INTEIRO na primeira falha de `JSON.parse`, nunca chegando na tentativa 2. Isso desperdicava a segunda chance mesmo quando a falha na primeira tentativa poderia ser transitoria (o log mostrava o Gemini "sobrecarregado" fazendo fallback de modelo por perto do mesmo horario — uma tentativa 2, especialmente depois de ja ter trocado pro modelo maior, tinha chance real de funcionar). Corrigido removendo o `break` — o for agora continua naturalmente pra proxima tentativa. Tambem melhorado o log de erro (antes so "Falha ao melhorar criativo — mantendo original", sem detalhe algum) pra incluir o inicio da mensagem de erro real E, num caso separado (resposta parseada mas sem headline), o inicio da resposta bruta — sem isso, nao dava pra saber se era JSON malformado, resposta vazia, ou outra causa, da proxima vez que acontecer.

**Investigado e descartado como nao-urgente:** pontuacao de imagem (RAG) cravando ~0.55 consistentemente, abaixo do limiar de 0.72 (elevado numa investigacao anterior, 10/09, especificamente pra rejeitar matches fracos que antes passavam com 0.50). Confirmado no codigo (`server/imageGeneration.ts`) que `pending_validation` NAO bloqueia o uso da imagem na campanha atual — `return cfUrl` acontece incondicionalmente apos a checagem do RAG, independente do status. O unico efeito de "pending_validation" e a imagem nao ser salva na biblioteca reaproveitavel pra futuras campanhas (`saveApprovedImage` so roda se `validation_status === "approved"`). Ou seja: zero impacto no cliente final da campanha atual, so uma otimizacao de custo/reuso que fica menos eficiente. Nao mexido nesta frente — precisaria de uma investigacao mais profunda da calibracao do algoritmo de scoring (documentado como "matching por keyword e limitado" no proprio comentario do codigo, uma limitacao ja conhecida e aceita).

Validado: logica do laco de retry testada isoladamente (confirma que as 2 tentativas rodam de verdade, e que uma segunda tentativa bem-sucedida apos falha na primeira agora e aproveitada), check:server 37/37 (sem erro novo), npm run build confirmado passando, as 7 suites de teste existentes sem regressao (117 testes) — incluindo `hybridCampaignEngine.test.ts`, que ja validava ausencia de "exclusivo|alto padrão" na copy gerada (confirma que a adicao esta alinhada com o que o proprio projeto ja testa).

### Fotos anexadas no chat perdidas silenciosamente — persistencia real + recuperacao da sessao (branch fix/chat-photo-persistence)

Michel trouxe uma analise propria (via sessao local Codex, ja mesclada na main antes desta frente) apontando 4 problemas confirmados no caminho de anexos que explicavam por que uma campanha real (#779) saiu com imagem gerada por IA/banco de imagens em vez das fotos reais do cliente. Investigado e confirmado cada um no codigo:

1. **Fotos so em memoria efemera do navegador** (`useState` puro, sem persistencia) — qualquer recarregamento de pagina antes da campanha ser gerada com sucesso perdia as fotos.
2. **`data.campanha` limpava anexos sem distinguir criacao de consulta** — investigado e confirmado ser mais restrito do que parecia (so dispara quando `gerar_campanha` tem sucesso de verdade, nao em qualquer mencao a campanha existente), mas ainda um problema real combinado com o item 1.
3. **Servidor so usava anexos da requisicao atual** — sem recuperar fotos de mensagens anteriores da mesma conversa; anexos sem `imageBase64` eram descartados por um `.filter()` silencioso, sem log nenhum.
4. **Sem fotos, a geracao caia pra imagem de IA sem perguntar** — `realImages: undefined` passado pro motor sem nenhuma confirmacao ao usuario.

**Achado extra durante a investigacao:** a coluna `lastCampaignUrl` (adicionada numa frente anterior) so estava dentro do `CREATE TABLE IF NOT EXISTS chat_sessions` — se a tabela ja existia em producao antes dessa coluna ser declarada (o que e o caso, ja que foi adicionada numa edicao POSTERIOR a criacao inicial da tabela), o `CREATE TABLE IF NOT EXISTS` vira no-op e a coluna nunca chega a ser criada de verdade (Postgres nao reconcilia colunas faltantes numa tabela que ja existe). Corrigido com um `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` defensivo, que funciona independente de quando a tabela foi criada em cada ambiente.

**Correcao implementada — mesmo padrao ja usado com sucesso pro anexo de video (upload imediato, persistido, status rastreado):**

- Nova coluna `chat_sessions.pendingPhotoUrls` (JSONB) — fotos ja enviadas ficam salvas aqui ate serem consumidas por uma geracao bem-sucedida.
- Novo endpoint `POST /chat/upload-photo` — sobe a foto pro Cloudinary assim que o arquivo e escolhido (nao so quando a mensagem e enviada), persistindo a referencia na sessao se um `sessionId` for informado.
- `server/db.ts`: `addPendingChatPhoto`, `getPendingChatPhotos`, `clearPendingChatPhotos`.
- `gerarRascunhoValidado` (o motor real de geracao — descoberto durante a implementacao que `executarGeracaoCampanha` virou um wrapper fino em torno dela, mudanca trazida pela sessao paralela) agora recupera fotos pendentes da sessao quando a requisicao atual nao trouxe nenhuma, e limpa essa lista apos consumi-las com sucesso — evita reaproveitar fotos antigas numa campanha nao relacionada mais tarde na mesma conversa.
- `sanitizeChatAttachments` aceita anexos com `photoUrl` (ja enviados) alem do formato antigo com `imageBase64` (retrocompatibilidade) — o filtro silencioso que descartava sem `imageBase64` agora tambem aceita `photoUrl`.
- `prepararFotosDoChat` pula o reupload quando a foto ja tem `photoUrl` (evita decodificar/reenviar base64 de algo que ja esta no Cloudinary).
- SYSTEM_PROMPT: nova instrucao explicita — apos `gerar_campanha` ter sucesso, a IA SEMPRE confere `photoCount`; se for 0, avisa claramente ao usuario que a campanha usa imagem de IA (nao a foto real do negocio), em vez de deixar isso implicito.
- Frontend (`useCampaignChat.ts`): `ChatImageAttachment` ganhou `status`/`photoUrl`; `addAttachments` agora sobe cada foto na hora (preview local instantaneo via `dataUrl`, upload em paralelo); `send()` prefere enviar `photoUrl` (ja persistida) em vez de reenviar base64; `carregarConversa` restaura as fotos pendentes da sessao ao recarregar a pagina (lidas do proprio `sessao.pendingPhotoUrls`, ja retornado pelo endpoint de mensagens sem mudanca adicional no servidor); botao de enviar bloqueado enquanto alguma foto ainda esta subindo (mesmo padrao ja usado pro video); preview mostra overlay de status (girando/erro) nas miniaturas.

**Complicacao real encontrada durante a implementacao:** entre a investigacao inicial e a implementacao, Michel mesclou uma sessao local paralela (Codex) que reestruturou significativamente o gerenciamento de sessao do chat — `executarGeracaoCampanha` virou wrapper de `gerarRascunhoValidado`, surgiu um middleware novo (`server/chatSession.ts`) com lease de concorrencia e contexto via `AsyncLocalStorage` (`briefingContext`), e a resolucao de sessionId migrou de uma variavel local pra `req.chatSessionId`. Isso quebrou a integracao inicial (erros de compilacao reais: `sessionId`/`req` fora de escopo nos 3 dispatchers de provedor, que sao funcoes proprias sem acesso a `req`). Corrigido threading `sessionId` como parametro explicito por toda a cadeia de chamadas (`tentarComGemini/Groq/DeepSeek` → `executarGeracaoCampanha` → `gerarRascunhoValidado`), igual ja era feito com `userId`/`attachments`.

Validado: check:server 37/37 (sem erro novo, confirmado contra a main real pos-merge), npm run build passando (CSS novo confirmado no bundle), modulos chat.ts e db.ts carregam sem crash, as 3 novas funcoes de db.ts confirmadas existentes, as 7 suites de teste existentes sem regressao (117 testes) + 13/13 nos testes de chatWorkspace/campaignPublish/imageGeneration ja existentes (confirma que o merge paralelo nao quebrou nada do que ja tinha sido construido antes).

### Trabalho paralelo (sessão local Codex, 14-16/09) — robustez de reescrita de criativo, prompt visual, latência, política de conversa e integridade de publicação

Entre a minha última entrada e agora, Michel avançou 5 commits adicionais via sua sessão local (Codex), cada um com seu próprio arquivo de documentação em `docs/` (convenção diferente da minha — um arquivo por assunto, em inglês, em vez de um registro único em português). Resumo em português pra manter este registro como fonte única e completa da evolução do repositório, não só da minha própria contribuição:

**1. Segurança na reescrita de criativo (`f4628e5`, `docs/creative-rewrite-safety.md`, novo `server/creativeRewriteGuard.ts`).** O caminho de reescrita de criativo (melhoria de score) agora usa os mesmos `CampaignFacts` do Fact Guard final — a copy JÁ gerada explicitamente não conta como fonte de fato, e uma lista de fatos verificados vazia não é isenção das checagens. Reescrita aceita só 5 campos de texto por um schema Zod estrito; tamanhos, placeholders e Fact Guard checados antes de adotar; texto alternativo sincronizado num clone (ID, mídia e ordem de capa não editáveis pela resposta de reescrita). No máximo 2 tentativas de reescrita por card. Imagem Cloudflare só entra na biblioteca aprovada após aprovação do RAG — pendente/rejeitado/falho não retorna imagem Cloudflare pro chamador (usa o fallback já existente).

**2. Alinhamento do prompt visual com o briefing real (`71ba7a9`, `docs/visual-prompt-alignment.md`).** Prompt de imagem prioriza produto/serviço e fatos visuais confirmados sobre padrões genéricos de segmento. Copy de dor/solução gerada pela IA não vira mais "evidência" de detalhe físico. Padrão de imóvel não assume mais apartamento de luxo mobiliado por padrão. Ângulos de transformação/prova social não pedem mais cenas de antes/depois ou depoimentos fabricados. Identidade do cache de imagem agora inclui o contexto do produto + fatos visuais confirmados — antes, busca de imóvel comercial priorizava menção de cidade sobre o tipo de imóvel declarado, o que às vezes selecionava fotos de apartamento de luxo pra uma sala comercial.

**3. Orçamento de latência do chat (`7f2df58`, `docs/chat-latency.md`, novo `server/chatRetryBudget.ts`).** Retentativas transitórias do Gemini/Groq agora têm no máximo 1 pausa de 250ms por rodada de modelo, e nenhuma tentativa nova começa depois de 12 segundos de orçamento total — antes, 8 falhas temporárias em sequência podiam somar até 33.6 segundos só de espera. É um orçamento de retentativa, não um timeout rígido (uma requisição já em andamento no SDK pode ultrapassar a janela).

**4. Política de conversa e recuperação de falha de provedor (`cf38880` + `01276de`, `docs/chat-conversation-policy.md`, novo `server/chatReasoning.ts`).** Os 3 provedores agora compartilham uma política de resposta curta (1-3 frases, até 3 fatos faltantes por pergunta, reaproveitando o briefing já confirmado na sessão) — uma campanha pedida pode ser gerada assim que o briefing estiver pronto, sem outro turno de "posso gerar?". Perguntas gerais não exigem mais campos de briefing de campanha. Erro de workspace/briefing agora retorna como resultado de ferramenta em vez de abandonar automaticamente aquele provedor. Cooldown de 15 minutos por credencial após erro 402 (sem crédito) do DeepSeek.

**5. Integridade de segmento/objetivo antes de publicar (`f57f3ec`, `docs/campaign-intent-integrity.md`, novo `server/campaignRuleRetrieval.ts` e `server/campaignPublishIntegrity.ts`).** Novo `campaignRuleRetrieval` recupera regras deterministicamente de `shared/segmentConfig` (identificadas por fonte/versão, sem trazer headline/exemplo de cliente/fato de oferta — nada de banco vetorial). Fact Guard expandido: metadado conflitante, falha de auditoria de segmento registrada, alegação de oferta não sustentada, e linguagem residencial em imóvel comercial agora são rejeitados. Geração persiste o snapshot completo de fatos, não só os 3 arrays do prompt — `publishToMeta` revalida os criativos salvos e qualquer texto alternativo fornecido contra esse snapshot, bloqueando campanhas antigas sem snapshot completo (precisam ser regeneradas). Objetivo final da Meta agora precisa bater com o objetivo da campanha (branding/awareness como aliases) — configuração de destino/pixel incompatível agora falha em vez de trocar silenciosamente vendas/engajamento por tráfego.

**Nota de correção — `docs/chat-state-recovery.md` (do commit `af9da6e`, anterior à minha PR #32) ficou desatualizado num ponto específico**: sua seção de limitações ainda lista "attachments remain browser memory only; reattach after reload" — isso foi corrigido pela minha frente de persistência de fotos (PR #32, commit `8c2fe96`, documentada acima), que já resolve exatamente essa limitação (upload imediato pro Cloudinary, persistido na sessão, recuperado automaticamente mesmo após recarregar a página). Não editei o arquivo da outra sessão diretamente — só registro aqui pra quem ler os dois não fique com a impressão errada de que o problema continua.

Nenhuma dessas 5 frentes foi implementada, revisada ou testada por mim — resumo compilado a partir dos arquivos de documentação e diffs que a própria sessão paralela já deixou no repositório, sem verificação adicional de minha parte.

### Fechando os 5 gaps sinalizados pela sessao paralela na persistencia de fotos (branch fix/chat-photo-persistence-gaps)

O changelog da sessao Codex (`docs/CODEX_CHANGELOG_2026-09-16.md`) sinalizou honestamente 5 gaps que continuavam abertos na minha propria correcao de persistencia de fotos (PR #32), sem atribuir a correcao aos commits deles. Investigados um por um contra o codigo real e confirmados todos como reais. Corrigidos:

**1. URL arbitraria aceita sem validar origem (o mais serio — risco de conteudo/seguranca).** `photoUrl` so era checada por comecar com `http(s)://` — alguem batendo direto na API (sem passar pelo endpoint de upload) podia mandar `{photoUrl: "http://qualquer-coisa.com/x.jpg"}` e essa URL entrava como se fosse foto real do cliente, indo pra analise de visao computacional e potencialmente pro criativo final. Nova funcao `isTrustedPhotoUrl` restringe a URLs que sao genuinamente do proprio Cloudinary configurado (`CLOUDINARY_CLOUD_NAME`) — protocolo https, host exato `res.cloudinary.com`, path comecando com `/{cloudName}/`. Testado contra tentativa de falsificacao de dominio (`res.cloudinary.com.evil.com`) — rejeitada corretamente.

**2. Foto enviada antes de existir sessao nao era persistida.** Se o usuario anexasse foto como primeira acao (antes de qualquer mensagem de texto, que e o que cria a sessao), a persistencia era pulada em silencio. Corrigido: o endpoint de upload agora cria a sessao ali mesmo se nenhuma valida foi informada (mesmo padrao ja usado no middleware do POST / na primeira mensagem), e devolve o `sessionId` novo pro cliente, que passa a usar essa mesma sessao dai em diante.

**3. Remover foto na interface nao avisava o servidor.** `removeAttachment` so mexia no estado local — a sessao continuava com a foto, que reaparecia depois de um recarregamento mesmo tendo sido removida explicitamente. Novo endpoint `DELETE /chat/pending-photo` e funcao `db.removePendingChatPhoto` sincronizam a remocao.

**4. Erros de banco na persistencia de foto ficavam completamente silenciosos.** `.catch(() => {})` sem log nenhum. Corrigido: `addPendingChatPhoto` agora retorna `true`/`false`, e o chamador loga um aviso especifico quando a persistencia falha (sem bloquear o upload em si — a foto ja esta no Cloudinary e funciona na troca atual mesmo que a persistencia entre sessoes falhe).

**5. Condicao de corrida real na lista de fotos pendentes.** A versao anterior lia a lista, adicionava a foto e regravava tudo — sem transacao. Duas uploads em paralelo podiam cada uma ler a mesma lista inicial, e a ultima escrita vencia, perdendo uma foto em silencio. Reescrito como uma UNICA instrucao `UPDATE` atomica no Postgres (concatena o JSONB novo, mantem so os 10 mais recentes via `jsonb_array_elements WITH ORDINALITY` + `LIMIT`) — sem janela entre ler e escrever. Mesmo padrao aplicado em `removePendingChatPhoto`.

Validado: `isTrustedPhotoUrl` testada isolada com 6 casos (incluindo tentativa de spoofing de dominio) — todos corretos. check:server 37/37 (sem erro novo), npm run build passando, modulo chat.ts carrega sem crash, as 7 suites de teste existentes sem regressao (117 testes) + 17/17 nos testes de chatWorkspace/campaignPublish/imageGeneration/chatSession ja existentes (confirma que as mudancas em `db.ts` nao quebraram nada que a sessao paralela ja tinha construido). Sem Postgres real neste ambiente pra testar a sintaxe SQL das duas novas queries atomicas contra um banco de verdade — a sintaxe (`jsonb_array_elements WITH ORDINALITY`, `jsonb_agg ORDER BY`) e padrao do Postgres e foi revisada com cuidado; vale acompanhar o log de deploy apos o merge.

### Capacidade de pesquisa web no chat — ferramenta "pesquisar_web" (branch feat/chat-web-search)

Michel pediu pra evoluir o chat "a ponto de pensar por si só com um super cérebro capaz de pesquisar informações se for necessário". Achado real durante a investigação: **o Gemini já tinha busca real na web integrada em algum lugar do codigo** (`geminiWithGrounding`, usado na analise de concorrentes via `tools: [{google_search:{}}]`, API de grounding do proprio Gemini) — nao foi preciso integrar nenhum provedor de pesquisa novo, so reaproveitar o que ja funciona.

**server/ai.ts**: nova funcao `pesquisarWebParaChat(pergunta)` — mesma chamada de API comprovada (grounding com Google Search, mesmo pool de chaves/fallback ja usado por `geminiWithGrounding`), mas devolvendo texto natural em vez de forcar JSON — a funcao original e pensada pra extracao de dado estruturado (analise de concorrente), nao pra resposta de conversa. Retorna `{resposta, buscas}` (as buscas feitas, pra log/transparencia) ou `null` se falhar.

**server/chat.ts**: nova ferramenta `pesquisar_web`, registrada nos 3 provedores (Gemini/Groq/DeepSeek). Descricao deixa claro que e ferramenta de LEITURA (nunca decide nada sozinha) e so deve ser usada quando a pergunta precisa de informacao atual/externa que o modelo nao tem certeza. Regra de seguranca explicita no SYSTEM_PROMPT: resultado de pesquisa e conversa, NAO fato confirmado do negocio do cliente — nunca deve virar alegacao de copy publicitaria (preco, prazo, caracteristica) sem o cliente confirmar explicitamente que se aplica ao negocio dele. Isso evita que a nova capacidade vire um jeito indireto de burlar o Fact Guard (que so aceita fato confirmado PELO CLIENTE como alegacao de anuncio).

Validado: `pesquisarWebParaChat` confirmada exportada corretamente de `ai.ts`, modulo `chat.ts` carrega sem crash, check:server 37/37 (sem erro novo, confirmado contra a main real), npm run build passando, as 7 suites de teste existentes sem regressao (117 testes). Nao foi possivel testar a chamada real de pesquisa (Gemini grounding) neste ambiente — sem acesso de rede a APIs externas no sandbox; a validacao ficou restrita a estrutura do codigo e integracao com o resto do chat.

**Proximo passo natural (nao implementado ainda)**: velocidade de resposta em camadas (lenta/media/rapida), pedido na mesma mensagem — auditoria inicial confirmou que o sistema de orcamento de latencia ja construido pela sessao paralela (`chatRetryBudget.ts`) e ortogonal a essa ideia (controla so o tempo de espera entre tentativas, nao qual modelo/provedor e escolhido primeiro) — sem conflito esperado, mas ainda precisa de desenho proprio (mapear "rapida" pra um modelo mais leve/sem pesquisa, "lenta" pra modelo mais robusto com pesquisa habilitada por padrao, e uma forma do usuario escolher isso na interface).

### O fallback local aparecendo com frequencia — orcamento de latencia bloqueando rotacao gratuita de chave Gemini (branch fix/gemini-key-rotation-vs-retry-budget)

Michel reportou a mensagem de fallback local ("Nao consegui obter uma resposta dos provedores de IA agora...") aparecendo com frequencia. Investigado o caminho completo (Gemini → DeepSeek → Groq → local) e achada a causa raiz especifica.

**Causa raiz confirmada.** `chamarGeminiComRetry` (server/chat.ts) foi corrigida numa frente anterior (10/09) pra cobrir o pool INTEIRO de chaves Gemini numa chamada so — rotacionar pra proxima chave quando uma esta suspensa/com cota esgotada e "sem custo real" (pula sem esperar), so pesa de verdade em erro temporario generalizado. Mas o orcamento de latencia adicionado numa frente paralela (`chatRetryBudget.ts`, 12 segundos) tinha um gate ADICIONAL logo no topo do laco — `if (i > 0 && !retryBudget.canAttempt()) throw` — aplicado em TODA iteracao, inclusive a rotacao "gratuita" de chave suspensa/esgotada. Com varias chaves ruins no inicio do pool (cenario ja visto antes nesta sessao — chaves suspensas sao um problema recorrente), o tempo de rede de CADA tentativa falhando ia consumindo os 12s do orcamento antes mesmo de chegar nas chaves boas do fim do pool. O sistema desistia e caia pro modo local mesmo com chave saudavel disponivel — reintroduzindo exatamente o problema que a correcao de 10/09 tinha resolvido.

**Corrigido**: removido o gate que bloqueava a rotacao de chave. O orcamento de 12s continua valendo (via `nextDelay()`, ja existente) so pra pausa entre tentativas de erro TEMPORARIO generalizado — nao bloqueia mais a rotacao gratuita de chave, que nao devia consumir esse orcamento.

**Groq nao tem o mesmo bug**: investigado o mesmo padrao em `chamarGroqComRetry` — reconsiderado e descartado como correcao necessaria, porque a semantica e diferente. Groq nao tem pool de chaves (uma so credencial) — toda iteracao ali E uma tentativa real de API, nao uma rotacao gratuita, entao o gate do orcamento faz sentido nesse caso e nao foi alterado.

Validado: simulacao isolada do padrao do laco reproduzindo o cenario exato (pool de 8 chaves, 6 primeiras ruins) — ANTES do fix, desiste apos 12s tendo tentado so as 6 chaves ruins, nunca alcancando a chave boa; DEPOIS do fix, continua alem dos 12s pra rotacao gratuita e alcanca a chave boa com sucesso. check:server 37/37 (sem erro novo), npm run build passando, modulo chat.ts carrega sem crash, as 7 suites de teste existentes sem regressao (117 testes) + 9/9 nos testes ja existentes de chatRetryBudget/chatReasoning (confirma que a mudanca em COMO o orcamento e usado no chat.ts nao quebrou o modulo do orcamento em si, que nao foi alterado).

### Velocidade de resposta em camadas — rápida, média, lenta (branch feat/chat-response-speed-tiers)

Michel pediu "precisamos de velocidade, o usuario precisar de a opção lenta, média e rápida de resposta" (mesma mensagem do pedido de pesquisa web, implementado numa frente anterior). Implementado de forma deliberadamente conservadora: sem reordenar a cadeia de fallback entre provedores (Gemini → DeepSeek → Groq), que acabou de ter um bug real corrigido numa frente anterior — reordenar isso agora seria arriscado demais logo depois desse fix. Em vez disso, a velocidade muda duas coisas: quais ferramentas ficam disponíveis pro modelo, e uma nota de orientação na conversa.

**server/chat.ts**:
- Novo parâmetro `velocidade` (`"rapida" | "media" | "lenta"`, padrão `"media"`), validado contra os 3 valores aceitos — qualquer coisa fora disso vira `"media"` silenciosamente, sem erro.
- `"media"` (padrão) mantém o comportamento de hoje **sem nenhuma alteração** — só rápida e lenta mudam algo.
- `"rapida"`: a ferramenta `pesquisar_web` fica fora da lista de ferramentas disponíveis — uma pesquisa custa uma chamada de rede inteira (round-trip pro Google + síntese do Gemini) antes do modelo sequer começar a responder, o oposto do que "rápido" pede. Arrays de ferramentas filtrados (`declaracoesGeminiRapida`, `ferramentasGroqRapida`) computados uma única vez no carregamento do módulo, não a cada requisição.
- `"lenta"`: nota injetada na última mensagem do usuário (mesmo padrão já usado pra anexo de foto/vídeo/contexto de sessão) liberando a IA a usar `pesquisar_web` quando genuinamente ajudar e a não se limitar ao modo direto de 1-3 frases se a pergunta pedir mais explicação.
- `velocidade` threaded pelas 3 funções de provedor (`tentarComGemini`/`tentarComGroq`/`tentarComDeepSeek`) e suas funções de retry internas (`chamarGeminiComRetry`, `chamarGroqComRetry` — esta última ganhou um novo parâmetro `ferramentas`, já que antes usava `ferramentasGroq` fixo direto no corpo da chamada; `chamarDeepSeekChat` já aceitava `tools` opcional, só precisou escolher o array certo).

**client/src/hooks/useCampaignChat.ts**: novo estado `velocidade`, persistido no navegador (preferência do usuário entre conversas, não por conversa) — inicializado do `localStorage` na primeira renderização. `escolherVelocidade` atualiza estado + persistência juntos. Incluído no corpo da requisição de `send()`.

**UI**: seletor de 3 botões (ícones + rótulo) no rodapé do chat, acima da bandeja de anexos — reaproveitado pelos dois lugares que usam `ChatConversationView` (widget flutuante e tela inicial).

**Achado incidental durante a validação — corrigido de passagem**: `npm run check` (checagem combinada client+server) vinha estourando memória (OOM) o processo inteiro desta sessão, o que significava que o lado do CLIENTE nunca tinha sido verificado por tipo de forma completa (só `check:server`, que não cobre `client/`, e `npm run build`, que usa esbuild e só remove tipos sem verificá-los). Rodado com limite de memória maior (3200MB, disponível no ambiente) pela primeira vez — achado e corrigido um erro real e pré-existente em `useCampaignChat.ts` (de uma frente anterior, persistência de fotos): `status: "uploading"` sem `as const` alargava pro tipo `string` genérico, incompatível com a união `"uploading" | "done" | "error"` declarada na interface. Confirmado contra a main real: 42 erros de tipo pré-existentes no projeto todo (nenhum deles introduzido nesta ou em frentes anteriores minhas — todos em arquivos que nunca toquei), 1 corrigido, 0 novos.

Validado: check:server 37/37, checagem completa (client+server) com memória maior — 41 erros pré-existentes remanescentes (nenhum meu), 1 corrigido, 0 novos introduzidos (confirmado por diff de mensagem contra a main real). npm run build passando, CSS novo confirmado no bundle, módulo chat.ts carrega sem crash, as 7 suites de teste existentes sem regressão (117 testes). Chamada real de pesquisa/velocidade não testável neste ambiente (sem acesso de rede a APIs externas no sandbox) — validação restrita à estrutura do código e à lógica de seleção de ferramentas.

### Diagnóstico do fallback local reaparecendo (branch fix/provider-skip-diagnostics)

Michel reportou o fallback local aparecendo de novo mesmo após a correção da rotação de chave Gemini (frente anterior). Investigado: a condição externa (`if (proximaChaveGemini())`) só loga algo quando uma tentativa É feita e falha — se um provedor é PULADO por falta de credencial disponível, nenhum log era emitido, então o Render não mostrava qual provedor faltou nem por quê, só que a cadeia inteira acabou caindo no modo local.

Hipótese mais provável levantada (não confirmável sem acesso à conta real): o saldo do DeepSeek — pendência já registrada desde o início desta sessão ("DeepSeek 'Insufficient Balance' — recarregar saldo no console DeepSeek", nunca resolvida) — causaria bloqueio de 15 minutos repetido (`BillingCooldown`, `server/chatReasoning.ts`) toda vez que a cota se esgota de novo, deixando o DeepSeek quase sempre indisponível. Combinado com chaves Gemini já suspensas (achado recorrente ao longo desta sessão), a cadeia inteira dependeria só do Groq — se algo também impedir o Groq, cai no modo local.

**Corrigido**: log explícito pra cada provedor PULADO (não só os que falharam após tentativa), com o motivo específico. Log de erro final claro quando os 3 provedores falham/são pulados. Da próxima vez que isso acontecer, os logs do Render vão mostrar exatamente qual provedor faltou e por quê.

**Nota de coordenação**: entre a investigação e o commit, a sessão paralela (Codex) mergeou a PR #38 ("mais poder de resposta e precisão" — temperature/maxOutputTokens centralizados em `configGeminiChat`, thinkingConfig pro modo lenta, max_tokens no Groq/DeepSeek). Confirmado que a área editada por essa correção (despacho externo dos 3 provedores) é estruturalmente separada da área que a PR #38 mexeu (dentro de `chamarGeminiComRetry`/`chamarGroqComRetry`/`chamarDeepSeekChat`) — reclonado do zero a partir do commit mais novo antes de reaplicar, sem sobrescrever nada.

Validado: check:server 37/37 (sem erro novo, confirmado contra a main real pós-PR#38), build passando, módulo carrega sem crash, as 7 suites existentes sem regressão. Não foi possível confirmar a causa raiz exata neste ambiente (sem acesso às credenciais/saldo reais das contas Gemini/DeepSeek/Groq) — recomendado a Michel verificar o saldo da conta DeepSeek e o status das chaves Gemini no console do Google Cloud.

### Mensagem de erro do FACT_CONFLICT vazava nome de módulo interno pro cliente final (branch fix/generation-error-copy)

Michel colou a mensagem exata que o chat mostra quando o Fact Guard bloqueia uma geração: "O gerador produziu informacoes nao confirmadas e o Fact Guard bloqueou esta tentativa...". Investigado: essa string vem de `generationErrorText()` (`server/chatBriefing.ts`, modulo novo da sessao paralela) — vira o campo "erro" que o MODELO le e e instruido a "repassar de forma clara" pro usuario (SYSTEM_PROMPT). Dois problemas reais:

1. **"Fact Guard" e nome de modulo interno** — um dono de padaria ou corretor de imoveis usando o chat nao tem contexto nenhum pro que isso significa. A instrucao do prompt so pedia "de forma clara", sem proibir explicitamente jargao tecnico — risco real do modelo simplesmente repetir "Fact Guard" pro cliente final.
2. **Sem proxima acao sugerida** — a transcricao real que Michel colou bem no inicio desta sessao mostrou a IA formulando naturalmente "Posso tentar gerar novamente removendo essas expressoes. Voce concorda?" quando esse mesmo erro acontecia (antes desse texto fixo existir). O texto fixo novo e so informativo/tranquilizador (diz o que NAO aconteceu, o que NAO precisa fazer) mas nao oferece nenhum proximo passo — uma regressao de experiencia em relacao ao que a IA ja fazia por conta propria.

**Corrigido em duas camadas**: reescrita a mensagem especifica do FACT_CONFLICT em `generationErrorText()` sem nomear "Fact Guard", explicando em linguagem simples o que aconteceu, e reintroduzindo a oferta de tentar de novo. E adicionada uma instrucao explicita no SYSTEM_PROMPT proibindo o modelo de repetir nomes de modulos/sistemas internos ("Fact Guard", "Quality Gate", "briefingContext") pro usuario em QUALQUER erro de ferramenta, nao so esse — defesa em profundidade contra qualquer outro jargao que possa vazar no futuro.

Validado: `generationErrorText` testada isolada — nao contem mais "Fact Guard", contem oferta de proxima acao. check:server 37/37 (sem erro novo), build passando, modulo chat.ts carrega sem crash, as 7 suites existentes sem regressao (117 testes).

### "Tentar de novo" após FACT_CONFLICT não tinha informação do que evitar — repetia o mesmo bloqueio (branch fix/fact-conflict-retry-forbidden-terms)

Michel reportou a mensagem de FACT_CONFLICT ficando aparecendo ao tentar gerar a campanha. Investigado: quando `gerar_campanha` falha, a mensagem gerica pro usuario (`generationErrorText`, corrigida numa frente anterior pra nao vazar "Fact Guard") descartava os detalhes ESPECIFICOS de qual palavra/campo causou o bloqueio — o modelo via so "algo nao confirmado", sem nenhuma pista do que exatamente evitar. Numa nova chamada de `gerar_campanha` com os mesmos argumentos, o motor de geracao nao tinha nenhum sinal novo, entao tinha chance real de repetir a MESMA palavra (especialmente se for uma tendencia sistematica do modelo, como "exclusivo" ja confirmado nesta sessao — nao aleatoriedade).

**Corrigido**: os termos ESPECIFICOS rejeitados (extraidos do erro bruto do Fact Guard via regex, testada contra os 3 padroes reais ja vistos nesta sessao — `unverified_scarcity_or_exclusivity_claim`, `forbidden_claim_not_in_current_briefing`, `price_conflict`) agora sao devolvidos ao MODELO (nao ao usuario — a mensagem visivel continua generica) num novo campo `termosRejeitados` no resultado da ferramenta. Novo parametro `forbiddenTerms` (array de strings) em `gerar_campanha`, que o modelo e instruido a preencher com esses termos ao tentar de novo — quando presente, e injetado como proibicao EXPLICITA e deterministica no contexto extra da nova geracao ("PROIBIDO usar estas palavras... foram rejeitadas numa tentativa anterior").

**Limitacao honesta, registrada**: essa correcao funciona de ponta a ponta pro caminho do Gemini (provedor primario, testado no cenario real), que tem um segundo turno onde o modelo processa o resultado da ferramenta antes de responder. Groq/DeepSeek (fallbacks, usados só quando o Gemini falha) retornam o texto de erro DIRETO como resposta da conversa, sem essa camada extra de raciocinio sobre o resultado da ferramenta — a mesma correcao nao se propaga automaticamente nesses dois caminhos. Dado que Gemini e o provedor primario (a esmagadora maioria do trafego real, confirmado pelos logs de producao ao longo desta sessao), essa e a fatia de maior valor; estender pro Groq/DeepSeek exigiria uma mudanca de arquitetura maior nesses dois caminhos, nao feita agora.

Validado: regex de extracao de termos testada isolada contra os 3 padroes reais + um erro sem FACT_CONFLICT (retorna undefined corretamente, sem falso positivo). Fluxo completo (erro real → termos extraidos → injecao no proximo prompt) testado de ponta a ponta isoladamente. check:server 37/37 (sem erro novo), build passando, modulo chat.ts carrega sem crash, as 7 suites existentes sem regressao (117 testes).

### Campanha travava sempre quando a violação de fato caía no campo "pain" — mecanismo de melhoria não conseguia corrigir (branch fix/creative-rewrite-pain-field)

Michel colou log de producao real (19/09) mostrando uma campanha bloqueada apos esgotar as 2 tentativas de melhoria pra um criativo: `Falha ao enriquecer criativos com score/imagem {"error":"FACT_CONFLICT: creatives[4].pain: unverified_scarcity_or_exclusivity_claim"}`. Investigado ate a causa raiz estrutural.

**Confirmado**: `rewriteSchema` (`server/creativeRewriteGuard.ts`) so aceitava 5 campos do modelo — `headline`, `description`, `copy`, `hook`, `cta`. O prompt de melhoria de criativo (`server/ai.ts`) pedia explicitamente "Retorne APENAS... headline, description, copy, hook e cta" — `pain` (a dor/desejo especifico que o criativo endereca, campo real e estabelecido, checado pelo Fact Guard igual qualquer outro texto) NUNCA fazia parte do que o modelo podia editar nessa etapa.

No log real: a auditoria de fatos detectava a violacao em `pain`, o sistema instruia o modelo "remova essa alegacao nao confirmada", mas o modelo literalmente nao tinha como corrigir — o campo nem estava na lista do que ele podia mudar. Resultado: falha garantida em TODAS as tentativas sempre que a violacao caisse especificamente nesse campo, sem chance real de sucesso, nao importa quantas retentativas.

**Corrigido**: `pain` adicionado ao `rewriteSchema` (opcional, max 160 caracteres — mesmo limite ja usado em outro lugar do codigo pra esse campo) e a logica de sincronizacao (`sync()`). Prompt de melhoria atualizado pra incluir `pain` no snapshot do criativo atual, pedir explicitamente esse campo na resposta, e ter sua propria regra de tamanho/proibicao de escassez inventada. Feito OPCIONAL no schema (nao obrigatorio) deliberadamente — exigir sempre criaria um NOVO motivo de rejeicao (`rewrite_invalid_schema`) se o modelo nao reenviasse pain mesmo quando ele nao era o campo problematico; opcional da o melhor dos dois: prompt pede firme, schema nao pune demais se omitido.

Validado: 3 testes novos adicionados ao arquivo ja existente `creativeRewriteGuard.test.ts` (reproduzindo o bug original documentado — reescrita sem tocar pain continua falhando quando pain tem a violacao; confirmando a correcao — reescrita COM pain corrigido agora e aceita; confirmando que omitir pain nao quebra uma reescrita limpa) — 8/8 no arquivo (5 existentes + 3 novos), nenhuma regressao nos testes ja la. check:server 37/37 (sem erro novo), build passando, modulos ai.ts/creativeRewriteGuard.ts carregam sem crash, as 7 suites existentes sem regressao (117 testes).

### Número de apartamento confundido com preço — corrompia o "preço esperado" de toda a campanha (branch fix/money-pattern-false-positive)

Michel colou log de producao real (19/09) mostrando uma campanha bloqueada por `price_conflict_expected_Locação de apartamento nº 1901` — um valor claramente ERRADO pra ser um preco esperado (e o nome/identificador do imovel, nao um valor monetario). Investigado ate a causa raiz.

**Confirmado**: a ultima alternativa do `moneyPattern` (regex de deteccao de preco em `server/campaignFactGuard.ts`) — palavra-gatilho tipo "locacao"/"aluguel"/"valor"/"preco" seguida de ate 20 caracteres quaisquer, seguida de 4 a 6 digitos — foi desenhada pra capturar preco informal SEM o simbolo "R$" (ex: "aluguel 2500"). Mas essa mesma regra casava TAMBEM com "Locação de apartamento **nº 1901**" — o NUMERO DO APARTAMENTO, nao um preco, porque "nº 1901" tem 4 digitos e "de apartamento nº " cabe dentro dos 20 caracteres livres permitidos.

Pior: quando o texto tinha o numero do apartamento E o preco real logo depois ("Locação de apartamento nº 1901... aluguel de 2500"), o regex parava no PRIMEIRO match (o numero do apto) e nunca chegava no preco de verdade — confirmado isoladamente com teste antes de corrigir. Isso corrompia `facts.realEstate.price` com um valor sem sentido, que passava a aparecer como "preco esperado" em TODA verificacao de preco daquela campanha dali em diante — mesmo quando o preco realmente escrito na copy estava certo, o sistema comparava contra o valor errado e rejeitava.

**Corrigido**: adicionado um lookahead negativo excluindo o caso onde uma palavra de identificacao (nº/numero/apto/apartamento/unidade/sala/conjunto/bloco/torre) aparece entre a palavra-gatilho e os digitos — o numero do apartamento nao casa mais, mas o preco informal legitimo ("aluguel 2500", "valor mensal 3200") continua casando normalmente.

Validado: regex testada isolada com 6 casos (numero de apto sozinho, preco informal legitimo com e sem simbolo, os dois no mesmo texto, variacoes de contexto) — todos corretos. 2 testes novos adicionados ao arquivo ja existente `campaignFactGuard.test.ts`, exercitando o pipeline real (`buildCampaignFacts`, nao so o regex isolado) — confirma que o numero do apartamento nao contamina mais o preco esperado, E que o caso legitimo (preco informal) continua funcionando (guarda de regressao). 50/50 no arquivo (48 existentes + 2 novos, nenhuma regressao). check:server 37/37 (sem erro novo), build passando, modulo carrega sem crash, as 7 suites existentes sem regressao (117 testes).

### Crise real de provedores confirmada em producao (19/09): saldo DeepSeek zerado, Genspark provavelmente com integracao invalida, log confuso corrigido

Michel colou log de producao real mostrando uma janela de tempo com MULTIPLOS provedores falhando ao mesmo tempo. Investigado cada um:

**1. DeepSeek com saldo zerado — CONFIRMADO, nao e mais hipotese.** `DeepSeek HTTP 402 {"error":{"message":"Insufficient Balance"...}}` apareceu 3 vezes nesse log. Isso e a MESMA pendencia levantada como hipotese numa investigacao anterior desta sessao (fallback local aparecendo com frequencia) — agora confirmada diretamente pelo log real. Acao necessaria: adicionar credito na conta DeepSeek (nao e algo corrigivel por codigo).

**2. Integracao com Genspark provavelmente baseada em endpoint que nao existe.** Toda tentativa (`callGensparkAPI`, `server/ai.ts`) falha com "fetch failed" — um erro de REDE (DNS/conexao), nao uma resposta HTTP de erro do servidor. Pesquisado: nao ha documentacao oficial confirmando que a Genspark oferece uma API publica REST do tipo `/v1/chat/completions` com autenticacao por chave de API pra desenvolvedores terceiros — as unicas integracoes de terceiros encontradas sao wrappers NAO-OFICIAIS que fazem engenharia reversa do APP WEB de consumidor (login via cookie/sessao, nao chave de API). Isso sugere fortemente que `https://api.genspark.ai/v1/chat/completions` (o endpoint chamado no codigo) nunca funcionou de verdade como uma API generica — `GENSPARK_API_KEY` esta configurada (confirmado em log de boot anterior), entao nao e falta de credencial, e sim uma integracao que parece ter sido construida sobre uma suposicao incorreta de que esse endpoint existe. Nao removido nem desativado o codigo — recomendado a Michel confirmar diretamente com a Genspark (suporte/documentacao da conta) se essa chave de API especifica da acesso a algum endpoint real antes de decidir manter ou remover essa integracao.

**3. Mensagem de log enganosa — CORRIGIDO.** "Gemini retornou resposta sem campos de campanha — pode ser mock interno" aparecia mesmo quando o motivo real era TODOS os provedores internos (Gemini, DeepSeek, Groq, Genspark — a funcao `gemini()` ja cascade por eles por dentro antes de cair no mock de ultimo recurso) terem falhado, nao especificamente o Gemini. Isso confundia o diagnostico — Michel via "Gemini" na mensagem sem saber que o problema real era uma combinacao de DeepSeek sem saldo + Gemini com cota esgotada + Genspark com endpoint que nao responde. Mensagem reescrita pra nomear todos os provedores possiveis envolvidos, nao só o Gemini.

Validado: check:server 37/37 (sem erro novo), build passando, as 7 suites existentes sem regressao (117 testes). Achados 1 e 2 sao acoes que precisam de verificacao/decisao de Michel (saldo de conta, confirmacao com suporte da Genspark) — nao sao correcoes de codigo.

### Auditoria da rota "última campanha gerada" — rota confirmada correta; 3 mutações com API desatualizada corrigidas (branch fix/campaign-result-mutation-loading-state)

Michel reportou tela de erro generica ("Algo deu errado") apos possivelmente clicar no link "Ultima campanha gerada" no chat, e pediu auditoria completa pra saber se falta alguma rota.

**Rota confirmada existente e correta**: `/projects/:id/campaign/result/:campaignId` esta registrada em `App.tsx`, aponta pro componente `CampaignResult`, dentro de `ProtectedRoute`. O link no chat (`chat.ultimaCampanha.url`) e construido no formato certo (`server/chat.ts:808`) e persistido corretamente na sessao (`lastCampaignUrl`). Nao ha rota faltando.

**Investigado a fundo em busca da causa do erro generico** (arquivo `CampaignResult.tsx`, 5386 linhas): checados os 11 `JSON.parse` do arquivo (incluindo o de `profile.socialLinks`, que bate com um bug ja conhecido desde o inicio desta sessao sobre esse campo nao ser JSON valido) — todos estao corretamente protegidos com try/catch, ao contrario da minha suspeita inicial. Achado real, mas nao a causa do crash: 3 mutacoes tRPC (`updateAdSetMutation`, `updateCreativeMutation`, `setFeaturedPhotoMutation`) usavam `.isLoading`, propriedade que o React Query v5 renomeou pra `.isPending` em mutacoes (`@tanstack/react-query ^5.90.2` confirmado no package.json — `isLoading` so existe mais em queries, nao mutacoes). Nao crashava (usado so em `disabled={...}` e ternario, seguro com `undefined`), mas os botoes de salvar orcamento/criativo e marcar foto destaque nunca mostravam corretamente o estado de carregamento/desabilitado durante a chamada.

**Causa raiz do crash em si nao foi determinada com certeza** — nao foi possivel reproduzir localmente (sem acesso ao navegador real nem ao console de erro exato), e o arquivo e grande demais pra auditoria exaustiva manual com confianca total. Recomendado a Michel: se o erro se repetir, capturar o erro exato do console do navegador (ou reproduzir e informar se acontece com QUALQUER campanha ou so com a #790/Morebem especificamente) — isso restringe a busca imediatamente, em vez de continuar auditando as 5386 linhas às cegas.

Validado: `.isLoading` → `.isPending` corrigido nas 3 mutacoes (5 ocorrencias). check:server 37/37 (sem erro novo), checagem completa client+server com memoria maior — erro do isLoading confirmado resolvido (72 → 71 erros pre-existentes, nenhum novo), build passando.

### Investigação do crash React #31 ({daily, lifetime}) em /projects/120/campaign/result/790 — causa raiz nao encontrada, mas ErrorBoundary agora reporta pro servidor (branch feat/client-error-server-reporting)

Michel compartilhou o erro real do console do navegador: `Minified React error #31 ... object with keys {daily, lifetime}`, capturado pelo ErrorBoundary em `/projects/120/campaign/result/790` (a mesma rota "ultima campanha gerada" investigada antes).

**Investigacao extensa, causa raiz NAO confirmada**: buscado em todo o codigo (servidor e cliente) por qualquer lugar que monte um objeto literal com as chaves `daily`+`lifetime` juntas — nao encontrado em lugar nenhum. Isso e um sinal real: todo codigo escrito a mao neste projeto usa nomes em portugues; um objeto com essas duas chaves em ingles sugere fortemente que vem de uma API externa (Meta Graph API mais provavel, dado o padrao `daily_budget`/`lifetime_budget` real da Meta) sendo armazenado ou passado adiante sem transformacao, mas o PONTO EXATO onde isso acontece nao foi localizado apesar de buscas extensas em `CampaignResult.tsx` (5386 linhas), `router.ts` (todas as queries relacionadas a orcamento/campanha), e modulos relacionados.

**Decisao tomada em vez de continuar adivinhando**: em vez de seguir vasculhando as ~5400 linhas as cegas, implementado reporte automatico de erro do ErrorBoundary pro servidor — antes, um crash so aparecia no console do NAVEGADOR do usuario, exigindo que Michel copiasse manualmente pra eu conseguir investigar. Agora:

- Novo endpoint `POST /api/client-error` (`server/_core/index.ts`), com rate limit simples (20/min, reaproveitando `express-rate-limit` ja usado em `publicApi.ts`) pra nao inundar o log se um componente entrar em loop de erro.
- `ErrorBoundary.tsx` (`componentDidCatch`) agora manda a mensagem de erro, o stack de componentes, o `context` da boundary e a URL (`pathname`) pro novo endpoint — best-effort, nunca bloqueia a UI se a chamada falhar.
- Loga via `log.error("client", ...)` — aparece nos MESMOS logs do Render que Michel ja compartilha comigo, sem precisar copiar nada manualmente na proxima ocorrencia.

Validado: testado ponta a ponta contra um servidor real rodando neste ambiente (banco falso, mas o boot e o endpoint funcionam independente disso) — requisicao de teste simulando o erro real retornou 204 e apareceu corretamente formatada no log do servidor com todos os campos (message, context, pathname, componentStack). check:server 37/37 (sem erro novo), build passando, servidor sobe sem crash, as 7 suites existentes sem regressao (117 testes).

**Proximo passo natural**: da proxima vez que esse ou qualquer outro erro de ErrorBoundary acontecer, vai aparecer automaticamente no log do Render — Michel so precisa colar o log de novo (ou eu busco direto se tiver acesso), sem precisar reproduzir manualmente nem copiar do console do navegador.

### Segunda tentativa de diagnosticar o crash {daily, lifetime} — sourcemaps habilitados em modo oculto (branch feat/hidden-sourcemaps)

O reporte de erro pro servidor (frente anterior) funcionou — Michel colou um novo log mostrando a mesma pilha de componentes do React, agora capturada automaticamente. Investigado a fundo: a pilha mostra nomes de componente de UMA LETRA só ("U", "Mi", "Li") vindos de arquivos JS minificados diferentes (`pages-admin-*.js`, `pages-modules-*.js`) aparecendo juntos na mesma pilha — o que a primeira vista sugeriu que `CampaignResult.tsx` (pages-modules) estava renderizando algo de um arquivo Admin (pages-admin). Busca extensa NÃO confirmou isso: nenhuma referência a "Admin" existe em `CampaignResult.tsx` nem em `Layout.tsx` (o layout compartilhado). Reconsiderado: nomes minificados de uma letra podem coincidir entre pacotes diferentes sem relação nenhuma — sem sourcemap real, a pilha de componentes sozinha não é confiável o suficiente pra apontar a linha exata com certeza.

**Decisão**: em vez de continuar adivinhando com informação insuficiente, habilitado `sourcemap: "hidden"` no build do Vite (`vite.config.ts`) — gera os arquivos `.map` (permite decodificar um stack trace minificado de volta pro código-fonte original depois), mas SEM adicionar a referência `sourceMappingURL` no bundle publicado, então o navegador do usuário não busca isso automaticamente. Adicionado tambem um bloqueio explícito no servidor (`server/_core/index.ts`) recusando qualquer requisição terminada em `.map` com 404 — camada extra de segurança, já que "hidden" sozinho não deveria expor isso, mas não custa garantir.

Validado: build gera os `.map` corretamente (confirmado nos 4 chunks principais, tamanhos entre ~900KB e ~2.2MB cada), confirmado que `sourceMappingURL` NÃO aparece em nenhum bundle publicado (0 ocorrências via grep). Testado contra servidor real rodando neste ambiente: requisição pro `.js` normal retorna 200 (funciona normalmente), requisição pro `.js.map` correspondente retorna 404 (bloqueado como esperado). check:server 37/37 (sem erro novo), as 7 suites existentes sem regressao (117 testes).

**Limitação honesta**: os arquivos `.map` ficam no filesystem do Render junto com os `.js` — não tenho acesso direto pra buscá-los eu mesmo daqui. Se o crash acontecer de novo, o proximo passo pra decodificar de verdade seria Michel conseguir baixar o `.map` correspondente do Render (se a plataforma oferecer acesso a shell/arquivos) e compartilhar comigo, ou considerar integrar isso com o Sentry (ja configurado no lado do servidor deste projeto), que resolve isso automaticamente — não implementado agora por ser um escopo maior.

### "rewrite_invalid_schema" sem nenhum detalhe do que falhou — corrigido (branch fix/rewrite-schema-error-detail)

Michel colou log de producao real (21/09) mostrando 3 de 8 tentativas de melhoria de criativo falhando com `"reason":"rewrite_invalid_schema"` — sem nenhum detalhe do que especificamente estava errado na resposta do modelo. Investigado: `acceptCreativeRewrite` (`server/creativeRewriteGuard.ts`) descartava por completo o erro detalhado do Zod (`parsed.error`) — que diria exatamente qual campo falhou e por quê (limite de caracteres excedido, campo faltando, campo extra nao permitido que o modelo as vezes adiciona por conta propria, como um campo de "reasoning" explicando a mudanca) — so lancava a string generica "rewrite_invalid_schema".

**Corrigido**: os detalhes reais do Zod agora sao incluidos na mensagem de erro lancada. Quem chama ja loga `e.message` (`server/ai.ts`), entao isso vira diagnostico automatico sem precisar mudar mais nada la.

Achado extra de passagem, corrigido: a mensagem de feedback pro modelo apos uma reescrita recusada ainda dizia "Confira todos os **cinco** campos" — desatualizada desde que `pain` foi adicionado como sexto campo (frente anterior). Corrigida pra "seis campos".

Validado: testados isoladamente 3 cenarios reais que provavelmente explicam as falhas do log (campo excedendo limite de caracteres, campo extra nao permitido tipo "reasoning", campo obrigatorio faltando) — todos agora produzem mensagem especifica e acionavel em vez do generico "rewrite_invalid_schema". 8/8 no teste ja existente de `creativeRewriteGuard.test.ts` (as asserções usam regex que ja batem com o novo formato mais detalhado, sem quebrar nada). check:server 37/37 (sem erro novo), build passando, as 7 suites existentes sem regressao (117 testes).

Nao investigado nesta frente (ocorrencia isolada, nao recorrente no log): um caso de "Unterminated string in JSON" com apenas 17 tokens de completion (bem abaixo do normal de ~180) — pode ser um corte de seguranca do proprio Gemini no meio da geracao, nao necessariamente um bug de codigo. O mecanismo de retry ja existente tratou isso corretamente (logou, manteve a ultima versao valida, seguiu adiante) — comportamento aceitavel como esta.

### Groq (último fallback) rejeitava requisição por ser grande demais — derrubava a cadeia inteira pro modo local (branch fix/groq-history-token-budget)

Michel colou log de producao real (21/09) mostrando o Groq recusando a requisicao DUAS vezes: `413 "Request too large... Limit 8000, Requested 8246"` e depois `"Requested 9338"` — o tier `on_demand` do Groq aceita no maximo 8000 tokens por minuto. Como Groq e o ULTIMO fallback da cadeia (Gemini → DeepSeek → Groq → local), essa falha derrubava a conversa inteira pro modo local nas duas ocorrencias — mesmo caso combinado com o saldo zerado do DeepSeek (ja confirmado antes) e sobrecarga temporaria do Gemini.

**Causa raiz confirmada**: `MAX_MENSAGENS_HISTORICO = 48` (dimensionado pro contexto bem maior do Gemini, aumentado de 16 numa frente anterior desta sessao) e enviado INTEIRO pro Groq tambem, sem nenhum limite proprio. `SYSTEM_PROMPT` sozinho tem ~24 mil caracteres (~6 mil tokens estimados, ~4 caracteres por token) — somado as definicoes de 8 ferramentas e ate 48 mensagens de historico, ultrapassa facilmente o orcamento de 8000 do Groq, mesmo em conversas de tamanho moderado.

**Corrigido**: novo limite `MAX_MENSAGENS_GROQ = 10`, aplicado SO na chamada ao Groq (`tentarComGroq`) — Gemini continua recebendo os 48 normalmente, ja que tem contexto e orcamento bem maiores. Sem chave de API adicional nem tier pago no Groq, a unica alavanca real e mandar menos historico especificamente nesse fallback.

Validado: simulacao isolada comparando tokens estimados com 48 vs 10 mensagens — reducao real confirmada na direcao certa. check:server 37/37 (sem erro novo), build passando, modulo carrega sem crash, as 7 suites existentes sem regressao (117 testes).

**Limitacao honesta**: a simulacao usou mensagens de exemplo mais curtas que as reais (o log mostrou requisicoes de 8246-9338 tokens; minha simulacao com 48 mensagens curtas deu ~7345 — abaixo do limite) — mensagens reais (especialmente resumos de campanha gerados pela IA) sao provavelmente mais longas, entao a reducao real na producao deve ser proporcionalmente maior que a simulacao sugere, mas nao consigo garantir com certeza absoluta que 10 mensagens elimina o problema em 100% dos casos extremos (conversa com mensagens excepcionalmente longas). Se o erro 413 persistir mesmo com esse limite reduzido, o proximo passo seria reduzir ainda mais, ou considerar trimar/resumir o CONTEUDO de cada mensagem antes de enviar ao Groq, nao so a quantidade.

### Trabalho paralelo (Michel direto, 22/09) — reconciliação com o fix do Groq, orçamento de requisição mais robusto, fluxo de entrada guiado, forbiddenTerms isolado por campanha

Desde minha ultima entrada, Michel fez 3 commits diretos (nao via sessao Codex automatizada — autoria propria, `Michel Leal <mixavier31@gmail.com>`) que reconciliam e aprimoram trabalho recente, incluindo minha propria correcao do Groq (PR #49):

**1. Orcamento de requisicao do Groq substituido por um mais robusto (`6a4c16c`, novo `server/chatRequestBudget.ts`).** Minha correcao anterior (`MAX_MENSAGENS_GROQ = 10`, um corte fixo por quantidade de mensagens) foi SUBSTITUIDA por `budgetChatMessages()` — estima o tamanho real em bytes (incluindo as definicoes de ferramentas, lacuna que eu tinha deixado documentada como nao resolvida), NUNCA corta a mensagem atual do usuario nem suas chamadas/resultados de ferramenta em andamento, e remove turnos antigos como GRUPOS COMPLETOS (nao no meio) ate caber no limite — se mesmo o minimo obrigatorio (prompt + turno atual) excede o orcamento, falha de forma clara (`chat_context_too_large`) em vez de arriscar outro 413. Tambem inclui `COMPACT_CHAT_POLICY` — uma versao bem mais curta do SYSTEM_PROMPT especifica pro Groq, atacando diretamente a raiz do problema que eu tinha identificado (SYSTEM_PROMPT sozinho consumindo a maior parte do orcamento de 8000 tokens do Groq) de forma mais completa que minha correcao original.

**2. Reescrita de criativo: raciocinio (thinking) do Gemini desabilitado pra nao truncar o JSON.** Endereca a anomalia que eu tinha notado mas nao investigado (`completion:17` a `completion:20` tokens em respostas de melhoria de criativo, causando "Unterminated string in JSON") — confirmado como problema real: o modo de raciocinio do Flash 2.5 consumia o orcamento de saida antes do JSON comecar. Desabilitado especificamente nas chamadas de reescrita, reservando a capacidade de saida pro JSON de verdade. Resposta tambem passa a exigir terminar com STOP explicitamente.

**3. Fluxo de entrada de campanha guiado (`27a17a0`, novo `server/chatIntake.ts`).** Politica estruturada pra escolha de projeto (lista os nomes reais, nunca pede ID), escolha entre campanha nova/usar como modelo/editar existente, e agrupamento de TODOS os campos essenciais faltantes numa unica pergunta organizada (em vez de perguntar um de cada vez) — com `missingCampaignIntake()` calculando exatamente o que falta.

**4. `forbiddenTerms` isolado por chamada, nunca vaza entre campanhas (`7078151`).** Reforca diretamente minha propria funcionalidade (PR #41, correcao do retry apos FACT_CONFLICT): `mergeChatBriefing` agora limpa `forbiddenTerms` do briefing anterior antes de aplicar o patch — sem isso, termos proibidos de uma tentativa de geracao ficariam "grudados" no briefing persistente e poderiam vazar pra uma campanha diferente/futura sem relacao nenhuma com o motivo original do bloqueio.

Segundo o proprio relato de validacao desses commits (`docs/chat-campaign-reliability.md`): 35 testes focados passaram (creativeRewriteGuard, chatRequestBudget, chatWorkspace, chatBriefing, chatReasoning, campaignIntent) — nenhuma campanha real foi criada ou publicada pelos testes. Checagem completa de tipo NAO passou no ambiente local deles pelos mesmos motivos ja conhecidos nesta sessao (modulos @google/genai e groq-sdk ausentes, mais os erros ja catalogados em router/MCP/imageGeneration) — same padrao que eu mesmo já vinha confirmando como pré-existente e não-bloqueante. Prontidao de deploy nao formalmente estabelecida por eles: `git diff --check` passou, mas chamada real aos provedores (Gemini/Groq/DeepSeek) nao foi validada por testes unitarios — mesma limitacao que já registrei nas minhas proprias validacoes ao longo desta sessao inteira.

Nenhuma dessas 4 frentes foi implementada ou revisada por mim — resumo compilado a partir dos commits e do doc que a propria sessao ja deixou no repositorio.

**Nota sobre este arquivo**: já passou de 1000 linhas / ~180KB. Segue crescendo de forma organizada (uma seção por investigação/correção, em ordem cronológica) e continua sendo a fonte única em português cobrindo tanto meu trabalho quanto o da sessão paralela — mas em algum momento pode valer a pena splitar por área (chat/geração de campanha, infraestrutura/deploy, etc.) se ficar difícil de navegar. Não fiz essa reorganização agora por não ter sido pedida.

### Novidade importante da sessão paralela: preparação de campanha sem IA quando todos os provedores falham (branch já mergeada, `76307a2`)

Achado ao investigar o log de Michel (22/09, `chat_context_too_large` derrubando pro modo local): a sessão paralela já implementou exatamente a resposta certa pra esse padrão recorrente — quando nenhum provedor de IA responde, o chat agora oferece um fluxo determinístico (`Preparar campanha` / `/preparar`) que NÃO chama nenhum provedor de IA. O usuário preenche os campos essenciais direto, e pode salvar um "rascunho básico" (`/rascunho`) com status `pending_enrichment` — que as mutações de publicação (Meta/Google/TikTok) **recusam explicitamente antes de qualquer chamada à API de anúncio**, até ser enriquecido e passar pela validação normal (Fact Guard/Quality Gate) depois. Isso transforma o que antes era um beco sem saída (mensagem de erro genérica) numa alternativa real de progresso mesmo durante uma indisponibilidade total. Não implementado por mim — resumo compilado do commit e do `docs/chat-offline-preparation.md` que a própria sessão já deixou.

### "description" da reescrita de criativo estourando o limite de 30 caracteres repetidamente — bloqueava correção de problema mais importante (branch fix/rewrite-description-buffer)

No mesmo log, um criativo (index 0) falhou a reescrita DUAS vezes seguidas pelo mesmo motivo: `"rewrite_invalid_schema: description: String must contain at most 30 character(s)"`. Como a validação de schema rejeita a resposta INTEIRA quando qualquer campo falha, o modelo nunca chegou a corrigir o problema real que causou o score baixo — uma alegação de exclusividade não confirmada no `headline` (`FACT_CONFLICT: creatives[0].headline: unverified_scarcity_or_exclusivity_claim`, a falha final que travou a campanha inteira).

**Corrigido**: instrução do prompt de melhoria mudada de "máx 30 caracteres" pra "máx 30 caracteres — mire em até 24 pra ter folga (conte antes de responder)" — dá margem de segurança pro modelo, técnica padrão de engenharia de prompt pra reduzir estouros por pouco de um limite rígido. Não resolve o problema estrutural mais amplo (uma reescrita mistura correção de schema E de fatos na mesma resposta; se uma falha, a outra nunca é validada) — isso exigiria separar as duas preocupações em passes distintos, mudança maior não feita agora.

Validado: check:server 37/37 (sem erro novo), build passando, as 7 suites existentes sem regressao (117 testes).

### OpenRouter (100% gratuito) adicionado como 4º provedor no raciocínio do chat (branch feat/chat-openrouter-free-fallback)

Michel perguntou se existe forma de deixar a geração de campanha menos dependente de Gemini/DeepSeek/Groq, especificamente **100% gratuita**.

**Achado ao investigar**: a geração de campanha em si (`generateCampaign`, em `server/ai.ts`) já tinha Claude e OpenRouter como fallbacks adicionais codificados — mas nunca configurados (chaves ausentes em todo log de boot desta sessão). Mais importante: isso so ajuda DEPOIS que o chat ja decidiu chamar `gerar_campanha` — o raciocinio da PROPRIA conversa (decidir o que responder, qual ferramenta chamar — onde a maioria das quedas pro modo local investigadas nesta sessao realmente acontece) só conhecia Gemini/DeepSeek/Groq.

Pesquisado (setembro/2026): OpenRouter tem modelos gratuitos com suporte real a chamada de ferramentas, incluindo `openai/gpt-oss-20b:free` — a MESMA familia de modelo ja usada com sucesso via Groq nesta base de codigo (`gpt-oss-120b`). API compativel com OpenAI (mesmo formato do Groq).

**Implementado**: `tentarComOpenRouter`, novo 4º provedor no raciocinio do chat — Gemini → DeepSeek → Groq → **OpenRouter (gratuito)** → modo local. Reaproveitou quase todo o codigo ja existente e testado do Groq em vez de reescrever do zero: o SDK do Groq aceita `baseURL` customizado (confirmado: `new Groq({apiKey, baseURL: "https://openrouter.ai/api/v1"})` aponta corretamente pro endpoint certo), entao a MESMA logica de despacho de 8 ferramentas foi extraida pra uma funcao compartilhada (`tentarComOpenAICompativel`), com `tentarComGroq` e a nova `tentarComOpenRouter` virando wrappers finos em cima dela — elimina ~100 linhas de duplicacao que existiriam se reescrito do zero. `chamarGroqComRetry` ganhou um parametro `model` (antes fixo em `MODELO_GROQ`), preservando comportamento existente via valor padrao.

**Zero custo, ativacao imediata quando configurado**: so precisa de `OPENROUTER_API_KEY` no Render (obtida de graca em openrouter.ai) — sem isso, o novo passo e pulado com log claro ("OpenRouter pulado — OPENROUTER_API_KEY não configurada"), sem alterar nenhum comportamento existente.

Validado: confirmado que o SDK do Groq realmente respeita `baseURL` customizado (testado isoladamente, aponta pro endpoint certo do OpenRouter em vez do Groq). check:server 37/37 (sem erro novo), build passando, modulo carrega sem crash, as 7 suites existentes sem regressao (117 testes). **Nao testavel de ponta a ponta neste ambiente** — sem chave de API real do OpenRouter nem acesso de rede externo pra confirmar uma chamada genuina funcionando; a estrutura e o formato da requisicao foram cuidadosamente espelhados do padrao ja comprovado do Groq, mas vale Michel confirmar com uma conversa real apos configurar a chave.

### Log de boot pra OPENROUTER_API_KEY (branch feat/openrouter-boot-log)

Michel configurou `OPENROUTER_API_KEY` no Render. Nao havia nenhuma linha de log de boot confirmando essa variavel especificamente (diferente de GEMINI_API_KEY, DEEPSEEK_API_KEY, GROQ_API_KEY, GENSPARK_API_KEY etc., que ja tinham) — sem isso, so daria pra confirmar que a chave foi pega corretamente esperando uma conversa real cair no 4º fallback. Adicionada a linha `[BOOT] OPENROUTER_API_KEY set (fallback gratuito): true/false`, mesmo padrao das demais.

Validado: testado com a variavel definida — linha aparece corretamente no boot (`true ✅`). check:server 37/37, build passando, as 7 suites existentes sem regressao.
