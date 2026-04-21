import SEO from "@/components/SEO";
import Hero from "@/components/landing/Hero";
import Benefits from "@/components/landing/Benefits";
import Proofs from "@/components/landing/Proofs";
import FinalCTA from "@/components/landing/FinalCTA";
import FloatingCTA from "@/components/landing/FloatingCTA";
import AnnualPromoBanner from "@/components/promo/AnnualPromoBanner";
import {
  DEFAULT_PROMO_PLAN,
  PROMO_BANNERS,
  PROMO_DISCLAIMER,
  PROMO_VISUAL_SUGGESTIONS,
  formatBRL,
  getPromoSignupUrl,
} from "@/lib/annualPromo";

const signupUrl = getPromoSignupUrl(DEFAULT_PROMO_PLAN.slug);

const LANDING_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "MecproAI",
      url: "https://mecpro-ai.onrender.com",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web Browser",
      inLanguage: "pt-BR",
      description: "Plataforma de inteligência de campanhas com oferta promocional para assinatura anual com 60% do valor pago em créditos para campanhas.",
      offers: {
        "@type": "Offer",
        name: "Oferta anual MecproAI",
        priceCurrency: "BRL",
        price: DEFAULT_PROMO_PLAN.annualPrice.toString(),
        description: `Assine o plano anual e receba ${formatBRL(DEFAULT_PROMO_PLAN.creditValue)} em créditos promocionais para campanhas.`,
        url: `https://mecpro-ai.onrender.com${signupUrl}`,
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.9",
        reviewCount: "127",
        bestRating: "5",
      },
    },
  ],
};

