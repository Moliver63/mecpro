import test from "node:test";
import assert from "node:assert/strict";
import {
  LIMITES, contar, medirCampo, posicaoDaOferta,
  analisarCriativo, analisarTextosDaCampanha,
} from "../limitesDeTextoMeta";

/**
 * Copy cortada no anuncio (25/10, campanha 804).
 *
 * O texto principal dizia o preco no caractere 244 e o feed corta em ~125. O
 * anuncio rodou um dia e meio sem mostrar R$ 19,90 a quem nao clicasse em "Ver
 * mais", e copy publicada na Meta nao se edita: so criando anuncio novo, o que
 * gasta e reinicia aprendizado.
 *
 * O que estes testes travam:
 *   1. a 804 real tem que gerar aviso (o teste do fim);
 *   2. estourar o maximo rigido BLOQUEIA, porque a Meta recusaria mesmo;
 *   3. passar da dobra apenas AVISA, porque travar publicacao por qualidade
 *      repete a parede que a 799 criou pro usuario.
 */

// Texto real do criativo 1 da campanha 804, como foi publicado.
const COPY_804 =
  "Você promete que dessa vez vai ser diferente e cai no mesmo ciclo. Isso tem " +
  "explicação, e dá para entender. O Método Shadia Hasan reúne autoconhecimento " +
  "e exercícios práticos para você reconhecer seus padrões.\n\nComece por uma aula " +
  "completa, por R$ 19,90, em pagamento único. Acesse o site e escolha a sua. O " +
  "acesso é liberado depois da confirmação do pagamento e vale por 7 dias. Quem " +
  "gostar assina um plano mensal para continuar.";

// ── Contagem ─────────────────────────────────────────────────────────────
test("conta por ponto de codigo: acento vale 1", () => {
  assert.equal(contar("ação"), 4);
  assert.equal(contar(""), 0);
  assert.equal(contar("R$ 19,90"), 8);
});

test("emoji nao conta dobrado", () => {
  assert.equal(contar("ok✅"), 3);
});

// ── Medicao de campo ─────────────────────────────────────────────────────
test("campo dentro do limite nao acusa nada", () => {
  const a = medirCampo("Uma aula por R$ 19,90", "titulo")!;
  assert.equal(a.excedeMaximo, false);
  assert.equal(a.cortado, false);
  assert.equal(a.trechoEscondido, "");
});

test("campo acima da dobra marca cortado, nao excedido", () => {
  // 32 caracteres: passa dos 27 visiveis, cabe nos 40 aceitos.
  const texto = "Exercícios com realidade virtual";
  assert.equal(contar(texto), 32);
  const a = medirCampo(texto, "titulo")!;
  assert.equal(a.cortado, true);
  assert.equal(a.excedeMaximo, false, "32 cabe no maximo de 40; a Meta aceita");
  assert.equal(a.trechoVisivel, "Exercícios com realidade vi");
  assert.equal(a.trechoEscondido, "rtual");
});

test("campo acima do maximo marca excedido", () => {
  const a = medirCampo("x".repeat(41), "titulo")!;
  assert.equal(a.excedeMaximo, true);
});

test("campo vazio ou so espaco e ignorado", () => {
  assert.equal(medirCampo("", "titulo"), null);
  assert.equal(medirCampo("   ", "titulo"), null);
  assert.equal(medirCampo("x", "campo_que_nao_existe"), null);
});

test("carrossel tem descricao mais curta que anuncio normal", () => {
  assert.equal(LIMITES.descricaoCarrossel.visivel, 20);
  assert.equal(LIMITES.descricao.visivel, 27);
  const texto = "Pagamento único, sem renovação"; // 30
  assert.equal(medirCampo(texto, "descricao")!.cortado, true);
  assert.equal(medirCampo(texto, "descricaoCarrossel")!.cortado, true);
});

// ── Posicao da oferta ────────────────────────────────────────────────────
test("acha o preco e diz onde esta", () => {
  const r = posicaoDaOferta("Comece hoje por R$ 19,90 em pagamento único.");
  assert.equal(r.encontrado, true);
  assert.equal(r.texto, "R$ 19,90");
  assert.equal(r.antesDaDobra, true);
});

