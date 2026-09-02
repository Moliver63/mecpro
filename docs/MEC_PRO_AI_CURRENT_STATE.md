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

## Quality gates operacionais

O arquivo `shared/campaignQualityGate.ts` concentra validacoes de prontidao por etapa, inspirado em padroes de agentes com gates antes de acoes criticas.

Ele avalia:

- `generate`: briefing minimo, objetivo, oferta, publico, verba, duracao e perguntas especificas por segmento.
- `media`: quantidade de midias, carrossel com pelo menos 2 itens, escolha de capa e ordem visual.
- `publish`: destino final, confirmacao explicita do usuario, criativos suficientes e resultado do fact guard.
- `optimize`: reservado para auditorias de otimizacao e proximas evolucoes.

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
