import { SEGMENT_CONFIG } from "../shared/segmentConfig";

// Local retrieval of editorial rules, never of another customer's offers.
export function retrieveCampaignRules(segment: string, objective: string) {
  const config = SEGMENT_CONFIG[segment];
  return {
    version: 1,
    source: config ? `shared/segmentConfig:${segment}` : "campaign-rules:universal",
    segment,
    objective,
    forbidden: config?.copy.forbidden || [],
    compliance: config?.copy.compliance || "Nao invente fatos, garantias ou resultados.",
  };
}

export function canonicalObjective(value: unknown): string {
  const key = String(value || "").trim().toLowerCase().replace(/^outcome_/, "");
  return key === "branding" ? "awareness" : key;
}

// Achado real (log de producao, 28/09, projeto 49 "Shadia Hasan — Leads"):
// FACT_CONFLICT bloqueou a campanha inteira por um unico campo,
// `creatives.4.adSets.2.objective: "sales"`, numa campanha cujo objetivo
// confirmado e `leads`. Nenhum fato foi inventado — o texto todo passou. O
// que divergiu foi metadado estrutural de UM ad set.
//
// No Meta, objetivo e propriedade da CAMPANHA; ad set tem optimization_goal,
// nao objetivo proprio. Entao um ad set carregando `objective` e redundante
// por definicao, e quando ele diverge a resposta certa e alinhar com o
// objetivo confirmado da campanha, nao descartar a campanha inteira.
//
// Alinhar aqui NAO afrouxa o Fact Guard. O guard existe pra impedir que
// metadado redefina silenciosamente a intencao confirmada do servidor
// (comentario em campaignFactGuard.ts:810); alinhar o aninhado AO valor
// confirmado empurra na direcao da verdade, nao contra ela. E toda
// divergencia encontrada e devolvida pra quem chama registrar em log — nada
// e corrigido em silencio.
//
// Nao mexe em nenhum campo de texto: headline, copy, description e afins
// continuam sujeitos ao guard exatamente como antes.
export function alinharObjetivosAninhados<T>(
  dados: T,
  objetivoCampanha: unknown,
): { dados: T; divergencias: Array<{ campo: string; encontrado: string }> } {
  const alvo = canonicalObjective(objetivoCampanha);
  const divergencias: Array<{ campo: string; encontrado: string }> = [];
  if (!alvo) return { dados, divergencias };

  const visitar = (valor: unknown, caminho: string): unknown => {
    // Sem o ternario, uma raiz que e array produz caminho com ponto na frente
    // (".4.adSets.2.objective") — e esse caminho vai pro log de producao.
    if (Array.isArray(valor)) return valor.map((item, i) => visitar(item, caminho ? `${caminho}.${i}` : String(i)));
    if (!valor || typeof valor !== "object") return valor;

    const saida: Record<string, unknown> = {};
    for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
      const campo = caminho ? `${caminho}.${chave}` : chave;
      if (chave === "objective" && typeof item === "string" && item.trim() && canonicalObjective(item) !== alvo) {
        divergencias.push({ campo, encontrado: item });
        saida[chave] = objetivoCampanha as string;
        continue;
      }
      saida[chave] = visitar(item, campo);
    }
    return saida;
  };

  return { dados: visitar(dados, "") as T, divergencias };
}

export function assertObjectiveUnchanged(expected: unknown, actual: unknown) {
  if (!canonicalObjective(expected) || canonicalObjective(expected) !== canonicalObjective(actual)) {
    throw new Error("CAMPAIGN_OBJECTIVE_CONFLICT: configuracao mudaria o objetivo confirmado. Revise destino/pixel ou escolha explicitamente outro objetivo antes de publicar.");
  }
}
