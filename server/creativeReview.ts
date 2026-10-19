import { validateCampaignFactIntegrity, type CampaignFacts } from "./campaignFactGuard";
import { CREATIVE_TEXT_LIMITS } from "./creativeRewriteGuard";
import { scoreCreative } from "./creativeScoringEngine";

/**
 * Por que um criativo esta com `needsReview`, lido do proprio criativo salvo.
 *
 * Achado real (19/10, campanha 799 da Shadia Hasan): os 4 criativos estavam
 * `needsReview: true` e NENHUM caminho do produto limpava a flag — nem o chat,
 * nem a tela (`updateCreative` recalcula score mas nao mexe em needsReview).
 * `assertCampaignPublishIntegrity` recusa qualquer criativo marcado, entao a
 * campanha era impublicavel pra sempre, por qualquer porta. E o chat so
 * descobria isso DEPOIS do token de confirmacao.
 *
 * Decisao do Michel (19/10, "So score baixo"): aprovacao no chat libera o
 * criativo quando o UNICO motivo e score abaixo de 75. Placeholder, texto fora
 * do segmento, fato nao confirmado, depoimento inventado ou campo acima do
 * limite continuam bloqueando ate o texto ser corrigido.
 *
 * Modulo leve de proposito: e importado por `publishPreflight.ts`, que nao pode
 * arrastar `ai.ts` (ver comentario la). Por isso o alinhamento de segmento e
 * LIDO do criativo (`segmentAlignmentIssues`, gravado na geracao) em vez de
 * recalculado aqui; quem edita texto recalcula e grava de novo.
 */

export const SCORE_MINIMO_PUBLICACAO = 75;

export type MotivoRevisao =
  | "score_baixo"
  | "placeholder"
  | "segmento"
  | "fatos"
  | "depoimento_inventado"
  | "texto_longo"
  | "nao_identificado";

export interface DiagnosticoRevisao {
  motivos: MotivoRevisao[];
  detalhes: string[];
  score: number;
  /** true so quando o unico motivo e score_baixo. */
  liberavelPorAprovacao: boolean;
}

const CAMPOS_DE_TEXTO = ["headline", "description", "copy", "hook", "cta"] as const;

// Mesmo padrao do auditCopy de ai.ts (inclui a palavra "placeholder").
const PLACEHOLDER_RE = /\[[^\]]*?\]|\{[^}]*?\}|placeholder|EMPRESA_AQUI|PRODUTO_AQUI|\bXXX+\b/i;

// Persona com nome e idade ("Ana Paula, 28,") — o formato do depoimento
// inventado que a geracao produziu no criativo 1 da 799, com a propria IA
// anotando em complianceNotes "Depoimento ficticio baseado em persona". O
// Fact Guard nao pega esse formato: ele procura "depoimentos reais",
// "milhares de clientes", estrelas. Aprovar por score liberaria um depoimento
// falso pra Meta.
const PERSONA_COM_IDADE_RE = /\b[A-ZÀ-Ý][a-zà-ÿ]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ]+)?,\s*\d{2}\s*(?:anos)?\s*[,.]/;

export function textoDoCriativo(c: any): string {
  return CAMPOS_DE_TEXTO.map((k) => c?.[k]).filter(Boolean).join(" ");
}

export function diagnosticarRevisao(creative: any, facts?: CampaignFacts | null): DiagnosticoRevisao {
  const motivos: MotivoRevisao[] = [];
  const detalhes: string[] = [];
  const texto = textoDoCriativo(creative);

  const score = typeof creative?.finalScore === "number" ? creative.finalScore : scoreCreative(creative).finalScore;
  if (score < SCORE_MINIMO_PUBLICACAO) {
    motivos.push("score_baixo");
    detalhes.push(`score ${score} (minimo ${SCORE_MINIMO_PUBLICACAO})`);
  }

  const placeholder = texto.match(PLACEHOLDER_RE);
  if (placeholder) {
    motivos.push("placeholder");
    detalhes.push(`texto com marcador nao preenchido: "${placeholder[0]}"`);
  }

  if (Array.isArray(creative?.segmentAlignmentIssues) && creative.segmentAlignmentIssues.length) {
    motivos.push("segmento");
    detalhes.push(...creative.segmentAlignmentIssues.map((s: unknown) => String(s)));
  }

  const longos = CAMPOS_DE_TEXTO.filter((k) => typeof creative?.[k] === "string" && creative[k].length > CREATIVE_TEXT_LIMITS[k]);
  if (longos.length) {
    motivos.push("texto_longo");
    detalhes.push(...longos.map((k) => `${k} com ${creative[k].length} caracteres (maximo ${CREATIVE_TEXT_LIMITS[k]})`));
  }

  const persona = String(creative?.copy || "").match(PERSONA_COM_IDADE_RE)
    || String(creative?.hook || "").match(PERSONA_COM_IDADE_RE);
  // complianceNotes e anotacao da GERACAO; depois que alguem reescreve o texto
  // pelo chat ela fica velha e nao pode continuar bloqueando.
  const notaFicticia = !creative?.textEditedAt && /fict[ií]ci/i.test(String(creative?.complianceNotes || ""));
  if (persona || notaFicticia) {
    motivos.push("depoimento_inventado");
    detalhes.push(persona
      ? `depoimento com pessoa nomeada ("${persona[0].trim()}") sem prova cadastrada`
      : "a propria geracao marcou o texto como depoimento ficticio");
  }

  if (facts) {
    const auditoria = validateCampaignFactIntegrity([creative], facts);
    // segmentAlignmentIssues ja vira motivo "segmento" acima; aqui so o resto.
    const conflitos = auditoria.conflicts.filter((c) => !String(c.field).endsWith(".segmentAlignmentIssues"));
    if (conflitos.length) {
      motivos.push("fatos");
      detalhes.push(...conflitos.slice(0, 5).map((c) => `${c.field.replace(/^creatives\.\d+\./, "")}: ${c.reason} ("${c.value}")`));
    }
  }

  if (!motivos.length && creative?.needsReview === true) {
    // Truncamento no limite e campo que a IA nao conseguiu reescrever marcam
    // needsReview na geracao sem deixar rastro no criativo. Nao da pra provar
    // que e "so score", entao nao e liberavel: editar recalcula do zero.
    motivos.push("nao_identificado");
    detalhes.push("motivo da revisao nao ficou registrado; reescreva o texto com editar_criativo para recalcular");
  }

  return { motivos, detalhes, score, liberavelPorAprovacao: motivos.length === 1 && motivos[0] === "score_baixo" };
}

const ROTULO: Record<MotivoRevisao, string> = {
  score_baixo: "score baixo",
  placeholder: "placeholder no texto",
  segmento: "texto fora do segmento",
  fatos: "alegacao nao confirmada no briefing",
  depoimento_inventado: "depoimento inventado",
  texto_longo: "campo acima do limite",
  nao_identificado: "motivo nao registrado",
};

export function descreverDiagnostico(index: number, d: DiagnosticoRevisao): string {
  const acao = d.liberavelPorAprovacao ? "pode ser aprovado no chat" : "precisa corrigir o texto";
  return `Criativo ${index}: ${d.motivos.map((m) => ROTULO[m]).join(", ")} — ${d.detalhes.join("; ")} (${acao}).`;
}

export function factsDaCampanha(campaign: any): CampaignFacts | null {
  try {
    const facts = JSON.parse(campaign?.aiResponse || "{}")?.campaignFacts;
    return facts?.intent?.segment && Array.isArray(facts.verifiedFacts) ? facts as CampaignFacts : null;
  } catch { return null; }
}
