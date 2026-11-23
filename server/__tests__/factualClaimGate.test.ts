import test from "node:test";
import assert from "node:assert/strict";
import { buildCampaignFacts, validateCampaignFactIntegrity } from "../campaignFactGuard";
import { detectFactualClaims, unverifiedFactualClaims, detectRegulatedArea, detectRegulatedClaims } from "../factualClaimGate";
import { diagnosticarRevisao } from "../creativeReview";
import { inferirSegmento } from "../../shared/segmentInference";
import { resolveInitialCampaignSegment } from "../ai";
import { generationErrorText } from "../chatBriefing";

// F1/F2 (auditoria 23/11): alegacao factual sem lastro e barrada em qualquer
// segmento, inclusive "outro"; linguagem publicitaria comum e anuncio legitimo passam.

type Caso = { seg: string; niche: string; produto: string; extra: string; limpo: any; inventado: any };
const casos: Caso[] = [
  { seg: "imobiliario", niche: "imobiliaria corretor de imoveis", produto: "apartamento 2 quartos a venda", extra: "Apartamento 2 quartos, 68 m², Centro de Itajai. Valor R$ 450.000.", limpo: { headline: "Apartamento 2 quartos no Centro", copy: "68 m² no Centro de Itajai. Agende uma visita.", cta: "Agendar visita" }, inventado: { headline: "Ultimas unidades com 30% de desconto", copy: "Mais de 500 familias ja compraram.", cta: "Agendar visita" } },
  { seg: "saude", niche: "clinica odontologica dentista", produto: "avaliacao odontologica", extra: "Clinica odontologica em Joinville. Avaliacao inicial. Atendemos de segunda a sexta.", limpo: { headline: "Avaliacao odontologica em Joinville", copy: "Agende sua avaliacao inicial. Atendimento de segunda a sexta.", cta: "Agendar" }, inventado: { headline: "Clareamento garantido em 1 sessao", copy: "Resultado 100% garantido, aprovado pelo CRO. Sem dor.", cta: "Agendar" } },
  { seg: "advocacia", niche: "escritorio de advocacia trabalhista", produto: "consultoria trabalhista", extra: "Escritorio de advocacia trabalhista em Curitiba. Primeira conversa por WhatsApp.", limpo: { headline: "Duvidas trabalhistas? Fale com a gente", copy: "Escritorio de advocacia trabalhista em Curitiba. Primeira conversa por WhatsApp.", cta: "Falar no WhatsApp" }, inventado: { headline: "Ganhamos 98% das causas", copy: "Indenizacao garantida em 30 dias.", cta: "Falar no WhatsApp" } },
  { seg: "estetica", niche: "clinica de estetica facial", produto: "limpeza de pele", extra: "Clinica de estetica em Blumenau. Limpeza de pele e hidratacao.", limpo: { headline: "Limpeza de pele em Blumenau", copy: "Clinica de estetica. Conheca a limpeza de pele e a hidratacao.", cta: "Agendar" }, inventado: { headline: "Pele perfeita sem dor", copy: "Antes e depois comprovado. Aprovada pela Anvisa.", cta: "Agendar" } },
  { seg: "educacao", niche: "curso online infoproduto de marketing", produto: "curso de trafego pago", extra: "Curso online de trafego pago para iniciantes. Acesso por plataforma de aulas.", limpo: { headline: "Aprenda trafego pago do zero", copy: "Curso 100% online para iniciantes, com aulas na plataforma.", cta: "Saiba mais" }, inventado: { headline: "Fature R$ 10 mil em 30 dias", copy: "Alunos faturam 6 digitos. Garantia de resultado.", cta: "Saiba mais" } },
  { seg: "agro", niche: "agronegocio insumos agricolas", produto: "venda de insumos agricolas", extra: "Revenda de insumos agricolas no Oeste do Parana.", limpo: { headline: "Insumos agricolas no Oeste do Parana", copy: "Revenda de insumos. Fale com a equipe.", cta: "Falar com a equipe" }, inventado: { headline: "Aumente a produtividade em 40%", copy: "Aprovado pela Embrapa. Resultado comprovado.", cta: "Falar com a equipe" } },
  { seg: "logistica", niche: "transportadora logistica de cargas", produto: "transporte de cargas", extra: "Transportadora de cargas rodoviarias no Sul do Brasil.", limpo: { headline: "Transporte de cargas no Sul", copy: "Transportadora rodoviaria. Peca um orcamento.", cta: "Pedir orcamento" }, inventado: { headline: "Zero avarias garantido", copy: "Certificada ISO 9001. Mais de 300 transportadoras confiam.", cta: "Pedir orcamento" } },
  { seg: "varejo", niche: "loja de roupas moda feminina", produto: "vestidos", extra: "Loja de roupas femininas em Gaspar. Atendimento de segunda a sabado.", limpo: { headline: "Vestidos para toda ocasiao", copy: "Loja de roupas femininas em Gaspar. Venha conhecer a colecao.", cta: "Ver colecao" }, inventado: { headline: "A melhor loja da cidade", copy: "Mais de 5 mil clientes satisfeitas desde 2005.", cta: "Ver colecao" } },
  { seg: "ecommerce", niche: "loja online e-commerce de camisetas", produto: "camisetas", extra: "Loja online de camisetas. Frete para todo o Brasil.", limpo: { headline: "Camisetas para o dia a dia", copy: "Loja online com frete para todo o Brasil.", cta: "Comprar" }, inventado: { headline: "Eleita a loja numero 1", copy: "Mais de 10 mil clientes satisfeitos.", cta: "Comprar" } },
  { seg: "b2b", niche: "empresa B2B de software de gestao", produto: "software de gestao", extra: "Software de gestao para pequenas empresas. Demonstracao online.", limpo: { headline: "Gestao simples para a sua empresa", copy: "Software de gestao para pequenas empresas. Peca uma demonstracao online.", cta: "Pedir demonstracao" }, inventado: { headline: "Reduza custos em 50%", copy: "Usado por mais de 1.000 empresas. Cliente: Magazine Luiza.", cta: "Pedir demonstracao" } },
];

