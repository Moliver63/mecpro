// Portao generico de alegacoes factuais.
//
// Auditoria 23/11 (F1/F2): o Fact Guard barrava preco, desconto, escassez e
// poucos tipos de prova social, mas deixava passar certificacao, aprovacao por
// orgao, percentual de resultado, garantia de resultado, nome de cliente, tempo
// de mercado e ranking, sobretudo em segmentos sem regra propria ("outro").
//
// Regra: uma alegacao FACTUAL (algo que o anunciante precisa poder provar) so
// passa se o proprio cliente confirmou os mesmos fatos no briefing/perfil
// (`confirmedClaimsRaw`). Linguagem publicitaria comum ("atendimento de
// qualidade", "a melhor escolha para voce") nao e alegacao factual e nao entra
// aqui: so entram padroes que carregam um dado verificavel (numero, orgao,
// selo, nome proprio, ranking explicito, garantia de resultado).
//
// Profissoes regulamentadas (saude, juridico, financeiro) tem um segundo nivel:
// algumas formas de publicidade sao vedadas MESMO com a confirmacao do cliente
// (cura garantida, ganho de causa garantido, rentabilidade garantida).
//
// Limites: regra por padrao de texto, nao prova semantica. Parafrase rara,
// ironia e texto dentro de imagem nao sao cobertos. Falso positivo custa uma
// reescrita ou uma confirmacao; falso negativo e o comportamento anterior.
import { normalizeText } from "./factNormalizer";

export type FactualClaimKind =
  | "credencial"
  | "resultado_percentual"
  | "garantia_resultado"
  | "prova_social_quantidade"
  | "cliente_nomeado"
  | "tempo_mercado"
  | "ranking";

export type RegulatedArea = "saude" | "juridico" | "financeiro";

export type FactualClaim = {
  kind: FactualClaimKind;
  /** Trecho normalizado (sem acento, minusculo) que gerou a alegacao. */
  value: string;
  /** Dados verificaveis do trecho: numeros e nomes proprios/siglas. */
  anchors: string[];
};

export type RegulatedClaim = { area: RegulatedArea; value: string; reason: string };

const L = String.raw`[a-z]`; // texto ja normalizado (sem acento)
const UNIDADES_QUANTIDADE = String.raw`(?:empresas?|profissionais|negocios?|lojas?|escritorios?|clinicas?|advogados?|medicos?|dentistas?|produtores?|motoristas?|transportadoras?|usuarios?|assinantes?|parceiros?|casos?|causas?|processos?|obras?|cirurgias?|atendimentos?|entregas?|viagens?|hectares?|mil|milhao|milhoes|clientes?|alunos?|pacientes?|familias?|pessoas?|pedidos?|vendas?|projetos?|imoveis|negocios)`;

type Padrao = { kind: FactualClaimKind; re: RegExp };

