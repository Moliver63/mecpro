/**
 * Provider customizado do Promptfoo que roda o PIPELINE REAL do MecProAI
 * (não um mock) — chama buildCampaignFromAds e, quando a oferta é
 * imobiliária, buildCampaignFacts, exatamente como o motor eco/híbrido em
 * produção (server/ai.ts). O Promptfoo mede o resultado; a geração e a
 * correção continuam sendo responsabilidade do próprio MecProAI — este
 * arquivo não reimplementa nenhuma regra, só invoca o código real.
 *
 * Requer que o processo rode com o loader do tsx (o projeto já depende
 * dele para os testes), porque este arquivo importa .ts diretamente:
 *   cross-env NODE_OPTIONS=--import=tsx promptfoo eval -c eval/promptfooconfig.pipeline.yaml
 * (ver npm run eval:pipeline).
 */
import { buildCampaignFromAds } from "../../server/ai";
import { buildCampaignFacts, type CampaignFacts } from "../../server/campaignFactGuard";

interface PipelineTestVars {
  objective?: string;
  isRealEstate?: boolean;
  segment?: string;
  desiredCreatives?: number;
  requestedBudget?: number;
  campaignDurationDays?: number;
  ageMin?: number;
  ageMax?: number;
  clientProfile?: Record<string, unknown>;
  input?: Record<string, unknown>;
}

export default class MecProPipelineProvider {
  id() {
    return "mecpro-pipeline";
  }

  async callApi(_prompt: string, context?: { vars?: PipelineTestVars }) {
    const vars = context?.vars || {};
    const clientProfile = vars.clientProfile || {};
    const objective = vars.objective || "leads";

    let campaignFacts: CampaignFacts | undefined;
    if (vars.isRealEstate) {
      campaignFacts = buildCampaignFacts({
        input: vars.input || {},
        clientProfile,
        segment: vars.segment,
      });
    }

    try {
      const result = await buildCampaignFromAds(0, objective, clientProfile, [], {
        desiredCreatives: vars.desiredCreatives ?? 4,
        requestedBudget: vars.requestedBudget,
        campaignDurationDays: vars.campaignDurationDays,
        ageMin: vars.ageMin,
        ageMax: vars.ageMax,
        isRealEstate: !!vars.isRealEstate,
        campaignFacts,
      });

      return {
        // Saída em JSON: as asserções (eval/assertions/*.ts) recebem isso
        // já parseado e reaplicam os MESMOS validadores de produção — não
        // um critério paralelo inventado para o eval.
        output: JSON.stringify({
          creatives: result.creatives,
          adSets: result.adSets,
          campaignFacts,
        }),
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        output: "",
      };
    }
  }
}
