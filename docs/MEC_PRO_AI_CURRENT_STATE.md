# MecProAI - Estado atual do motor

Atualizado em: 2026-08-29

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

### Correcoes remanescentes apos commits paralelos direto no GitHub (branch fix/remaining-crashes-and-price-negation, PR pendente de revisao)

Enquanto uma frente anterior desta sessao investigava o deploy quebrado e a cascata de crashes dos 6 segmentos novos (veiculos, construcao, educacao, eventos, turismo, pet), Michel fez 6 commits direto na main resolvendo boa parte dos mesmos problemas em paralelo (sintaxe, estrutura dos 6 segmentos, nicheKeys de alimentacao). O PR anterior desta sessao ficou obsoleto. Reavaliado o que ainda faltava contra o estado atual da main e corrigido:

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
