// Guarda de oferta comercial.
//
// Compara o que a copy PROMETE (gratuidade, desconto, bonus, prazo de acesso,
// garantia, prazo da oferta) com o que o cliente CONFIRMOU no briefing/perfil
// daquele rascunho. Regra estrutural, vale para qualquer cliente e segmento.
//
// Por que existe: o Fact Guard so validava preco. "Aula gratis", "sem pagar
// nada", "50% de desconto", "bonus gratis" e "acesso por 30 dias" passavam
// mesmo quando a oferta confirmada era uma aula por R$ 19,90 com 7 dias de
// acesso. Alem disso, o modelo de segmento sugere CTAs como "Aula gratis" e
// "Avaliacao gratuita" para o objetivo leads, e leads nao autoriza presumir
// oferta gratuita. A fonte da verdade e sempre `confirmedClaimsRaw`.
//
// Limites (ver docs/specs/2026-11-19-validacao-oferta-comercial.md):
// regra por padrao de texto, nao prova semantica. Parafrases raras, ironia e
// afirmacoes dentro de imagem nao sao cobertas.
import { normalizeMoneyValue, normalizeText } from "./factNormalizer";

export type OfferClaimKind = "gratuidade" | "desconto" | "bonus" | "acesso" | "garantia" | "prazo_oferta";

export type OfferClaimSuggestion = {
  // Trecho exato (do texto original) que sera trocado.
  find: string;
  // Texto novo, vazio quando a sugestao e remover o trecho.
  replaceWith: string;
  // Fato confirmado que sustenta a sugestao, ou motivo da remocao.
  basis: string;
};

export type OfferClaimConflict = {
  kind: OfferClaimKind;
  // Trecho do texto ORIGINAL que gerou o conflito.
  value: string;
  reason: string;
  // null quando nao ha fato confirmado para propor troca: pedir confirmacao.
  suggestion: OfferClaimSuggestion | null;
  needsOfferConfirmation: boolean;
  // Por que a gratuidade nao foi aceita e o que o usuario precisa confirmar:
  // - briefing_campanha: so o perfil da conta cita gratuidade; o briefing da campanha informa preco.
  // - snapshot_antigo: rascunho gerado antes da checagem por campanha; a origem da gratuidade nao da para verificar.
  // - oferta_ambigua: o briefing chama o mesmo produto de pago e de gratuito sem diferenciar.
  confirmacao?: ConfirmacaoDeOferta;
};

export type ConfirmacaoDeOferta = "briefing_campanha" | "snapshot_antigo" | "oferta_ambigua";

export type OfferGuardContext = {
  // Texto normalizado (sem acento, minusculo) de todo briefing + perfil.
  confirmedClaimsRaw: string;
  // Preco confirmado (qualquer nicho). Ex.: "R$ 19,90".
  price?: string;
  // Texto normalizado SO do briefing desta campanha (sem o perfil da conta) e
  // dos campos de produto dela. O perfil descreve a conta inteira e pode citar
  // OUTRA oferta ("aula gratuita"); com preco positivo nesta campanha, so este
  // texto confirma gratuidade. Snapshots gravados antes dessa checagem nao o
  // trazem (undefined): sem como separar perfil de briefing, a gratuidade nao
  // e aceita ate o briefing da campanha confirma-la (rascunho novo).
  campaignClaimsRaw?: string;
  campaignProductRaw?: string;
};

type FatosParaOferta = {
  confirmedClaimsRaw: string;
  campaignClaimsRaw?: string;
  campaignProductRaw?: string;
  genericProductPrice?: string;
  realEstate?: { price?: string };
};

/** Contexto do guarda de oferta a partir do snapshot de fatos da propria campanha. */
export function contextoDeOferta(facts: FatosParaOferta): OfferGuardContext {
  return {
    confirmedClaimsRaw: facts.confirmedClaimsRaw,
    price: facts.realEstate?.price || facts.genericProductPrice,
    campaignClaimsRaw: facts.campaignClaimsRaw,
    campaignProductRaw: facts.campaignProductRaw,
  };
}

type Match = { raw: string; index: number; end: number; groups: string[] };

const UNIDADE_DIAS: Record<string, number> = { d: 1, s: 7, m: 30, a: 365, h: 1 / 24 };
const NUMERO_POR_EXTENSO: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8,
  nove: 9, dez: 10, doze: 12, quinze: 15, vinte: 20, trinta: 30, sessenta: 60, noventa: 90,
};
const NUM = String.raw`(?:\d{1,4}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|doze|quinze|vinte|trinta|sessenta|noventa)`;
const UNIT = String.raw`(?:dias?|semanas?|meses|mes|anos?|horas?)`;

const NEGACAO_ANTES = /\b(?:nao|nunca|jamais|longe\s+de\s+ser|deixa\s+de\s+ser)\b/;

const MESES = "janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";
const DIAS_SEMANA = "domingo|segunda|terca|quarta|quinta|sexta|sabado";

