#!/usr/bin/env python3
"""
fix_cascata_ai_10_09.py — aplica no server/ai.ts a parte da correção da
"cascata de geração" (10/09) que não dava pra subir pela integração
(o arquivo tem ~500KB).

Uso:  python3 scripts/fix_cascata_ai_10_09.py

O que o script aplica (tudo com âncora única — aborta se não achar):

  D0  import do Fact Guard ganha `type CampaignFactConflict`
  D1  buildCampaignFacts passa a receber `mediaBudget` (verba de anúncios
      SEPARADA de preço da oferta — "R$ 6/dia" virou "Valor: R$ 6" na copy)
  D2  prompt do gerador: orçamento rotulado como VERBA DE MÍDIA, com
      proibição explícita de citar como preço da oferta
  D3  ciclo de reparo de criativos vira determinístico:
        a) contexto de enrichCreativesWithScoresAndImages ganha
           `campaignFacts?` (revalidação factual pós-reparo)
        b) call site principal passa `campaignFacts`
        c) improveCreativeIfWeak: cada tentativa monta ISSUES com códigos
           explícitos ([placeholder_residual], [fact_conflict],
           [segment_alignment_missing], [compliance_risk_meta],
           [hook_strength_low], [clarity_low], [urgency_low],
           [specificity_low], [score_improvement]) e o resultado do reparo
           é REVALIDADO factualmente — se introduzir conflito factual novo,
           a tentativa é descartada e o reparador é avisado na próxima.

IMPORTANTE: o FACT_CONFLICT NÃO é afrouxado em nada — todo o reforço é
ANTES dele (prompt do gerador + reparo com revalidação). Quem manda é o
Fact Guard (server/campaignFactGuard.ts).

Depois de rodar: npx tsc --noEmit --skipLibCheck -p tsconfig.server.json
"""

import sys
from pathlib import Path

AI_TS = Path(__file__).resolve().parent.parent / "server" / "ai.ts"


def replace_once(content: str, anchor: str, replacement: str, label: str) -> str:
    """Substitui âncora que TEM que aparecer exatamente 1x. Aborta se não."""
    count = content.count(anchor)
    if count != 1:
        sys.exit(f"ERRO [{label}]: âncora aparece {count}x (esperado 1x). "
                 f"O ai.ts mudou? Revise a âncora antes de continuar.")
    return content.replace(anchor, replacement, 1)


