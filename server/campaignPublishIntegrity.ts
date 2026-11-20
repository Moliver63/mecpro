import { validateCampaignFactIntegrity, type CampaignFacts, type CampaignFactConflict } from "./campaignFactGuard";
import type { OfferClaimKind, OfferClaimSuggestion } from "./campaignOfferGuard";
import { assertObjectiveUnchanged } from "./campaignRuleRetrieval";

/**
 * Versao que nao lanca, pra pre-checagem do chat (`pendenciasLocaisParaPublicar`)
 * recusar ANTES do token de confirmacao com a mesma regra da publicacao real.
 * Achado real (19/10, campanha 799): a pre-checagem nao olhava needsReview nem
 * o snapshot de fatos, entao o chat emitia token pra campanha que
 * `publishToMeta` ia recusar aqui.
 */
export function verificarIntegridadeParaPublicar(campaign: any, overrides: unknown = {}): { ok: boolean; erro?: string } {
  try {
    assertCampaignPublishIntegrity(campaign, overrides);
    return { ok: true };
  } catch (error) {
    return { ok: false, erro: error instanceof Error ? error.message : String(error) };
  }
}

// ── Divergencias de oferta (campo, trecho, motivo, sugestao) ──────────────────

export type DivergenciaDeOferta = {
  /** Indice do criativo salvo; null quando o texto veio do formulario de publicacao. */
  criativo: number | null;
  /** Caminho do campo dentro do criativo, ex.: "headline" ou "carouselCards[1].title". */
  caminho: string;
  campoRotulo: string;
  /** Trecho exato que gerou o conflito. */
  trecho: string;
  motivo: string;
  motivoTexto: string;
  tipo: OfferClaimKind;
  /** Troca baseada em fato confirmado (ou remocao segura). null = pedir confirmacao da oferta. */
  sugestao: OfferClaimSuggestion | null;
  precisaConfirmarOferta: boolean;
  /** Texto atual do campo no rascunho, para a tela mostrar o trecho em contexto e pre-preencher a edicao. */
  textoAtual?: string | null;
};

const MOTIVO_TEXTO: Record<string, string> = {
  offer_free_claim_not_confirmed: "promete gratuidade que não está confirmada na oferta",
  offer_discount_not_confirmed: "cita desconto ou condição promocional que não está confirmada",
  offer_bonus_not_confirmed: "cita bônus ou brinde que não está confirmado",
  offer_access_term_not_confirmed: "cita prazo de acesso diferente do confirmado",
  offer_guarantee_not_confirmed: "cita garantia diferente da confirmada",
  offer_deadline_not_confirmed: "cita prazo ou urgência da oferta que não está confirmado",
};

const ROTULO_CAMPO: Record<string, string> = {
  headline: "Título", description: "Descrição", shortDescription: "Descrição curta", copy: "Texto principal",
  bodyText: "Texto principal", primaryText: "Texto principal", cta: "CTA", hook: "Gancho", script: "Roteiro",
  text: "Texto", title: "Título do card", subtitle: "Subtítulo do card", body: "Texto do card",
  caption: "Legenda", narration: "Narração", voiceover: "Narração", callToAction: "CTA", ctaText: "CTA", ctaLabel: "CTA",
};

function rotuloDoCampo(caminho: string, criativo: number | null): string {
  const folha = caminho.split(".").pop()?.replace(/\[\d+\]$/, "") || caminho;
  const card = caminho.match(/\[(\d+)\]\.[^.]*$/);
  const base = ROTULO_CAMPO[folha] || folha;
  const prefixo = criativo === null ? "Formulário de publicação" : `Criativo ${criativo + 1}`;
  return `${prefixo} · ${base}${card ? ` (card ${Number(card[1]) + 1})` : ""}`;
}