function matchesOf(text: string, pattern: RegExp): Match[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  const re = new RegExp(pattern.source, flags);
  const out: Match[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({ raw: m[0], index: m.index, end: m.index + m[0].length, groups: m.slice(1) });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

// Negacao na mesma oracao, ate 30 caracteres antes do trecho.
function negadoAntes(text: string, index: number): boolean {
  const antes = text.slice(Math.max(0, index - 30), index);
  const corte = Math.max(...[".", "!", "?", "\n", ";", ":", ","].map((p) => antes.lastIndexOf(p)));
  return NEGACAO_ANTES.test(antes.slice(corte + 1));
}

function paraDias(numero: string, unidade: string): number | null {
  const n = /^\d+$/.test(numero) ? Number(numero) : NUMERO_POR_EXTENSO[numero];
  if (!Number.isFinite(n)) return null;
  const fator = UNIDADE_DIAS[unidade.startsWith("mes") ? "m" : unidade[0]];
  return fator === undefined ? null : n * fator;
}

function valoresMonetarios(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/r\$\s*\d[\d.,]*/g)) {
    const v = normalizeMoneyValue(m[0]);
    if (v) out.push(v);
  }
  return out;
}

// Normaliza sem mudar o comprimento do texto: cada caractere vira exatamente
// um caractere (acento removido, minusculo). Assim os indices achados no texto
// normalizado valem para o texto ORIGINAL e o trecho citado ao usuario e o que
// ele realmente escreveu. Se algum caractere mudar de tamanho, cai no
// normalizeText e devolve o trecho ja normalizado.
function normalizarPreservandoIndices(original: string): { n: string; exato: boolean } {
  let n = "";
  for (const ch of original) {
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    n += base.length === ch.length ? base : ch.toLowerCase().length === ch.length ? ch.toLowerCase() : "?".repeat(ch.length);
  }
  if (n.length === original.length) return { n, exato: true };
  return { n: normalizeText(original), exato: false };
}

let EXATO = true;
function trechoOriginal(original: string, normalizado: string, index: number, end: number): string {
  return EXATO && original.length === normalizado.length ? original.slice(index, end) : normalizado.slice(index, end);
}

// ── Gratuidade ──────────────────────────────────────────────────────────────
const PALAVRA_GRATIS = String.raw`(?:gratis|gratuit[oa]s?|de\s+graca|sem\s+custos?(?!\s+(?:adicion(?:al|ais)|extras?|ocultos?|de|do|da|para|com)(?![a-z])))`;
const GRATIS_RE = new RegExp(String.raw`(?<![a-z])${PALAVRA_GRATIS}(?![a-z])`);
// Promessa de que a oferta inteira nao custa nada. Nao depende de negacao
// curta ("nao pague nada" AFIRMA gratuidade).
const OFERTA_TODA_GRATIS: RegExp[] = [
  /(?<![a-z])sem\s+pagar\s+(?:nada|um\s+centavo|nenhum\s+centavo|absolutamente\s+nada)(?![a-z])/,
  /(?<![a-z])nao\s+(?:pague|paga|precisa\s+pagar|vai\s+pagar|custa|cobramos)\s+nada(?![a-z])/,
  /(?<![a-z])nada\s+a\s+pagar(?![a-z])/,
  /(?<![a-z\d.,])(?:zero|0)\s+reais(?![a-z])/,
  /(?<![a-z\d])r\$\s*0(?:[.,]0+)?(?![\d.,]*[1-9])(?!\d)/,
  /(?<![a-z])(?:custo|investimento)\s+zero(?![a-z])/,
  /(?<![a-z])por\s+nada(?![a-z])/,
];
const PARCIAL_SEM_PAGAR = /(?<![a-z])sem\s+pagar\s+(?!nada|um\s+centavo|nenhum\s+centavo|absolutamente)([a-z]{3,})/;

const STOP_SUJEITO = new Set([
  "de", "da", "do", "das", "dos", "a", "o", "as", "os", "um", "uma", "e", "com", "para", "pra", "por",
  "sua", "seu", "suas", "seus", "na", "no", "em", "voce", "agora", "hoje", "aqui", "ja", "tambem", "total",
  "mais", "so", "para", "que", "ao", "aos", "nosso", "nossa",
]);

const SUJEITOS_BRINDE = new Set([
  "bonus", "brinde", "brindes", "presente", "extra", "ebook", "e-book", "checklist", "planilha", "guia", "material",
  "kit", "amostra", "modelo", "template", "mentoria", "sessao",
]);

function sujeitoDoGratis(n: string, index: number, end: number): string | null {
  const antes = n.slice(0, index).split(/[^a-z0-9-]+/).filter(Boolean);
  for (let i = antes.length - 1, passos = 0; i >= 0 && passos < 3; i--, passos++) {
    if (!STOP_SUJEITO.has(antes[i])) return antes[i];
  }
  const depois = n.slice(end).split(/[^a-z0-9-]+/).filter(Boolean);
  for (let i = 0; i < depois.length && i < 3; i++) {
    if (!STOP_SUJEITO.has(depois[i])) return depois[i];
  }
  return null;
}