export default function Landing() {
  return (
    <>
      <SEO
        title="MecproAI — Assine o anual e ganhe 60% em crédito para campanhas"
        description={`Oferta promocional MecproAI: feche o anual por ${formatBRL(DEFAULT_PROMO_PLAN.annualPrice)} e receba ${formatBRL(DEFAULT_PROMO_PLAN.creditValue)} em créditos para campanhas dentro da plataforma.`}
        keywords="MecproAI, plano anual, crédito para campanhas, tráfego pago, assinatura anual, promoção MecproAI"
        canonical="/"
        ogType="website"
        structuredData={LANDING_JSONLD}
      />

      <div className="min-h-screen bg-white text-slate-950">
        <nav className="sticky top-0 z-40 border-b border-slate-200 bg-white/92 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <a href="/" className="flex items-center gap-3 text-decoration-none">
              <img src="/logo.png" alt="MecproAI" className="h-10 w-auto" />
            </a>
            <div className="hidden items-center gap-6 md:flex">
              <a href="#oferta" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">Oferta</a>
              <a href="#valor" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">Valor</a>
              <a href="#como-funciona" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">Como funciona</a>
              <a href="/courses" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">Academy</a>
              <a href="/faq" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">FAQ</a>
            </div>
            <div className="flex items-center gap-2">
              <a href="/login" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                Entrar
              </a>
              <a href={signupUrl} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-extrabold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-600">
                Quero ativar meu crédito agora
              </a>
            </div>
          </div>
        </nav>

        <div id="oferta">
          <Hero
            annualPrice={formatBRL(DEFAULT_PROMO_PLAN.annualPrice)}
            creditValue={formatBRL(DEFAULT_PROMO_PLAN.creditValue)}
            signupUrl={signupUrl}
          />
        </div>

        <section className="border-y border-slate-200 bg-slate-50 py-6">
          <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:grid-cols-3 sm:px-6 lg:px-8">
            {[
              { label: "Operações ativas", value: "500+" },
              { label: "Campanhas geradas", value: "10.000+" },
              { label: "Avaliação média", value: "4.9/5" },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-center shadow-sm">
                <p className="text-2xl font-black text-slate-950">{item.value}</p>
                <p className="mt-1 text-sm font-medium text-slate-500">{item.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="valor" className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.22em] text-emerald-700">
                Explicação simples
              </span>
              <h2 className="mt-5 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                Você paga uma vez no anual e volta para o jogo com crédito dentro da plataforma
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                A oferta foi desenhada para aumentar conversão com lógica financeira clara: o cliente fecha o plano anual, garante previsibilidade e ainda recebe 60% do valor pago em crédito para acelerar campanhas.
              </p>
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {[
                {
                  title: "Basic anual",
                  pay: formatBRL(924),
                  credit: formatBRL(554.4),
                  cta: "Ganhar 60% em crédito agora",
                  href: getPromoSignupUrl("basic"),
                },
                {
                  title: "Premium anual",
                  pay: formatBRL(DEFAULT_PROMO_PLAN.annualPrice),
                  credit: formatBRL(DEFAULT_PROMO_PLAN.creditValue),
                  cta: "Ative seu bônus de campanha",
                  href: signupUrl,
                  featured: true,
                },
                {
                  title: "VIP anual",
                  pay: formatBRL(3804),
                  credit: formatBRL(2282.4),
                  cta: "Comece com vantagem no tráfego",
                  href: getPromoSignupUrl("vip"),
                },
              ].map((item) => (
                <article key={item.title} className={`rounded-[28px] border p-6 shadow-sm ${item.featured ? "border-emerald-300 bg-slate-950 text-white shadow-2xl shadow-slate-950/10" : "border-slate-200 bg-white"}`}>
                  <div className={`inline-flex rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.22em] ${item.featured ? "bg-emerald-400 text-slate-950" : "bg-slate-100 text-slate-700"}`}>
                    {item.featured ? "Oferta principal" : "Exemplo real"}
                  </div>
                  <h3 className={`mt-4 text-2xl font-black ${item.featured ? "text-white" : "text-slate-950"}`}>{item.title}</h3>
                  <p className={`mt-4 text-sm leading-7 ${item.featured ? "text-slate-300" : "text-slate-600"}`}>
                    Você paga <strong>{item.pay}</strong> e recebe <strong>{item.credit}</strong> em créditos para campanhas dentro da plataforma.
                  </p>
                  <p className={`mt-2 text-sm leading-7 ${item.featured ? "text-emerald-200" : "text-emerald-700"}`}>
                    Isso dá mais espaço para anunciar, validar criativos e crescer sem colocar toda a pressão no caixa logo no primeiro mês.
                  </p>
                  <a href={item.href} className={`mt-6 inline-flex min-h-14 w-full items-center justify-center rounded-2xl px-5 text-center text-sm font-extrabold transition sm:text-base ${item.featured ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300" : "bg-slate-950 text-white hover:bg-slate-800"}`}>
                    {item.cta}
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <Proofs
          annualPrice={formatBRL(DEFAULT_PROMO_PLAN.annualPrice)}
          creditValue={formatBRL(DEFAULT_PROMO_PLAN.creditValue)}
          signupUrl={signupUrl}
        />

        <section className="bg-white py-8 sm:py-12">
          <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:grid-cols-3 sm:px-6 lg:px-8">
            {PROMO_BANNERS.map((label, index) => (
              <a
                key={label}
                href={index === 0 ? signupUrl : index === 1 ? getPromoSignupUrl("basic") : getPromoSignupUrl("vip")}
                className="rounded-[26px] border border-slate-200 bg-gradient-to-r from-slate-950 to-slate-800 p-6 text-white shadow-lg transition hover:-translate-y-1"
              >
                <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-emerald-200">Banner clicável</p>
                <p className="mt-3 text-2xl font-black">{label}</p>
                <p className="mt-3 text-sm leading-7 text-slate-300">{PROMO_DISCLAIMER}</p>
                <span className="mt-5 inline-flex rounded-full bg-emerald-400 px-4 py-2 text-sm font-extrabold text-slate-950">
                  Ir para assinatura anual
                </span>
              </a>
            ))}
          </div>
        </section>

        <Benefits
          annualPrice={formatBRL(DEFAULT_PROMO_PLAN.annualPrice)}
          creditValue={formatBRL(DEFAULT_PROMO_PLAN.creditValue)}
          signupUrl={signupUrl}
        />

        <section className="bg-slate-50 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <AnnualPromoBanner
              title="Oferta desenhada para gerar decisão rápida"
              description="Ancoragem de valor, urgência, aversão à perda e ganho financeiro imediato trabalham juntos para empurrar a decisão certa: entrar agora no anual com crédito promocional e sair na frente das próximas campanhas."
              ctaLabel="Quero ativar meu crédito agora"
              tone="dark"
            />

            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              <article className="rounded-[28px] border border-rose-200 bg-rose-50 p-6 shadow-sm sm:p-8">
                <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-rose-700">Aversão à perda</p>
                <h3 className="mt-4 text-2xl font-black text-slate-950">Depois que essa campanha encerrar, o plano volta ao valor normal sem créditos.</h3>
                <p className="mt-3 text-base leading-7 text-slate-700">
                  Quem entra agora começa com vantagem. Quem espera paga mais caro em oportunidade e começa sem o impulso financeiro que já poderia estar rodando dentro da própria operação.
                </p>
                <a href={signupUrl} className="mt-6 inline-flex min-h-14 items-center justify-center rounded-2xl bg-slate-950 px-6 text-sm font-extrabold text-white transition hover:bg-slate-800 sm:text-base">
                  Ativar 60% de crédito
                </a>
              </article>

              <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-slate-700">Ideias visuais</p>
                <h3 className="mt-4 text-2xl font-black text-slate-950">Elementos que reforçam urgência sem parecer exagero</h3>
                <ul className="mt-4 space-y-3 text-base leading-7 text-slate-600">
                  {PROMO_VISUAL_SUGGESTIONS.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="mt-1 text-emerald-500">●</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <a href={signupUrl} className="mt-6 inline-flex min-h-14 items-center justify-center rounded-2xl bg-emerald-500 px-6 text-sm font-extrabold text-white transition hover:bg-emerald-600 sm:text-base">
                  Quero ativar meu crédito agora
                </a>
              </article>
            </div>
          </div>
        </section>

        <FinalCTA
          annualPrice={formatBRL(DEFAULT_PROMO_PLAN.annualPrice)}
          creditValue={formatBRL(DEFAULT_PROMO_PLAN.creditValue)}
          signupUrl={signupUrl}
        />

        <FloatingCTA
          annualPrice={formatBRL(DEFAULT_PROMO_PLAN.annualPrice)}
          creditValue={formatBRL(DEFAULT_PROMO_PLAN.creditValue)}
          signupUrl={signupUrl}
        />
      </div>
    </>
  );
}