// Aplicados ao texto NORMALIZADO. Sem \b junto de vogal acentuada: o texto
// normalizado nao tem acento, entao \b e seguro aqui.
const PADROES: Padrao[] = [
  // Certificacao, selo, aprovacao ou registro por um orgao/entidade.
  { kind: "credencial", re: /\b(?:certificad[oa]s?\s+(?:pel[oa]s?|por|iso|em)\s*[a-z0-9]+|certificad[oa]s?\b|certificacao\s+[a-z0-9]+|homologad[oa]s?\b|iso\s*-?\s*\d{3,5}|aprovad[oa]s?\s+(?:pel[oa]s?|por)\s+[a-z0-9]+|credenciad[oa]s?\s+(?:pel[oa]s?|por|no|na)\s+[a-z0-9]+|recomendad[oa]s?\s+(?:pel[oa]s?|por)\s+[a-z0-9]+|registrad[oa]s?\s+(?:no|na|pel[oa])\s+[a-z0-9]+|selo\s+[a-z0-9]+|premiad[oa]s?\b|ganhador(?:a)?\s+d[oa]\s+premio|vencedor(?:a)?\s+d[oa]\s+premio(?:\s+[a-z0-9]+){0,3}|parceir[oa]s?\s+oficial(?:\s+d[aeo]s?\s+[a-z0-9]+)?|revendedor(?:a)?\s+autorizad[oa](?:\s+d[aeo]s?\s+[a-z0-9]+)?|registro\s+(?:no|na|do|da)?\s*[a-z]{2,10}\s*[-:n.o]*\s*\d{3,})/g },
  // Resultado percentual. Desconto, juros e entrada pertencem ao guarda de oferta.
  { kind: "resultado_percentual", re: /\b\d{1,3}(?:[.,]\d+)?\s*%(?!\s*(?:de\s+)?(?:desconto|off|juros|entrada|cashback|de\s+entrada|ao\s+mes|ao\s+ano))(?:\s+(?:das?|dos|de|a\s+mais|a\s+menos|mais|menos)\b)?/g },
  // Garantia de resultado (distinta de garantia comercial, que e do guarda de oferta).
  { kind: "garantia_resultado", re: /\b(?:resultados?\s+garantid[oa]s?|sucesso\s+garantido|aprovacao\s+garantida|vitoria\s+garantida|cura\s+garantida|indenizacao\s+garantida|ganho\s+garantido|lucro\s+garantido|garantimos\s+(?:o\s+|a\s+|seu\s+|sua\s+)?(?:resultado|sucesso|aprovacao|vitoria|indenizacao|ganho|lucro|cura)|garantia\s+de\s+(?:resultado|sucesso|aprovacao|vitoria|ganho|cura)|100\s*%\s*(?:garantid[oa]s?|seguro|eficaz|de\s+(?:sucesso|aprovacao|resultado))|(?:risco\s+zero|zero\s+risco)\b|satisfacao\s+garantida)/g },
  // Quantidade de pessoas/empresas/casos atendidos (amplia a prova social existente).
  { kind: "prova_social_quantidade", re: new RegExp(String.raw`(?<![a-z0-9])\+\s*\d[\d.,]*(?:\s*(?:mil|milhao|milhoes|k))?\s+(?:de\s+)?${UNIDADES_QUANTIDADE}|\b(?:mais\s+de\s+\d[\d.,]*(?:\s*(?:mil|milhao|milhoes|k))?\s+(?:de\s+)?${UNIDADES_QUANTIDADE}|(?:milhares?|centenas?)\s+de\s+${UNIDADES_QUANTIDADE}|\d[\d.,]*\s+${UNIDADES_QUANTIDADE}\s+(?:atendid|satisfeit|confi|ja\s+(?:atendid|escolh|usam|confi))${L}*|(?:usad[oa]|escolhid[oa]|adotad[oa]|confiad[oa]|aprovad[oa])\s+por\s+(?:mais\s+de\s+)?\d[\d.,]*)`, "g") },
  // Tempo de mercado.
  { kind: "tempo_mercado", re: /\b(?:ha\s+(?:mais\s+de\s+)?\d{1,3}\s+anos?\b|(?:com\s+)?(?:mais\s+de\s+)?\d{1,3}\s+anos?\s+(?:de\s+(?:mercado|experiencia|tradicao|historia|atuacao)|no\s+mercado|atuando|cuidando|servindo|transformando|ajudando)|tradicao\s+de\s+\d{1,3}\s+anos?|desde\s+(?:19|20)\d{2}\b)/g },
  // Ranking explicito (superlativo com comparador de mercado/lugar).
  { kind: "ranking", re: /\b(?:somos\s+(?:a|o|as|os)\s+(?:maior|melhor|unic[oa]|primeir[oa]|mais\s+[a-z]+)\b(?:\s+[a-z0-9]+){0,4}|numero\s*(?:1|um)\b|n(?:o|º|°)\.?\s*1\b|lider(?:es)?\s+(?:de|em|no|na|do|da)\s+[a-z]+|eleit[oa]s?\s+(?:a\s+|o\s+)?(?:melhor|numero)|(?:o|a)\s+(?:melhor|maior|mais\s+[a-z]+)\s+(?:[a-z]+\s+){0,2}d[aeo]s?\s+(?:cidade|regiao|brasil|pais|estado|mercado|categoria|segmento|sul|norte|nordeste|centro-oeste|sudeste)|mais\s+(?:vendid[oa]|premiad[oa]|procurad[oa]|indicad[oa])\s+d[aeo]s?\s+[a-z]+|(?:melhor|maior)\s+(?:[a-z]+\s+){0,2}d[aeo]s?\s+(?:cidade|regiao|brasil|pais))/g },
];

// Palavras que nao identificam um dado verificavel.
const PALAVRAS_SEM_DADO = new Set([
  "mais", "menos", "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas", "por", "pela", "pelo",
  "pelas", "pelos", "com", "para", "que", "ha", "desde", "anos", "ano", "atendid", "e", "a", "o", "as", "os",
  "um", "uma", "ao", "melhor", "maior", "numero", "lider", "eleit", "eleito", "eleita",
]);

