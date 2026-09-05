/**
 * Asserção customizada: reaplica a auditoria editorial REAL do MecProAI
 * (shared/campaignCopyQuality.ts) — linguagem interna vazando pro anúncio
 * (achado real, campanha 746: "A foto real orienta o ângulo deste card..."),
 * hook idêntico à headline, aberturas repetidas entre cards do carrossel.
 */
import { getCarouselEditorialIssues } from "../../shared/campaignCopyQuality";

export default function assertEditorial(output: unknown) {
  const parsed = typeof output === "string" ? JSON.parse(output) : output;
  const { creatives } = parsed || {};

  if (!Array.isArray(creatives) || creatives.length === 0) {
    return { pass: false, score: 0, reason: "Nenhum criativo retornado pelo pipeline." };
  }

  const issues = getCarouselEditorialIssues(creatives);
  return {
    pass: issues.length === 0,
    score: issues.length === 0 ? 1 : 0,
    reason: issues.length === 0 ? "Sem problemas editoriais detectados." : `Problemas editoriais: ${issues.join("; ")}`,
  };
}
