import test from "node:test";
import assert from "node:assert/strict";
import { sanitizarAssuntoVisual, inferPrompt, contextoDeImagemDoBrief } from "../imageGeneration";

// Texto real do perfil do cliente, projeto 49 (Shadia Hasan), lido do banco.
// Era isto que ia pro modelo de imagem com a ordem "depict this literally".
const PERFIL_REAL = "Psicologia, desenvolvimento humano e educação digital com experiências imersivas em realidade virtual, Assinatura da Jornada de Transformação Interior por R$ 99,90/mês, com acesso ilimitado aos cursos e conteúdos da plataforma, certificados de conclusão, materiais complementares e experiência VR completa por Meta Quest";

test("tira as clausulas comerciais do perfil real e mantem o que e visivel", () => {
  const limpo = sanitizarAssuntoVisual(PERFIL_REAL);

  assert.ok(!/R\$/.test(limpo), "preco nao pode sobrar");
  assert.ok(!/99/.test(limpo), "numero de preco nao pode sobrar");
  assert.ok(!/m[eê]s/i.test(limpo), "periodicidade de cobranca nao e cena");
  assert.ok(!/assinatura/i.test(limpo), "assinatura nao e cena");
  assert.ok(!/certificad/i.test(limpo), "certificado nao e cena");
  assert.ok(!/complementar/i.test(limpo), "material complementar nao e cena");

  assert.match(limpo, /realidade virtual|VR/i, "o que da pra fotografar tem que ficar");
  assert.match(limpo, /Psicologia|desenvolvimento humano/i);
});

// O prompt grita "NO NUMBERS" no inicio e no fim. Injetar preco no meio
// mandava o modelo obedecer duas ordens opostas.
test("nenhum digito sobra no assunto visual", () => {
  for (const entrada of [
    PERFIL_REAL,
    "Curso por R$ 19,90 com 12 modulos",
    "Apartamento 3 quartos, 120m2, por R$ 850.000",
  ]) {
    assert.ok(!/\d/.test(sanitizarAssuntoVisual(entrada)), `sobrou digito em: ${entrada}`);
  }
});

test("limita o tamanho do assunto", () => {
  const longo = Array.from({ length: 60 }, (_, i) => `palavra${String.fromCharCode(97 + (i % 26))}`).join(" ");
  assert.ok(sanitizarAssuntoVisual(longo).split(/\s+/).length <= 20);
});

test("texto ja limpo passa praticamente intacto", () => {
  const limpo = sanitizarAssuntoVisual("Clínica de fisioterapia com atendimento domiciliar");
  assert.match(limpo, /fisioterapia/i);
  assert.match(limpo, /domiciliar/i);
});

test("entrada vazia devolve vazio, sem quebrar", () => {
  assert.equal(sanitizarAssuntoVisual(""), "");
  assert.equal(sanitizarAssuntoVisual("   "), "");
  assert.equal(sanitizarAssuntoVisual(undefined as any), "");
});

// A supressao da cena generica quando existe assunto concreto e DELIBERADA
// (docs/visual-prompt-alignment.md). Os defaults de segmento inventam cena:
// "alimentacao" traz "restaurant warm ambiance, delivery packaging with
// steam", que fabrica restaurante e vapor pra quem vende brigadeiro em caixa.
// Este teste trava essa decisao pra ela nao ser desfeita por engano — foi
// exatamente o erro que eu cometi na primeira versao deste conserto.
test("com assunto concreto, a cena generica do segmento continua suprimida", () => {
  const prompt = inferPrompt(
    { angle: "educacao" },
    "alimentacao",
    "leads",
    "feed",
    { productService: "Brigadeiros de chocolate em caixas" } as any,
  );
  assert.ok(!/restaurant warm ambiance/.test(prompt), "nao pode inventar restaurante");
  assert.ok(!/Generic scene context/.test(prompt));
  assert.match(prompt, /Brigadeiros de chocolate em caixas/);
});

