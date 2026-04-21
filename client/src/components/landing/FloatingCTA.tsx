import type { LandingOfferProps } from "./types";

export default function FloatingCTA({ signupUrl, creditValue }: LandingOfferProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 px-4">
      <div className="mx-auto max-w-md rounded-2xl bg-slate-950 p-2 shadow-[0_18px_60px_rgba(15,23,42,0.45)] ring-1 ring-white/10">
        <a
          href={signupUrl}
          className="pointer-events-auto flex min-h-14 items-center justify-center rounded-xl bg-emerald-400 px-5 text-center text-sm font-extrabold text-slate-950 transition hover:bg-emerald-300 sm:text-base"
        >
          Ativar 60% de crédito · {creditValue}
        </a>
      </div>
    </div>
  );
}
