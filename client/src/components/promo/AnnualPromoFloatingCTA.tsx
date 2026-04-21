import { DEFAULT_PROMO_PLAN, PROMO_PLAN_MAP, formatBRL, getPromoSignupUrl, type PromoPlanSlug } from "@/lib/annualPromo";

interface AnnualPromoFloatingCTAProps {
  planSlug?: PromoPlanSlug;
  label?: string;
}

export default function AnnualPromoFloatingCTA({
  planSlug = DEFAULT_PROMO_PLAN.slug,
  label = "Ativar 60% de crédito",
}: AnnualPromoFloatingCTAProps) {
  const selectedPlan = PROMO_PLAN_MAP[planSlug] ?? DEFAULT_PROMO_PLAN;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 px-4">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-slate-950 p-2 shadow-[0_18px_60px_rgba(15,23,42,0.45)]">
        <a
          href={getPromoSignupUrl(planSlug)}
          className="pointer-events-auto flex min-h-14 items-center justify-center rounded-xl bg-emerald-400 px-5 text-center text-sm font-extrabold text-slate-950 transition hover:bg-emerald-300 sm:text-base"
        >
          {label} · {formatBRL(selectedPlan.creditValue)}
        </a>
      </div>
    </div>
  );
}
