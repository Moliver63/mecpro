/**
 * campaignScore.ts — Calcula score de auditoria de campanha sem LLM
 * Usado nos cards da página inicial para mostrar qualidade de cada campanha
 */

export interface CampaignScoreResult {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  color: string;
  bg: string;
  label: string;
  topIssue: string | null;
  isMock: boolean;
}

export function calcCampaignScore(campaign: any, clientProfile?: any): CampaignScoreResult {
  let score = 100;
  let topIssue: string | null = null;
  let isMock = false;

  const strategy  = campaign?.strategy  || "";
  const creatives = (() => { try { return JSON.parse(campaign?.creatives || "[]"); } catch { return []; } })();
  const adSets    = (() => { try { return JSON.parse(campaign?.adSets    || "[]"); } catch { return []; } })();
  const funnel    = (() => { try { return JSON.parse(campaign?.conversionFunnel || "[]"); } catch { return []; } })();
  const extra     = (() => { try { return JSON.parse(campaign?.aiResponse || "null"); } catch { return null; } })();
  const metrics   = extra?.metrics || null;

  // ── Estratégia (peso 20) ──
  if (!strategy || strategy.length < 50) { score -= 20; topIssue = topIssue || "Estratégia não gerada"; }
  else if (strategy.length < 200)         { score -= 10; topIssue = topIssue || "Estratégia superficial"; }

  // ── Mock detection ──
  const mockHeadlines = ["Descubra por que centenas escolhem", "Veja o que nossos clientes dizem", "Oferta especial — vagas limitadas", "Resultados reais em 30 dias"];
  if (extra?._isMock || creatives.some((c: any) => mockHeadlines.some(m => (c.headline || "").startsWith(m)))) {
    score -= 25; isMock = true; topIssue = topIssue || "Dados de mock — regenere a campanha";
  }

  // ── Criativos (peso 25) ──
  if (!creatives.length)    { score -= 25; topIssue = topIssue || "Sem criativos gerados"; }
  else if (creatives.length < 3) { score -= 10; }
  const noCopy = creatives.filter((c: any) => !c.copy && !c.bodyText).length;
  if (noCopy > 0) { score -= noCopy * 5; topIssue = topIssue || "Criativos sem copy"; }

  // ── AdSets (peso 15) ──
  if (!adSets.length) { score -= 15; topIssue = topIssue || "Públicos não definidos"; }

  // ── Métricas & Funil (peso 20) ──
  if (!metrics && !funnel.length) { score -= 20; topIssue = topIssue || "Métricas e funil ausentes"; }
  else if (!metrics)              { score -= 10; topIssue = topIssue || "Métricas não geradas"; }
  else if (!funnel.length)        { score -= 10; topIssue = topIssue || "Funil não gerado"; }

  // ── Briefing (peso 20) ──
  const p = clientProfile || {};
  let briefingMissing = 0;
  if (!p.mainPain)               briefingMissing++;
  if (!p.uniqueValueProposition) briefingMissing++;
  if (!p.mainObjections)         briefingMissing++;
  if (!p.desiredTransformation)  briefingMissing++;
  if (briefingMissing >= 3) { score -= 20; topIssue = topIssue || "Perfil do cliente incompleto"; }
  else if (briefingMissing >= 1) { score -= briefingMissing * 5; }

  score = Math.max(0, Math.min(100, score));

  const grade: CampaignScoreResult["grade"] =
    score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 45 ? "D" : "F";

  const gradeConfig = {
    A: { color: "#16a34a", bg: "#dcfce7", label: "Excelente" },
    B: { color: "#2563eb", bg: "#dbeafe", label: "Bom" },
    C: { color: "#d97706", bg: "#fef3c7", label: "Regular" },
    D: { color: "#ea580c", bg: "#ffedd5", label: "Fraco" },
    F: { color: "#dc2626", bg: "#fee2e2", label: "Crítico" },
  };

  return { score, grade, ...gradeConfig[grade], topIssue, isMock };
}