function ancorasDoTrecho(trecho: string): string[] {
  const ancoras: string[] = [];
  for (const numero of trecho.match(/\d[\d.,]*/g) || []) {
    const limpo = numero.replace(/[.,]/g, "");
    if (limpo) ancoras.push(limpo);
  }
  for (const palavra of trecho.match(/[a-z]{3,}/g) || []) {
    if (!PALAVRAS_SEM_DADO.has(palavra) && !/^(?:certificad|homologad|aprovad|credenciad|recomendad|registrad|premiad|garantid|garantia|garantimos|resultado|sucesso|vitoria|cura|ganho|lucro|indenizacao|aprovacao|risco|riscos|zero|seguro|eficaz|clientes?|alunos?|pacientes?|empresas?|profissionais|atendimentos?|satisfeit|confi|experiencia|mercado|tradicao|historia|atuacao|atuando|cuidando|servindo|transformando|ajudando|selo|oficial|revendedor|autorizad|vencedor|registro|cidade|regiao|brasil|pais|estado|categoria|segmento|usad|escolhid|adotad|confiad|milhares?|centenas?|vendid|procurad|indicad|ganhador|premio)/.test(palavra)) {
      ancoras.push(palavra);
    }
  }
  return Array.from(new Set(ancoras));
}

function temPalavra(raw: string, palavra: string): boolean {
  return new RegExp(String.raw`(?<![a-z0-9])${palavra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(raw);
}

/**
 * Cliente nomeado: precisa do texto ORIGINAL (a caixa alta distingue nome proprio).
 * "Cliente: Magazine Luiza", "trabalhamos com Natura", "usado pela Embrapa".
 */
const NOME_GENERICO = new Set(["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo", "via", "todo", "toda", "todos", "todas", "grande", "regiao", "cidade", "bairro", "whatsapp", "instagram", "facebook", "brasil", "online", "presencial", "domicilio", "novo", "nova", "vip", "premium", "especial", "exclusivo", "antigo", "fiel", "satisfeito", "feliz", "ideal", "final", "unico", "unica", "em", "de", "da", "do"]);
function detectarClientesNomeados(textoOriginal: string): FactualClaim[] {
  const achados: FactualClaim[] = [];
  const re = /(?<![\p{L}])(?:[Cc]lientes?|[Pp]arceir[oa]s?|[Cc]ases?|[Aa]tendemos|[Aa]tendeu|[Tt]rabalhamos\s+com|[Tt]rabalhou\s+com|[Uu]sad[oa]s?\s+(?:pel[oa]s?|por)|[Jj][aá]\s+atendemos|[Mm]arcas?\s+como|[Cc]lientes?\s+como|[Ee]mpresas?\s+como)\s*:?\s*(?:a\s+|o\s+|com\s+|da\s+|do\s+)?([A-ZÀ-Ý][\p{L}0-9&.]+(?:\s+[A-ZÀ-Ý][\p{L}0-9&.]+){0,3})/gu;
  for (const m of textoOriginal.matchAll(re)) {
    const nome = normalizeText(m[1] || "");
    const primeira = nome.split(" ")[0];
    // Dia da semana, canal ou abrangencia ("Atendemos Via WhatsApp") nao e cliente.
    if (!nome || NOME_GENERICO.has(primeira) || nome.split(" ").some((p) => NOME_GENERICO.has(p)) || nome.length < 3) continue;
    achados.push({ kind: "cliente_nomeado", value: normalizeText(m[0]), anchors: nome.split(" ").filter((p) => p.length >= 3 && !PALAVRAS_SEM_DADO.has(p)) });
  }
  return achados;
}

export function detectFactualClaims(textoOriginal: string): FactualClaim[] {
  const texto = normalizeText(textoOriginal || "");
  const achados: FactualClaim[] = [];
  for (const { kind, re } of PADROES) {
    re.lastIndex = 0;
    for (const m of texto.matchAll(re)) {
      const value = m[0].replace(/\s+/g, " ").trim();
      // "100% online/digital/natural" descreve o produto; a garantia de resultado
      // ("100% garantido/eficaz") tem padrao proprio.
      if (kind === "resultado_percentual" && /^100\s*%/.test(value)) continue;
      if (value) achados.push({ kind, value, anchors: ancorasDoTrecho(value) });
    }
  }
  achados.push(...detectarClientesNomeados(textoOriginal || ""));
  // Sem duplicata de mesmo trecho.
  const vistos = new Set<string>();
  return achados.filter((c) => (vistos.has(c.kind + c.value) ? false : (vistos.add(c.kind + c.value), true)));
}

/** Confirmada = o cliente afirmou o mesmo dado em algum campo do briefing/perfil. */
export function alegacaoFactualConfirmada(claim: FactualClaim, confirmedClaimsRaw: string): boolean {
  const raw = String(confirmedClaimsRaw || "");
  if (!raw) return false;
  if (raw.includes(claim.value)) return true;
  if (claim.kind === "resultado_percentual") {
    // O percentual confirmado precisa ser percentual: "98" solto num telefone nao conta.
    const numero = (claim.value.match(/\d{1,3}(?:[.,]\d+)?/) || [""])[0].replace(",", ".");
    const variantes = [numero, numero.replace(".", ",")].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return variantes.some((n) => new RegExp(String.raw`(?<![0-9.,])${n}\s*(?:%|por\s*cento)`).test(raw));
  }
  // Com dados verificaveis (numero, sigla, nome), todos precisam estar no briefing
  // no mesmo contexto de tipo: "98%" so confirma "98%", nao qualquer "98".
  if (claim.anchors.length) {
    const ancorasOk = claim.anchors.every((a) => (/^\d/.test(a) ? new RegExp(String.raw`(?<![0-9])${a}(?![0-9])`).test(raw.replace(/(\d)[.,](?=\d{3}(?!\d))/g, "$1")) : temPalavra(raw, a)));
    if (ancorasOk) return true;
  }
  return false;
}

export function unverifiedFactualClaims(textoOriginal: string, confirmedClaimsRaw: string): FactualClaim[] {
  return detectFactualClaims(textoOriginal).filter((c) => !alegacaoFactualConfirmada(c, confirmedClaimsRaw));
}

// ── Profissoes regulamentadas ──────────────────────────────────────────────
// Detectadas pelo conteudo do briefing, nao so pelo segmento: um "outro" com
// "escritorio de advocacia" no briefing e area juridica.
const AREAS: Array<[RegulatedArea, RegExp]> = [
  ["saude", /\b(?:medic[oa]s?|medicina|dentist[ao]s?|odontolog\w*|clinica\s+(?:medica|odontologica|de\s+\w+)|psicolog\w*|psiquiatr\w*|fisioterap\w*|nutricionist\w*|nutricao|dermatolog\w*|cirurg\w*|fonoaudiolog\w*|enfermag\w*|estetica|harmonizacao|botox|consultorio|terapeuta|terapia|saude)\b/],
  ["juridico", /\b(?:advogad[oa]s?|advocacia|escritorio\s+de\s+advocacia|juridic\w*|oab|direito\s+(?:trabalhista|civil|penal|previdenciario|tributario|de\s+familia)|inventario|divorcio|acao\s+trabalhista)\b/],
  ["financeiro", /\b(?:contador|contabil\w*|contabilidade|investiment\w*|corretora\s+de\s+(?:valores|seguros)|consultoria\s+financeira|credito|emprestimo|consorcio|seguros?\s+(?:de|para)|planejamento\s+financeiro|renda\s+fixa|renda\s+variavel)\b/],
];

export function detectRegulatedArea(textoBriefing: string): RegulatedArea | null {
  const t = normalizeText(textoBriefing || "");
  for (const [area, re] of AREAS) if (re.test(t)) return area;
  return null;
}

const REGULADAS: Record<RegulatedArea, Array<[RegExp, string]>> = {
  saude: [
    [/\b(?:cura\s+(?:garantida|definitiva|total|certa)|garantimos\s+(?:a\s+)?cura|milagr\w+)\b/, "promessa de cura ou milagre"],
    [/\b(?:resultado|resultados)\s+(?:100\s*%\s*)?garantid[oa]s?\b|\b100\s*%\s*(?:garantid[oa]|seguro|eficaz)\b/, "resultado de saude garantido"],
    [/\bsem\s+(?:nenhum\s+)?(?:dor|risco|efeito\s+colateral|efeitos\s+colaterais)\b/, "ausencia total de dor ou risco"],
    [/\bantes\s+e\s+depois\b/, "antes e depois em publicidade de saude"],
  ],
  juridico: [
    [/\b(?:ganho\s+de\s+causa|vitoria|indenizacao|causa)\s+garantid[oa]s?\b|\bgarantimos\s+(?:a\s+)?(?:vitoria|indenizacao|ganho)\b/, "garantia de resultado juridico"],
    [/\b(?:promocao|promocional|desconto|brinde|sorteio|gratis|gratuit[oa]s?)\b/, "oferta promocional em publicidade de advocacia"],
  ],
  financeiro: [
    [/\b(?:rentabilidade|lucro|ganho|retorno)\s+garantid[oa]s?\b|\bgarantimos\s+(?:a\s+)?(?:rentabilidade|lucro|retorno)\b/, "rentabilidade ou lucro garantido"],
    [/\b\d{1,3}(?:[.,]\d+)?\s*%\s+ao\s+(?:mes|ano|dia)\b/, "percentual de rentabilidade sem comprovacao"],
    [/\bsem\s+risco\b|\brisco\s+zero\b/, "ausencia de risco em produto financeiro"],
  ],
};

export function detectRegulatedClaims(textoOriginal: string, area: RegulatedArea | null): RegulatedClaim[] {
  if (!area) return [];
  const t = normalizeText(textoOriginal || "");
  const achados: RegulatedClaim[] = [];
  for (const [re, reason] of REGULADAS[area]) {
    const m = t.match(re);
    if (m?.[0]) achados.push({ area, value: m[0].replace(/\s+/g, " ").trim(), reason });
  }
  return achados;
}
