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

      <div className="landing-page">
        <div className="landing-promo-bar">
          <a href={signupUrl} className="landing-promo-link">
            <span className="badge badge-green">Oferta anual</span>
            <span>Feche o plano anual e ganhe {creditValue} em créditos para tráfego pago</span>
            <span aria-hidden="true">→</span>
          </a>
        </div>

        <header className="landing-header">
          <div className="container landing-header-inner">
            <a href="/" className="landing-logo">
              Mecpro<span>AI</span>
            </a>

            <nav className="landing-nav" aria-label="Navegação principal">
              <a href="#provas">Vantagem</a>
              <a href="#beneficios">Benefícios</a>
              <a href="#faq">FAQ</a>
              <a href="/pricing">Planos</a>
            </nav>

            <div className="landing-header-actions">
              <a href="/login" className="btn btn-md btn-ghost landing-header-login">
                Entrar
              </a>
              <a href={signupUrl} className="btn btn-md btn-green">
                Quero ativar meu crédito
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