test("preco depois da dobra e sinalizado", () => {
  const r = posicaoDaOferta("a".repeat(200) + " R$ 19,90");
  assert.equal(r.encontrado, true);
  assert.equal(r.antesDaDobra, false);
  assert.ok(r.posicao! > 125);
});

test("preco que COMECA antes da dobra mas termina depois nao vale", () => {
  // Meia oferta visivel e oferta escondida.
  const r = posicaoDaOferta("a".repeat(120) + "R$ 19,90", 125);
  assert.equal(r.encontrado, true);
  assert.equal(r.antesDaDobra, false, "precisa caber inteiro antes da dobra");
});

test("texto sem preco nao inventa oferta", () => {
  const r = posicaoDaOferta("Conheça o método e transforme sua rotina.");
  assert.equal(r.encontrado, false);
  assert.equal(r.antesDaDobra, false);
});

test("acento antes do preco nao desloca a posicao", () => {
  // index do match vem em UTF-16; a contagem e em pontos de codigo.
  const r = posicaoDaOferta("ação ação R$ 10,00");
  assert.equal(r.posicao, contar("ação ação "));
});

// ── Bloqueio x aviso ─────────────────────────────────────────────────────
test("estourar o maximo BLOQUEIA", () => {
  const r = analisarTextosDaCampanha([{ copy: "ok", headline: "x".repeat(45) }]);
  assert.equal(r.ok, false);
  assert.equal(r.bloqueios.length, 1);
  assert.match(r.bloqueios[0], /recusada/);
});

test("passar da dobra NAO bloqueia, so avisa", () => {
  // Travar publicacao por qualidade repete a parede da 799.
  const r = analisarTextosDaCampanha([{ copy: "Por R$ 19,90 hoje.", headline: "x".repeat(32) }]);
  assert.equal(r.ok, true, "aviso nunca derruba publicacao");
  assert.equal(r.bloqueios.length, 0);
  assert.equal(r.avisos.length, 1);
});

test("campanha limpa nao gera ruido", () => {
  const r = analisarTextosDaCampanha([
    { copy: "Uma aula por R$ 19,90, pagamento único. Acesse o site.", headline: "Aula por R$ 19,90", description: "Pagamento único" },
  ]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.avisos, []);
});

test("lista vazia nao lanca", () => {
  const r = analisarTextosDaCampanha([]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.avisos, []);
});

test("texto longo sem preco avisa sobre a primeira frase", () => {
  const r = analisarCriativo({ copy: "a".repeat(300) }, 0);
  assert.equal(r.bloqueios.length, 0);
  assert.match(r.avisos[0], /primeira frase/);
});

// ── O caso real ──────────────────────────────────────────────────────────
test("804 real: nenhum campo estoura limite, e mesmo assim esta errado", () => {
  // O ponto do modulo. Contar caractere sozinho daria tudo certo.
  const r = analisarCriativo({ copy: COPY_804, headline: "Uma aula do método por R$ 19,90", description: "Pagamento único, sem renovação", format: "Carrossel" }, 1);
  assert.equal(r.bloqueios.length, 0, "a Meta aceitaria este anuncio sem reclamar");
  assert.ok(contar(COPY_804) < LIMITES.textoPrincipal.maximo);

  assert.equal(r.oferta.encontrado, true);
  assert.equal(r.oferta.texto, "R$ 19,90");
  assert.equal(r.oferta.antesDaDobra, false, "era este o prejuizo: preco escondido");
  assert.ok(r.oferta.posicao! > 200, `preco no caractere ${r.oferta.posicao}`);
  assert.ok(r.avisos.some((a) => /Ver mais/.test(a)), "precisa dizer que o preco some");
});

test("804 corrigida: oferta na frente resolve o aviso do preco", () => {
  const corrigida =
    "Uma aula completa do Método Shadia Hasan por R$ 19,90, em pagamento único. Acesse o site e escolha a sua.\n\n" +
    "Você promete que dessa vez vai ser diferente e cai no mesmo ciclo. Isso tem explicação, e dá para entender.";
  const r = analisarCriativo({ copy: corrigida, headline: "Uma aula por R$ 19,90", description: "Pagamento único", format: "Carrossel" }, 1);
  assert.equal(r.oferta.antesDaDobra, true);
  assert.equal(r.bloqueios.length, 0);
  assert.deepEqual(r.avisos, [], "sem aviso: o que importa esta visivel");
});
