/**
 * nicheResolver.ts — deriveNicheFromProfile
 *
 * Fecha o segundo lado da Entrega 1 do Conselho (docs/FRAMEWORK_EXCELENCIA.md
 * linha 798): "Conectar inferOfferType + SUBSEGMENTS ao resolveCampaignProfile
 * — learning_base só grava niche='geral'".
 *
 * PARTE 1 — resolveCampaignProfile (server/campaignProfile.ts): detecta
 *   segmento, tipo de oferta e subsegmento a partir do briefing.
 * PARTE 2 — ESTE ARQUIVO: COMPOSIÇÃO do nicho estruturado a partir do
 *   CampaignProfile já calculado.
 *
 * Quem usa isto:
 *   - generateCampaign em server/ai.ts: devolve o nicho calculado no
 *     resultado. O caller (adminIntelligenceRouter.updateLearning) usa
 *     o nicho retornado em vez de o input.segment cru.
 *   - ML consumer / dashboard admin que queira exibir tipo de oferta.
 */

import type { CampaignProfile } from "./campaignProfile";
import { SUBSEGMENTS } from "../shared/subsegments";

// ─── ENTRADA ────────────────────────────────────────────────────────────────

export interface DeriveNicheOptions {
  /** Em vez do fallback automático "geral", sobrescreve com valor explícito. */
  fallbackNiche?: string;
}

// ─── CONSTANTES ─────────────────────────────────────────────────────────────

const VALID_SEGMENT_KEYS = new Set<string>([
  "imoveis_venda", "imoveis_locacao",
  "alimentacao", "servicos_locais", "saude_estetica",
  "infoprodutos", "moda_varejo", "ecommerce", "b2b", "financeiro",
  "outro",
]);

const OFFER_TYPE_HUMAN: Record<string, string> = {
  venda:       "venda",
  locacao:     "locacao",
  temporada:   "temporada",
  lancamento:  "lancamento",
  leilao:      "leilao",
  servico:     "servico",
  produto:     "produto",
  consulta:    "consulta",
  delivery:    "delivery",
  curso:       "curso",
  desconhecido: "desconhecido",
};

// ─── NORMALIZAÇÃO ──────────────────────────────────────────────────────────

function normalizeNicheKey(s: string): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

// ─── FUNÇÃO PRINCIPAL ──────────────────────────────────────────────────────

/**
 * deriveNicheFromProfile — função pura, síncrona, sem I/O.
 *
 * Composição da chave de nicho:
 *   3 → "imoveis_locacao.locacao_anual"         (alta confiança)
 *   4 → "imoveis_locacao.temporada_tentativo"   (média confiança)
 *   5 → "ecommerce.curso"                       (sem subsegmento, offerType batido)
 *   5b→ "imoveis_venda.venda"                   (locacao + offer venda)
 *   6 → "ecommerce"                             (segmento isolado)
 *   7 → "geral"                                  (último caso)
 */
export function deriveNicheFromProfile(
  profile: CampaignProfile,
  options: DeriveNicheOptions = {},
): string {
  if (!profile || typeof profile !== "object") {
    return normalizeNicheKey(options.fallbackNiche || "geral");
  }

  const segment = normalizeNicheKey(profile.resolvedSegment || "");
  if (!segment || !VALID_SEGMENT_KEYS.has(segment)) {
    return normalizeNicheKey(options.fallbackNiche || "geral");
  }

  if (segment === "outro") {
    return options.fallbackNiche ? normalizeNicheKey(options.fallbackNiche) : "geral";
  }

  // confirmação cruzada: subsegmento da tabela SUBSEGMENTS
  const subsegmentKeyRaw = profile.subsegmentKey || "";
  const subsegmentKey    = normalizeNicheKey(subsegmentKeyRaw);
  const subsegmentExists =
    !!subsegmentKey && !!SUBSEGMENTS[segment]?.some(s =>
      s.key === subsegmentKeyRaw || normalizeNicheKey(s.key) === subsegmentKey);

  // 3. alta confiança + subsegmento válido
  if (subsegmentExists && profile.subsegmentConfidence === "alta") {
    return `${segment}.${subsegmentKey}`;
  }

  // 4. média confiança + subsegmento válido
  if (subsegmentExists && profile.subsegmentConfidence === "media") {
    return `${segment}.${subsegmentKey}_tentativo`;
  }

  // 5. sem subsegmento — cai pra OfferType
  const offerRaw = profile.offerType || "desconhecido";
  const offer    = OFFER_TYPE_HUMAN[offerRaw] ? offerRaw : "desconhecido";

  if (offer !== "desconhecido") {
    // 5b. conflito: imoveis_locacao detectado mas offerType = venda
    if (segment === "imoveis_locacao" && offer === "venda") {
      return "imoveis_venda.venda";
    }
    return `${segment}.${offer}`;
  }

  // 6. fallback: chave isolada do segmento
  return options.fallbackNiche ? normalizeNicheKey(options.fallbackNiche) : segment;
}

