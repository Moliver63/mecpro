import { DEFAULT_PROMO_PLAN, PROMO_DISCLAIMER, PROMO_PLAN_MAP, PROMO_PROGRESS, formatBRL, getPromoSignupUrl, type PromoPlanSlug } from "@/lib/annualPromo";

interface AnnualPromoBannerProps {
  title?: string;
  description?: string;
  ctaLabel?: string;
  planSlug?: PromoPlanSlug;
  tone?: "dark" | "light" | "emerald";
  compact?: boolean;
}

const toneStyles = {
  dark: {
    wrapper: "border-slate-800 bg-slate-950 text-white shadow-2xl shadow-slate-950/20",
    eyebrow: "bg-white/10 text-amber-200 border border-white/10",
    desc: "text-slate-300",
    bar: "bg-white/10",
    barFill: "bg-gradient-to-r from-amber-300 via-emerald-300 to-emerald-500",
    button: "bg-emerald-400 text-slate-950 hover:bg-emerald-300",
    meta: "text-slate-400",
  },
  light: {
    wrapper: "border-slate-200 bg-white text-slate-950 shadow-sm",
    eyebrow: "bg-amber-50 text-amber-700 border border-amber-200",
    desc: "text-slate-600",
    bar: "bg-slate-100",
    barFill: "bg-gradient-to-r from-amber-400 via-emerald-400 to-emerald-500",
    button: "bg-slate-950 text-white hover:bg-slate-800",
    meta: "text-slate-500",
  },
  emerald: {
    wrapper: "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-amber-50 text-slate-950 shadow-sm",
    eyebrow: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    desc: "text-slate-700",
    bar: "bg-emerald-100",
    barFill: "bg-gradient-to-r from-emerald-500 via-emerald-400 to-amber-400",
    button: "bg-emerald-500 text-white hover:bg-emerald-600",
    meta: "text-slate-600",
  },
} as const;

export default function AnnualPromoBanner({
  title = "Ganhe 60% em crédito agora",
  description,
  ctaLabel = "Ativar 60% de crédito",
  planSlug = DEFAULT_PROMO_PLAN.slug,
  tone = "emerald",
  compact = false,
}: AnnualPromoBannerProps) {
  const selectedPlan = PROMO_PLAN_MAP[planSlug] ?? DEFAULT_PROMO_PLAN;
  const styles = toneStyles[tone];
  const copy = description ?? `Feche o plano anual ${selectedPlan.name} por ${formatBRL(selectedPlan.annualPrice)} e receba ${formatBRL(selectedPlan.creditValue)} em créditos para campanhas dentro da plataforma.`;

  return (
    <section className={`rounded-[28px] border ${styles.wrapper} ${compact ? "p-5" : "p-6 sm:p-8"}`}>
      <div className={`flex ${compact ? "flex-col gap-4" : "flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"}`}>
        <div className="max-w-3xl">
          <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.22em] ${styles.eyebrow}`}>
            Oferta anual MecproAI
          </span>
          <h3 className={`mt-4 font-black tracking-tight ${compact ? "text-2xl" : "text-3xl sm:text-4xl"}`}>
            {title}
          </h3>
          <p className={`mt-3 max-w-2xl text-sm leading-7 sm:text-base ${styles.desc}`}>
            {copy}
          </p>
          <div className="mt-4 max-w-xl">
            <div className={`h-3 overflow-hidden rounded-full ${styles.bar}`}>
              <div className={`h-full rounded-full ${styles.barFill}`} style={{ width: `${PROMO_PROGRESS}%` }} />
            </div>
            <p className={`mt-2 text-xs font-semibold uppercase tracking-[0.2em] ${styles.meta}`}>
              {PROMO_PROGRESS}% do lote promocional já comprometido · {PROMO_DISCLAIMER}
            </p>
          </div>
        </div>

        <div className="flex w-full max-w-sm flex-col gap-3 lg:items-end">
          <a
            href={getPromoSignupUrl(planSlug)}
            className={`inline-flex min-h-14 w-full items-center justify-center rounded-2xl px-6 text-center text-sm font-extrabold transition sm:text-base ${styles.button}`}
          >
            {ctaLabel}
          </a>
          <p className={`text-center text-xs font-medium lg:text-right ${styles.meta}`}>
            {PROMO_DISCLAIMER}
          </p>
        </div>
      </div>
    </section>
  );
}