function stem(word: string): string {
  return word.length > 5 ? word.slice(0, 5) : word;
}

const SUJEITOS_DA_OFERTA = new Set([
  "vaga", "vagas", "aula", "aulas", "curso", "acesso", "inscricao", "participacao", "evento", "webinar", "oferta",
  "produto", "servico", "conteudo", "treinamento", "workshop", "live", "entrada", "teste", "demo", "demonstracao",
  "aula-teste", "experiencia", "palestra", "encontro", "turma", "ingresso",
]);

// Gratuidade: so o briefing da PROPRIA campanha confirma, com ou sem preco.
// Perfil da conta, outra campanha e o texto misturado de snapshot antigo nao.
//
// - Base unica: o briefing da campanha (campaignClaimsRaw). "Gratis" passa quando
//   o briefing diz "gratis/gratuito" colado no MESMO sujeito (mesma frase, ate ~18
//   caracteres) ou, sem preco, quando a gratuidade e da oferta em geral.
//   Gratuidade de brinde ("bonus gratuito") nao vale para o produto.
// - Gratuidade que existe so fora do briefing da campanha (perfil) pede
//   confirmacao no briefing, tenha a campanha preco ou nao.
// - Se o briefing chama o produto anunciado de pago (preco) e de gratuito, sem
//   qualificar a parte gratuita ("introdutoria", "demonstracao", "bonus"...),
//   pede esclarecimento em vez de decidir.
// - Snapshot antigo (campaignClaimsRaw ausente): nada confirma; pede confirmacao.
// Tipo plano: com strict:false uniao discriminada nao estreita.
type VereditoGratuidade = { ok: boolean; confirmacao?: ConfirmacaoDeOferta };

const FIM_DE_FRASE = /[.;!?\n]/;
const QUALIFICADOR_DE_PARTE_GRATUITA = /(?<![a-z])(?:introdutori[ao]s?|demonstrativ[ao]s?|demonstracao|experimental|experiencia|primeira|amostra|degustacao|teste|trecho|modulo|bonus|brinde|brindes)(?![a-z])/;

function marcasDeGratuidade(t: string): Match[] {
  return matchesOf(t, GRATIS_RE).filter((m) => !negadoAntes(t, m.index));
}

function limitesDaFrase(t: string, index: number, end: number): [number, number] {
  let ini = index;
  while (ini > 0 && !FIM_DE_FRASE.test(t[ini - 1])) ini--;
  let fim = end;
  while (fim < t.length && !FIM_DE_FRASE.test(t[fim])) fim++;
  return [ini, fim];
}

function avaliarGratuidade(sujeito: string | null, ctx: OfferGuardContext): VereditoGratuidade {
  const positivo = precoPositivo(ctx.price);
  const todo = ctx.confirmedClaimsRaw;
  const campanha = ctx.campaignClaimsRaw;
  if (campanha === undefined) {
    return { ok: false, ...(marcasDeGratuidade(todo).length ? { confirmacao: "snapshot_antigo" as const } : {}) };
  }
  const base = campanha;
  const donoBrinde = (m: Match) => SUJEITOS_BRINDE.has(sujeitoDoGratis(base, m.index, m.end) ?? "");
  const marcas = marcasDeGratuidade(base).filter((m) => !donoBrinde(m));

  if (positivo && sujeito && ctx.campaignProductRaw?.includes(stem(sujeito))) {
    const s = stem(sujeito);
    const contraditorio = marcas.some((m) => {
      const [ini, fim] = limitesDaFrase(base, m.index, m.end);
      const frase = base.slice(ini, fim);
      return frase.includes(s) && !QUALIFICADOR_DE_PARTE_GRATUITA.test(frase);
    });
    if (contraditorio) return { ok: false, confirmacao: "oferta_ambigua" };
  }

  if (marcas.length) {
    if (sujeito) {
      const s = stem(sujeito);
      const colada = marcas.some((m) => {
        const [ini, fim] = limitesDaFrase(base, m.index, m.end);
        return base.slice(Math.max(ini, m.index - 18), Math.min(fim, m.end + 18)).includes(s);
      });
      if (colada) return { ok: true };
      if (!positivo && SUJEITOS_DA_OFERTA.has(sujeito)) return { ok: true };
    } else if (!positivo) {
      return { ok: true };
    }
  }
  // Nao confirmado. Gratuidade que existe so fora do briefing da campanha
  // (perfil da conta) pede a confirmacao no briefing da campanha.
  if (marcasDeGratuidade(todo).length && !marcasDeGratuidade(campanha).filter((m) => !SUJEITOS_BRINDE.has(sujeitoDoGratis(campanha, m.index, m.end) ?? "")).length) {
    return { ok: false, confirmacao: "briefing_campanha" };
  }
  return { ok: false };
}

