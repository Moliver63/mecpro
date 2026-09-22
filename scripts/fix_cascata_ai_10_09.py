#!/usr/bin/env python3
"""
fix_cascata_ai_10_09.py — aplica no server/ai.ts a parte da correção da
"cascata de geração" (10/09) que AINDA FALTA na main atual.

ATENÇÃO — versão 2 (20/09): a main evoluiu desde o PR #22. O ciclo de
reparo de criativos (improveCreativeIfWeak) já foi reescrito com
validação factual por tentativa via acceptCreativeRewrite
(creativeRewriteGuard.ts), incluindo o fix do campo `pain`. Portanto
este script NÃO toca mais no ciclo de reparo — fazer isso seria
regressão.

O que ainda falta e este script aplica (âncora única — aborta se não achar):

  D1  buildCampaignFacts passa a receber `mediaBudget` (verba de anúncios
      SEPARADA de preço da oferta). O Fact Guard já tem o check
      budget_as_price_conflict_media_budget_is_not_offer_price (PR #22),
      mas sem isso ele nunca dispara — "R$ 6/dia" de verba pode virar
      "Valor: R$ 6" na copy sem bloqueio.
  D2  prompt do gerador: orçamento rotulado como VERBA DE MÍDIA, com
      proibição explícita de citar como preço da oferta (2 pontos).

IMPORTANTE: o FACT_CONFLICT NÃO é afrouxado em nada — todo o reforço é
ANTES dele. Quem manda é o Fact Guard (server/campaignFactGuard.ts).

Uso:  python3 scripts/fix_cascata_ai_10_09.py
Depois: npx tsc --noEmit --skipLibCheck -p tsconfig.server.json
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

    # Guard rails: se o ciclo de reparo antigo ou o patch v1 já foram
    # aplicados/sobrescritos, o estado não é o esperado — abortar é mais
    # seguro que aplicar parcial.
    if "acceptCreativeRewrite(current, improved, facts)" not in content:
        sys.exit("ERRO: improveCreativeIfWeak não usa acceptCreativeRewrite — "
                 "a main regrediu? Este script v2 pressupõe o ciclo de reparo "
                 "novo (14/09+19/09). Não continue.")
    if "mediaBudget: { dailyMediaBudget: budgetDaily" in content:
        sys.exit("OK — patch já aplicado anteriormente. Nada a fazer.")

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
    // comercial — entra separada pro Fact Guard bloquear "budget virou preço"
    // (check budget_as_price_conflict_* já existe no guard, mas sem isto
    // nunca disparava).
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

    # ── Validação pós-patch ────────────────────────────────────────────────
    checks = [
        "mediaBudget: { dailyMediaBudget: budgetDaily, monthlyMediaBudget: requestedBudget }",
        "ORÇAMENTO DE MÍDIA (verba de anúncios)",
        "Verba de mídia mensal (NUNCA citar na copy",
    ]
    missing = [c for c in checks if c not in content]
    if missing:
        sys.exit("ERRO: pós-patch faltando marcadores: " + repr(missing))

    leftovers = [
        "ORÇAMENTO: R$ ${input.budget}/mês (R$ ${budgetDaily}/dia)\nDURAÇÃO",
        "- Budget mensal: R$ ${monthlyBudget}",
    ]
    present = [l for l in leftovers if l in content]
    if present:
        sys.exit("ERRO: trechos que deveriam ter sido substituídos ainda presentes: " + repr(present))

    AI_TS.write_text(content, encoding="utf-8")
    print(f"OK — ai.ts patchado ({original_len} -> {len(content)} chars).")
    print("Aplicado: D1 mediaBudget separado | D2 orçamento = verba de mídia (2 pontos).")
    print("Ciclo de reparo NÃO tocado — a versão da main (acceptCreativeRewrite) é mais nova.")
    print("FACT_CONFLICT intacto — reforço é todo ANTES dele.")
    print("Próximo passo: npx tsc --noEmit --skipLibCheck -p tsconfig.server.json")


if __name__ == "__main__":
    main()