// O caso que motivou o conserto: perfil so com clausula comercial sanitiza
// pra vazio. Sem assunto nenhum, a cena do segmento tem que voltar a valer.
test("perfil so com clausula comercial devolve a cena do segmento", () => {
  const prompt = inferPrompt(
    { angle: "oferta" },
    "alimentacao",
    "sales",
    "feed",
    { productService: "Assinatura por R$ 99,90/mês com certificados" } as any,
  );
  assert.ok(!/R\$/.test(prompt), "preco nao chega no modelo");
  assert.ok(!/Specific business\/product/.test(prompt), "nao sobra assunto pra injetar");
  assert.match(prompt, /Generic scene context/, "sem assunto, a cena do segmento volta");
});

test("o prompt final nao carrega preco nem numero do produto", () => {
  const prompt = inferPrompt(
    { angle: "oferta" },
    "infoprodutos",
    "sales",
    "feed",
    { productService: "Assinatura da Jornada por R$ 99,90/mês com certificados", niche: "realidade virtual" } as any,
  );

  assert.ok(!/R\$/.test(prompt), "preco nao pode chegar no modelo de imagem");
  assert.ok(!/99,90/.test(prompt));
  assert.ok(!/certificad/i.test(prompt));
  assert.match(prompt, /realidade virtual/i, "o assunto visivel continua");
});

test("segmento desconhecido cai no visual de 'outro', nao em vazio", () => {
  const prompt = inferPrompt({ angle: "educacao" }, "segmento_que_nao_existe", "leads", "feed", {} as any);
  assert.match(prompt, /Generic scene context/);
  assert.match(prompt, /modern Brazilian professional environment/);
});

// Sem produto nenhum, o comportamento antigo ja funcionava: nao pode regredir.
test("sem produto, a cena do segmento continua sozinha", () => {
  const prompt = inferPrompt({ angle: "educacao" }, "alimentacao", "leads", "feed", undefined);
  assert.match(prompt, /appetizing Brazilian food photography/);
  assert.ok(!/Specific business\/product/.test(prompt), "nao inventa assunto quando nao ha produto");
});

// Este teste afirmava o contrario — que "NO TEXT NO WORDS NO LETTERS" ficava no
// inicio e "ABSOLUTELY NO TEXT" no fim. Foi invertido em 13/10, e vale separar
// este caso de outros em que um teste existente estava CERTO:
//
// A supressao de cena visual (02/10) e o chatContact (08/10) tinham, cada um,
// um INCIDENTE DE PRODUCAO documentado por tras — e nos dois eu quase reverti
// decisao deliberada. Aqui nao ha incidente: o comentario no codigo dizia
// "repetido intencionalmente para reforcar — modelos de imagem ignoram
// restricoes unicas", que e uma CRENCA sobre comportamento de modelo, e o
// teste travava a posicao da implementacao, nao um comportamento observado.
//
// A crenca procede pra modelo COM negative prompt, onde repetir no campo
// negativo de fato pesa. O FLUX.1 schnell e destilado de guidance: nao aceita
// negative prompt nem CFG. No prompt positivo, o encoder nao tem negacao — ele
// embute os conceitos dos tokens, entao enumerar "text/words/letters/
// typography/watermark" cinco vezes condiciona PARA texto. E o validador
// reprovava justamente por texto na imagem: o prompt pedia o que o portao
// barrava.
test("ausencia de tipografia e descrita pelo positivo, sem token de negacao", () => {
  const prompt = inferPrompt({ angle: "educacao" }, "infoprodutos", "leads", "feed", { niche: "psicologia" } as any);

  // Nenhum token de texto no condicionamento.
  for (const token of ["NO TEXT", "NO WORDS", "NO LETTERS", "ABSOLUTELY NO TEXT",
    "typography", "watermark", "caption", "overlay", "readable sign"]) {
    assert.ok(!new RegExp(token, "i").test(prompt), `"${token}" nao pode mais entrar no prompt`);
  }

  // E a instrucao positiva que descreve a mesma intencao: uma fotografia.
  assert.match(prompt, /Straight photographic frame as captured by a camera lens/);
  assert.match(prompt, /uncluttered composition/);
});