// Item/material gratuito (e-book, checklist...) confirmado no briefing: a regra de
// bonus decide se o ITEM e citado. Nao decide a gratuidade do produto anunciado
// (ver avaliarGratuidade).
function itemGratuitoConfirmado(confirmed: string, sujeito: string | null, preco: string | undefined): boolean {
  const marcas = marcasDeGratuidade(confirmed);
  if (!marcas.length) return false;
  if (sujeito) {
    const s = stem(sujeito);
    if (marcas.some((m) => confirmed.slice(Math.max(0, m.index - 18), m.end + 18).includes(s))) return true;
    return !precoPositivo(preco) && SUJEITOS_DA_OFERTA.has(sujeito);
  }
  return !precoPositivo(preco);
}

function precoPositivo(preco: string | undefined): boolean {
  if (!preco) return false;
  const v = normalizeMoneyValue(preco);
  const m = v.match(/^([\d.]+)\s+brl$/);
  return !!m && Number(m[1]) > 0;
}

function sugestaoDePreco(trecho: string, preco: string | undefined): OfferClaimSuggestion | null {
  if (!precoPositivo(preco)) return null;
  return { find: trecho, replaceWith: `por ${preco}`, basis: `preco confirmado ${preco}` };
}

function detectGratuidade(texto: string, n: string, ctx: OfferGuardContext, out: OfferClaimConflict[]) {
  const confirmed = ctx.confirmedClaimsRaw;
  const vistos = new Set<string>();
  const push = (c: OfferClaimConflict) => {
    const k = `${c.kind}:${c.value}`;
    if (!vistos.has(k)) {
      vistos.add(k);
      out.push(c);
    }
  };
  // Conflito de gratuidade. Preco so entra na sugestao quando e o preco confirmado
  // da campanha; em oferta ambigua nao ha sugestao (nao se decide pelo usuario).
  const conflito = (trecho: string, v: VereditoGratuidade, parcial = false): OfferClaimConflict => {
    const confirmacao = v.confirmacao;
    return {
      kind: "gratuidade",
      value: trecho,
      reason: "offer_free_claim_not_confirmed",
      suggestion: parcial || confirmacao === "oferta_ambigua" ? null : sugestaoDePreco(trecho, ctx.price),
      needsOfferConfirmation: parcial || !!confirmacao || !precoPositivo(ctx.price),
      ...(confirmacao ? { confirmacao } : {}),
    };
  };

  for (const re of OFERTA_TODA_GRATIS) {
    for (const m of matchesOf(n, re)) {
      const v = avaliarGratuidade(null, ctx);
      if (v.ok || zeroConfirmado(confirmed, ctx.price)) continue;
      push(conflito(trechoOriginal(texto, n, m.index, m.end), v));
    }
  }

  for (const m of matchesOf(n, GRATIS_RE)) {
    if (negadoAntes(n, m.index)) continue;
    const sujeito = sujeitoDoGratis(n, m.index, m.end);
    // Brinde/bonus gratis e tratado na regra de bonus.
    if (sujeito && SUJEITOS_BRINDE.has(sujeito)) continue;
    const v = avaliarGratuidade(sujeito, ctx);
    if (v.ok) continue;
    push(conflito(trechoOriginal(texto, n, m.index, m.end), v));
  }

  for (const m of matchesOf(n, PARCIAL_SEM_PAGAR)) {
    const v = avaliarGratuidade(m.groups[0], ctx);
    if (v.ok) continue;
    push(conflito(trechoOriginal(texto, n, m.index, m.end), v, true));
  }
}

function zeroConfirmado(confirmed: string, preco: string | undefined): boolean {
  if (precoPositivo(preco)) return false;
  return /(?<![a-z\d])r\$\s*0(?:[.,]0+)?(?!\d)|(?<![a-z])zero\s+reais/.test(confirmed);
}

// ── Desconto ────────────────────────────────────────────────────────────────
const DESCONTO_PERCENTUAL = new RegExp(
  String.raw`(?<![\d,.])(\d{1,3})\s?%\s*(?:de\s+)?(?:desconto|off)(?![a-z])|(?<![a-z])desconto\s+(?:de\s+|ate\s+)?(?:ate\s+)?(\d{1,3})\s?%`,
);
const DE_POR = /(?<![a-z])de\s+(r\$\s*\d[\d.,]*)\s+por\s+(?:apenas\s+|so\s+)?(r\$\s*\d[\d.,]*)/;
const ECONOMIZE = /(?<![a-z])economi[zs]e\s+(?:ate\s+)?(r\$\s*\d[\d.,]*|\d{1,3}\s?%)/;
const DESCONTO_GENERICO = /(?<![a-z])(desconto|descontao|descontos|promocao|promocional|promocoes|oferta\s+especial|condicoes?\s+especiais|preco\s+especial|preco\s+de\s+lancamento|valor\s+de\s+lancamento|black\s+friday|liquidacao|queima\s+de\s+estoque|metade\s+do\s+preco|cupom)(?![a-z])/;
const FAMILIA_DESCONTO = /(?<![a-z])(?:desconto|descontao|promocao|promocional|cupom|liquidacao|black\s+friday|lancamento|metade\s+do\s+preco|oferta\s+especial|condicoes?\s+especiais|preco\s+especial)/;

