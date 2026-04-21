import type { FAQItem, LandingOfferProps } from "./types";

const items: FAQItem[] = [
  {
    question: "O que eu ganho ao fechar o plano anual?",
    answer:
      "Você ativa o plano anual e recebe créditos promocionais para tráfego pago dentro desta campanha. A proposta é simples: fechar agora para entrar com vantagem financeira real.",
  },
  {
    question: "Qual é o valor do crédito promocional?",
    answer:
      "Nesta página, a oferta está apresentada em reais para deixar o ganho claro. Ao fechar o anual, você recebe o valor indicado na oferta em créditos promocionais para campanhas.",
  },
  {
    question: "Em quanto tempo os créditos são liberados?",
    answer:
      "O prazo informado para liberação é de até 10 dias após a confirmação da assinatura anual dentro da campanha promocional.",
  },
  {
    question: "Posso usar os créditos em campanhas?",
    answer:
      "Sim. A proposta da oferta é justamente dar mais margem para você colocar campanhas no ar com menos risco e mais velocidade.",
  },
  {
    question: "Essa condição vale para qualquer plano?",
    answer:
      "A página foi construída para empurrar a assinatura anual vinculada à campanha atual. A recomendação principal é entrar agora enquanto o crédito promocional está disponível.",
  },
  {
    question: "O que acontece se eu esperar?",
    answer:
      "Você corre o risco de pegar o plano fora da campanha promocional, sem créditos, e começar investindo mais do próprio bolso para anunciar.",
  },
  {
    question: "Essa oferta fica ativa para sempre?",
    answer:
      "Não. A comunicação da página reforça que os créditos promocionais são limitados e a condição pode ser encerrada a qualquer momento.",
  },
  {
    question: "Qual é a ação mais inteligente agora?",
    answer:
      "Se você já pretende usar tráfego pago, faz sentido entrar durante a campanha, garantir o anual e começar com vantagem financeira desde a largada.",
    }
];

export default function FAQ({ signupUrl, creditValue }: LandingOfferProps) {
  return (
    <section id="faq" className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.22em] text-slate-700">
            FAQ
          </span>
          <h2 className="mt-5 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Perguntas frequentes para destravar a decisão
          </h2>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            A ideia desta página é deixar tudo objetivo: valor, benefício, prazo e motivo para agir agora.
          </p>
        </div>

        <div className="mt-12 space-y-4">
          {items.map((item) => (
            <details key={item.question} className="group rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-lg font-black text-slate-950">
                <span>{item.question}</span>
                <span className="text-2xl text-slate-400 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">{item.answer}</p>
            </details>
          ))}
        </div>

        <div className="mt-12 rounded-[32px] border border-emerald-200 bg-emerald-50 p-8 text-center shadow-sm">
          <p className="text-lg font-semibold text-slate-800">
            Se a dúvida era financeira, aqui está a resposta: você fecha o anual e entra com <span className="font-black text-emerald-700">{creditValue}</span> de vantagem promocional.
          </p>
          <a
            href={signupUrl}
            className="mt-6 inline-flex min-h-14 items-center justify-center rounded-2xl bg-slate-950 px-8 text-base font-extrabold text-white transition hover:bg-slate-800"
          >
            Quero ativar meu crédito agora
          </a>
        </div>
      </div>
    </section>
  );
}
