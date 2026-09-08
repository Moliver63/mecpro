/**
 * campaignProfile.ts — resolveCampaignProfile
 *
 * Entrega 1 do Conselho marcada em docs/FRAMEWORK_EXCELENCIA.md e
 * docs/SYSTEM_MEMORY.md como "semente do Perfil da Campanha".
 *
 * Centraliza a resolução de segmento + tipo de oferta + subsegmento
 * (antes funções isoladas: inferOfferType em server/ai.ts, inferSubsegment
 * em shared/subsegments.ts, resolveIsRealEstate em server/campaignFactGuard.ts)
 * e expõe um objeto único CampaignProfile reutilizável por TODOS os callers
 * que precisam do "tipo de oferta real" da campanha.
 *
 * Sem quebrar o fluxo: confiança baixa em qualquer inferência permanece
 * silenciosa — sem instrução extra no prompt, sem hook/cta override,
 * sem alteração de segmento.
 *
 * É SÍNCRONA — nenhuma chamada de DB, IA externa ou I/O.
 */

import { log } from "./_core/log";
import { type OfferInference, type OfferType, inferOfferType } from "./ai";
import {
  type Subsegment,
  type SubsegmentInference,
  SUBSEGMENTS,
  inferSubsegment,
} from "../shared/subsegments";
import { buildCampaignFacts, resolveIsRealEstate } from "./campaignFactGuard";

// ─── ENTRADA ────────────────────────────────────────────────────────────────

export interface CampaignProfileInput {
  segment?:                 string;
  extraContext?:            string;
  name?:                    string;
  clientNiche?:             string | null;
  clientProductService?:    string | null;
  clientProductName?:       string | null;
  clientMainPain?:          string | null;
  clientUVP?:               string | null;
  clientDifferentials?:     string | null;
  /** Helper: se já rodou, passa o resolvedSegment do caller */
  preResolvedSegment?:      string;
  /** Helper: se já rodou, passa as campaignFacts do caller */
  preResolvedFacts?:        ReturnType<typeof buildCampaignFacts>;
}

// ─── SAÍDA ─────────────────────────────────────────────────────────────────

export interface CampaignProfile {
  initialSegment:         string;
  resolvedSegment:        string;
  isRealEstate:           boolean;
  offerType:              OfferType;
  offerConfidence:        OfferInference["confidence"];
  offerMatched:           string[];
  subsegmentKey:          string | null;
  subsegmentLabel:        string | null;
  subsegmentConfidence:   SubsegmentInference["confidence"];
  subsegmentMatched:      string[];
  hookOverride:           string | null;
  ctaOverride:            string[] | null;
  /** STRING VAZIA por design quando a confiança for "baixa" ou subsegment não detectado */
  subsegmentInstruction:  string;
}

// ─── DETECÇÃO LOCAL DE SEGMENTO (FALLBACK) ─────────────────────────────────

function detectInitialSegmentLocally(input: CampaignProfileInput): string {
  const text = [
    input.clientNiche,
    input.clientProductService,
    input.clientProductName,
    input.extraContext,
    input.name,
  ].filter(Boolean).join(" ").toLowerCase();

  if (!text.trim()) return "outro";

  const rules: Array<[string, RegExp[]]> = [
    ["imoveis_locacao", [
      /\b(aluguel|aluga(r|-se)?|loca[çc][ãa]o|locar|temporada|airbnb|di[áa]ria)\b/,
    ]],
    ["imoveis_venda", [
      /\b([àa] venda|vende-se|escritura|minha casa minha vida|\bmcmv\b|na planta|corretor|corretora)\b/,
    ]],
    ["saude_estetica", [
      /\b(est[ée]tica|harmoniza[çc][ãa]o|botox|ortodont|implante|invisalign|clareamento)\b/,
    ]],
    ["infoprodutos", [
      /\b(curso|mentoria|aula gr[áa]tis|ebook|ead|turma)\b/,
    ]],
    ["servicos_locais", [
      /\b(cl[íi]nica|consult[óo]rio|sal[ãa]o|oficina|agende|or[çc]amento)\b/,
    ]],
    ["alimentacao", [
      /\b(restaurante|delivery|lanche|pizza|confeitaria|padaria|doceria|hamburgueria)\b/,
    ]],
    ["moda_varejo", [
      /\b(cole[çc][ãa]o|roupa|cal[çc]ado|acess[óo]rio)\b/,
    ]],
    ["ecommerce", [
      /\b(loja|shopify|estoque limitado|cupom|adicione ao carrinho)\b/,
    ]],
    ["b2b", [
      /\b(saas|software|plataforma|b2b|empresas|automatize)\b/,
    ]],
    ["financeiro", [
      /\b(financeiro|investimento)\b/,
    ]],
  ];

  for (const [key, patterns] of rules) {
    if (patterns.some(re => re.test(text))) return key;
  }
  return "outro";
}