function removerTrecho(trecho: string, motivo: string): OfferClaimSuggestion {
  return { find: trecho, replaceWith: "", basis: motivo };
}

function detectDesconto(texto: string, n: string, ctx: OfferGuardContext, out: OfferClaimConflict[]) {
  const confirmed = ctx.confirmedClaimsRaw;
  const dinheiroConfirmado = valoresMonetarios(confirmed);
  const temFamilia = matchesOf(confirmed, FAMILIA_DESCONTO).some((m) => !negadoAntes(confirmed, m.index));

  for (const m of matchesOf(n, DESCONTO_PERCENTUAL)) {
    if (negadoAntes(n, m.index)) continue;
    const pct = m.groups[0] || m.groups[1];
    const confirmadoPct = new RegExp(String.raw`(?<![\d,.])${pct}\s?%`).test(confirmed) && temFamilia;
    if (confirmadoPct) continue;
    const trecho = trechoOriginal(texto, n, m.index, m.end);
    out.push({
      kind: "desconto",
      value: trecho,
      reason: "offer_discount_not_confirmed",
      suggestion: removerTrecho(trecho, "desconto nao confirmado no briefing"),
      needsOfferConfirmation: !temFamilia,
    });
  }

  for (const m of matchesOf(n, DE_POR)) {
    const de = normalizeMoneyValue(m.groups[0]);
    if (de && dinheiroConfirmado.includes(de) && temFamilia) continue;
    const trecho = trechoOriginal(texto, n, m.index, m.end);
    const por = precoPositivo(ctx.price) ? ctx.price! : null;
    out.push({
      kind: "desconto",
      value: trecho,
      reason: "offer_discount_not_confirmed",
      suggestion: por ? { find: trecho, replaceWith: `por ${por}`, basis: `preco confirmado ${por}` } : null,
      needsOfferConfirmation: !por,
    });
  }

  for (const m of matchesOf(n, ECONOMIZE)) {
    const valor = m.groups[0];
    const confirmadoValor = /%/.test(valor)
      ? new RegExp(String.raw`(?<![\d,.])${valor.replace(/\D/g, "")}\s?%`).test(confirmed)
      : dinheiroConfirmado.includes(normalizeMoneyValue(valor));
    if (confirmadoValor && temFamilia) continue;
    const trecho = trechoOriginal(texto, n, m.index, m.end);
    out.push({
      kind: "desconto",
      value: trecho,
      reason: "offer_discount_not_confirmed",
      suggestion: removerTrecho(trecho, "economia nao confirmada no briefing"),
      needsOfferConfirmation: !temFamilia,
    });
  }

  for (const m of matchesOf(n, DESCONTO_GENERICO)) {
    if (negadoAntes(n, m.index)) continue;
    // Ja coberto por uma regra mais especifica no mesmo trecho.
    if (out.some((c) => c.kind === "desconto" && normalizeText(c.value).includes(m.groups[0]))) continue;
    if (temFamilia) continue;
    const trecho = trechoOriginal(texto, n, m.index, m.end);
    out.push({
      kind: "desconto",
      value: trecho,
      reason: "offer_discount_not_confirmed",
      suggestion: removerTrecho(trecho, "condicao promocional nao confirmada no briefing"),
      needsOfferConfirmation: true,
    });
  }
}

// ── Bonus / brinde ──────────────────────────────────────────────────────────
const FAMILIA_BONUS = /(?<![a-z])(?:bonus|brinde|brindes|presente|de\s+brinde)(?![a-z])/;
const BONUS_RE = /(?<![a-z])(bonus|brindes?|de\s+brinde|de\s+presente|presente\s+exclusivo)(?![a-z])(?:\s+(?:gratis|gratuit[oa]s?))?(?:\s*(?:de|:|-|\+)\s*(?:um|uma|o|a)?\s*([a-z0-9-]{4,}))?/;
const SUBSTANTIVO_BRINDE = "ebook|e-book|checklist|planilha|guia|material|aula\\s+extra|mentoria|kit|amostra|consulta|avaliacao|sessao|template|modelo";
const GANHE_RE = new RegExp(String.raw`(?<![a-z])ganhe\s+(?:de\s+)?(?:um|uma|o|a)?\s*(${SUBSTANTIVO_BRINDE})(?![a-z])`);
const SUBSTANTIVO_GRATIS_RE = new RegExp(
  String.raw`(?<![a-z])(${SUBSTANTIVO_BRINDE})\s+(?:gratis|gratuit[oa]s?)(?![a-z])|(?<![a-z])(?:gratis|gratuit[oa]s?)\s+(?:de\s+)?(?:um|uma|o|a)?\s*(${SUBSTANTIVO_BRINDE})(?![a-z])`,
);

