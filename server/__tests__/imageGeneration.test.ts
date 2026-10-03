import test from "node:test";
import assert from "node:assert/strict";
import { cloudflareCampoDeSteps, cloudflareModeloAceitaDimensoes } from "../imageGeneration";

// Achado real (log de produção, 13/09): TODA chamada ao FLUX Schnell
// falhava com 400 "Additional or unevaluated properties '/num_steps'"
// — o código sempre mandava "num_steps", mas o FLUX usa o campo
// "steps" (confirmado via documentação oficial da Cloudflare); "num_steps"
// é nome de campo da família Stable Diffusion, não do FLUX.
test("cloudflareCampoDeSteps usa o nome de campo certo por modelo", () => {
  assert.equal(cloudflareCampoDeSteps("@cf/black-forest-labs/flux-1-schnell"), "steps");
  assert.equal(cloudflareCampoDeSteps("@cf/black-forest-labs/flux-2-klein"), "steps");
  assert.equal(cloudflareCampoDeSteps("@cf/stabilityai/stable-diffusion-xl-base-1.0"), "num_steps");
  assert.equal(cloudflareCampoDeSteps("@cf/lykon/dreamshaper-8-lcm"), "num_steps");
});

// Este teste afirmava `flux-1-schnell → true` e estava errado. Duas provas
// independentes, as duas contra:
//
// 1. Log de produção (03/10, campanha 797): as nove gerações levaram
//    "Cloudflare 400 — retry sem dimensões" e só passaram na segunda
//    tentativa, sem width/height. 9 de 9, nenhuma exceção.
// 2. Schema oficial (developers.cloudflare.com/workers-ai/models/
//    flux-1-schnell/schema-input.json): apenas `prompt` e `steps`, com
//    "additionalProperties": false.
//
// O custo do erro não era imagem quebrada — o retry salvava a geração. Era
// duas viagens de rede e até 60s de timeout em cada imagem, silenciosamente.
//
// A regra é por GERAÇÃO do modelo, não por família: o FLUX 2 tem schema
// próprio e aceita width/height (flux-2-flex, -max, -pro-preview).
test("cloudflareModeloAceitaDimensoes: flux-1 nao aceita, flux-2 aceita", () => {
  assert.equal(cloudflareModeloAceitaDimensoes("@cf/black-forest-labs/flux-1-schnell"), false);
  assert.equal(cloudflareModeloAceitaDimensoes("@cf/black-forest-labs/flux-2-flex"), true);
  assert.equal(cloudflareModeloAceitaDimensoes("@cf/black-forest-labs/flux-2-klein"), true);
  assert.equal(cloudflareModeloAceitaDimensoes("@cf/stabilityai/stable-diffusion-xl-base-1.0"), false);
  assert.equal(cloudflareModeloAceitaDimensoes("@cf/lykon/dreamshaper-8-lcm"), false);
});