function resolveInitialSegment(input: CampaignProfileInput): string {
  const explicit = String(input.segment || "").trim();
  const validKeys = new Set<string>([
    ...Object.keys(SUBSEGMENTS),
    "financeiro",
    "outro",
  ]);

  if (explicit && validKeys.has(explicit)) return explicit;
  return detectInitialSegmentLocally(input);
}

// ─── FUNÇÃO CENTRAL ─────────────────────────────────────────────────────────

export function resolveCampaignProfile(input: CampaignProfileInput): CampaignProfile {
  const initialSegment = resolveInitialSegment(input);

  let facts = input.preResolvedFacts;
  if (!facts) {
    facts = buildCampaignFacts({
      input: {
        segment: input.segment,
        name: input.name,
        extraContext: input.extraContext,
      } as any,
      clientProfile: {
        niche:             input.clientNiche,
        productService:    input.clientProductService,
        productName:       input.clientProductName,
        mainPain:          input.clientMainPain,
        uniqueValueProposition: input.clientUVP,
        productDifferentials:    input.clientDifferentials,
      } as any,
      campaignName: input.name,
      segment:      initialSegment,
    } as any);
  }

  const isRealEstate = resolveIsRealEstate(initialSegment, facts);
  const purpose = facts?.realEstate?.purpose;

  let resolvedSegment = initialSegment;
  if (isRealEstate && (purpose === "locacao" || purpose === "temporada")) {
    resolvedSegment = "imoveis_locacao";
  } else if (isRealEstate && purpose === "venda") {
    resolvedSegment = "imoveis_venda";
  }

  if (input.preResolvedSegment && !isRealEstate) {
    resolvedSegment = input.preResolvedSegment;
  }

  const inferenceText = [
    input.clientProductService,
    input.clientMainPain,
    input.clientUVP,
    input.clientDifferentials,
    input.extraContext,
  ].filter(Boolean).join(". ");

  const offer: OfferInference = inferOfferType(inferenceText, resolvedSegment);
  const subsegment: SubsegmentInference = inferSubsegment(inferenceText, resolvedSegment);

  const matchedSub: Subsegment | undefined =
    subsegment.key
      ? SUBSEGMENTS[resolvedSegment]?.find(s => s.key === subsegment.key)
      : undefined;

  const wantsOverrides =
    !!matchedSub && subsegment.confidence !== "baixa";

  const hookOverride: string | null =
    wantsOverrides ? matchedSub!.hookOverride ?? null : null;

  const ctaOverride: string[] | null =
    wantsOverrides ? matchedSub!.ctaOverride ?? null : null;

  const subsegmentInstruction = wantsOverrides
    ? `\n🎯 SUBSEGMENTO DETECTADO: ${matchedSub!.label} (confiança ${subsegment.confidence}, sinais: ${subsegment.matched.slice(0, 3).join(", ")})\n${
        matchedSub!.hookOverride
          ? `- Use como inspiração de HOOK: ${matchedSub!.hookOverride}\n`
          : ""
      }${
        matchedSub!.ctaOverride?.length
          ? `- Prefira um destes CTAs (ou variação muito próxima): ${matchedSub!.ctaOverride.join(", ")}`
          : ""
      }`
    : "";

  if (subsegment.key) {
    log.info("campaignProfile", "subsegmento inferido via resolveCampaignProfile", {
      initialSegment,
      resolvedSegment,
      isRealEstate,
      offerType:        offer.offerType,
      offerConfidence:  offer.confidence,
      subsegmentKey:    subsegment.key,
      subsegmentConfidence: subsegment.confidence,
    });
  }

  return {
    initialSegment,
    resolvedSegment,
    isRealEstate,
    offerType:            offer.offerType,
    offerConfidence:      offer.confidence,
    offerMatched:         offer.matched,
    subsegmentKey:        subsegment.key,
    subsegmentLabel:      subsegment.label,
    subsegmentConfidence: subsegment.confidence,
    subsegmentMatched:    subsegment.matched,
    hookOverride,
    ctaOverride,
    subsegmentInstruction,
  };
}