function detectBonus(texto: string, n: string, ctx: OfferGuardContext, out: OfferClaimConflict[]) {
  const confirmed = ctx.confirmedClaimsRaw;
  const temBonus = matchesOf(confirmed, FAMILIA_BONUS).some((m) => !negadoAntes(confirmed, m.index));
  const vistos = new Set<string>();
  const registrar = (m: Match, motivo: string) => {
    const trecho = trechoOriginal(texto, n, m.index, m.end);
    if (vistos.has(trecho)) return;
    vistos.add(trecho);
    out.push({
      kind: "bonus",
      value: trecho,
      reason: "offer_bonus_not_confirmed",
      suggestion: removerTrecho(trecho, motivo),
      needsOfferConfirmation: true,
    });
  };

  for (const m of matchesOf(n, BONUS_RE)) {
    if (negadoAntes(n, m.index)) continue;
    const item = m.groups[1];
    if (!temBonus) {
      registrar(m, "bonus nao confirmado no briefing");
      continue;
    }
    // Bonus confirmado, mas o ITEM citado precisa existir no briefing.
    if (item && !STOP_SUJEITO.has(item) && !confirmed.includes(stem(item))) {
      registrar(m, "item do bonus nao confirmado no briefing");
    }
  }

  for (const m of matchesOf(n, GANHE_RE)) {
    const item = m.groups[0].replace(/\s+/g, " ");
    if (negadoAntes(n, m.index)) continue;
    if (temBonus && confirmed.includes(stem(item))) continue;
    registrar(m, "brinde nao confirmado no briefing");
  }

  for (const m of matchesOf(n, SUBSTANTIVO_GRATIS_RE)) {
    if (negadoAntes(n, m.index)) continue;
    const item = (m.groups[0] || m.groups[1] || "").replace(/\s+/g, " ");
    const livre = itemGratuitoConfirmado(confirmed, item.split(" ")[0], ctx.price);
    if (livre) continue;
    if (temBonus && confirmed.includes(stem(item))) continue;
    registrar(m, "material gratuito nao confirmado no briefing");
  }
}

// ── Acesso e garantia ───────────────────────────────────────────────────────
const ACESSO_DEPOIS = new RegExp(String.raw`(?<![a-z])acesso\s+(?:por|de|durante|ate|a|em|total\s+por|total\s+de)?\s*(${NUM})\s*(${UNIT})(?![a-z])`);
const ACESSO_ANTES = new RegExp(String.raw`(?<![a-z\d])(${NUM})\s*(${UNIT})\s+de\s+acesso(?![a-z])`);
const ACESSO_VITALICIO = /(?<![a-z])acesso\s+(?:vitalicio|ilimitado|permanente|para\s+sempre|por\s+toda\s+a\s+vida)(?![a-z])/;
const GARANTIA_DEPOIS = new RegExp(String.raw`(?<![a-z])garantia\s+(?:total\s+|incondicional\s+)?(?:de|por)\s+(${NUM})\s*(${UNIT})(?![a-z])`);
const GARANTIA_ANTES = new RegExp(String.raw`(?<![a-z\d])(${NUM})\s*(${UNIT})\s+de\s+garantia(?![a-z])`);

function prazoConfirmadoPerto(confirmed: string, ancora: string, dias: number): string | null {
  const re = new RegExp(String.raw`(${NUM})\s*(${UNIT})(?![a-z])`, "g");
  let achou: string | null = null;
  for (const m of confirmed.matchAll(re)) {
    const idx = m.index ?? 0;
    const janela = confirmed.slice(Math.max(0, idx - 30), idx + m[0].length + 30);
    if (!new RegExp(ancora).test(janela)) continue;
    const d = paraDias(m[1], m[2]);
    achou = achou ?? m[0];
    if (d !== null && Math.abs(d - dias) < 0.5) return m[0];
  }
  return achou === null ? null : "";
}

