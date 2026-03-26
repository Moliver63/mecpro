/**
 * stripe-config.ts — Mapeamento de planos para Price IDs do Stripe
 * Localização: shared/stripe-config.ts
 */

export type PlanSlug = "basic" | "premium" | "vip";

/**
 * Retorna o Price ID do Stripe para o plano informado.
 * Os valores são lidos das variáveis de ambiente.
 */
export function getStripePriceId(plan: PlanSlug): string | null {
  const map: Record<PlanSlug, string | undefined> = {
    basic:   process.env.STRIPE_PRICE_BASIC,
    premium: process.env.STRIPE_PRICE_PREMIUM,
    vip:     process.env.STRIPE_PRICE_VIP,
  };

  return map[plan] || null;
}

/**
 * Verifica se um plano está devidamente configurado no Stripe
 */
export function isPlanStripeConfigured(plan: PlanSlug): boolean {
  const priceId = getStripePriceId(plan);
  return !!(priceId && priceId !== "" && !priceId.includes("SUBSTITUA"));
}

/**
 * Retorna o Product ID do Stripe para o plano informado.
 */
export function getStripeProductId(plan: PlanSlug): string | null {
  const map: Record<PlanSlug, string | undefined> = {
    basic:   process.env.STRIPE_PRODUCT_BASIC,
    premium: process.env.STRIPE_PRODUCT_PREMIUM,
    vip:     process.env.STRIPE_PRODUCT_VIP,
  };

  return map[plan] || null;
}

/**
 * Lista todos os planos pagos disponíveis
 */
export const PAID_PLANS: PlanSlug[] = ["basic", "premium", "vip"];

/**
 * Metadados dos planos (nome, preço exibido)
 */
export const PLAN_META: Record<PlanSlug, { name: string; price: string }> = {
  basic:   { name: "Basic",   price: "R$ 97/mês"  },
  premium: { name: "Premium", price: "R$ 197/mês" },
  vip:     { name: "VIP",     price: "R$ 397/mês" },
};
