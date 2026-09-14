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

test("cloudflareModeloAceitaDimensoes distingue FLUX de Stable Diffusion", () => {
  assert.equal(cloudflareModeloAceitaDimensoes("@cf/black-forest-labs/flux-1-schnell"), true);
  assert.equal(cloudflareModeloAceitaDimensoes("@cf/stabilityai/stable-diffusion-xl-base-1.0"), false);
  assert.equal(cloudflareModeloAceitaDimensoes("@cf/lykon/dreamshaper-8-lcm"), false);
});