// Rótulo de segmento SEM subsegmento. Precisa existir porque
// `deriveNicheFromProfile` devolve chave de segmento pura no passo 6
// (fallback sem subsegmento e sem offerType), então "b2b", "alimentacao" e
// "imoveis_venda" chegam aqui sem ponto — e as regras abaixo todas testam
// `startsWith("b2b.")`, com ponto. Sem este mapa, "b2b" caía no
// titleizador genérico e virava "B2b" na interface.
const ROTULO_DE_SEGMENTO: Record<string, string> = {
  imoveis_venda:    "Imóveis à venda",
  imoveis_locacao:  "Imóveis para alugar",
  alimentacao:      "Alimentação",
  servicos_locais:  "Serviços locais",
  saude_estetica:   "Saúde e estética",
  infoprodutos:     "Infoprodutos / Educação",
  moda_varejo:      "Moda e varejo",
  ecommerce:        "E-commerce / Produto",
  b2b:              "B2B / Empresas",
  financeiro:       "Financeiro / Investimentos",
  outro:            "Outro",
};

/**
 * Rótulo humano do nicho (exibição em UI). Não usar para lookup em DB.
 *
 * Dois bugs reais corrigidos aqui (05/10 → 06/10), os dois travando o teste
 * "nicheToHumanLabel: composto → rótulo humano":
 *
 * 1. Chave de segmento pura ("b2b") não casava com nenhuma regra, porque
 *    todas testam o prefixo COM ponto ("b2b."). Caía no titleizador e virava
 *    "B2b". Valia pros onze segmentos: "Alimentacao", "Saude Estetica",
 *    "Imoveis Venda" — todos sem acento e sem o rótulo pensado.
 * 2. O sufixo `_tentativo` só era traduzido no titleizador genérico, no fim.
 *    Qualquer nicho que casasse uma regra específica perdia o "(tentativa)":
 *    `imoveis_venda.lancamento_tentativo` devolvia "Imóvel na planta",
 *    escondendo do usuário que o subsegmento foi um palpite de confiança
 *    média. Agora o sufixo é separado na entrada e reaplicado no fim, valendo
 *    pra todos os caminhos.
 */
export function nicheToHumanLabel(niche: string): string {
  const bruto = (niche || "").toLowerCase();
  // Separado na entrada: vale pros três caminhos (regra específica, rótulo
  // de segmento, titleizador), não só pro último.
  const ehTentativa = /_tentativo$/.test(bruto);
  const lower = bruto.replace(/_tentativo$/, "");
  return rotuloBase(lower) + (ehTentativa ? " (tentativa)" : "");
}

function rotuloBase(lower: string): string {
  if (lower.startsWith("imoveis_locacao.locacao_anual"))  return "Imóvel para alugar (anual)";
  if (lower.startsWith("imoveis_locacao.comercial"))      return "Imóvel comercial para alugar";
  if (lower.startsWith("imoveis_locacao.temporada"))      return "Temporada / Diária";
  if (lower.startsWith("imoveis_venda.mcmv"))             return "Minha Casa Minha Vida";
  if (lower.startsWith("imoveis_venda.lancamento"))       return "Imóvel na planta";
  if (lower.startsWith("imoveis_venda.alto_padrao"))      return "Imóvel de alto padrão";
  if (lower.startsWith("imoveis_venda.investimento"))     return "Investimento imobiliário";
  if (lower.startsWith("imoveis_venda.venda_pronta"))     return "Imóvel pronto para morar";
  if (lower.startsWith("imoveis_venda.comercial"))        return "Imóvel comercial à venda";
  if (lower.startsWith("alimentacao.delivery"))          return "Delivery / Pedido online";
  if (lower.startsWith("alimentacao."))                   return "Alimentação";
  if (lower.startsWith("ecommerce."))                     return "E-commerce / Produto";
  if (lower.startsWith("moda_varejo."))                   return "Moda e varejo";
  if (lower.startsWith("infoprodutos.curso"))             return "Curso / Educação";
  if (lower.startsWith("infoprodutos."))                  return "Infoprodutos / Educação";
  if (lower.startsWith("saude_estetica.consulta"))        return "Consulta / Avaliação";
  if (lower.startsWith("saude_estetica."))                return "Saúde e estética";
  if (lower.startsWith("servicos_locais."))               return "Serviços locais";
  if (lower.startsWith("b2b.saas"))                       return "Software / SaaS";
  if (lower.startsWith("b2b."))                           return "B2B / Empresas";
  if (lower.startsWith("financeiro."))                    return "Financeiro / Investimentos";
  // Chave de segmento pura, sem subsegmento.
  if (ROTULO_DE_SEGMENTO[lower]) return ROTULO_DE_SEGMENTO[lower];
  return lower
    .split(".")
    .map(s => s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "))
    .join(" — ");
}
