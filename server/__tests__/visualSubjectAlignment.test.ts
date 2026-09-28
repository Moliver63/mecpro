import test from "node:test";
import assert from "node:assert/strict";
import { sanitizarAssuntoVisual, inferPrompt } from "../imageGeneration";

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

test("a proibicao de texto continua no inicio e no fim", () => {
  const prompt = inferPrompt({ angle: "educacao" }, "infoprodutos", "leads", "feed", { niche: "psicologia" } as any);
  assert.match(prompt.slice(0, 80), /NO TEXT NO WORDS NO LETTERS/);
  assert.match(prompt.slice(-200), /ABSOLUTELY NO TEXT/);
});