def main() -> None:
    if not AI_TS.exists():
        sys.exit(f"ERRO: {AI_TS} não encontrado — rode o script na raiz do repo.")

    content = AI_TS.read_text(encoding="utf-8")
    original_len = len(content)

    # ── D0: import do Fact Guard ganha CampaignFactConflict ────────────────
    content = replace_once(
        content,
        'import { buildCampaignFacts, formatCampaignFactsForPrompt, validateCampaignFactIntegrity, resolveIsRealEstate, type CampaignFacts } from "./campaignFactGuard";',
        'import { buildCampaignFacts, formatCampaignFactsForPrompt, validateCampaignFactIntegrity, resolveIsRealEstate, type CampaignFacts, type CampaignFactConflict } from "./campaignFactGuard";',
        "D0 import CampaignFactConflict",
    )

    # ── D1: buildCampaignFacts recebe mediaBudget separado ─────────────────
    content = replace_once(
        content,
        """  const campaignFacts = buildCampaignFacts({
    input,
    clientProfile: clientProfile as any,
    campaignName: input.name,
    segment: initialSegment,
  });""",
        """  const campaignFacts = buildCampaignFacts({
    input,
    clientProfile: clientProfile as any,
    campaignName: input.name,
    segment: initialSegment,
    // Achado real (cascata de geração, 10/09): verba de mídia NÃO é fato
    // comercial — entra separada pro Fact Guard bloquear "budget virou preço".
    mediaBudget: { dailyMediaBudget: budgetDaily, monthlyMediaBudget: requestedBudget },
  });""",
        "D1 mediaBudget no buildCampaignFacts",
    )

    # ── D2: orçamento rotulado como VERBA DE MÍDIA no prompt do gerador ────
    content = replace_once(
        content,
        "ORÇAMENTO: R$ ${input.budget}/mês (R$ ${budgetDaily}/dia)",
        """ORÇAMENTO DE MÍDIA (verba de anúncios): R$ ${input.budget}/mês (R$ ${budgetDaily}/dia)
⚠️ ATENÇÃO: esse valor é a VERBA DE ANÚNCIOS, NUNCA o preço/valor do produto ou serviço. É PROIBIDO citar esse valor como preço da oferta (ex.: "por R$ X", "tudo incluso por R$ X"). Se a oferta não tiver preço informado nos FATOS VERIFICADOS, NÃO mencione valor nenhum.""",
        "D2a label orçamento de mídia",
    )
    content = replace_once(
        content,
        "- Budget mensal: R$ ${monthlyBudget}",
        "- Verba de mídia mensal (NUNCA citar na copy — não é preço da oferta): R$ ${monthlyBudget}",
        "D2b budget mensal não é preço",
    )

    # ── D3a: contexto do enrich ganha campaignFacts (opcional) ─────────────
    content = replace_once(
        content,
        """  city?: string;
  skipAIGeneration?: boolean;""",
        """  city?: string;
  campaignFacts?: CampaignFacts; // fatos verificados — revalidação factual pós-reparo (10/09)
  skipAIGeneration?: boolean;""",
        "D3a campaignFacts no contexto",
    )

    # ── D3b: call site principal passa campaignFacts ───────────────────────
    content = replace_once(
        content,
        """        city:           (clientProfile as any)?.city           || "",
        realImages:     input.realImages,          // fotos reais do cliente (modo upload)""",
        """        city:           (clientProfile as any)?.city           || "",
        campaignFacts,                              // revalidação factual pós-reparo (10/09)
        realImages:     input.realImages,          // fotos reais do cliente (modo upload)""",
        "D3b campaignFacts no call site",
    )

    # ── D3c: ciclo de reparo determinístico ────────────────────────────────
    start_marker = "  async function improveCreativeIfWeak(creative: any, index: number): Promise<any> {"
    end_marker = "  const rawList = Array.isArray(creatives) ? creatives : [];"
    if content.count(start_marker) != 1 or content.count(end_marker) != 1:
        sys.exit("ERRO [D3c]: marcadores do bloco improveCreativeIfWeak não são únicos.")
    start = content.index(start_marker)
    end = content.index(end_marker)
    if end <= start:
        sys.exit("ERRO [D3c]: end_marker antes do start_marker — arquivo inesperado.")

    new_block = '''  // Achado real (cascata de geração, 10/09): ciclo de reparo DETERMINÍSTICO.
  // Antes o reparador recebia só recomendações soltas e às vezes INVENTAVA
  // fato pra subir o score — o FACT_CONFLICT pegava, mas só no fim da
  // cascata. Agora cada tentativa recebe códigos de issue explícitos e o
  // resultado do reparo é revalidado factualmente: se introduzir conflito
  // factual NOVO, a tentativa inteira é descartada.
  // IMPORTANTE: o FACT_CONFLICT não foi afrouxado — o reforço é ANTES dele.
  function factConflictsOf(cr: any): CampaignFactConflict[] {
    if (!context.campaignFacts) return [];
    try {
      return validateCampaignFactIntegrity([cr], context.campaignFacts).conflicts;
    } catch {
      return [];
    }
  }

  async function improveCreativeIfWeak(creative: any, index: number): Promise<any> {
    let current = creative;
    const repairWarnings: string[] = [];
    for (let attempt = 1; attempt <= MAX_IMPROVE_ATTEMPTS; attempt++) {
      const score = scoreCreative(current);
      const placeholder = hasResidualPlaceholder(current);
      const factConflicts = factConflictsOf(current);
      // Placeholder e conflito factual são bloqueantes: mesmo com score alto,
      // precisa regenerar (um [cidade] não substituído ou um fato inventado
      // é alucinação que não pode publicar)
      if (score.finalScore >= SCORE_THRESHOLD && !placeholder && factConflicts.length === 0) {
        return { ...current, ...score, needsReview: false, ...(repairWarnings.length ? { repairWarnings } : {}) };
      }
      // O reparador recebe EXATAMENTE por que o criativo perdeu ponto —
      // códigos de issue estruturados, não texto solto.
      const issues: string[] = [];
      if (placeholder) {
        issues.push("[placeholder_residual] REMOVA todos os placeholders como [cidade], {preço}, EMPRESA_AQUI — use texto real ou omita o trecho");
      }
      if (factConflicts.length > 0) {
        const factDetail = factConflicts.slice(0, 3).map((c) => c.field + '="' + c.value + '" [' + c.reason + ']').join(", ");
        issues.push("[fact_conflict] o criativo afirma fato que NÃO consta nos FATOS VERIFICADOS: " + factDetail + " — remova ou substitua pelo fato verificado correspondente");
      }
      const segmentIssues = auditCreativeSegmentAlignment(current, segment);
      for (const seg of segmentIssues) {
        issues.push("[segment_alignment_missing] " + seg);
      }
      for (const rec of score.recommendations || []) {
        const r = rec.toLowerCase();
        const code = r.includes("hook") ? "hook_strength_low"
          : r.includes("proposta de valor") || r.includes("genéric") ? "clarity_low"
          : r.includes("urgência") ? "urgency_low"
          : r.includes("compliance") || r.includes("reprovação") ? "compliance_risk_meta"
          : r.includes("números") || r.includes("específic") ? "specificity_low"
          : "score_improvement";
        issues.push("[" + code + "] " + rec);
      }
      const recs = issues.join("\\n- ") || "[score_improvement] aumente especificidade, urgência e clareza";
      log.info("ai", `Score ${score.finalScore} < ${SCORE_THRESHOLD} — melhorando criativo (tentativa ${attempt}/${MAX_IMPROVE_ATTEMPTS})`, {
        index, headline: String(current.headline || "").slice(0, 40),
      });
      try {
        const avisoReparoAnterior = repairWarnings.length
          ? `\n⚠️ REPARO ANTERIOR DESCARTADO: ${repairWarnings.join(", ")}. Não repita esse erro.\n`
          : "";
        const raw = await gemini(
          `Melhore este criativo de anúncio Meta Ads resolvendo EXATAMENTE os issues listados.\n` +
          `ISSUES:\n- ${recs}\n\n` +
          `CRIATIVO ATUAL (JSON): ${JSON.stringify({ headline: current.headline, copy: current.copy, hook: current.hook, cta: current.cta, description: current.description })}\n\n` +
          `REGRAS ABSOLUTAS:\n` +
          `- Segmento correto da campanha: ${segment}. Mantenha vocabulário e CTA compatíveis com esse segmento.\n` +
          `- headline: máx 40 caracteres, específica, sem CTA embutido\n` +
          `- description: máx 30 caracteres, complementar à headline (NÃO repetir)\n` +
          `- copy: máx 500 caracteres, sem frases repetidas\n` +
          `- Mantenha o mesmo produto/oferta, apenas melhore a execução\n` +
          `- NUNCA invente números de vagas, unidades, contagens ou prazos específicos (ex: "apenas 50 vagas", "somente até sexta-feira", "últimas 48 horas") que não foram fornecidos pelo cliente. Se um issue pedir mais urgência, use gatilhos legítimos SEM dados numéricos inventados (benefício concreto, especificidade real da oferta, clareza do próximo passo) — jamais fabrique escassez ou prazo.\n` +
          `- O Fact Guard revalida o resultado e DESCARTA a tentativa inteira se você inventar fato.\n` +
          avisoReparoAnterior +
          `Retorne APENAS o JSON com os mesmos campos, sem markdown.`,
          { temperature: 0.8, jsonMode: true, maxOutputTokens: 800, _endpoint: "improve_creative" },
        );
        const improved = JSON.parse(String(raw).replace(/```json|```/g, "").trim());
        if (improved?.headline) {
          const candidato = { ...current, ...improved };
          // Revalidação factual pós-reparo: se o reparo introduziu conflito
          // factual NOVO (que não existia antes), descarta a tentativa.
          const conflitosAntes = new Set(factConflicts.map((c) => c.reason + "|" + c.value));
          const conflitosDepois = factConflictsOf(candidato);
          const introduzidos = conflitosDepois.filter((c) => !conflitosAntes.has(c.reason + "|" + c.value));
          if (introduzidos.length > 0) {
            const codigo = introduzidos[0]?.reason || "desconhecido";
            log.warn("ai", "Reparo introduziu fato não verificado — tentativa descartada", { index, attempt, reason: codigo });
            repairWarnings.push(`reparo_anterior_alucinou_${codigo}`);
            continue;
          }
          current = candidato;
        }
      } catch (e) {
        log.warn("ai", "Falha ao melhorar criativo — mantendo original", { index, attempt });
        break;
      }
    }
    // Último recurso: se AINDA há placeholder após os retries, remove por sanitização
    // (regenerar falhou — melhor uma frase enxuta que um [cidade] visível no anúncio)
    if (hasResidualPlaceholder(current)) {
      log.warn("ai", "Placeholder persistiu após retries — sanitizando como último recurso", { index });
      current = {
        ...current,
        headline:    stripPlaceholders(current.headline),
        copy:        stripPlaceholders(current.copy),
        hook:        stripPlaceholders(current.hook),
        description: stripPlaceholders(current.description),
        cta:         stripPlaceholders(current.cta),
      };
    }
    const finalScoreResult = scoreCreative(current);
    const finalPlaceholder = hasResidualPlaceholder(current);
    const finalFactConflicts = factConflictsOf(current);
    const stillWeak = finalScoreResult.finalScore < SCORE_THRESHOLD;
    if (stillWeak) {
      log.warn("ai", `Criativo permanece com score ${finalScoreResult.finalScore} após ${MAX_IMPROVE_ATTEMPTS} tentativas — marcado para revisão`, { index });
    }
    return { ...current, ...finalScoreResult, needsReview: stillWeak || finalPlaceholder || finalFactConflicts.length > 0, ...(repairWarnings.length ? { repairWarnings } : {}) };
  }

'''

    content = content[:start] + new_block + content[end:]

    # ── Validação pós-patch ────────────────────────────────────────────────
    checks = [
        "type CampaignFactConflict",
        "mediaBudget: { dailyMediaBudget: budgetDaily, monthlyMediaBudget: requestedBudget }",
        "ORÇAMENTO DE MÍDIA (verba de anúncios)",
        "Verba de mídia mensal (NUNCA citar na copy",
        "campaignFacts?: CampaignFacts;",
        "campaignFacts,                              // revalidação factual pós-reparo (10/09)",
        "function factConflictsOf",
        "[fact_conflict]",
        "[segment_alignment_missing]",
        "reparo_anterior_alucinou_",
        "O Fact Guard revalida o resultado e DESCARTA",
    ]
    missing = [c for c in checks if c not in content]
    if missing:
        sys.exit("ERRO: pós-patch faltando marcadores: " + repr(missing))

    leftovers = [
        "- Budget mensal: R$ ${monthlyBudget}",
        "RECOMENDAÇÕES: ${recs}",
    ]
    present = [l for l in leftovers if l in content]
    if present:
        sys.exit("ERRO: trechos que deveriam ter sido substituídos ainda presentes: " + repr(present))

    AI_TS.write_text(content, encoding="utf-8")
    print(f"OK — ai.ts patchado ({original_len} -> {len(content)} chars).")
    print("Aplicado: D0 import CampaignFactConflict | D1 mediaBudget separado | "
          "D2 orçamento = verba de mídia | D3 ciclo de reparo determinístico.")
    print("FACT_CONFLICT intacto — reforço é todo ANTES dele.")
    print("Próximo passo: npx tsc --noEmit --skipLibCheck -p tsconfig.server.json")


if __name__ == "__main__":
    main()