function detectPrazoDeAcessoEGarantia(texto: string, n: string, ctx: OfferGuardContext, out: OfferClaimConflict[]) {
  const confirmed = ctx.confirmedClaimsRaw;
  const duracoes: Array<{ re: RegExp; kind: OfferClaimKind; ancora: string; reason: string; nome: string }> = [
    { re: ACESSO_DEPOIS, kind: "acesso", ancora: "acesso", reason: "offer_access_term_not_confirmed", nome: "prazo de acesso" },
    { re: ACESSO_ANTES, kind: "acesso", ancora: "acesso", reason: "offer_access_term_not_confirmed", nome: "prazo de acesso" },
    { re: GARANTIA_DEPOIS, kind: "garantia", ancora: "garantia", reason: "offer_guarantee_not_confirmed", nome: "garantia" },
    { re: GARANTIA_ANTES, kind: "garantia", ancora: "garantia", reason: "offer_guarantee_not_confirmed", nome: "garantia" },
  ];
  const vistos = new Set<string>();
  for (const { re, kind, ancora, reason, nome } of duracoes) {
    for (const m of matchesOf(n, re)) {
      if (negadoAntes(n, m.index)) continue;
      const dias = paraDias(m.groups[0], m.groups[1]);
      if (dias === null) continue;
      const confirmadoIgual = prazoConfirmadoPerto(confirmed, ancora, dias);
      if (confirmadoIgual) continue; // mesma duracao confirmada
      const trecho = trechoOriginal(texto, n, m.index, m.end);
      if (vistos.has(trecho)) continue;
      vistos.add(trecho);
      // confirmadoIgual === "" => existe prazo confirmado, mas diferente.
      // confirmadoIgual === null => nenhum prazo confirmado.
      let sugestao: OfferClaimSuggestion | null = null;
      if (confirmadoIgual === "") {
        const m2 = achaPrazoConfirmado(confirmed, ancora);
        if (m2) {
          const numeroOriginal = trecho.match(new RegExp(String.raw`(\d{1,4}|[A-Za-zÀ-ÿ]+)\s*(dias?|semanas?|meses|m[eê]s|anos?|horas?)`, "i"));
          if (numeroOriginal) {
            sugestao = { find: numeroOriginal[0], replaceWith: m2, basis: `${nome} confirmado: ${m2}` };
          }
        }
      }
      out.push({
        kind,
        value: trecho,
        reason,
        suggestion: sugestao ?? removerTrecho(trecho, `${nome} nao confirmado no briefing`),
        needsOfferConfirmation: confirmadoIgual === null,
      });
    }
  }

  for (const m of matchesOf(n, ACESSO_VITALICIO)) {
    if (negadoAntes(n, m.index)) continue;
    const palavra = m.raw.replace(/^acesso\s+/, "");
    if (confirmed.includes(palavra) && new RegExp(String.raw`acesso[^.]{0,30}${palavra}|${palavra}[^.]{0,30}acesso`).test(confirmed)) continue;
    const trecho = trechoOriginal(texto, n, m.index, m.end);
    const prazo = achaPrazoConfirmado(confirmed, "acesso");
    out.push({
      kind: "acesso",
      value: trecho,
      reason: "offer_access_term_not_confirmed",
      suggestion: prazo
        ? { find: trecho, replaceWith: `acesso por ${prazo}`, basis: `prazo de acesso confirmado: ${prazo}` }
        : removerTrecho(trecho, "prazo de acesso nao confirmado no briefing"),
      needsOfferConfirmation: !prazo,
    });
  }
}

function achaPrazoConfirmado(confirmed: string, ancora: string): string | null {
  const re = new RegExp(String.raw`(${NUM})\s*(${UNIT})(?![a-z])`, "g");
  for (const m of confirmed.matchAll(re)) {
    const idx = m.index ?? 0;
    const janela = confirmed.slice(Math.max(0, idx - 30), idx + m[0].length + 30);
    if (new RegExp(ancora).test(janela)) return m[0];
  }
  return null;
}

// ── Prazo da oferta (data limite / urgencia) ───────────────────────────────
const DATA_LIMITE = new RegExp(
  String.raw`(?<![a-z])(?:valid[oa]s?\s+ate|somente\s+ate|so\s+ate|inscricoes?\s+ate|vagas?\s+ate|oferta\s+ate|promocao\s+ate|encerra(?:\s+em)?|termina(?:\s+em)?|acaba(?:\s+em)?)\s+(?:o\s+dia\s+|dia\s+)?(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}\s+de\s+(?:${MESES})|(?:${DIAS_SEMANA})(?:-feira)?|hoje|amanha|meia-noite)(?![a-z\d])`,
);
// "ate 25/11" so conta com data explicita (nunca "ate 12x", "ate 7 dias", "ate sabado").
const DATA_LIMITE_ATE = new RegExp(
  String.raw`(?<![a-z])ate\s+(?:o\s+dia\s+|dia\s+)?(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}\s+de\s+(?:${MESES}))(?![a-z\d])`,
);
const URGENCIA_FRASE = new RegExp(
  String.raw`(?<![a-z])(?:so\s+hoje|somente\s+hoje|apenas\s+hoje|so\s+amanha|ultimas?\s+horas|ultimo\s+dia|ultimos\s+dias|por\s+tempo\s+limitado|tempo\s+limitado|oferta\s+relampago|so\s+esta\s+semana|somente\s+esta\s+semana|so\s+nesta\s+semana|hoje\s+e\s+o\s+ultimo\s+dia)(?![a-z])`,
);

function dataCanonica(token: string): string | null {
  const barra = token.match(/^(\d{1,2})\/(\d{1,2})/);
  if (barra) return `${Number(barra[1])}/${Number(barra[2])}`;
  const extenso = token.match(new RegExp(String.raw`^(\d{1,2})\s+de\s+(${MESES})`));
  if (extenso) return `${Number(extenso[1])}/${MESES.split("|").indexOf(extenso[2]) + 1}`;
  return null;
}

function datasConfirmadas(confirmed: string): Set<string> {
  const out = new Set<string>();
  for (const m of confirmed.matchAll(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?(?![\d/])/g)) out.add(`${Number(m[1])}/${Number(m[2])}`);
  for (const m of confirmed.matchAll(new RegExp(String.raw`(\d{1,2})\s+de\s+(${MESES})`, "g"))) {
    out.add(`${Number(m[1])}/${MESES.split("|").indexOf(m[2]) + 1}`);
  }
  return out;
}