export function paraDivergencia(conflito: CampaignFactConflict, totalCriativos: number): DivergenciaDeOferta | null {
  if (!conflito.kind) return null;
  const m = conflito.field.match(/^creatives\[(\d+)\]\.?(.*)$/);
  const indice = m ? Number(m[1]) : -1;
  const doCriativo = indice >= 0 && indice < totalCriativos;
  const caminho = doCriativo ? (m![2] || "") : (m ? m[2] || "" : conflito.field);
  const criativo = doCriativo ? indice : null;
  return {
    criativo,
    caminho,
    campoRotulo: rotuloDoCampo(caminho, criativo),
    trecho: conflito.value,
    motivo: conflito.reason,
    motivoTexto: MOTIVO_TEXTO[conflito.reason] || conflito.reason,
    tipo: conflito.kind,
    sugestao: conflito.suggestion ?? null,
    precisaConfirmarOferta: conflito.needsOfferConfirmation === true,
  };
}

export function descreverDivergencia(d: DivergenciaDeOferta): string {
  const sugestao = d.sugestao
    ? d.sugestao.replaceWith
      ? ` Sugestão: trocar por "${d.sugestao.replaceWith}" (${d.sugestao.basis}).`
      : ` Sugestão: remover o trecho (${d.sugestao.basis}).`
    : "";
  const confirmar = d.precisaConfirmarOferta ? " Falta confirmar essa condição na oferta do briefing." : "";
  return `${d.campoRotulo}: "${d.trecho}" ${d.motivoTexto}.${sugestao}${confirmar}`;
}

/**
 * Avalia a integridade sem lancar. `erroEstrutural` cobre dados invalidos,
 * snapshot de fatos ausente, objetivo trocado e revisao pendente; `conflitos`
 * traz os conflitos do Fact Guard, com trecho e sugestao quando sao de oferta.
 */
export function avaliarIntegridade(campaign: any, overrides: unknown = {}): { erroEstrutural?: string; conflitos: CampaignFactConflict[]; totalCriativos: number } {
  let response: any;
  let creatives: unknown;
  try {
    response = JSON.parse(campaign.aiResponse || "{}");
    creatives = JSON.parse(campaign.creatives || "[]");
  } catch { return { erroEstrutural: "CAMPAIGN_INTEGRITY: dados invalidos; regenere o rascunho.", conflitos: [], totalCriativos: 0 }; }
  const facts = response.campaignFacts as CampaignFacts;
  if (!facts?.intent?.segment || !facts.intent.objective || !facts.realEstate
      || !Array.isArray(facts.verifiedFacts) || !Array.isArray(facts.forbiddenClaims)
      || typeof facts.confirmedClaimsRaw !== "string" || typeof facts.socialProofRaw !== "string"
      || !Array.isArray(creatives) || !creatives.length) {
    return { erroEstrutural: "CAMPAIGN_INTEGRITY: campanha sem briefing validado completo. Regenere para validar segmento, objetivo e textos antes de publicar.", conflitos: [], totalCriativos: 0 };
  }
  try { assertObjectiveUnchanged(facts.intent.objective, campaign.objective); }
  catch (error) { return { erroEstrutural: error instanceof Error ? error.message : String(error), conflitos: [], totalCriativos: creatives.length }; }
  if (creatives.some((creative: any) => creative?.needsReview === true)) {
    return { erroEstrutural: "CAMPAIGN_INTEGRITY: criativos ainda precisam de revisao antes de publicar.", conflitos: [], totalCriativos: creatives.length };
  }
  const result = validateCampaignFactIntegrity([...creatives, overrides], facts);
  return { conflitos: result.conflicts, totalCriativos: creatives.length };
}

export function descreverConflito(c: CampaignFactConflict, totalCriativos: number): string {
  const d = paraDivergencia(c, totalCriativos);
  return d ? descreverDivergencia(d) : `${c.field}: ${c.reason}`;
}

export function assertCampaignPublishIntegrity(campaign: any, overrides: unknown = {}) {
  const { erroEstrutural, conflitos, totalCriativos } = avaliarIntegridade(campaign, overrides);
  if (erroEstrutural) throw new Error(erroEstrutural);
  if (conflitos.length) {
    throw new Error(`CAMPAIGN_INTEGRITY: ${conflitos.slice(0, 5).map((c) => descreverConflito(c, totalCriativos)).join("; ")}`);
  }
  return { status: "passed" as const, conflicts: [] as CampaignFactConflict[] };
}
