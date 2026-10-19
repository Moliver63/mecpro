import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizarAssuntoVisual, fatosVisuaisDoBriefing,
  ORCAMENTO_FATOS_VISUAIS, MAX_FATOS_VISUAIS,
} from "../imageSubjectSafety";

/**
 * Pedido do Michel (19/10): "essa alteracao precisa cobrir possiveis situacoes
 * que venham surgir no futuro".
 *
 * O jeito de testar isso NAO e listar mais palavras e afirmar que estao na
 * lista — seria o mesmo teste que passava quando o filtro tinha vocabulario de
 * imovel. Este arquivo afirma PROPRIEDADE DA SAIDA sobre um corpus adversarial:
 * qualquer que seja o briefing, certas coisas nunca saem do outro lado.
 *
 * Com isso, um rotulo que eu nao imaginei quebra o teste pela propriedade, nao
 * pela ausencia na lista.
 */

// Briefings plausiveis que ainda nao existiram, de segmentos variados, com
// rotulos que eu deliberadamente NAO coloquei no vocabulario.
const CORPUS_ADVERSARIAL = [
  "Produto: Curso e jornada de autoconhecimento pelo Metodo Shadia Hasan",
  "Diferencial: jornada vivencial com imersao em realidade virtual",
  "Diferencial: atendimento em VR com acompanhamento individual",
  "tipo: apartamento de dois quartos com varanda gourmet",
  "mobilia: cozinha planejada e armarios embutidos",
  "Venda: site oficial shadiahasan.com e/ou Hotmart",
  "Contato: ola@shadiahasan.com.br",
  "Site: https://shadiahasan.com/aula-gratis",
  "Redes sociais: @shadiahasan no Instagram",
  "Preco: assinatura de R$ 99,90/mes com certificado",
  "Pagamento: PIX, boleto ou cartao de credito em 12x",
  "CNPJ: 12.345.678/0001-99",
  "Horario de atendimento: segunda a sexta, 9h as 18h",
  "Politica de cancelamento: ate 30 dias antes do inicio",
  "Reembolso: garantia de 7 dias",
  "Frete: gratis acima de R$ 199",
  "Cupom: PRIMEIRA10 para 10% de desconto",
  "Entrega: em ate 5 dias uteis",
  "Suporte: via WhatsApp (11) 99999-0000",
  "Checkout: plataforma Hotmart",
  "Publico: adultos interessados em autoconhecimento e psicologia integrativa",
  "Ambiente: estudio com luz natural e plantas",
  "Equipe: tres fisioterapeutas e um educador fisico",
  "Compre no site oficial agora mesmo",
  "Parceria: rede de clinicas conveniadas (ver lista)",
];

test("INVARIANTE: nada que o FLUX desenharia como texto sai do filtro", () => {
  const saida = fatosVisuaisDoBriefing(CORPUS_ADVERSARIAL, 10_000, 100).join(" | ");

  // Estes sao os danos observados em producao nesta semana, cada um com log:
  // 'Agila' (15/10, headline desenhada), dominio e marca (19/10).
  const proibidos: Array<[string, RegExp]> = [
    ["digito", /\d/],
    ["URL", /https?:|www\./i],
    ["dominio", /\.(com|br|net|org|io|app|me|co|shop|store|online|site)\b/i],
    ["e-mail ou arroba", /@/],
    ["moeda", /r\$|reais/i],
    ["percentual", /%/],
    ["aparte em parenteses", /\(|\)/],
  ];
  for (const [nome, padrao] of proibidos) {
    assert.doesNotMatch(saida, padrao, `${nome} chegou no prompt de imagem: ${saida}`);
  }
});

test("INVARIANTE: o fato visual de QUALQUER segmento continua chegando", () => {
  const saida = fatosVisuaisDoBriefing(CORPUS_ADVERSARIAL, 10_000, 100).join(" | ");

  // Infoproduto — era o caso que o vocabulario de imovel descartava inteiro.
  assert.match(saida, /realidade virtual/i);
  assert.match(saida, /autoconhecimento/i);
  // Imovel — o caminho que funcionava continua funcionando, agora sem caso
  // especial: o rotulo sai e o valor carrega a cena.
  assert.match(saida, /apartamento de dois quartos/i);
  assert.match(saida, /cozinha planejada/i);
  // Servico/saude.
  assert.match(saida, /estudio com luz natural/i);
  assert.match(saida, /fisioterapeutas/i);
});

// A regra que eu considerei e descartei, registrada como teste pra nao voltar.
test("sigla em CAIXA ALTA nao e barrada: barraria o proprio VR", () => {
  const saida = fatosVisuaisDoBriefing(["Diferencial: atendimento em VR com acompanhamento"]);
  assert.match(saida.join(" "), /\bVR\b/, "VR e o fato que a semana toda tentou fazer chegar na imagem");
});

test("fato sem rotulo tambem e filtrado", () => {
  // O filtro antigo olhava so o rotulo; frase solta era invisivel pra ele.
  assert.deepEqual(fatosVisuaisDoBriefing(["Compre no site oficial agora mesmo"]), []);
  assert.deepEqual(fatosVisuaisDoBriefing(["Fale com a gente no WhatsApp"]), []);
  // E frase solta visual passa.
  assert.match(fatosVisuaisDoBriefing(["Estudio amplo com luz natural"]).join(" "), /luz natural/i);
});

test("orcamento e de caracteres, nao so de contagem", () => {
  const verboso = Array.from({ length: 20 }, (_, i) =>
    `Ambiente ${"x".repeat(0)}: sala ampla com luz natural, plantas, madeira clara e tecido cru numero ${i}`);
  const saida = fatosVisuaisDoBriefing(verboso);
  assert.ok(saida.length <= MAX_FATOS_VISUAIS, `${saida.length} fatos`);
  const total = saida.join("").length;
  // Seis fatos curtos somam pouco; seis verbosos diluiriam o assunto inteiro.
  assert.ok(total <= ORCAMENTO_FATOS_VISUAIS + 120, `orcamento estourado: ${total}`);
});

test("entrada torta nao quebra nem inventa", () => {
  for (const torta of [null, undefined, "nao e array", 42, {}, [null, undefined, 7, {}, ""]]) {
    assert.deepEqual(fatosVisuaisDoBriefing(torta as any), [], JSON.stringify(torta));
  }
  assert.equal(sanitizarAssuntoVisual(undefined as any), "");
  assert.equal(sanitizarAssuntoVisual("   "), "");
});

// Limite conhecido, declarado de proposito: marca sem dominio nao e detectavel
// por forma, e lista de marcas e exatamente o que envelhece. Fica para o portao
// visual, que reprova logo via `blockers`.
test("limite conhecido: marca sem dominio passa, e isso esta documentado", () => {
  const saida = fatosVisuaisDoBriefing(["Diferencial: parceria oficial com a Nike"]).join(" ");
  assert.match(saida, /Nike/, "se isto mudar, o comentario de imageSubjectSafety precisa mudar junto");
});