function detectPrazoDaOferta(texto: string, n: string, ctx: OfferGuardContext, out: OfferClaimConflict[]) {
  const confirmed = ctx.confirmedClaimsRaw;
  const datas = datasConfirmadas(confirmed);

  for (const m of [...matchesOf(n, DATA_LIMITE), ...matchesOf(n, DATA_LIMITE_ATE)]) {
    if (negadoAntes(n, m.index)) continue;
    const alvo = m.groups[0];
    const canon = dataCanonica(alvo);
    let ok: boolean;
    if (canon) ok = datas.has(canon);
    else if (alvo === "hoje" || alvo === "amanha" || alvo === "meia-noite") ok = confirmed.includes(alvo);
    else ok = new RegExp(String.raw`(?<![a-z])${alvo.replace(/-feira$/, "")}`).test(confirmed);
    if (ok) continue;
    const trecho = trechoOriginal(texto, n, m.index, m.end);
    out.push({
      kind: "prazo_oferta",
      value: trecho,
      reason: "offer_deadline_not_confirmed",
      suggestion: removerTrecho(trecho, "prazo da oferta nao confirmado no briefing"),
      needsOfferConfirmation: datas.size === 0,
    });
  }

  for (const m of matchesOf(n, URGENCIA_FRASE)) {
    if (negadoAntes(n, m.index)) continue;
    if (confirmed.includes(m.raw)) continue;
    const trecho = trechoOriginal(texto, n, m.index, m.end);
    if (out.some((c) => c.kind === "prazo_oferta" && c.value === trecho)) continue;
    out.push({
      kind: "prazo_oferta",
      value: trecho,
      reason: "offer_deadline_not_confirmed",
      suggestion: removerTrecho(trecho, "urgencia nao confirmada no briefing"),
      needsOfferConfirmation: datas.size === 0,
    });
  }
}

/**
 * Procura promessas comerciais sem lastro no briefing confirmado.
 * `texto` e um campo de copy (titulo, texto principal, descricao, CTA, roteiro,
 * cartao de carrossel). Devolve uma lista vazia quando tudo esta confirmado.
 */
export function detectUnconfirmedOfferClaims(texto: string, ctx: OfferGuardContext): OfferClaimConflict[] {
  const bruto = String(texto ?? "").normalize("NFC");
  if (!bruto.trim()) return [];
  const { n, exato } = normalizarPreservandoIndices(bruto);
  EXATO = exato;
  const out: OfferClaimConflict[] = [];
  detectGratuidade(bruto, n, ctx, out);
  detectDesconto(bruto, n, ctx, out);
  detectBonus(bruto, n, ctx, out);
  detectPrazoDeAcessoEGarantia(bruto, n, ctx, out);
  detectPrazoDaOferta(bruto, n, ctx, out);
  return out;
}

/**
 * Aplica as sugestoes de um conjunto de conflitos a um texto. So troca
 * conflitos que tem sugestao; os demais ficam para edicao manual. Nunca
 * inventa fato: toda troca vem de `suggestion`, que sai de fato confirmado.
 */
export function applyOfferSuggestions(texto: string, conflicts: Array<Pick<OfferClaimConflict, "value" | "suggestion">>): string {
  let resultado = texto;
  for (const c of conflicts) {
    if (!c.suggestion) continue;
    const { find, replaceWith } = c.suggestion;
    if (!find || !resultado.includes(find)) continue;
    resultado = resultado.replace(find, replaceWith);
  }
  return resultado
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])\s*([.!?])/g, "$2")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;:.-]+/, "")
    .trim();
}

/**
 * Remove de uma lista de CTAs sugeridos (modelos por segmento) os que prometem
 * gratuidade, desconto, bonus, prazo ou urgencia sem lastro no briefing. Os
 * modelos de segmento eram a origem de "Aula gratis" em campanhas de leads:
 * leads nao autoriza presumir oferta gratuita.
 */
export function ctasSemPromessaNaoConfirmada(ctas: string[], ctx: OfferGuardContext): string[] {
  const seguros = ctas.filter((cta) => detectUnconfirmedOfferClaims(cta, ctx).length === 0);
  return seguros.length ? seguros : ["Quero saber mais", "Quero participar"];
}

/** Regra de oferta anexada aos prompts de geracao (vence sobre exemplos e modelos). */
export const REGRA_OFERTA_PARA_PROMPT =
  "REGRA DE OFERTA COMERCIAL (vence sobre qualquer modelo, exemplo ou CTA sugerido): " +
  "gratuidade (gratis, gratuito, sem pagar, R$ 0), desconto, bonus/brinde, garantia, prazo de acesso, prazo da oferta e urgencia " +
  "so podem aparecer se estiverem escritos nos FATOS VERIFICADOS. O objetivo leads NAO significa oferta gratuita: " +
  "se houver preco confirmado, a oferta e paga. Sem confirmacao, use CTA neutro (Quero saber mais, Quero participar).";
