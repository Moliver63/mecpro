import test from "node:test";
import assert from "node:assert/strict";
import { creativeTextIssues, camposComErroObjetivo, opcionalVazio } from "../creativeRewriteGuard";
import { buildCampaignFacts } from "../campaignFactGuard";

const facts = buildCampaignFacts({
  input: { extraContext: "Oferta: aula do programa Pensamentos Automáticos por R$ 19,90, pagamento único, acesso por 7 dias." },
  clientProfile: {}, segment: "infoprodutos",
});
const base = {
  headline: "Aula por R$ 19,90",
  description: "Acesso por 7 dias",
  copy: "Aula do programa Pensamentos Automáticos por R$ 19,90, pagamento único, acesso por 7 dias.",
  hook: "Até quando você vai desistir de si?",
  cta: "Quero minha aula",
};

test("pain e solution vazios nao barram a geracao (campos opcionais)", () => {
  const c = { ...base, pain: "", solution: "" };
  assert.deepEqual(creativeTextIssues(c), []);
  assert.deepEqual(camposComErroObjetivo(c, facts), []);
});

test("espacos em branco tambem contam como nao enviado, em script e shortDescription", () => {
  const c = { ...base, pain: "   ", script: "", shortDescription: " " };
  assert.deepEqual(creativeTextIssues(c), []);
});

test("campo obrigatorio vazio continua bloqueando", () => {
  for (const campo of ["headline", "description", "copy", "hook", "cta"] as const) {
    const c = { ...base, [campo]: "" };
    assert.ok(creativeTextIssues(c).some(i => i.startsWith(`${campo}:`)), `${campo} vazio deveria bloquear`);
    assert.ok(camposComErroObjetivo(c, facts).some(x => x.campo === campo && x.motivos.includes("vazio")), `${campo} vazio deveria pedir conserto`);
  }
});

test("opcional preenchido segue validado: acima do limite ainda e erro", () => {
  const c = { ...base, pain: "x".repeat(400) };
  assert.ok(creativeTextIssues(c).some(i => i.startsWith("pain:")));
  assert.equal(opcionalVazio(c, "pain"), false);
});

test("o texto nao e inventado: pain e solution seguem vazios", () => {
  const c = { ...base, pain: "", solution: "" };
  creativeTextIssues(c);
  assert.equal(c.pain, "");
  assert.equal(c.solution, "");
});
