export type PromoPlanSlug = "basic" | "premium" | "vip";

export interface PromoPlan {
  slug: PromoPlanSlug;
  name: string;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  annualPrice: number;
  creditValue: number;
  description: string;
  benefits: string[];
  popular?: boolean;
}

export const PROMO_DISCLAIMER = "Disponível por tempo limitado ou até esgotar os créditos promocionais.";
export const PROMO_PROGRESS = 76;

export function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function createPromoPlan(
  slug: PromoPlanSlug,
  name: string,
  monthlyPrice: number,
  description: string,
  benefits: string[],
  popular = false,
): PromoPlan {
  const annualMonthlyPrice = Math.floor(monthlyPrice * 0.8);
  const annualPrice = annualMonthlyPrice * 12;
  const creditValue = Number((annualPrice * 0.6).toFixed(2));

  return {
    slug,
    name,
    monthlyPrice,
    annualMonthlyPrice,
    annualPrice,
    creditValue,
    description,
    benefits,
    popular,
  };
}

export const PROMO_PLANS: PromoPlan[] = [
  createPromoPlan(
    "basic",
    "Basic",
    97,
    "Para autônomos que querem validar campanhas com menos pressão no caixa.",
    ["3 projetos", "5 concorrentes por projeto", "10 campanhas por mês", "Suporte por e-mail"],
  ),
  createPromoPlan(
    "premium",
    "Premium",
    197,
    "Para agências e times que querem mais volume, mais testes e mais resultado.",
    ["10 projetos", "Concorrentes ilimitados", "Campanhas ilimitadas", "Relatórios PDF", "Suporte prioritário"],
    true,
  ),
  createPromoPlan(
    "vip",
    "VIP",
    397,
    "Para operações maiores que querem escala, velocidade e suporte dedicado.",
    ["Projetos ilimitados", "Tudo do Premium", "API access", "Manager dedicado", "Onboarding personalizado"],
  ),
];

export const PROMO_PLAN_MAP = Object.fromEntries(PROMO_PLANS.map((plan) => [plan.slug, plan])) as Record<PromoPlanSlug, PromoPlan>;

export const DEFAULT_PROMO_PLAN = PROMO_PLAN_MAP.premium;

export function getPromoSignupUrl(plan: PromoPlanSlug = DEFAULT_PROMO_PLAN.slug) {
  return `/pricing?billing=annual&promo=credit60&plan=${plan}`;
}

export const PROMO_BANNERS = [
  "Ganhe 60% em crédito agora",
  "Ative seu bônus de campanha",
  "Comece com vantagem no tráfego",
];

export const PROMO_VISUAL_SUGGESTIONS = [
  "Selos de oferta limitada em amarelo e verde",
  "Barra de progresso simulando liberação de créditos",
  "Contador regressivo por campanha promocional",
  "CTAs em contraste forte com sombra e borda brilhante",
];