function validar(c: Caso, criativo: any, segmento?: string) {
  const seg = segmento ?? resolveInitialCampaignSegment(undefined, { niche: c.niche, productService: c.produto }, c.extra, c.produto);
  const facts = buildCampaignFacts({
    input: { name: c.produto, objective: "leads", platform: "meta", extraContext: c.extra },
    clientProfile: { companyName: c.seg, niche: c.niche, productService: c.produto },
    segment: seg,
  });
  return validateCampaignFactIntegrity([criativo], facts);
}

for (const c of casos) {
  test(`F1 ${c.seg}: anuncio com os fatos do briefing passa e o inventado e barrado`, () => {
    const ok = validar(c, c.limpo);
    assert.equal(ok.status, "passed", `limpo bloqueado: ${JSON.stringify(ok.conflicts)}`);
    const ruim = validar(c, c.inventado);
    assert.equal(ruim.status, "failed", "alegacao inventada passou");
    assert.ok(ruim.conflicts.length >= 1);
  });
}

test("F1: cada tipo de alegacao factual e detectado e, sem lastro, barrado em 'outro'", () => {
  const exemplos: Array<[string, string]> = [
    ["Ganhamos 98% das causas", "resultado_percentual"], ["Resultado 100% garantido", "garantia_resultado"],
    ["Certificada ISO 9001", "credencial"], ["Aprovado pela Embrapa", "credencial"],
    ["Usado por mais de 1.000 empresas", "prova_social_quantidade"], ["Cliente: Magazine Luiza", "cliente_nomeado"],
    ["Ha 20 anos no mercado", "tempo_mercado"], ["Desde 2015 cuidando de voce", "tempo_mercado"],
    ["Eleita a melhor pizza da cidade", "ranking"], ["Aumente a produtividade em 40%", "resultado_percentual"],
  ];
  for (const [texto, tipo] of exemplos) {
    const achados = unverifiedFactualClaims(texto, "");
    assert.ok(achados.some((a) => a.kind === tipo), `${texto} deveria ser ${tipo}: ${JSON.stringify(achados)}`);
  }
});

test("F1: o que o cliente confirmou no briefing passa; numero solto de outro contexto nao confirma", () => {
  assert.equal(unverifiedFactualClaims("Certificada ISO 9001", "empresa certificada iso 9001 desde a fundacao").length, 0);
  assert.equal(unverifiedFactualClaims("Ha 20 anos no mercado", "atuamos ha 20 anos no mercado de cargas").length, 0);
  assert.equal(unverifiedFactualClaims("Usado por mais de 1.000 empresas", "base de 1000 empresas ativas").length, 0);
  assert.equal(unverifiedFactualClaims("Cliente: Magazine Luiza", "projeto feito para magazine luiza").length, 0);
  // "98" aparece num telefone, mas nao como percentual.
  assert.equal(unverifiedFactualClaims("Ganhamos 98% das causas", "telefone 41 99898 1234").length, 1);
  assert.equal(unverifiedFactualClaims("Ganhamos 98% das causas", "taxa de exito de 98% nas causas").length, 0);
  // Outro numero, outro dado: nao herda confirmacao.
  assert.equal(unverifiedFactualClaims("Mais de 900 clientes", "mais de 500 clientes").length, 1);
});

