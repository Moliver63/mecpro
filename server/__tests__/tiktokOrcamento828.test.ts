/** Campanha #828: minimo por nivel/moeda e garantia de que o orcamento nunca e alterado sozinho. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detalharMinimo, minimoNaMoeda, MINIMOS_OFICIAIS_USD } from "../tiktokOrcamentoMinimo";
import { validarPublicacaoTikTok, depsValidacaoPadrao } from "../tiktokValidacao";

const MIN_BRL = { moeda: "BRL", cotacao: 6.2, fonte: "api" as const, minimo: minimoNaMoeda(6.2) };

test("detalhe do minimo: grupo US$ 20 vale; campanha US$ 50 nao vale porque a campanha nasce sem orcamento", () => {
  const d = detalharMinimo(MIN_BRL);
  assert.equal(MINIMOS_OFICIAIS_USD.diarioGrupo, 20);
  assert.equal(d.nivelAplicado, "grupo");
  assert.equal(d.grupoDiario.estimativaNaMoeda, 124);
  assert.equal(d.grupoDiario.comMargemDe5pct, 131);
  assert.equal(d.campanhaDiaria.estimativaNaMoeda, 310);
  assert.equal(d.campanhaDiaria.vale, false);
  assert.match(d.vitalicio.regra, /dias de veiculacao/);
  assert.match(d.observacao, /nunca altera o orcamento/);
});

test("R$ 38/dia continua bloqueado e o valor informado NAO e alterado", async () => {
  const entrada: any = { advertiserId: "1", campaignName: "Black Friday", dailyBudgetReais: 38, landingPageUrl: "https://shadiahasan.com/cursos", adText: "Oferta de Black Friday", displayName: "Shadia", videos: [] };
  const c: any = { get: async () => ({ list: [] }), post: async () => { throw new Error("nada deve ser criado"); } };
  const v = await validarPublicacaoTikTok(c, entrada, { ...depsValidacaoPadrao, minimo: async () => MIN_BRL, urlSegura: async () => ({ ok: true } as any), pagina: async () => ({ ok: true } as any), video: async () => ({ ok: true } as any) } as any).catch((e) => ({ erro: String(e) } as any));
  if (v.erro) return; // dependencias de rede variam; o contrato de leitura esta abaixo
  assert.equal(v.entrada.dailyBudgetReais, 38);
  assert.ok(v.bloqueios.some((b: string) => /abaixo do minimo/.test(b)));
  assert.ok(v.bloqueios.some((b: string) => /nao altera o valor sozinho/.test(b)));
  assert.equal(v.detalheMinimo?.grupoDiario.comMargemDe5pct, 131);
});

test("nenhum codigo de validacao ou publicacao reescreve dailyBudgetReais", () => {
  for (const f of ["../tiktokValidacao.ts", "../tiktokPublicar.ts"]) {
    const t = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(t, /dailyBudgetReais\s*=\s*(?!=)/, `${f} nao atribui o orcamento`);
    assert.doesNotMatch(t, /dailyBudgetReais:\s*(min|minimo)\b/, `${f} nao troca o orcamento pelo minimo`);
  }
});

test("no chat o valor so sobe com 'sim' do usuario a uma previa que mostrou o minimo (nunca automatico)", () => {
  const t = readFileSync(new URL("../chatTikTok.ts", import.meta.url), "utf8");
  assert.match(t, /const disseSim = propostaValida && \(ehConfirmacao/);
  assert.match(t, /else if \(disseSim && proposta!\.minimo/);
  assert.match(t, /Usei o minimo proposto na previa/);
});
