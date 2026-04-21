/**
 * stripe-config.ts — Mapeamento de planos para Price IDs do Stripe
 */

export type PlanSlug = "basic" | "premium" | "vip";
export type BillingMode = "monthly" | "yearly";

function resolveAnnualEnv(plan: PlanSlug) {
  const yearlyVars: Record<PlanSlug, string | undefined> = {
    basic: process.env.STRIPE_PRICE_BASIC_YEARLY || process.env.STRIPE_PRICE_BASIC_ANNUAL,
    premium: process.env.STRIPE_PRICE_PREMIUM_YEARLY || process.env.STRIPE_PRICE_PREMIUM_ANNUAL,
    vip: process.env.STRIPE_PRICE_VIP_YEARLY || process.env.STRIPE_PRICE_VIP_ANNUAL,
  };

  return yearlyVars[plan];
}

/**
 * Retorna o Price ID do Stripe para o plano e ciclo informado.
 */
export function getStripePriceId(plan: PlanSlug, billing: BillingMode = "monthly"): string | null {
  if (billing === "yearly") {
    return resolveAnnualEnv(plan) || null;
  }

  const monthlyVars: Record<PlanSlug, string | undefined> = {
    basic: process.env.STRIPE_PRICE_BASIC,
    premium: process.env.STRIPE_PRICE_PREMIUM,
    vip: process.env.STRIPE_PRICE_VIP,
  };

  return monthlyVars[plan] || null;
}

/**
 * Verifica se um plano está devidamente configurado no Stripe.
 */
export function isPlanStripeConfigured(plan: PlanSlug, billing: BillingMode = "monthly"): boolean {
  const priceId = getStripePriceId(plan, billing);
  return !!(priceId && priceId !== "" && !priceId.includes("SUBSTITUA"));
}

/**
 * Retorna o Product ID do Stripe para o plano informado.
 */
export function getStripeProductId(plan: PlanSlug): string | null {
  const map: Record<PlanSlug, string | undefined> = {
    basic: process.env.STRIPE_PRODUCT_BASIC,
    premium: process.env.STRIPE_PRODUCT_PREMIUM,
    vip: process.env.STRIPE_PRODUCT_VIP,
  };

  return map[plan] || null;
}

export const PAID_PLANS: PlanSlug[] = ["basic", "premium", "vip"];

export const PLAN_META: Record<PlanSlug, { name: string; monthlyPrice: string; yearlyPrice: string }> = {
  basic: { name: "Basic", monthlyPrice: "R$ 97/mês", yearlyPrice: "R$ 924/ano" },
  premium: { name: "Premium", monthlyPrice: "R$ 197/mês", yearlyPrice: "R$ 1.884/ano" },
  vip: { name: "VIP", monthlyPrice: "R$ 397/mês", yearlyPrice: "R$ 3.804/ano" },
};
