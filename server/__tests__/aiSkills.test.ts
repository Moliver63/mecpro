import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lerHabilidade, habilidadesDisponiveis, comporInstrucao, limparCacheDeHabilidades } from "../aiSkills";

/**
 * Habilidades sao instrucao, nao integracao (24/10).
 *
 * O ponto que estes testes protegem: habilidade NUNCA pode ser pre-requisito.
 * Se um arquivo sumir, ficar malformado ou o nome pedido nao existir, a
 * geracao de campanha tem que seguir exatamente como seguia antes. O produto
 * nao pode parar de funcionar porque alguem editou um markdown.
 */

function pastaTemporaria(arquivos: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "habilidades-"));
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    writeFileSync(join(dir, nome), conteudo, "utf8");
  }
  return dir;
}

const VALIDA = `---
name: exemplo
description: Fazer alguma coisa bem feita.
---

Primeiro passo.
Segundo passo.`;

test("le frontmatter e corpo", () => {
  const h = lerHabilidade(VALIDA, "arquivo");
  assert.equal(h?.nome, "exemplo");
  assert.equal(h?.descricao, "Fazer alguma coisa bem feita.");
  assert.match(h!.instrucoes, /Primeiro passo/);
  assert.doesNotMatch(h!.instrucoes, /description:/, "frontmatter nao entra no corpo");
});

test("arquivo malformado e descartado, nao lanca", () => {
  assert.equal(lerHabilidade("sem frontmatter nenhum", "x"), null);
  assert.equal(lerHabilidade("---\nname: so-nome\n---\n\ncorpo", "x"), null, "sem description nao vale");
  assert.equal(lerHabilidade("---\ndescription: tem\n---\n\n", "x"), null, "sem corpo nao vale");
});

test("o nome do arquivo serve de nome quando o frontmatter nao traz", () => {
  const h = lerHabilidade("---\ndescription: algo\n---\n\ncorpo", "do-arquivo");
  assert.equal(h?.nome, "do-arquivo");
});

test("habilidade quebrada no meio das boas nao derruba as outras", () => {
  const dir = pastaTemporaria({
    "boa.md": VALIDA,
    "quebrada.md": "isto nao tem frontmatter",
    "outra.md": "---\nname: outra\ndescription: Outra coisa.\n---\n\nCorpo da outra.",
  });
  try {
    const lista = habilidadesDisponiveis(dir);
    assert.equal(lista.length, 2);
    assert.deepEqual(lista.map((h) => h.nome).sort(), ["exemplo", "outra"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pasta inexistente devolve lista vazia, sem lancar", () => {
  assert.deepEqual(habilidadesDisponiveis("/caminho/que/nao/existe"), []);
});

test("compor injeta a habilidade depois da instrucao base", () => {
  const dir = pastaTemporaria({ "boa.md": VALIDA });
  try {
    const r = comporInstrucao("INSTRUCAO BASE", ["exemplo"], dir);
    assert.match(r, /^INSTRUCAO BASE/);
    assert.match(r, /## exemplo/);
    assert.match(r, /Primeiro passo/);
    assert.ok(r.indexOf("INSTRUCAO BASE") < r.indexOf("Primeiro passo"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("nome desconhecido nao quebra: devolve a base intacta", () => {
  // Habilidade e melhoria, nunca pre-requisito.
  const dir = pastaTemporaria({ "boa.md": VALIDA });
  try {
    assert.equal(comporInstrucao("BASE", ["nao-existe"], dir), "BASE");
    assert.equal(comporInstrucao("BASE", [], dir), "BASE");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a composicao avisa o modelo a nao inventar fato de cliente", () => {
  // O risco da habilidade e justamente produzir texto generico convincente.
  const dir = pastaTemporaria({ "boa.md": VALIDA });
  try {
    const r = comporInstrucao("BASE", ["exemplo"], dir);
    assert.match(r, /Nao invente dado/i);
    assert.match(r, /briefing/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── As habilidades que vao no repositorio ────────────────────────────────
test("as habilidades do produto carregam e tem conteudo de verdade", () => {
  limparCacheDeHabilidades();
  const lista = habilidadesDisponiveis();
  const nomes = lista.map((h) => h.nome).sort();
  assert.deepEqual(nomes, ["gancho", "legenda", "planejamento-de-conteudo", "roteiro-de-reel"]);
  for (const h of lista) {
    assert.ok(h.instrucoes.length > 400, `${h.nome} curta demais pra ser util`);
    assert.ok(h.descricao.length > 20, `${h.nome} sem descricao util`);
  }
});

test("nenhuma habilidade traz fato de cliente embutido", () => {
  // Habilidade e processo; publico, preco e oferta vem do perfil do cliente.
  // Uma habilidade com "Shadia" dentro so serve pra um cliente.
  limparCacheDeHabilidades();
  for (const h of habilidadesDisponiveis()) {
    assert.doesNotMatch(h.instrucoes, /shadia|19,90|R\$\s*\d/i, `${h.nome} tem dado de cliente`);
  }
});

test("as habilidades repetem os limites que o produto ja impoe", () => {
  // Fact Guard barra na saida; a habilidade evita que o modelo tente.
  limparCacheDeHabilidades();
  const texto = habilidadesDisponiveis().map((h) => h.instrucoes).join("\n").toLowerCase();
  assert.match(texto, /promessa de resultado|promessa, prazo|prometa resultado/);
  assert.match(texto, /depoimento/);
  assert.match(texto, /briefing/);
});
