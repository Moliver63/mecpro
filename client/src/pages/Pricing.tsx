import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AnnualPromoBanner from "@/components/promo/AnnualPromoBanner";
import AnnualPromoFloatingCTA from "@/components/promo/AnnualPromoFloatingCTA";
import {
  DEFAULT_PROMO_PLAN,
  PROMO_DISCLAIMER,
  PROMO_PLANS,
  PROMO_PROGRESS,
  formatBRL,
  getPromoSignupUrl,
  type PromoPlanSlug,
} from "@/lib/annualPromo";

export default function Pricing() {
  const [, setLocation] = useLocation();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState("");
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const initialBilling = params.get("billing") === "annual" ? "annual" : "monthly";
  const [billing, setBilling] = useState<"monthly" | "annual">(initialBilling);
  const queryPlan = (params.get("plan") || DEFAULT_PROMO_PLAN.slug) as PromoPlanSlug;
  const { isAuthenticated } = useAuth();
  const createCheckout = trpc.subscriptions.createCheckout.useMutation();

  const selectedPlan = useMemo(
    () => PROMO_PLANS.find((plan) => plan.slug === queryPlan) ?? DEFAULT_PROMO_PLAN,
    [queryPlan],
  );

  const getDisplayedPrice = (plan: (typeof PROMO_PLANS)[number]) =>
    billing === "annual" ? plan.annualPrice : plan.monthlyPrice;

  const getDisplayedCadence = () => (billing === "annual" ? "por ano" : "por mês");

  const getDisplayedCredit = (plan: (typeof PROMO_PLANS)[number]) =>
    billing === "annual" ? plan.creditValue : 0;

  const handleSubscribe = async (slug: PromoPlanSlug) => {
    if (!isAuthenticated) {
      window.location.href = "/login";
      return;
    }

    setError("");
    setLoadingPlan(slug);
    try {
      const result = await createCheckout.mutateAsync({
        planSlug: slug,
        billing: billing === "annual" ? "yearly" : "monthly",
      });
      if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setError(e.message || "Erro ao criar checkout. Tente novamente.");
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <nav className="sticky top-0 z-40 border-b border-slate-200 bg-white/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="MecproAI" className="h-10 w-auto" />
          </a>
          <div className="hidden items-center gap-6 md:flex">
            <a href="/" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">Início</a>
            <a href="/courses" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">Academy</a>
            <a href="/faq" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setLocation("/login")} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
              Entrar
            </button>
            <button onClick={() => handleSubscribe(selectedPlan.slug)} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-extrabold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-600">
              Quero ativar meu crédito agora
            </button>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden bg-slate-950 px-4 py-14 text-white sm:px-6 sm:py-20 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_40%),radial-gradient(circle_at_right,_rgba(251,191,36,0.18),_transparent_28%)]" />
        <div className="relative mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <span className="inline-flex rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.22em] text-amber-200">
                Oferta principal MecproAI
              </span>
              <h1 className="mt-5 text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
                Assine o anual e receba 60% do valor pago em crédito para campanhas
              </h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-200">
                Você fecha o plano anual, ganha previsibilidade no caixa e ainda volta para o jogo com crédito promocional dentro da plataforma. É uma oferta pensada para acelerar a decisão e aumentar sua margem de resultado desde o primeiro dia.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <button onClick={() => handleSubscribe(selectedPlan.slug)} className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-emerald-400 px-8 text-base font-extrabold text-slate-950 transition hover:bg-emerald-300">
                  Quero ativar meu crédito agora
                </button>
                <a href="#plans" className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-8 text-base font-bold text-white transition hover:bg-white/10">
                  Ver planos anuais
                </a>
              </div>
              <p className="mt-4 text-sm font-semibold text-amber-200">{PROMO_DISCLAIMER}</p>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/25 backdrop-blur sm:p-8">
              <div className="rounded-[28px] border border-emerald-400/20 bg-slate-900/80 p-6">
                <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-emerald-200">Exemplo de ganho financeiro</p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm text-slate-300">Você paga</p>
                    <p className="mt-2 text-3xl font-black text-white">{formatBRL(selectedPlan.annualPrice)}</p>
                    <p className="mt-2 text-sm text-slate-300">Plano anual {selectedPlan.name}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4">
                    <p className="text-sm text-emerald-100">Você recebe</p>
                    <p className="mt-2 text-3xl font-black text-emerald-300">{formatBRL(selectedPlan.creditValue)}</p>
                    <p className="mt-2 text-sm text-emerald-100">Créditos para campanhas</p>
                  </div>
                </div>
                <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-300 via-emerald-300 to-emerald-500" style={{ width: `${PROMO_PROGRESS}%` }} />
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  Quantidade limitada de créditos disponíveis. Quem entra agora ativa a vantagem. Quem espera pode encontrar o anual sem bônus.
                </p>
                <button onClick={() => handleSubscribe(selectedPlan.slug)} className="mt-6 inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-white px-6 text-base font-extrabold text-slate-950 transition hover:bg-slate-100">
                  Ativar 60% de crédito
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.22em] text-emerald-700">
              Seção de valor
            </span>
            <h2 className="mt-5 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Explicação simples, vantagem clara e dinheiro voltando para sua operação
            </h2>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              Em vez de pagar o anual e depois ainda separar a verba de mídia do zero, você fecha o plano e recupera 60% do valor pago em crédito para campanhas dentro da plataforma.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {PROMO_PLANS.map((plan) => (
              <article key={plan.slug} className={`rounded-[28px] border p-6 shadow-sm ${plan.popular ? "border-emerald-300 bg-slate-950 text-white shadow-2xl shadow-slate-950/10" : "border-slate-200 bg-slate-50"}`}>
                <div className={`inline-flex rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.22em] ${plan.popular ? "bg-emerald-400 text-slate-950" : "bg-white text-slate-700 border border-slate-200"}`}>
                  {plan.popular ? "Plano mais vendido" : `Plano ${plan.name}`}
                </div>
                <h3 className={`mt-4 text-2xl font-black ${plan.popular ? "text-white" : "text-slate-950"}`}>{plan.name}</h3>
                <p className={`mt-3 text-sm leading-7 ${plan.popular ? "text-slate-300" : "text-slate-600"}`}>
                  Você paga <strong>{formatBRL(plan.annualPrice)}</strong> no anual e recebe <strong>{formatBRL(plan.creditValue)}</strong> em créditos.
                </p>
                <p className={`mt-3 text-sm leading-7 ${plan.popular ? "text-emerald-200" : "text-emerald-700"}`}>
                  Mais alcance, mais campanhas e mais resultado com menor risco para seu caixa.
                </p>
                <button onClick={() => handleSubscribe(plan.slug)} className={`mt-6 inline-flex min-h-14 w-full items-center justify-center rounded-2xl px-5 text-center text-sm font-extrabold transition sm:text-base ${plan.popular ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300" : "bg-slate-950 text-white hover:bg-slate-800"}`}>
                  Quero ativar meu crédito agora
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-950 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_0.95fr]">
            <article className="rounded-[28px] border border-white/10 bg-white/5 p-6 sm:p-8">
              <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-amber-200">Escassez e urgência</p>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
                Quantidade limitada de créditos disponíveis nesta campanha
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-300">
                A estrutura desta página foi criada para converter rápido: ganho financeiro evidente, urgência clara e rota curta até a assinatura anual.
              </p>
              <div className="mt-6 h-4 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-300 via-emerald-300 to-emerald-500" style={{ width: `${PROMO_PROGRESS}%` }} />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm font-semibold text-slate-300">
                <span>{PROMO_PROGRESS}% do lote promocional já comprometido</span>
                <span>{PROMO_DISCLAIMER}</span>
              </div>
              <button onClick={() => handleSubscribe(selectedPlan.slug)} className="mt-6 inline-flex min-h-14 items-center justify-center rounded-2xl bg-emerald-400 px-8 text-base font-extrabold text-slate-950 transition hover:bg-emerald-300">
                Ativar 60% de crédito
              </button>
            </article>

            <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-slate-700">Benefícios diretos</p>
              <h3 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
                Mais alcance, mais campanhas e mais resultado com menor risco
              </h3>
              <div className="mt-6 space-y-4">
                {[
                  "Mais alcance para colocar a estratégia no ar sem travar no caixa.",
                  "Mais campanhas para testar criativos, públicos e ofertas com velocidade.",
                  "Mais resultado com menor risco porque parte do valor pago volta para sua operação.",
                ].map((item) => (
                  <div key={item} className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <span className="mt-1 text-emerald-500">✓</span>
                    <p className="text-sm leading-7 text-slate-700">{item}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => handleSubscribe(selectedPlan.slug)} className="mt-6 inline-flex min-h-14 items-center justify-center rounded-2xl bg-slate-950 px-8 text-base font-extrabold text-white transition hover:bg-slate-800">
                Quero ativar meu crédito agora
              </button>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-20" id="como-funciona">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.22em] text-slate-700">
              Como funciona
            </span>
            <h2 className="mt-5 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Passo a passo simples para ativar sua vantagem
            </h2>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-5">
            {[
              { step: "1", title: "Assina o plano anual", desc: "Escolhe o plano que faz sentido para o seu momento e fecha a assinatura anual." },
              { step: "2", title: "Confirma o pagamento", desc: "A assinatura é processada e o pedido promocional entra no fluxo interno." },
              { step: "3", title: "Aguarda até 10 dias", desc: "Esse é o prazo estimado para a liberação do lote promocional dentro da campanha." },
              { step: "4", title: "Recebe os créditos", desc: "Os créditos são disponibilizados para uso dentro da plataforma." },
              { step: "5", title: "Usa nas campanhas", desc: "Você aplica o saldo promocional para rodar, validar e escalar campanhas." },
            ].map((item) => (
              <article key={item.step} className="rounded-[28px] border border-slate-200 bg-slate-50 p-6 shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-xl font-black text-white">{item.step}</div>
                <h3 className="mt-5 text-xl font-black text-slate-950">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{item.desc}</p>
              </article>
            ))}
          </div>
          <div className="mt-8 text-center">
            <button onClick={() => handleSubscribe(selectedPlan.slug)} className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-emerald-500 px-8 text-base font-extrabold text-white transition hover:bg-emerald-600">
              Quero ativar meu crédito agora
            </button>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-[28px] border border-rose-200 bg-rose-50 p-6 shadow-sm sm:p-8">
              <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-rose-700">Bloco de aversão à perda</p>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
                Depois que essa campanha encerrar, o plano volta ao valor normal sem créditos
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-700">
                Quem entra agora começa com vantagem. Quem espera paga mais caro em oportunidade e perde a chance de começar com verba promocional já pronta para ser usada nas campanhas.
              </p>
              <button onClick={() => handleSubscribe(selectedPlan.slug)} className="mt-6 inline-flex min-h-14 items-center justify-center rounded-2xl bg-slate-950 px-8 text-base font-extrabold text-white transition hover:bg-slate-800">
                Ativar 60% de crédito
              </button>
            </article>

            <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-slate-700">Ancoragem de valor</p>
              <h3 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
                Aqui a assinatura não é só custo. Ela já volta como combustível para vender.
              </h3>
              <p className="mt-4 text-base leading-7 text-slate-600">
                Esse é o tipo de oferta que reduz atrito: o cliente compra acesso anual e recebe um empurrão financeiro real para fazer campanhas rodarem. O benefício é simples de entender e rápido de desejar.
              </p>
              <a href={getPromoSignupUrl("premium")} className="mt-6 inline-flex min-h-14 items-center justify-center rounded-2xl bg-emerald-500 px-8 text-base font-extrabold text-white transition hover:bg-emerald-600">
                Quero ativar meu crédito agora
              </a>
            </article>
          </div>
        </div>
      </section>

      <section id="plans" className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.22em] text-emerald-700">
              Página de assinatura
            </span>
            <h2 className="mt-5 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Escolha o plano anual e ative sua vantagem financeira
            </h2>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              Modo anual ativado para conversão. Em cada plano abaixo você vê o valor pago, o crédito recebido e o CTA direto para checkout.
            </p>
            <div className="mt-8 inline-flex rounded-2xl border border-slate-200 bg-slate-100 p-1">
              <button onClick={() => setBilling("monthly")} className={`rounded-xl px-5 py-3 text-sm font-extrabold transition ${billing === "monthly" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>
                Mensal
              </button>
              <button onClick={() => setBilling("annual")} className={`rounded-xl px-5 py-3 text-sm font-extrabold transition ${billing === "annual" ? "bg-slate-950 text-white shadow-sm" : "text-slate-500"}`}>
                Anual com oferta
              </button>
            </div>
          </div>

          {error && (
            <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-center text-sm font-semibold text-rose-700">
              ⚠️ {error}
            </div>
          )}

          <div className="mt-10 grid gap-6 xl:grid-cols-3">
            {PROMO_PLANS.map((plan) => {
              const isAnnual = billing === "annual";
              const isPopular = plan.popular;
              const ctaText = isAnnual ? "Quero ativar meu crédito agora" : `Assinar ${plan.name}`;

              return (
                <article key={plan.slug} className={`relative flex flex-col rounded-[32px] border p-7 shadow-sm ${isPopular ? "border-emerald-300 bg-slate-950 text-white shadow-2xl shadow-slate-950/10" : "border-slate-200 bg-slate-50"}`}>
                  {isPopular && (
                    <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.22em] text-slate-950">
                      Melhor para converter
                    </div>
                  )}
                  <div className="mt-2">
                    <p className={`text-xs font-extrabold uppercase tracking-[0.22em] ${isPopular ? "text-emerald-200" : "text-slate-500"}`}>{plan.name}</p>
                    <h3 className={`mt-3 text-4xl font-black tracking-tight ${isPopular ? "text-white" : "text-slate-950"}`}>
                      {formatBRL(getDisplayedPrice(plan))}
                    </h3>
                    <p className={`mt-2 text-sm ${isPopular ? "text-slate-300" : "text-slate-500"}`}>{getDisplayedCadence()}</p>
                    <p className={`mt-4 text-sm leading-7 ${isPopular ? "text-slate-300" : "text-slate-600"}`}>{plan.description}</p>
                  </div>

                  {isAnnual && (
                    <div className={`mt-6 rounded-[24px] border p-5 ${isPopular ? "border-emerald-400/30 bg-emerald-400/10" : "border-emerald-200 bg-emerald-50"}`}>
                      <p className={`text-xs font-extrabold uppercase tracking-[0.22em] ${isPopular ? "text-emerald-100" : "text-emerald-700"}`}>
                        Crédito promocional incluído
                      </p>
                      <p className={`mt-3 text-3xl font-black ${isPopular ? "text-emerald-300" : "text-emerald-700"}`}>
                        {formatBRL(getDisplayedCredit(plan))}
                      </p>
                      <p className={`mt-2 text-sm leading-7 ${isPopular ? "text-emerald-100" : "text-emerald-800"}`}>
                        Você paga {formatBRL(plan.annualPrice)} no ano e recebe 60% desse valor em créditos para campanhas.
                      </p>
                    </div>
                  )}

                  <div className="mt-6 flex-1 space-y-3">
                    {plan.benefits.map((benefit) => (
                      <div key={benefit} className="flex gap-3">
                        <span className={`${isPopular ? "text-emerald-300" : "text-emerald-500"}`}>✓</span>
                        <span className={`text-sm leading-7 ${isPopular ? "text-slate-200" : "text-slate-700"}`}>{benefit}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    disabled={loadingPlan === plan.slug}
                    onClick={() => handleSubscribe(plan.slug)}
                    className={`mt-8 inline-flex min-h-14 w-full items-center justify-center rounded-2xl px-6 text-base font-extrabold transition ${isPopular ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300" : "bg-slate-950 text-white hover:bg-slate-800"} ${loadingPlan === plan.slug ? "opacity-70" : ""}`}
                  >
                    {loadingPlan === plan.slug ? "Redirecionando..." : ctaText}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <AnnualPromoBanner tone="light" compact title="Ganhe 60% em crédito agora" description={`Feche o anual ${DEFAULT_PROMO_PLAN.name} por ${formatBRL(DEFAULT_PROMO_PLAN.annualPrice)} e receba ${formatBRL(DEFAULT_PROMO_PLAN.creditValue)} para campanhas. CTA repetido para reduzir atrito e acelerar conversão.`} />

          <div className="mt-10 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-3xl font-black tracking-tight text-slate-950">Perguntas rápidas antes de assinar</h2>
            <div className="mt-8 space-y-6">
              {[
                {
                  q: "Como funciona o plano anual com crédito?",
                  a: "Você fecha a assinatura anual, entra na campanha promocional e recebe 60% do valor pago em créditos para usar dentro da plataforma conforme o prazo informado.",
                },
                {
                  q: "Quando recebo os créditos?",
                  a: "O prazo comunicado nesta campanha é de até 10 dias após a confirmação da assinatura anual.",
                },
                {
                  q: "O que acontece quando a oferta terminar?",
                  a: "O plano continua existindo, mas esta condição promocional com créditos pode sair do ar sem aviso adicional quando o lote terminar.",
                },
                {
                  q: "Posso contratar no mensal?",
                  a: "Sim, mas o gatilho de conversão desta página foi criado para o anual, porque é nele que a oferta de crédito gera a maior vantagem financeira.",
                },
              ].map((item) => (
                <div key={item.q} className="border-b border-slate-200 pb-6 last:border-b-0 last:pb-0">
                  <p className="text-lg font-black text-slate-950">{item.q}</p>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-slate-950 px-4 py-14 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-amber-200">Rodapé com reforço</p>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
                Feche o anual agora e comece com crédito em vez de começar do zero
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-8 text-slate-300">
                Oferta repetida, urgência reforçada e CTA final forte. Essa combinação existe para cortar distração e levar direto para a assinatura anual com vantagem financeira real.
              </p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Oferta ativa</p>
              <p className="mt-3 text-3xl font-black text-white">{formatBRL(DEFAULT_PROMO_PLAN.annualPrice)}</p>
              <p className="mt-2 text-sm leading-7 text-slate-300">+ {formatBRL(DEFAULT_PROMO_PLAN.creditValue)} em créditos para campanhas</p>
              <button onClick={() => handleSubscribe(DEFAULT_PROMO_PLAN.slug)} className="mt-6 inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-emerald-400 px-6 text-base font-extrabold text-slate-950 transition hover:bg-emerald-300">
                Quero ativar meu crédito agora
              </button>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">{PROMO_DISCLAIMER}</p>
            </div>
          </div>
        </div>
      </footer>

      <AnnualPromoFloatingCTA planSlug={DEFAULT_PROMO_PLAN.slug} />
    </div>
  );
}