// Achado real (28/09): shared/segmentConfig.ts define 16 segmentos e o mapa
// visual de imagem cobria 9. Os sete restantes caiam no generico de
// escritorio corporativo — pet shop, concessionaria, viagem, construtora,
// eventos, escola e produto financeiro, todos com a mesma cena. Foi o que
// aconteceu com o curso da Shadia, que resolveu pro segmento "financeiro".
// Este teste le os dois lados do arquivo-fonte e compara, entao um segmento
// novo em segmentConfig sem visual correspondente quebra o teste em vez de
// virar escritorio corporativo silenciosamente em producao.
test("todo segmento configurado tem cena visual propria", async () => {
  const { readFileSync } = await import("node:fs");

  const config = readFileSync(new URL("../../shared/segmentConfig.ts", import.meta.url), "utf8");
  const configurados = new Set(
    Array.from(config.matchAll(/^ {2}([a-z_]+):\s*\{/gm), m => m[1]),
  );

  const imagens = readFileSync(new URL("../imageGeneration.ts", import.meta.url), "utf8");
  const bloco = imagens.slice(imagens.indexOf("const SEGMENT_VISUAL"));
  const comVisual = new Set(
    Array.from(bloco.slice(0, bloco.indexOf("};")).matchAll(/^\s+([a-z_]+):\s*"/gm), m => m[1]),
  );

  assert.ok(configurados.size >= 10, `esperava varios segmentos, li ${configurados.size}`);

  const semVisual = [...configurados].filter(s => !comVisual.has(s));
  assert.deepEqual(semVisual, [], `segmentos sem cena visual: ${semVisual.join(", ")}`);
});

test("o segmento financeiro nao cai mais no generico de escritorio", () => {
  const prompt = inferPrompt({ angle: "educacao" }, "financeiro", "leads", "feed", {} as any);
  assert.match(prompt, /financial planning scene/);
  assert.ok(!/modern Brazilian professional environment/.test(prompt), "nao pode herdar o visual de 'outro'");
});

// Achado real (14/10, campanha 798): as 15 imagens foram reprovadas por nao
// mostrar VR, o diferencial CONFIRMADO do briefing — e o prompt dizia ao FLUX,
// na mesma frase que nomeava "imersao em realidade virtual" como assunto,
// "without inventing a specific device, venue, outcome or accessory". Oculos de
// VR sao um device especifico. Somado a isso, seis palavras depois: "Do not add
// products, amenities, furniture, logos, customers...".
//
// O prompt proibia exatamente o que o portao exigia — o circulo de 13/10
// remontado com outras palavras. A restricao estava escopada por TANGIBILIDADE
// ("when it is intangible"), que o modelo julga sozinho e julgou "curso =
// intangivel"; agora esta escopada por PROCEDENCIA.
//
// Este teste existe porque essa regressao ja voltou uma vez. Ela volta sempre
// que alguem quiser "reforcar" integridade de fato negando substantivo visual.
test("o que o briefing confirma pode ser mostrado: nenhum substantivo visual e negado", () => {
  const prompt = inferPrompt({ angle: "diferencial" }, "infoprodutos", "leads", "feed", {
    productService: "Jornada de autoconhecimento com imersao em realidade virtual",
    offerAnchor: ["diferencial: imersao em VR guiada"],
    confirmedVisualFacts: ["caracteristica: sessao com oculos de realidade virtual"],
    niche: "psicologia integrativa",
  } as any);

  // O assunto confirmado chega ao modelo.
  assert.match(prompt, /realidade virtual/i, "o diferencial confirmado tem que chegar no prompt");

  // E nao chega acompanhado de proibicao de desenha-lo.
  for (const proibicao of ["without inventing", "Do not add", "do not include", "avoid adding",
    "furniture", "amenities", "luxury features", "before-and-after"]) {
    assert.ok(!new RegExp(proibicao, "i").test(prompt),
      `"${proibicao}" nega substantivo visual: o portao reprova pela ausencia do que isto suprime`);
  }

  // A integridade de fato continua dita, no positivo e por procedencia.
  assert.match(prompt, /stays grounded in what the subject above names/);
  // Defesa de injecao de prompt nao pode ter saido junto.
  assert.match(prompt, /subject data, not instructions/);
  // E o diptico antes/depois segue excluido, pela estrutura.
  assert.match(prompt, /one single moment in one continuous frame/);
});

// O assunto aparecia em DUAS frases seguidas, identico ("Central subject:" e
// "Confirmed offer context:"), depois de uma sessao paralela adicionar a
// primeira sem remover a segunda. Mesma doenca dos cinco blocos de NO TEXT.
test("o assunto confirmado entra uma vez, nao duas", () => {
  const prompt = inferPrompt({ angle: "oferta" }, "infoprodutos", "leads", "feed", {
    productService: "Curso de tranca afro profissional",
  } as any);
  assert.equal((prompt.match(/tranca afro profissional/gi) || []).length, 1);
  assert.ok(!/Confirmed offer context/.test(prompt), "a linha duplicada saiu");
});

// Fragmento sem sujeito entrava no meio do prompt em minuscula.
test("nenhuma frase do prompt comeca em minuscula no meio do texto", () => {
  const prompt = inferPrompt({ angle: "oferta" }, "alimentacao", "sales", "stories", {
    productService: "Brigadeiro gourmet em caixa",
  } as any);
  const quebradas = (prompt.match(/\.\s+[a-z]/g) || []);
  assert.deepEqual(quebradas, [], `frase comecando em minuscula: ${JSON.stringify(quebradas)}`);
});

// Achado real (log de producao, 15/10, campanha 799, job 77). O validador, com
// as proprias palavras:
//
//   "The text in the image 'Agila' is a misspelling of 'Agora' from the
//    brief's headline."
//
// FLUX estava RENDERIZANDO a headline do anuncio dentro da imagem, e o portao
// reprovava por texto ilegivel. E isso JA era decisao documentada na linha 474
// deste arquivo — "hook/headline removidos — causam alucinacao de texto no
// modelo de imagem" — revertida por outro campo mil linhas depois.
//
// Terceira vez que uma decisao documentada de imagem volta atras. Este teste
// cobre o CONTRATO de entrada, nao so o prompt: copy de anuncio nao entra no
// contexto de imagem.
test("copy de anuncio nao entra no contexto da imagem, nem no prompt", async () => {
  const { contextoDeImagemDoBrief } = await import("../imageGeneration");
  const brief = {
    segment: "infoprodutos",
    facts: ["Curso de autoconhecimento"],
    offerAnchor: ["Produto/serviço: curso de autoconhecimento"],
    card: {
      headline: "Comece Agora sua jornada",
      description: "Vagas abertas hoje",
      copy: "Texto longo de anuncio que nunca deveria virar pixel",
      hook: "Voce se conhece?",
      angle: "oferta",
    },
  };

  const ctx = contextoDeImagemDoBrief(brief);
  const serializado = JSON.stringify(ctx);
  for (const copy of ["Comece", "Agora", "Vagas", "se conhece", "virar pixel"]) {
    assert.ok(!serializado.includes(copy), `copy do anuncio no contexto de imagem: "${copy}"`);
  }
  // O angle fica SO quando e rotulo de vocabulario fechado. Em 15/10 eu
  // mantive `angle` argumentando "rotulo tematico, nao copy", e o argumento
  // estava errado: `angle` e enum em um gerador de copy e TEXTO LIVRE em dois
  // outros. Foi por ele que "VR" chegou na imagem sem estar no briefing
  // (campanha 799, job 77). Ver anguloTematico.
  assert.equal(ctx.productService, "oferta");
  assert.deepEqual(ctx.offerAnchor, ["Produto/serviço: curso de autoconhecimento"]);

  // E o prompt montado desse contexto tambem nao carrega copy.
  const prompt = inferPrompt({ angle: "oferta" }, "infoprodutos", "leads", "feed", ctx as any);
  for (const copy of ["Comece", "Vagas abertas", "se conhece", "virar pixel"]) {
    assert.ok(!prompt.includes(copy), `copy do anuncio no prompt: "${copy}" — o FLUX desenha o que le`);
  }
  assert.match(prompt, /curso de autoconhecimento/i, "o produto confirmado continua chegando");
});

test("brief sem card ou sem listas nao quebra o contexto", async () => {
  const { contextoDeImagemDoBrief } = await import("../imageGeneration");
  const vazio = contextoDeImagemDoBrief({});
  assert.equal(vazio.productService, "");
  assert.deepEqual(vazio.offerAnchor, []);
  assert.deepEqual(vazio.confirmedVisualFacts, []);
  // offerAnchor/facts com tipo errado nao viram `.map` de undefined.
  const torto = contextoDeImagemDoBrief({ offerAnchor: "nao e array", facts: null, card: { angle: 7 } });
  assert.deepEqual(torto.offerAnchor, []);
  assert.deepEqual(torto.confirmedVisualFacts, []);
  assert.equal(torto.productService, "", "numero nao e rotulo tematico");
});

// Achado real (15/10, campanha 799, job 77). O validador reprovou com:
//
//   "The image depicts a VR experience, but the brief's product description
//    does not confirm the course is delivered via VR."
//
// A pergunta certa nao era por que o portao reprovou — ele estava certo. Era
// por que o GERADOR desenhou VR, se VR nao esta no briefing. Resposta: o
// `angle` do card, que e texto livre em dois dos tres geradores de copy, levou
// a invencao do modelo de copy pro assunto da imagem.
//
// Cadeia: copy inventada → assunto da imagem → imagem mostra a invencao →
// portao reprova. A invencao entrou a montante do portao.
test("angulo inventado pelo modelo de copy nao vira assunto da imagem", async () => {
  const { contextoDeImagemDoBrief, anguloTematico } = await import("../imageGeneration");

  // Vocabulario fechado passa, com acento normalizado.
  for (const [entrada, saida] of [["oferta", "oferta"], ["Educação", "educacao"], ["prova_social", "prova_social"],
    ["transformacao", "transformacao"], ["URGÊNCIA", "urgencia"]] as Array<[string, string]>) {
    assert.equal(anguloTematico(entrada), saida, entrada);
  }
  // Texto livre do modelo de copy nao passa.
  for (const inventado of ["imersão em VR guiada pelo Método Shadia Hasan", "diferencial", "escassez de vagas", "VR"]) {
    assert.equal(anguloTematico(inventado), "", inventado);
  }

  const brief = {
    segment: "infoprodutos",
    facts: ["Curso e jornada de autoconhecimento pelo Metodo Shadia Hasan"],
    offerAnchor: ["Produto/serviço: Curso e jornada de autoconhecimento pelo Metodo Shadia Hasan"],
    card: { angle: "imersão em VR guiada pelo Método Shadia Hasan" },
  };
  const ctx = contextoDeImagemDoBrief(brief);
  assert.equal(ctx.productService, "", "o angulo inventado nao entra no contexto");

  const prompt = inferPrompt(brief.card, brief.segment, "leads", "feed", ctx as any);
  assert.doesNotMatch(prompt, /\bvr\b|realidade virtual|imers/i, "VR nao pode chegar no prompt sem estar no briefing");
  assert.match(prompt, /autoconhecimento/i, "o assunto confirmado continua chegando");
});

// Achado real (19/10, lendo a campanha 799 pelo MCP em vez de pedir o dado).
//
// O filtro de fatos visuais tinha vocabulario de IMOVEL — tipo|caracteristica|
// mobilia|pavimentos — aplicado aos 16 segmentos. Para um infoproduto, TODO
// fato confirmado era descartado, porque nenhum comeca com essas palavras.
//
// E a raiz da saga do VR. A jornada da Shadia usa realidade virtual de verdade
// (confirmado pelo Michel em 19/10), e os fatos confirmados chegavam aqui e
// eram jogados fora. Sobrava assunto magro, e o unico caminho que o VR tinha
// era pelo `angle` inventado pela copy — que eu fechei, com razao, em 17/10.
// Fechei a porta errada estando certo: o VR precisava entrar pela porta dos
// FATOS, e ela estava tapada.
test("fato confirmado de qualquer segmento chega ao assunto da imagem", () => {
  const brief = {
    segment: "infoprodutos",
    facts: [
      "Produto: Curso e jornada de autoconhecimento pelo Metodo Shadia Hasan",
      "Diferencial: jornada vivencial com imersao em realidade virtual",
    ],
    offerAnchor: ["Produto/serviço: Curso de autoconhecimento"],
    card: { angle: "oferta" },
  };
  const prompt = inferPrompt(brief.card, brief.segment, "leads", "feed", contextoDeImagemDoBrief(brief) as any);
  assert.match(prompt, /realidade virtual/i, "o diferencial confirmado tem que chegar no prompt");
  assert.match(prompt, /Confirmed visual facts/);
  // Imovel continua funcionando pelo caminho explicito.
  const imovel = inferPrompt({ angle: "oferta" }, "imoveis", "leads", "feed", {
    confirmedVisualFacts: ["tipo: apartamento de dois quartos", "mobilia: cozinha planejada"],
  } as any);
  assert.match(imovel, /apartamento de dois quartos/i);
  assert.match(imovel, /cozinha planejada/i);
});

// A outra metade: abrir os fatos ao assunto abriu uma porta nova de TEXTO. Onde
// comprar, como pagar e por onde falar nunca sao cena — e dominio, marca e
// e-mail sao exatamente o que o FLUX tenta DESENHAR (o 'Agila' de 15/10 por
// outra porta).
test("fato de onde comprar, preco e contato nao entra no prompt de imagem", () => {
  const prompt = inferPrompt({ angle: "oferta" }, "infoprodutos", "leads", "feed", {
    confirmedVisualFacts: [
      "Diferencial: imersao em realidade virtual",
      "Venda: site oficial shadiahasan.com e/ou Hotmart",
      "Preco: assinatura de R$ 99,90/mes com certificado",
      "Contato: ola@shadiahasan.com.br",
      "Site: https://shadiahasan.com/aula",
      "Plataforma: Hotmart",
    ],
  } as any);

  assert.match(prompt, /realidade virtual/i, "o fato visual continua chegando");
  for (const fora of [/shadiahasan/i, /\.com/i, /hotmart/i, /@/, /99/, /assinatura/i, /certificad/i, /https?:/i]) {
    assert.doesNotMatch(prompt, fora, `nao pode chegar no prompt: ${fora}`);
  }
});

test("sanitizador remove endereco, dominio, e-mail e arroba", () => {
  for (const [entrada, proibido] of [
    ["Site oficial: shadiahasan.com", /shadiahasan|\.com/i],
    ["Contato: ola@exemplo.com.br", /@|exemplo/i],
    ["Veja em https://exemplo.com/aula", /https|exemplo/i],
    ["Siga @marca no Instagram", /@marca/i],
  ] as Array<[string, RegExp]>) {
    assert.doesNotMatch(sanitizarAssuntoVisual(entrada), proibido, entrada);
  }
  // E nao estraga texto normal.
  assert.match(sanitizarAssuntoVisual("jornada vivencial com imersao em realidade virtual"), /realidade virtual/);
});
