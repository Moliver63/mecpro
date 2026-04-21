import type { LandingOfferProps } from "./types";

export default function Hero({ annualPrice, creditValue, signupUrl }: LandingOfferProps) {
  return (
    <section className="relative overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.18),_transparent_40%),radial-gradient(circle_at_right,_rgba(251,191,36,0.16),_transparent_30%)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
              Oferta anual com crédito promocional
            </div>
            <h1 className="text-center text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl lg:text-left lg:text-6xl">
              Feche o plano anual e ganhe <span className="text-emerald-300">{creditValue}</span> em créditos para tráfego pago
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-8 text-slate-200 lg:mx-0 lg:text-left">
              Ative o anual agora, entre com vantagem financeira desde o primeiro dia e use seus créditos promocionais para acelerar campanhas sem começar do zero. Você fecha por {annualPrice} e já entra com verba a favor do seu crescimento.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row lg:items-start">
              <a
                href={signupUrl}
                className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-emerald-400 px-7 text-base font-extrabold text-slate-950 shadow-[0_18px_50px_rgba(16,185,129,0.35)] transition hover:-translate-y-0.5 hover:bg-emerald-300 sm:w-auto"
              >
                Quero ativar meu crédito agora
              </a>
              <a
                href="#como-funciona"
                className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-7 text-base font-bold text-white transition hover:bg-white/10 sm:w-auto"
              >
                Ver como funciona
              </a>
            </div>
            <p className="mt-4 text-center text-sm font-medium text-amber-200 lg:text-left">
              Disponível por tempo limitado ou até esgotar os créditos promocionais desta campanha.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Plano anual</p>
                <p className="mt-3 text-3xl font-black text-white">{annualPrice}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">Você ativa um ano inteiro de plataforma e ainda entra com impulso para anunciar.</p>
              </div>
              <div className="rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-5 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Crédito promocional</p>
                <p className="mt-3 text-3xl font-black text-emerald-300">{creditValue}</p>
                <p className="mt-2 text-sm leading-6 text-emerald-100">Créditos liberados para você colocar campanhas no ar com mais força e menos pressão no caixa.</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Urgência</p>
                <p className="mt-3 text-3xl font-black text-white">Agora</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">Quem entra nesta campanha promocional começa com vantagem. Quem espera pode pagar mais e entrar sem crédito.</p>
              </div>
            </div>
          </div>

          <aside className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
            <div className="rounded-3xl border border-emerald-400/20 bg-slate-900/80 p-6">
              <span className="inline-flex rounded-full bg-amber-400 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.2em] text-slate-950">
                Ganho financeiro direto
              </span>
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm text-slate-300">Fechamento anual</p>
                  <p className="mt-2 text-2xl font-black text-white">{annualPrice}</p>
                </div>
                <div className="flex items-center justify-center text-2xl font-black text-emerald-300">+</div>
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4">
                  <p className="text-sm text-emerald-100">Créditos para tráfego pago</p>
                  <p className="mt-2 text-2xl font-black text-emerald-300">{creditValue}</p>
                </div>
              </div>
              <a
                href={signupUrl}
                className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-white px-5 py-4 text-center text-base font-extrabold text-slate-950 transition hover:bg-slate-100"
              >
                Ganhar {creditValue} agora
              </a>
              <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950 p-4">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.2em] text-slate-300">
                  <span>Lote promocional</span>
                  <span>créditos limitados</span>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-amber-300 via-emerald-300 to-emerald-500" />
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  Esta página foi criada para converter rápido: pouca distração, ganho claro e vantagem financeira imediata para quem fecha agora.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
