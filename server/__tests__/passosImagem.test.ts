import test from "node:test";
import assert from "node:assert/strict";
import { passosDeGeracao, PASSOS_PADRAO_IMAGEM } from "../imageGeneration";

const FLUX = "@cf/black-forest-labs/flux-1-schnell";

// Achado real (07/10): estava fixo em 8, com o comentario "mais passos =
// maior qualidade". Verdade pra difusao comum; o FLUX.1 *schnell* e a
// variante DESTILADA, treinada pra 1-4 passos, e a doc da Cloudflare da
// `steps` com default 4 e maximo 8 — rodar em 8 fica fora da faixa de
// projeto.
//
// O preco nao e marginal. Tabela oficial: 9,60 neurons por passo + 4,80 por
// tile de 512x512. Em 1024x1024 (4 tiles = 19,2 neurons):
//   steps 8 → 96,0 neurons → ~104 imagens/dia nos 10.000 gratuitos
//   steps 4 → 57,6 neurons → ~173 imagens/dia
test("o default e 4, nao 8 — dentro da faixa do schnell e 67% mais imagens/dia", () => {
  assert.equal(PASSOS_PADRAO_IMAGEM, 4);
  assert.equal(passosDeGeracao(FLUX, undefined), 4);
  assert.equal(passosDeGeracao(FLUX, ""), 4);

  // A conta que justifica a mudanca, travada aqui pra nao virar folclore.
  // (Arredondado porque 4 * 9.6 em ponto flutuante da 38.400000000000006.)
  const neurons = (passos: number) => Math.round((passos * 9.6 + 4 * 4.8) * 10) / 10;
  assert.equal(neurons(8), 96);
  assert.equal(neurons(4), 57.6);
  assert.equal(Math.floor(10_000 / neurons(8)), 104);
  assert.equal(Math.floor(10_000 / neurons(4)), 173);
});

// Reversivel sem deploy: se a qualidade em 4 decepcionar, volta a 8 pelo
// painel do Render.
test("env sobrescreve, dentro do teto do schema", () => {
  assert.equal(passosDeGeracao(FLUX, "8"), 8);
  assert.equal(passosDeGeracao(FLUX, "1"), 1);
  assert.equal(passosDeGeracao(FLUX, "6"), 6);
});

// O teto de 8 e do schema oficial do flux-1: pedir mais e 400 na hora. Um
// valor invalido nao pode derrubar a geracao — cai no default.
test("valor invalido ou acima do teto cai no default, sem estourar", () => {
  for (const ruim of ["9", "100", "0", "-3", "abc", "4.5", " ", "NaN", "Infinity"]) {
    assert.equal(passosDeGeracao(FLUX, ruim), PASSOS_PADRAO_IMAGEM, `"${ruim}" devia cair no default`);
  }
});

// Fora do flux-1 o teto e outro: a familia Stable Diffusion aceita mais
// passos, e nao faz sentido limitar ela ao schema do FLUX.
test("modelo nao-flux1 tem teto proprio", () => {
  const sd = "@cf/stabilityai/stable-diffusion-xl-base-1.0";
  assert.equal(passosDeGeracao(sd, "20"), 20);
  assert.equal(passosDeGeracao(sd, "9"), 9, "9 passa no SD, ao contrario do flux-1");
  assert.equal(passosDeGeracao(FLUX, "9"), PASSOS_PADRAO_IMAGEM, "mas no flux-1 continua barrado");
  assert.equal(passosDeGeracao(sd, "21"), PASSOS_PADRAO_IMAGEM);
});
