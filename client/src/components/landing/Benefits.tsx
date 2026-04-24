import type { LandingOfferProps } from "./types";

const benefits = [
  {
    title: "Mais alcance",
    description:
      "Comece com verba promocional para rodar campanhas mais fortes desde o início, sem depender só do seu caixa.",
  },
  {
    title: "Mais campanhas",
    description:
      "Teste mais criativos, públicos e ofertas com mais liberdade para encontrar o que vende de verdade.",
  },
  {
    title: "Mais resultado com menor risco",
    description:
      "Você entra no anual já com vantagem financeira e reduz a pressão de investir tudo do próprio bolso logo no começo.",
  },
  {
    title: "Mais velocidade",
    description:
      "Com crédito liberado, fica mais fácil sair da ideia e colocar campanhas no ar sem travar na decisão financeira.",
  },
  {
    title: "Mais previsibilidade",
    description:
      "Você garante o plano por um ano e ainda entra sabendo que parte do valor volta para o seu crescimento em mídia.",
  },
  {
    title: "Mais vantagem competitiva",
    description:
      "Enquanto muita gente paga o plano e ainda precisa separar verba para anunciar, você já começa um passo à frente.",
  },
];

export default function Benefits({ signupUrl, creditValue }: LandingOfferProps) {
  return (
    <section id="beneficios" className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.22em] text-emerald-700">
            Benefícios diretos
          </span>
          <h2 className="mt-5 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Mais alcance, mais campanhas e mais resultado com menor risco
          </h2>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            A lógica é simples: você fecha o anual e já entra com força para anunciar. Isso acelera decisão, reduz risco e aumenta sua margem para testar o que funciona.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {benefits.map((benefit) => (
            <article
              key={benefit.title}
              className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-lg text-white">
                ✓
              </div>
              <h3 className="mt-5 text-xl font-black text-slate-950">{benefit.title}</h3>
              <p className="mt-3 text-base leading-7 text-slate-600">{benefit.description}</p>
            </article>
          ))}
        </div>

        <div className="mt-12 rounded-[32px] border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-amber-50 p-8 text-center shadow-sm">
          <p className="text-lg font-semibold text-slate-800">
            Ative agora e entre com <span className="font-black text-emerald-700">{creditValue}</span> para colocar campanhas no ar com mais confiança.
          </p>
          <a
            href={signupUrl}
            className="mt-6 inline-flex min-h-14 items-center justify-center rounded-2xl bg-slate-950 px-8 text-base font-extrabold text-white transition hover:bg-slate-800"
          >
            Ativar crédito líquido
          </a>
        </div>
      </div>
    </section>
  );
}
