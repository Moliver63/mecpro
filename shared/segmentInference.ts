// Inferencia de segmento a partir do briefing inteiro, nao so do campo "nicho".
//
// Auditoria 23/11 (F2): `detectSegmentFromNiche` olha palavras-chave de UM texto,
// sem normalizar acento, e devolvia "outro" para medico, dermatologista,
// psicologa, incorporadora, entre outros. Aqui o texto de todos os campos e
// normalizado e confrontado com um lexico de termos que so existem num segmento.
//
// Limites: continua sendo lexico (nao entende frases ambiguas). Por isso devolve
// `confianca` e, quando nao tem certeza, devolve "outro": a protecao de
// alegacoes (server/factualClaimGate.ts) vale para QUALQUER segmento e nao
// depende desta resposta. Agro, logistica, juridico e contabil ficam em
// "outro" de proposito: nao ha regra de copy propria para eles, e mapear para
// um segmento errado traria CTAs de outro negocio.
import { detectSegmentFromNiche } from "./segmentConfig";

export type InferenciaDeSegmento = {
  segment: string;
  confianca: "alta" | "media" | "baixa";
  origem: "nicho" | "briefing" | "nenhuma";
};

function sem(s: unknown): string {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Termos especificos, sem ambiguidade com outro segmento.
const LEXICO: Array<[string, RegExp]> = [
  ["saude_estetica", /\b(?:medic[oa]s?|medicina|dentist\w*|odontolog\w*|ortodont\w*|psicolog\w*|psiquiatr\w*|fisioterap\w*|nutricionist\w*|dermatolog\w*|cirurgi\w*|fonoaudiolog\w*|cardiolog\w*|oftalmolog\w*|ortoped\w*|ginecolog\w*|pediatr\w*|harmonizacao|botox|preenchimento|depilacao|limpeza\s+de\s+pele|terapeuta)\b/],
  ["imoveis_venda", /\b(?:incorporadora|lancamento\s+imobiliario|empreendimento\s+imobiliario|loteamento)\b/],
];

export function inferirSegmento(campos: { niche?: unknown; productService?: unknown; productName?: unknown; extraContext?: unknown; name?: unknown }): InferenciaDeSegmento {
  const nicho = String(campos.niche ?? "").trim();
  if (nicho) {
    const direto = detectSegmentFromNiche(nicho);
    if (direto !== "outro") return { segment: direto, confianca: "alta", origem: "nicho" };
  }
  const textoTodo = [campos.niche, campos.productService, campos.productName, campos.extraContext, campos.name]
    .map(sem).filter(Boolean).join(" ");
  if (!textoTodo) return { segment: "outro", confianca: "baixa", origem: "nenhuma" };
  const porLexico = LEXICO.filter(([, re]) => re.test(textoTodo)).map(([seg]) => seg);
  // Dois segmentos especificos ao mesmo tempo = ambiguo: nao decide.
  if (porLexico.length === 1) return { segment: porLexico[0], confianca: "media", origem: "briefing" };
  const generico = detectSegmentFromNiche(textoTodo);
  if (generico !== "outro") return { segment: generico, confianca: "baixa", origem: "briefing" };
  return { segment: "outro", confianca: "baixa", origem: "nenhuma" };
}
