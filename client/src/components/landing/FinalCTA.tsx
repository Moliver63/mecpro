import type { LandingOfferProps } from "./types";

export default function FinalCTA({ annualPrice, creditValue, signupUrl }: LandingOfferProps) {
  return (
    <section className="bg-slate-950 py-20 text-white sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-[36px] border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20 backdrop-blur sm:p-10 lg:p-12">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <span className="inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.22em] text-amber-200">
                Última chamada
              </span>
              <h2 className="mt-5 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
                Feche o anual por {annualPrice} e ganhe {creditValue} em créditos para tráfego pago
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
                Depois que essa campanha encerrar, o plano volta ao valor normal sem créditos. Quem entra agora começa com vantagem. Quem espera entra pagando mais caro em oportunidade.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <a
                  href={signupUrl}
                  className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-emerald-400 px-8 text-base font-extrabold text-slate-950 transition hover:-translate-y-0.5 hover:bg-emerald-300"
                >
                  Quero ativar meu crédito agora
                </a>
                <a
                  href="#faq"
                  className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-8 text-base font-bold text-white transition hover:bg-white/10"
                >
                  Ver perguntas frequentes
                </a>
              </div>
            </div>

            <div className="space-y-4 rounded-[32px] border border-white/10 bg-slate-900/80 p-6">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Oferta</p>
                <p className="mt-3 text-3xl font-black text-white">{annualPrice}</p>
              </div>
              <div className="rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-100">Crédito promocional</p>
                <p className="mt-3 text-3xl font-black text-emerald-300">{creditValue}</p>
              </div>
              <a
                href={signupUrl}
                className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-white px-6 text-base font-extrabold text-slate-950 transition hover:bg-slate-100"
              >
                Ativar crédito líquido
              </a>
            </div>
          </div>
        </div>

        <footer className="mt-10 flex flex-col gap-6 border-t border-white/10 pt-8 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-white">MecproAI</p>
            <p className="mt-1">Oferta promocional para assinatura anual com vantagem financeira em créditos para campanhas.</p>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <a href="/pricing" className="transition hover:text-white">Planos</a>
            <a href="/faq" className="transition hover:text-white">FAQ</a>
            <a href="/login" className="transition hover:text-white">Entrar</a>
            <a href={signupUrl} className="font-bold text-emerald-300 transition hover:text-emerald-200">Ativar agora</a>
          </div>
        </footer>
      </div>
    </section>
  );
}
