/**
 * autonomousWorker.ts
 *
 * Worker do Agente Autônomo MECPro.
 * Executado periodicamente via Cron Job no Render.
 *
 * Funcionamento:
 *   1. Busca todos os projetos ativos no banco
 *   2. Para cada projeto, busca campanhas com publishStatus = "success"
 *   3. Roda o agente em cada campanha (análise + decisão + ação opcional)
 *
 * Configuração no Render (Cron Job):
 *   Command: npx tsx server/autonomousWorker.ts
 *   Schedule: 0 * * * *   (a cada hora)
 *             0 8,20 * * * (duas vezes por dia: 8h e 20h)
 *
 * Variáveis de ambiente:
 *   AUTONOMOUS_AGENT_MODE   = observe | semi | active  (padrão: observe)
 *   AGENT_PAUSE_THRESHOLD   = 35
 *   AGENT_SCALE_THRESHOLD   = 78
 *   AGENT_MAX_CAMPAIGNS     = 20
 *   ANTHROPIC_API_KEY       = sk-ant-... (Claude como LLM principal)
 */

import "dotenv/config";
import { log } from "./logger";
import * as db from "./db";
import { runAgentForCampaign } from "./autonomousAgent";

// ─── Busca campanhas elegíveis para monitoramento ─────────────────────────────

async function getActiveCampaignsForAgent(): Promise<Array<{
  id:        number;
  projectId: number;
  userId:    number;
  name:      string;
  platform:  string;
}>> {
  const eligible: Array<{ id: number; projectId: number; userId: number; name: string; platform: string }> = [];

  try {
    // Busca todos os projetos
    const allProjects = await db.getAllProjects() as any[];
    log.info("worker", `Projetos encontrados: ${allProjects.length}`);

    for (const project of allProjects) {
      const userId = project.userId;
      if (!userId) continue;

      // Busca campanhas do projeto
      const projectCampaigns = await db.getCampaignsByProjectId(project.id) as any[];

      // Filtra apenas campanhas publicadas com ID na plataforma (dados reais disponíveis)
      const published = projectCampaigns.filter((c: any) =>
        c.publishStatus === "success" &&
        (c.metaCampaignId || c.platform === "google") // tem dados reais
      );

      for (const campaign of published) {
        eligible.push({
          id:        campaign.id,
          projectId: campaign.projectId,
          userId,
          name:      campaign.name,
          platform:  campaign.platform,
        });
      }
    }

    log.info("worker", `Campanhas elegíveis para análise: ${eligible.length}`);
  } catch (e: any) {
    log.warn("worker", "Erro ao buscar campanhas", { error: e.message });
  }

  return eligible;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  const mode = process.env.AUTONOMOUS_AGENT_MODE || "observe";

  log.info("worker", "🤖 Autonomous Agent Worker iniciando", {
    mode,
    llm:       process.env.ANTHROPIC_API_KEY ? "Claude (principal)" : "Gemini (fallback)",
    timestamp: new Date().toISOString(),
  });

  const campaigns = await getActiveCampaignsForAgent();

  if (campaigns.length === 0) {
    log.info("worker", "Nenhuma campanha publicada encontrada — worker encerrado.");
    return;
  }

  const maxCampaigns = Number(process.env.AGENT_MAX_CAMPAIGNS || 20);
  const toProcess = campaigns.slice(0, maxCampaigns);

  log.info("worker", `Processando ${toProcess.length} de ${campaigns.length} campanha(s)`);

  const results = {
    total:     0,
    paused:    0,
    scaled:    0,
    adjusted:  0,
    creatives: 0,
    noAction:  0,
    errors:    0,
  };

  for (const campaign of toProcess) {
    try {
      log.info("worker", `Analisando: "${campaign.name}" (ID ${campaign.id} | ${campaign.platform})`);

      const decision = await runAgentForCampaign(campaign.id, campaign.userId);

      if (decision) {
        results.total++;
        switch (decision.action) {
          case "pause_campaign":   results.paused++;    break;
          case "scale_budget":     results.scaled++;    break;
          case "adjust_budget":    results.adjusted++;  break;
          case "suggest_creative": results.creatives++; break;
          default:                 results.noAction++;  break;
        }

        log.info("worker", `✓ ${campaign.name}: ${decision.action} (score ${decision.score}) via ${decision.llmUsed}`);
      }

      // Pausa entre campanhas para não sobrecarregar APIs
      await new Promise(r => setTimeout(r, 800));

    } catch (e: any) {
      results.errors++;
      log.warn("worker", `Erro na campanha ${campaign.id}: ${e.message?.slice(0, 100)}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  log.info("worker", "🤖 Worker finalizado", {
    ...results,
    elapsed: `${elapsed}s`,
    mode,
  });
}

// ─── Execução ─────────────────────────────────────────────────────────────────

main().catch(e => {
  log.warn("worker", "Erro fatal no Autonomous Agent Worker", {
    error: e.message,
    stack: e.stack?.slice(0, 300),
  });
  process.exit(1);
});
