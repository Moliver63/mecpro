import { useAuth } from "./useAuth";

// Limites por plano — espelham o backend (server/db.ts PLAN_LIMITS)
const PLAN_LIMITS = {
  free:    { maxProjects: 1,    maxCompetitors: 2,  maxCampaigns: 0,    hasAI: false, hasMeta: false, hasGoogle: false, hasExportPdf: false, hasExportXlsx: false },
  basic:   { maxProjects: 3,    maxCompetitors: 5,  maxCampaigns: 3,    hasAI: true,  hasMeta: true,  hasGoogle: false, hasExportPdf: false, hasExportXlsx: false },
  premium: { maxProjects: 10,   maxCompetitors: null, maxCampaigns: null, hasAI: true, hasMeta: true,  hasGoogle: true,  hasExportPdf: true,  hasExportXlsx: true  },
  vip:     { maxProjects: null, maxCompetitors: null, maxCampaigns: null, hasAI: true, hasMeta: true,  hasGoogle: true,  hasExportPdf: true,  hasExportXlsx: true  },
} as const;

const PLAN_NAMES: Record<string, string> = {
  free: "Free", basic: "Basic", premium: "Premium", vip: "VIP"
};

const UPGRADE_TO: Record<string, string> = {
  free: "basic", basic: "premium", premium: "vip", vip: "vip"
};

export type PlanKey = keyof typeof PLAN_LIMITS;

export function usePlanLimit() {
  const { user } = useAuth();
  const plan = ((user as any)?.plan || "free") as PlanKey;
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  function canCreateProject(currentCount: number): { allowed: boolean; reason?: string; upgrade?: string } {
    if (limits.maxProjects === null) return { allowed: true };
    if (currentCount >= limits.maxProjects) {
      return {
        allowed: false,
        reason: `Seu plano ${PLAN_NAMES[plan]} permite no máximo ${limits.maxProjects} projeto(s). Faça upgrade para criar mais.`,
        upgrade: UPGRADE_TO[plan],
      };
    }
    return { allowed: true };
  }

  function canCreateCompetitor(currentCount: number): { allowed: boolean; reason?: string; upgrade?: string } {
    if (limits.maxCompetitors === null) return { allowed: true };
    if (currentCount >= limits.maxCompetitors!) {
      return {
        allowed: false,
        reason: `Seu plano ${PLAN_NAMES[plan]} permite no máximo ${limits.maxCompetitors} concorrente(s) por projeto.`,
        upgrade: UPGRADE_TO[plan],
      };
    }
    return { allowed: true };
  }

  function canGenerateCampaign(campaignsThisMonth: number): { allowed: boolean; reason?: string; upgrade?: string } {
    if (limits.maxCampaigns === null) return { allowed: true };
    if (limits.maxCampaigns === 0) {
      return { allowed: false, reason: `Geração de campanhas com IA não está disponível no plano ${PLAN_NAMES[plan]}.`, upgrade: "basic" };
    }
    if (campaignsThisMonth >= limits.maxCampaigns) {
      return { allowed: false, reason: `Seu plano ${PLAN_NAMES[plan]} permite ${limits.maxCampaigns} campanha(s)/mês. Limite atingido.`, upgrade: "premium" };
    }
    return { allowed: true };
  }

  function canUseMeta(): { allowed: boolean; reason?: string; upgrade?: string } {
    if (!limits.hasMeta) return { allowed: false, reason: `Integração Meta Ads disponível a partir do plano Basic.`, upgrade: "basic" };
    return { allowed: true };
  }

  function canUseGoogle(): { allowed: boolean; reason?: string; upgrade?: string } {
    if (!limits.hasGoogle) return { allowed: false, reason: `Integração Google Ads disponível a partir do plano Premium.`, upgrade: "premium" };
    return { allowed: true };
  }

  function canExportPdf(): { allowed: boolean; reason?: string; upgrade?: string } {
    if (!limits.hasExportPdf) return { allowed: false, reason: `Exportação PDF disponível a partir do plano Premium.`, upgrade: "premium" };
    return { allowed: true };
  }

  function canExportXlsx(): { allowed: boolean; reason?: string; upgrade?: string } {
    if (!limits.hasExportXlsx) return { allowed: false, reason: `Exportação XLSX disponível a partir do plano Premium.`, upgrade: "premium" };
    return { allowed: true };
  }

  return {
    plan,
    limits,
    planName: PLAN_NAMES[plan],
    canCreateProject,
    canCreateCompetitor,
    canGenerateCampaign,
    canUseMeta,
    canUseGoogle,
    canExportPdf,
    canExportXlsx,
  };
}
