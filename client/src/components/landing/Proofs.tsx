import type { LandingOfferProps } from "./types";

const steps = [
  {
    step: "1",
    title: "Feche o plano anual",
    description: "Ative sua assinatura anual agora e garanta sua entrada na campanha promocional vigente.",
  },
  {
    step: "2",
    title: "Aguarde até 10 dias",
    description: "Após a confirmação, os créditos promocionais entram no fluxo de liberação previsto pela campanha.",
  },
  {
    step: "3",
    title: "Receba seus créditos",
    description: "Você recebe o valor promocional para usar dentro da operação de campanhas e acelerar seus testes.",
  },
  {
    step: "4",
    title: "Use em campanhas",
    description: "Com o saldo liberado, você entra com mais margem para rodar, aprender e buscar resultado mais rápido.",
  },
];

const proofPoints = [
  "Quem fecha agora entra no anual com verba promocional a favor.",
  "Quem espera corre o risco de pagar o plano sem o bônus de campanha.",
  "O crédito aumenta sua capacidade de testar sem colocar toda a pressão no caixa.",
];

export default function Proofs({ annualPrice, creditValue, signupUrl }: LandingOfferProps) {
  return (
    <section id="provas" className="bg-slate-50 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.22em] text-amber-700">
              Vantagem financeira real
            </span>
            <h2 className="mt-5 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Você não entra só com o plano. Você entra com crédito para anunciar.
            </h2>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              Em vez de fechar o anual e depois ainda precisar separar toda a verba de mídia, você fecha por {annualPrice} e recebe {creditValue} em créditos para tráfego pago. Isso muda a largada da sua operação.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Você paga</p>
                <p className="mt-3 text-3xl font-black text-slate-950">{annualPrice}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">Assinatura anual ativada para operar com mais previsibilidade.</p>
              </div>
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Você ganha</p>
                <p className="mt-3 text-3xl font-black text-emerald-700">{creditValue}</p>
                <p className="mt-2 text-sm leading-6 text-emerald-800">Créditos promocionais para campanhas e validações com menos risco.</p>
              </div>
            </div>
            <a
              href={signupUrl}
              className="mt-8 inline-flex min-h-14 items-center justify-center rounded-2xl bg-slate-950 px-8 text-base font-extrabold text-white transition hover:bg-slate-800"
            >
              Ganhar meu crédito agora
            </a>
          </article>

          <aside className="rounded-[32px] border border-slate-200 bg-slate-950 p-8 text-white shadow-sm sm:p-10">
            <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.22em] text-amber-200">
              Escassez e urgência
            </span>
            <h3 className="mt-5 text-3xl font-black tracking-tight">
              Créditos promocionais limitados para esta campanha
            </h3>
            <p className="mt-4 text-lg leading-8 text-slate-300">
              A oferta foi desenhada para gerar ação rápida. Quando esta campanha encerrar, o plano volta ao valor normal sem créditos promocionais.
            </p>
            <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.22em] text-slate-300">
                <span>Liberação atual</span>
                <span>Lote promocional</span>
              </div>
              <div className="mt-4 h-4 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-4/5 rounded-full bg-gradient-to-r from-amber-300 via-emerald-300 to-emerald-500" />
              </div>
              <ul className="mt-6 space-y-3 text-sm leading-7 text-slate-200">
                {proofPoints.map((point) => (
                  <li key={point} className="flex gap-3">
                    <span className="mt-1 text-emerald-300">●</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
            <a
              href={signupUrl}
              className="mt-8 inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-emerald-400 px-8 text-base font-extrabold text-slate-950 transition hover:bg-emerald-300"
            >
              Ative seu bônus de campanha
            </a>
          </aside>
        </div>

        <a
          href={signupUrl}
          className="mt-8 flex items-center justify-between gap-4 rounded-[28px] border border-emerald-200 bg-gradient-to-r from-emerald-500 to-emerald-400 px-6 py-5 text-white shadow-lg shadow-emerald-500/20 transition hover:-translate-y-0.5"
        >
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-emerald-50">Banner clicável</p>
            <p className="mt-1 text-xl font-black">Ganhe {creditValue} em crédito agora</p>
          </div>
          <span className="whitespace-nowrap rounded-full bg-white px-4 py-2 text-sm font-extrabold text-emerald-700">
            Quero ativar
          </span>
        </a>

        <div id="como-funciona" className="mt-10 rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.22em] text-slate-700">
              Como funciona
            </span>
            <h2 className="mt-5 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Quatro passos para entrar com vantagem
            </h2>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              Sem complicação: você fecha o anual, aguarda o prazo da campanha, recebe os créditos e usa esse saldo para anunciar com mais força.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-4">
            {steps.map((item) => (
              <article key={item.step} className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-xl font-black text-white">
                  {item.step}
                </div>
                <h3 className="mt-5 text-xl font-black text-slate-950">{item.title}</h3>
                <p className="mt-3 text-base leading-7 text-slate-600">{item.description}</p>
              </article>
            ))}
          </div>

          <a
            href={signupUrl}
            className="mt-8 inline-flex min-h-14 items-center justify-center rounded-2xl bg-emerald-500 px-8 text-base font-extrabold text-white transition hover:bg-emerald-600"
          >
            Quero ativar meus créditos agora
          </a>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <article className="rounded-[32px] border border-rose-200 bg-rose-50 p-8 shadow-sm">
            <p className="text-sm font-extrabold uppercase tracking-[0.22em] text-rose-700">Aversão à perda</p>
            <h3 className="mt-4 text-2xl font-black text-slate-950">
              Depois que essa campanha encerrar, o plano volta ao valor normal sem créditos.
            </h3>
            <p className="mt-4 text-base leading-7 text-slate-700">
              Quem entra agora começa com vantagem. Quem espera pode pagar mais caro e começar sem esse impulso financeiro para as campanhas.
            </p>
          </article>

          <article className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-sm font-extrabold uppercase tracking-[0.22em] text-slate-700">Pressão certa para decisão</p>
            <h3 className="mt-4 text-2xl font-black text-slate-950">
              Se você já planeja crescer com tráfego pago, faz mais sentido entrar quando existe crédito promocional.
            </h3>
            <p className="mt-4 text-base leading-7 text-slate-600">
              A oferta foi feita para converter com clareza: valor fechado, ganho em reais, passo a passo simples e uma vantagem concreta para agir agora.
            </p>
          </article>
        </div>

        <a
          href={signupUrl}
          className="mt-8 flex items-center justify-between gap-4 rounded-[28px] border border-slate-950 bg-slate-950 px-6 py-5 text-white shadow-lg transition hover:-translate-y-0.5"
        >
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-slate-300">Banner clicável</p>
            <p className="mt-1 text-xl font-black">Ative seu bônus de campanha</p>
          </div>
          <span className="whitespace-nowrap rounded-full bg-white px-4 py-2 text-sm font-extrabold text-slate-950">
            Ativar agora
          </span>
        </a>
      </div>
    </section>
  );
}