test("F1: linguagem publicitaria comum e oferta legitima nao sao alegacoes factuais", () => {
  const legitimos = [
    "Atendimento de qualidade", "A melhor escolha para voce", "Peca um orcamento sem compromisso", "Curso 100% online",
    "Parcele em ate 12x", "0% de juros", "Equipe com 3 profissionais", "Loja online com frete para todo o Brasil",
    "Referencia em odontologia", "Cliente Novo ganha brinde", "Agende uma visita", "Fale com um especialista",
    "30% de desconto", "10% de entrada", "Resultado do exame em 24 horas",
  ];
  for (const t of legitimos) assert.deepEqual(detectFactualClaims(t).map((c) => c.value), [], `falso positivo: ${t}`);
});

test("F1: profissoes regulamentadas tem regra propria mesmo com a confirmacao do cliente", () => {
  assert.equal(detectRegulatedArea("escritorio de advocacia trabalhista"), "juridico");
  assert.equal(detectRegulatedArea("clinica odontologica"), "saude");
  assert.equal(detectRegulatedArea("consultoria financeira e investimentos"), "financeiro");
  assert.equal(detectRegulatedArea("loja de camisetas"), null);
  assert.ok(detectRegulatedClaims("Cura garantida", "saude").length);
  assert.ok(detectRegulatedClaims("Antes e depois impressionante", "saude").length);
  assert.ok(detectRegulatedClaims("Indenizacao garantida", "juridico").length);
  assert.ok(detectRegulatedClaims("Rentabilidade garantida de 3% ao mes", "financeiro").length);
  assert.deepEqual(detectRegulatedClaims("Cura garantida", null), []);
  // Mesmo com o cliente "confirmando", a regra da profissao segue valendo.
  const c = casos[2];
  const facts = buildCampaignFacts({
    input: { name: c.produto, objective: "leads", platform: "meta", extraContext: c.extra + " Indenizacao garantida." },
    clientProfile: { companyName: "adv", niche: c.niche, productService: c.produto }, segment: "outro",
  });
  const v = validateCampaignFactIntegrity([{ headline: "Indenizacao garantida", copy: "Fale conosco", cta: "WhatsApp" }], facts);
  assert.equal(v.status, "failed");
  assert.ok(v.conflicts.some((x) => x.reason === "regulated_advertising_claim"));
});

test("F1: a revisao do criativo e a mensagem ao usuario tambem cobrem as novas alegacoes sem expor o valor", () => {
  const c = casos[6];
  const facts = buildCampaignFacts({
    input: { name: c.produto, objective: "leads", platform: "meta", extraContext: c.extra },
    clientProfile: { companyName: "x", niche: c.niche, productService: c.produto }, segment: "outro",
  });
  const d = diagnosticarRevisao({ headline: "Transporte de cargas", copy: "Certificada ISO 9001", description: "Orcamento", cta: "Pedir orcamento", finalScore: 90 }, facts);
  assert.ok(d.motivos.includes("fatos"));
  const msg = generationErrorText("FACT_CONFLICT: x. creatives.0.copy: certificada iso 9001 (unverified_factual_claim_credencial)");
  assert.doesNotMatch(msg, /iso 9001/i);
  assert.match(msg, /afirmacao verificavel/i);
});

test("F2: o segmento e inferido pelo briefing inteiro, sem acento, e 'outro' so quando nao ha indicio", () => {
  assert.equal(inferirSegmento({ niche: "medico dermatologista" }).segment, "saude_estetica");
  assert.equal(inferirSegmento({ niche: "psicologa" }).segment, "saude_estetica");
  assert.equal(inferirSegmento({ niche: "", extraContext: "Sou nutricionista e atendo online" }).segment, "saude_estetica");
  assert.equal(inferirSegmento({ niche: "incorporadora lancamento" }).segment, "imoveis_venda");
  assert.equal(inferirSegmento({ niche: "restaurante delivery" }).confianca, "alta");
  assert.equal(inferirSegmento({ niche: "advogado trabalhista" }).segment, "outro");
  assert.equal(inferirSegmento({}).origem, "nenhuma");
  assert.equal(resolveInitialCampaignSegment(undefined, { niche: "medico dermatologista", productService: "consulta" }, "", "Consulta"), "saude_estetica");
});
