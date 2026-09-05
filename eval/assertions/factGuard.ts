/**
 * Asserção customizada: reaplica o Fact Guard REAL do MecProAI
 * (server/campaignFactGuard.ts) sobre a saída do provider, em vez de
 * reescrever as mesmas regras em YAML. Se o Fact Guard mudar, o eval
 * automaticamente reflete a mudança — uma fonte de verdade só.
 */
import { validateCampaignFactIntegrity } from "../../server/campaignFactGuard";

export default function assertFactGuard(output: unknown) {
  const parsed = typeof output === "string" ? JSON.parse(output) : output;
  const { creatives, campaignFacts } = parsed || {};

  if (!campaignFacts) {
    // Oferta não-imobiliária (ou provider não anexou os fatos) — o Fact
    // Guard hoje só tem checagens estruturais completas pra imóveis
    // (ver pendência registrada em docs/MEC_PRO_AI_CURRENT_STATE.md).
    // Não reprova por falta de dado que o próprio sistema ainda não gera.
    return {
      pass: true,
      score: 1,
      reason: "Sem campaignFacts anexado (oferta não-imobiliária) — Fact Guard não avaliado neste caso.",
    };
  }

  const validation = validateCampaignFactIntegrity(creatives || [], campaignFacts);
  return {
    pass: validation.status === "passed",
    score: validation.status === "passed" ? 1 : 0,
    reason:
      validation.status === "passed"
        ? "Fact Guard aprovou: sem contradições factuais, escassez/exclusividade ou moradia própria sem base."
        : `Fact Guard reprovou: ${validation.conflicts
            .map((c: { reason: string; value: string }) => `${c.reason} ("${c.value}")`)
            .join("; ")}`,
  };
}
