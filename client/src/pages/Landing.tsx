import SEO from "@/components/SEO";
import Benefits from "@/components/landing/Benefits";
import FAQ from "@/components/landing/FAQ";
import FinalCTA from "@/components/landing/FinalCTA";
import FloatingCTA from "@/components/landing/FloatingCTA";
import Hero from "@/components/landing/Hero";
import Proofs from "@/components/landing/Proofs";

const formatBRL = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

const annualMonthlyPrice = 157;
const annualTotalPrice = annualMonthlyPrice * 12;
const promotionalCreditValue = annualTotalPrice * 0.6;

const annualPrice = formatBRL(annualTotalPrice);
const creditValue = formatBRL(promotionalCreditValue);
const signupUrl = "/register";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      name: "MecproAI — Plano anual com crédito promocional para tráfego pago",
      url: "https://www.mecproai.com/",
      description:
        "Feche o plano anual do MecproAI e ganhe créditos promocionais para tráfego pago. Oferta com foco em vantagem financeira, urgência e ativação rápida.",
    },
    {
      "@type": "Offer",
      name: "Plano anual MecproAI com crédito promocional",
      priceCurrency: "BRL",
      price: annualTotalPrice.toFixed(2),
      description: `Feche o plano anual por ${annualPrice} e receba ${creditValue} em créditos para tráfego pago.`,
      availability: "https://schema.org/LimitedAvailability",
      url: "https://www.mecproai.com/register",
    },
  ],
};

export default function Landing() {
  return (
    <>
      <SEO
        title="MecproAI — Feche o anual e ganhe créditos para tráfego pago"
        description={`Feche o plano anual do MecproAI por ${annualPrice} e ganhe ${creditValue} em créditos para tráfego pago. Oferta promocional por tempo limitado.`}
        keywords="mecproai, plano anual, crédito para tráfego pago, landing page, assinatura anual, marketing digital"
        canonical="/"
        ogType="website"
        structuredData={structuredData}
      />

      <div className="min-h-screen bg-white text-slate-950">
        <div className="bg-emerald-500 px-4 py-3 text-center text-sm font-extrabold text-slate-950">
          <a href={signupUrl} className="inline-flex items-center gap-2 hover:underline">
            <span>Feche o plano anual e ganhe {creditValue} em créditos para tráfego pago</span>
            <span aria-hidden="true">→</span>
          </a>
        </div>

        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <a href="/" className="text-xl font-black tracking-tight text-slate-950">
              Mecpro<span className="text-emerald-600">AI</span>
            </a>
            <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-600 md:flex">
              <a href="#provas" className="transition hover:text-slate-950">Vantagem</a>
              <a href="#beneficios" className="transition hover:text-slate-950">Benefícios</a>
              <a href="#faq" className="transition hover:text-slate-950">FAQ</a>
              <a href="/pricing" className="transition hover:text-slate-950">Planos</a>
            </nav>
            <div className="flex items-center gap-3">
              <a href="/login" className="hidden text-sm font-bold text-slate-600 transition hover:text-slate-950 sm:inline-flex">
                Entrar
              </a>
              <a
                href={signupUrl}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-extrabold text-white transition hover:bg-slate-800"
              >
                Quero ativar meu crédito agora
              </a>
            </div>
          </div>
        </header>

        <main>
          <Hero annualPrice={annualPrice} creditValue={creditValue} signupUrl={signupUrl} />
          <Proofs annualPrice={annualPrice} creditValue={creditValue} signupUrl={signupUrl} />
          <Benefits annualPrice={annualPrice} creditValue={creditValue} signupUrl={signupUrl} />
          <FAQ annualPrice={annualPrice} creditValue={creditValue} signupUrl={signupUrl} />
          <FinalCTA annualPrice={annualPrice} creditValue={creditValue} signupUrl={signupUrl} />
        </main>

        <FloatingCTA annualPrice={annualPrice} creditValue={creditValue} signupUrl={signupUrl} />
      </div>
    </>
  );
}
