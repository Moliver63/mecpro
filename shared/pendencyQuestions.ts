// shared/pendencyQuestions.ts
//
// Mapeia cada campo pendente do perfil do cliente (ver `checks` em
// server/_core/router.ts:projectsAudit) para uma pergunta-guia e um conjunto
// de respostas alternativas prontas, que o usuário pode escolher com 1 clique
// em vez de deixar o campo em branco — evitando que a IA "invente" produto,
// diferencial ou prova social na hora de gerar a campanha (ver caso Shadia
// Hasan v6: depoimentos fictícios preenchidos porque productProofPoints
// estava vazio).
//
// Usado por:
//   - client/src/pages/ClientProfile.tsx (formulário do cliente)
//   - client/src/pages/AdminProjects.tsx (painel de conformidade do admin)

export interface PendencyGuide {
  /** Pergunta principal, direta, em 1 frase. */
  question: string;
  /** Pergunta de apoio, só exibida se a resposta vier vaga/genérica. */
  followUp?: string;
  /**
   * Respostas alternativas prontas — o usuário clica e o texto entra no
   * campo (editável depois). A última opção é sempre uma saída honesta
   * ("não tenho ainda") em vez de forçar uma resposta inventada.
   */
  options: string[];
}

export const PENDENCY_GUIDES: Record<string, PendencyGuide> = {
  hasProduct: {
    question: "O que exatamente você vende? Em uma frase, como se fosse explicar pra alguém que nunca ouviu falar do seu negócio.",
    followUp: "É produto físico, serviço avulso, assinatura, curso gravado ou experiência ao vivo? Online, presencial ou híbrido?",
    options: [
      "Serviço avulso — sessão ou atendimento único",
      "Pacote de sessões / plano recorrente",
      "Assinatura mensal",
      "Curso ou conteúdo gravado",
      "Experiência presencial / evento único",
    ],
  },

  hasDifferentials: {
    question: "Se um cliente comparasse você com os 3 concorrentes mais próximos, o que só você entrega?",
    followUp: "Existe algo no seu método, formato ou entrega que ninguém no seu nicho faz do mesmo jeito?",
    options: [
      "Método próprio, exclusivo — não é replicável por concorrente",
      "Formato de entrega diferente da concorrência (ex: presencial vs. só teoria)",
      "Resultado mais rápido / mensurável em prazo definido",
      "Atendimento mais próximo / personalizado (nome, história, acompanhamento)",
      "Ainda não sei — preciso pensar nisso com calma",
    ],
  },

  hasProofPoints: {
    question: "Você tem depoimento real de cliente? Pode colar 1 ou 2 aqui, do jeito que a pessoa escreveu.",
    followUp: "Sem depoimento, tem algum número — quantas pessoas já atendeu, taxa de satisfação, tempo de mercado, prêmio ou certificação?",
    options: [
      "Tenho depoimento de cliente, mas preciso digitar",
      "Não tenho depoimento, mas tenho número (atendidos, satisfação, tempo de mercado)",
      "Tenho prêmio, certificação ou menção em mídia",
      "Ainda não tenho nenhuma prova social — gerar sem esse elemento por enquanto",
    ],
  },

  hasWebsite: {
    question: "Você tem site, landing page ou até um link de Instagram/Linktree que sirva como destino do anúncio?",
    options: [
      "Tenho site próprio",
      "Tenho landing page específica da campanha",
      "Só tenho perfil de Instagram/Linktree por enquanto",
      "Ainda não tenho nenhum destino — vou usar formulário de leads nativo do Meta",
    ],
  },
};

/**
 * Retorna true se o campo é considerado "resposta honesta de ausência"
 * (ex: "ainda não tenho") em vez de um dado real — usado pra decidir se o
 * quality-gate de copy deve tratar esse campo como vazio mesmo estando
 * preenchido com uma dessas frases, evitando que a IA tente extrair prova
 * social de um texto que na verdade diz "não tenho prova social".
 */
export function isAbsenceAnswer(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.toLowerCase();
  return (
    v.includes("ainda não tenho") ||
    v.includes("não sei") ||
    v.includes("preciso pensar")
  );
}
