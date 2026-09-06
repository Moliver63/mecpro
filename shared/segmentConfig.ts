/**
 * segmentConfig.ts — Fonte única de verdade para todos os segmentos
 *
 * Usado por:
 *   - Frontend: CampaignBuilder (Step 1, Step 5, Step 7)
 *   - Backend:  generateCampaign, generateCampaignPart, groqMinimalPrompt
 *
 * Para adicionar novo segmento: adicione uma entrada em SEGMENT_CONFIG.
 * Todas as partes do sistema herdam automaticamente.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

export interface SegmentCopy {
  /** Textos de headline para anúncios (max 40 chars Meta) */
  headlines:       string[];
  /** Copies curtas para feed (150-200 chars) */
  shortCopies:     string[];
  /** CTAs para objetivo leads */
  ctaLeads:        string[];
  /** CTAs para objetivo vendas */
  ctaSales:        string[];
  /** Diretriz de hook para a IA */
  hookDirective:   string;
  /** Palavras/CTAs proibidos neste segmento */
  forbidden:       string[];
  /** Regras de compliance da plataforma */
  compliance:      string;
}

export interface SegmentUIConfig {
  /** Objetivo padrão ao selecionar o segmento */
  objective:       "leads" | "sales" | "traffic" | "awareness";
  /** Plataforma padrão */
  platform:        "meta" | "google" | "both";
  /** Orçamento mensal sugerido em R$ */
  budget:          number;
  /** Duração sugerida em dias */
  duration:        number;
  /** Pergunta qualificadora para formulário de leads */
  qualifyingQuestion: string;
  /** Opções da pergunta qualificadora */
  qualifyingOptions:  string[];
}

export interface SegmentDetection {
  /** Palavras-chave para detecção automática pelo nicho */
  nicheKeys:       string[];
  /** Contexto extra para injeção no prompt da IA */
  promptContext:   string;
}

/**
 * Subsegmento — tipo de oferta dentro de um segmento.
 * Escalável: para adicionar um novo tipo, basta acrescentar uma entrada.
 * Os "signals" alimentam a inferência determinística de tipo de oferta.
 */
export interface Subsegment {
  /** Chave única (ex: "locacao", "harmonizacao") */
  key:            string;
  /** Rótulo exibível (ex: "Locação", "Harmonização facial") */
  label:          string;
  /** Padrões regex de alto sinal que indicam este subsegmento */
  signals:        string[];
  /** true = sinal forte (sozinho já dá confiança alta) */
  strong?:        boolean;
  /** Override do hook para este subsegmento (opcional) */
  hookOverride?:  string;
  /** CTAs preferenciais para este subsegmento (opcional) */
  ctaOverride?:   string[];
}

export interface SegmentDefinition {
  value:           string;
  label:           string;
  icon:            string;
  desc:            string;
  copy:            SegmentCopy;
  ui:              SegmentUIConfig;
  detection:       SegmentDetection;
  /** Subsegmentos (tipos de oferta) — opcional, dado escalável */
  subsegments?:    Subsegment[];
}

// ─────────────────────────────────────────────────────────────────────────────
// FALLBACK — usado quando segmento não existe
// ─────────────────────────────────────────────────────────────────────────────

export const SEGMENT_FALLBACK: SegmentCopy = {
  headlines:       [
    "Conheça a solução ideal para você",
    "Fale agora com um especialista",
    "Resultados reais para o seu negócio",
  ],
  shortCopies:     ["Descubra como podemos ajudar seu negócio a crescer com mais eficiência."],
  ctaLeads:        ["Quero saber mais", "Falar com especialista", "Solicitar informações"],
  ctaSales:        ["Comprar agora", "Ver oferta", "Garantir meu acesso"],
  hookDirective:   "dor do cliente + solução clara + CTA direto",
  forbidden:       [],
  compliance:      "Sem promessas de resultado garantido.",
};

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO CENTRAL DE SEGMENTOS
// ─────────────────────────────────────────────────────────────────────────────

export const SEGMENT_CONFIG: Record<string, SegmentDefinition> = {

  // ── IMÓVEIS — VENDA ──────────────────────────────────────────────────────
  imoveis_venda: {
    value: "imoveis_venda",
    label: "Imóveis — Venda",
    icon:  "🏠",
    desc:  "Apartamentos, casas, terrenos à venda",
    copy: {
      headlines: [
        "Seu imóvel em [cidade] por [preço]",
        "Financie com entrada acessível",
        "Últimas unidades disponíveis",
        "Imóvel dos sonhos te espera",
        "Parcelas menores que aluguel",
      ],
      shortCopies: [
        "Você ainda paga aluguel sem ter nada no final? Garanta seu imóvel em [cidade] com entrada a partir de R$ [valor] e parcelas que cabem no seu bolso.",
        "Últimas unidades de [empreendimento] em [cidade]. [X]m², [suítes] suítes, [vagas] vaga(s). Condições especiais para quem fechar este mês.",
      ],
      ctaLeads:   ["Agendar visita", "Quero saber as condições", "Falar com corretor", "Ver o imóvel", "Solicitar proposta"],
      ctaSales:   ["Garantir minha unidade", "Ver condição especial", "Falar agora", "Quero reservar"],
      hookDirective: "dor de não ter o imóvel ideal / sonho de ter imóvel próprio / sair do aluguel",
      forbidden:  ["guia grátis", "ebook", "baixar", "download", "material gratuito", "curso", "aula"],
      compliance: "Sem claims de valorização garantida. Sem 'melhor preço' sem comprovação.",
    },
    ui: {
      objective:           "leads",
      platform:            "meta",
      budget:              3000,
      duration:            30,
      qualifyingQuestion:  "Qual é o seu interesse?",
      qualifyingOptions:   ["Morar", "Investir", "Morar e Investir"],
    },
    detection: {
      nicheKeys:    ["imob", "corretor", "corretag", "imóvel", "imovel", "apartamento", "casa", "terreno", "lote"],
      promptContext: `Segmento: Imóveis para VENDA.
COPIES: Desperte desejo pelo imóvel — localização, m², diferenciais, condições de pagamento.
CTAs OBRIGATÓRIOS: "Agendar visita" | "Quero saber as condições" | "Falar com corretor"
CTAs PROIBIDOS: qualquer CTA de infoproduto (guia, ebook, aula, download)
FUNIL: Frio → foto externa/localização. Morno → tour interno/diferenciais. Quente → condição especial/urgência.
COMPLIANCE: Sem valorização garantida. Sem "melhor preço" sem comprovação.`,
    },
  },

  // ── IMÓVEIS — LOCAÇÃO ────────────────────────────────────────────────────
  imoveis_locacao: {
    value: "imoveis_locacao",
    label: "Imóveis — Locação",
    icon:  "🔑",
    desc:  "Apartamentos, casas, salas para alugar",
    copy: {
      headlines: [
        "Apartamento em [bairro] disponível agora",
        "Alugar ficou mais fácil em [cidade]",
        "Imóvel pronto para morar, sem burocracia",
        "Sem fiador: entrada facilitada em [bairro]",
        "Disponibilidade imediata — agende sua visita",
        "Seu próximo lar em [cidade] te espera",
      ],
      shortCopies: [
        "Apartamento disponível agora em [bairro]. [X] suítes, [Y]m², vaga inclusa. Sem burocracia. Agende sua visita hoje.",
        "Cansado de pagar caro por pouco espaço? Confira nossos imóveis para alugar em [cidade] — localização central, preço justo e entrada facilitada.",
      ],
      ctaLeads:   ["Ver disponibilidade", "Agendar visita", "Consultar valores", "Quero alugar"],
      ctaSales:   ["Reservar imóvel", "Garantir meu contrato", "Fazer proposta"],
      hookDirective: "disponibilidade imediata / facilidade de mudança / localização ideal / custo-benefício",
      forbidden:  ["guia grátis", "ebook", "baixar", "download", "comprar", "financiar", "parcela"],
      compliance: "Não discriminar por raça, família, religião. Fotos reais do imóvel.",
    },
    ui: {
      objective:           "leads",
      platform:            "meta",
      budget:              1500,
      duration:            30,
      qualifyingQuestion:  "Qual é o seu interesse?",
      qualifyingOptions:   ["Moradia longa duração", "Temporada / Airbnb", "Comercial / Escritório"],
    },
    detection: {
      nicheKeys:    ["locaç", "alugu", "aluguel", "temporada", "airbnb", "alugar"],
      promptContext: `Segmento: Imóveis para LOCAÇÃO/ALUGUEL.
COPIES: Disponibilidade imediata, valor do aluguel, localização e facilidades incluídas.
CTAs OBRIGATÓRIOS: "Ver disponibilidade" | "Agendar visita" | "Consultar valores"
CTAs PROIBIDOS: "comprar", "financiar", "parcela", "entrada" (são termos de venda, não locação)
LINGUAGEM: "alugar", "locação", "disponível agora", "sem burocracia"
COMPLIANCE: Não discriminar por critérios protegidos (raça, família, religião).`,
    },
  },

  // ── E-COMMERCE ────────────────────────────────────────────────────────────
  ecommerce: {
    value: "ecommerce",
    label: "E-commerce",
    icon:  "🛒",
    desc:  "Loja virtual, produtos físicos",
    copy: {
      headlines: [
        "Frete grátis hoje em [produto]",
        "[Produto] com [X]% de desconto",
        "Entrega em 2 dias úteis",
        "Compre e receba em casa",
        "Oferta por tempo limitado",
      ],
      shortCopies: [
        "Frete grátis hoje! [Produto] por R$ [X] com entrega em 2 dias e 30 dias para trocar. Sem risco.",
        "[X]% de desconto só até [data]. Aproveite agora antes que acabe o estoque.",
      ],
      ctaLeads:   ["Cadastrar e ganhar desconto", "Quero receber ofertas", "Entrar na lista VIP"],
      ctaSales:   ["Comprar agora", "Ver oferta", "Garantir com desconto", "Comprar com frete grátis"],
      hookDirective: "produto + preço + frete grátis + prazo de entrega rápido + garantia",
      forbidden:  ["agendar visita", "falar com corretor", "avaliação gratuita", "guia", "locação", "aluguel"],
      compliance: "Preço exato. Desconto real (preço de vs atual). Fotos reais do produto.",
    },
    ui: {
      objective:           "sales",
      platform:            "meta",
      budget:              3000,
      duration:            30,
      qualifyingQuestion:  "O que você tem interesse?",
      qualifyingOptions:   ["Comprar agora", "Receber promoções", "Conhecer o catálogo"],
    },
    detection: {
      nicheKeys:    ["ecommerce", "loja", "produto", "varejo", "e-commerce", "shopify"],
      promptContext: `Segmento: E-COMMERCE — produtos físicos.
COPIES: Produto + preço + frete grátis + prazo + garantia.
CTAs OBRIGATÓRIOS: "Comprar agora" | "Ver oferta" | "Garantir com desconto"
CTAs PROIBIDOS: qualquer CTA de serviço, imóvel ou infoproduto
SAZONALIDADE: Ajuste para Black Friday, Natal, Dia das Mães.
COMPLIANCE: Preço exato. Desconto real. Fotos reais do produto.`,
    },
  },

  // ── SERVIÇOS LOCAIS ───────────────────────────────────────────────────────
  servicos_locais: {
    value: "servicos_locais",
    label: "Serviços Locais",
    icon:  "📍",
    desc:  "Clínicas, salões, restaurantes, oficinas",
    copy: {
      headlines: [
        "A [X]min de você — agende já",
        "Horário disponível amanhã",
        "Primeira consulta com desconto",
        "Atendimento no mesmo dia",
        "Profissional avaliado com ⭐⭐⭐⭐⭐",
      ],
      shortCopies: [
        "A [X] minutos de você. Agende agora e ganhe [benefício] na primeira visita. Sem fila, sem espera.",
        "Agenda aberta para essa semana em [cidade]. [Serviço] com profissionais avaliados com 5 estrelas.",
      ],
      ctaLeads:   ["Agendar agora", "Ligar agora", "Ver horários disponíveis", "Reservar meu horário"],
      ctaSales:   ["Contratar serviço", "Solicitar orçamento", "Falar no WhatsApp"],
      hookDirective: "proximidade geográfica + horário disponível + benefício da primeira visita",
      forbidden:  ["comprar online", "frete grátis", "entrega", "baixar guia", "ebook", "financiar"],
      compliance: "Fotos reais do estabelecimento. Horários corretos. Preços reais.",
    },
    ui: {
      objective:           "leads",
      platform:            "meta",
      budget:              1500,
      duration:            30,
      qualifyingQuestion:  "Qual serviço você tem interesse?",
      qualifyingOptions:   ["Agendar consulta", "Pedir orçamento", "Saber mais sobre os serviços"],
    },
    detection: {
      nicheKeys:    ["serviço", "local", "clínica", "salão", "oficina", "consultório", "studio"],
      promptContext: `Segmento: SERVIÇOS LOCAIS.
COPIES: Localização próxima + disponibilidade imediata + benefício da primeira visita.
CTAs OBRIGATÓRIOS: "Agendar agora" | "Ver horários" | "Reservar meu horário"
CTAs PROIBIDOS: "comprar", "frete grátis", "entrega", "download"
SEGMENTAÇÃO: Raio de 5-15km. "Pessoas que moram aqui" (não visitantes).
COMPLIANCE: Fotos reais do local. Horários corretos.`,
    },
  },

  // ── INFOPRODUTOS ──────────────────────────────────────────────────────────
  infoprodutos: {
    value: "infoprodutos",
    label: "Infoprodutos / Cursos",
    icon:  "🎓",
    desc:  "Cursos online, mentorias, ebooks",
    copy: {
      headlines: [
        "[Resultado] em [tempo] — método comprovado",
        "Aula grátis com [X] mil alunos",
        "Turma fechando [data]",
        "7 dias de garantia total",
        "Aprenda [skill] do zero",
      ],
      shortCopies: [
        "Descubra como [resultado desejado] em [tempo] — mesmo sem [objeção principal]. Aula gratuita com [X] mil alunos já assistiram.",
        "Turma fechando hoje. [X] alunos já transformaram [resultado]. 7 dias de garantia total — se não gostar, devolvemos tudo.",
      ],
      ctaLeads:   ["Quero minha vaga gratuita", "Acessar aula grátis", "Entrar para a lista VIP", "Baixar agora"],
      ctaSales:   ["Garantir minha vaga", "Quero me inscrever", "Acessar agora com desconto"],
      hookDirective: "transformação prometida + prova social (número de alunos) + baixo atrito para começar",
      forbidden:  ["agendar visita", "falar com corretor", "entrega em 2 dias", "frete grátis", "alugar"],
      compliance: "Sem promessas de ganho específico ('ganhe R$ X/mês'). Use 'resultados variam'.",
    },
    ui: {
      objective:           "leads",
      platform:            "both",
      budget:              3000,
      duration:            30,
      qualifyingQuestion:  "Qual é seu maior desafio hoje?",
      qualifyingOptions:   ["Quero aprender do zero", "Já tenho base, quero avançar", "Quero certificação"],
    },
    detection: {
      nicheKeys:    ["curso", "info", "ead", "mentoria", "ebook", "digital", "online", "treinamento"],
      promptContext: `Segmento: INFOPRODUTOS e cursos online.
COPIES: Transformação prometida + prova social + baixo atrito.
CTAs OBRIGATÓRIOS: "Vaga gratuita" | "Aula grátis" | "Garantir minha vaga"
CTAs PROIBIDOS: "agendar visita", "frete grátis", "entrega", "falar com corretor"
FUNIL: TOF → conteúdo gratuito. MOF → webinar. BOF → oferta com urgência.
COMPLIANCE: Sem promessas de ganho. 'Resultados variam' obrigatório.`,
    },
  },

  // ── SAÚDE & ESTÉTICA ──────────────────────────────────────────────────────
  saude_estetica: {
    value: "saude_estetica",
    label: "Saúde & Estética",
    icon:  "💆",
    desc:  "Clínicas, procedimentos, bem-estar",
    copy: {
      headlines: [
        "Avaliação gratuita com especialista",
        "Recupere sua autoestima",
        "Agenda aberta esta semana",
        "Procedimento com resultados reais",
        "Especialista certificado te atende",
      ],
      shortCopies: [
        "Recupere sua autoestima com [procedimento]. Avaliação gratuita com especialista. Sem compromisso.",
        "Agenda limitada para esta semana. [X] pacientes já transformaram sua vida com [procedimento]. Agende sua avaliação gratuita agora.",
      ],
      ctaLeads:   ["Agendar avaliação gratuita", "Quero minha avaliação", "Falar com especialista", "Marcar consulta"],
      ctaSales:   ["Agendar procedimento", "Solicitar proposta", "Ver disponibilidade"],
      hookDirective: "autoestima + bem-estar + resultados sem claims médicos proibidos",
      forbidden:  ["cura", "elimina", "trata", "guia", "ebook", "baixar", "before/after", "antes/depois", "garantido"],
      compliance: "PROIBIDO: before/after, claims médicos, exposição de corpo. Use 'pode ajudar', 'favorece'.",
    },
    ui: {
      objective:           "leads",
      platform:            "meta",
      budget:              2000,
      duration:            30,
      qualifyingQuestion:  "Qual é o seu interesse?",
      qualifyingOptions:   ["Agendar avaliação", "Saber mais sobre os procedimentos", "Receber informações de preço"],
    },
    detection: {
      nicheKeys:    ["saúde", "saude", "estética", "estetica", "clínica", "clinica", "procedimento", "beleza"],
      promptContext: `Segmento: SAÚDE E ESTÉTICA.
COPIES: Autoestima + bem-estar + resultados. NUNCA claims médicos.
CTAs OBRIGATÓRIOS: "Avaliação gratuita" | "Falar com especialista"
PROIBIDO ABSOLUTO: before/after, "cura", "elimina", "trata", exposição de corpo.
Use: "pode ajudar", "favorece", "contribui para".
COMPLIANCE CRÍTICO: Meta bane anúncios de saúde com before/after.`,
    },
  },

  // ── ALIMENTAÇÃO ───────────────────────────────────────────────────────────
  alimentacao: {
    value: "alimentacao",
    label: "Alimentação & Delivery",
    icon:  "🍔",
    desc:  "Restaurantes, lanchonetes, delivery",
    copy: {
      headlines: [
        "Entrega em 30 minutos",
        "Frete grátis hoje no app",
        "Promoção do dia: [prato]",
        "Peça agora, chegue quente",
        "Cardápio completo com delivery",
      ],
      shortCopies: [
        "Entrega em 30 minutos. [Prato] por R$ [X] com taxa grátis hoje. Peça agora pelo WhatsApp.",
        "Promoção só hoje: [prato] por R$ [X]. Entrega rápida, pedido fácil. Não perca!",
      ],
      ctaLeads:   ["Ver cardápio", "Pedir no WhatsApp"],
      ctaSales:   ["Pedir agora", "Fazer meu pedido", "Pedir delivery", "Pedir com desconto"],
      hookDirective: "foto apetitosa + velocidade de entrega + preço especial do dia",
      forbidden:  ["agendar visita", "guia grátis", "ebook", "curso", "avaliação gratuita", "financiar"],
      compliance: "Foto real do produto. Preço exato. Álcool: configurar restrição de idade 18+.",
    },
    ui: {
      objective:           "sales",
      platform:            "meta",
      budget:              1000,
      duration:            30,
      qualifyingQuestion:  "Como você prefere pedir?",
      qualifyingOptions:   ["Delivery", "Retirada no local", "Reserva para jantar"],
    },
    detection: {
      // Achado real (Gra Kau Delícias, campanha #754): "confeitaria" não
      // batia com nenhuma palavra-chave existente e caía no fallback
      // "outro" — o que, junto com o bug do isRealEstate acima, contribuiu
      // pro desvio pro gerador de imóveis. Ampliado pra cobrir confeitaria/
      // doceria/padaria, que são alimentacao mas não usam essas palavras.
      nicheKeys:    ["restaurante", "aliment", "delivery", "lanche", "comida", "gastronomia", "bar", "pizz", "confeit", "doce", "docinho", "padaria", "confeitaria", "bolo", "brigadeiro", "encomendas", "presentes", "cafeteria", "hamburgueria"],
      promptContext: `Segmento: ALIMENTAÇÃO E DELIVERY.
COPIES: Apelo visual + velocidade + preço especial do dia.
CTAs OBRIGATÓRIOS: "Pedir agora" | "Ver cardápio" | "Pedir no WhatsApp"
HORÁRIOS: Publicar 30-60 min antes dos picos (11h30, 18h30).
SEGMENTAÇÃO: Raio de 5-8km. Público 18-45 anos.
COMPLIANCE: Foto real do produto. Álcool: restrição de idade.`,
    },
  },

  // ── MODA & VAREJO ─────────────────────────────────────────────────────────
  moda_varejo: {
    value: "moda_varejo",
    label: "Moda & Varejo",
    icon:  "👗",
    desc:  "Roupas, calçados, acessórios",
    copy: {
      headlines: [
        "Nova coleção chegou — confira já",
        "Frete grátis em toda a loja",
        "[Peça] com [X]% off hoje",
        "Estoque limitado — garanta já",
        "Seu estilo começa aqui",
      ],
      shortCopies: [
        "Nova coleção chegou. [Peça] por R$ [X] com frete grátis hoje. Estoque limitado — garanta o seu.",
        "Últimas peças com [X]% de desconto. Só até [data] ou enquanto durar o estoque.",
      ],
      ctaLeads:   ["Ver nova coleção", "Cadastrar para receber novidades"],
      ctaSales:   ["Comprar agora", "Ver coleção", "Garantir o meu", "Aproveitar oferta"],
      hookDirective: "estilo + ocasião + preço + frete grátis + estoque limitado",
      forbidden:  ["agendar visita", "avaliação gratuita", "guia", "curso", "ebook", "locação"],
      compliance: "Fotos reais. Preço exato. Sem discriminação de tamanho/corpo.",
    },
    ui: {
      objective:           "sales",
      platform:            "meta",
      budget:              2000,
      duration:            30,
      qualifyingQuestion:  "O que você procura?",
      qualifyingOptions:   ["Roupas femininas", "Roupas masculinas", "Acessórios", "Calçados"],
    },
    detection: {
      nicheKeys:    ["moda", "roupa", "vestuário", "vestuario", "calçado", "calcado", "acessório"],
      promptContext: `Segmento: MODA E VAREJO.
COPIES: Estilo + ocasião + preço + frete + estoque limitado.
CTAs OBRIGATÓRIOS: "Comprar agora" | "Ver coleção" | "Aproveitar oferta"
SAZONALIDADE: Verão/inverno, Black Friday, Natal, Dia das Mães.
COMPLIANCE: Fotos reais. Sem discriminação de tamanho/corpo.`,
    },
  },

  // ── B2B ───────────────────────────────────────────────────────────────────
  b2b: {
    value: "b2b",
    label: "B2B / Empresas",
    icon:  "🏢",
    desc:  "Soluções para empresas, SaaS, serviços",
    copy: {
      headlines: [
        "Reduza [X]% de [processo] hoje",
        "Empresas líderes já usam esta solução",
        "Demo gratuita disponível",
        "ROI comprovado em [setor]",
        "Case: como [empresa] cresceu [X]%",
      ],
      shortCopies: [
        "Reduza [X]% do tempo gasto em [processo]. +500 empresas já usam. Solicite uma demo gratuita — sem compromisso.",
        "Veja como [empresa similar] aumentou [X]% de [resultado] usando [solução]. Demo gratuita de 30 minutos.",
      ],
      ctaLeads:   ["Solicitar demo gratuita", "Falar com especialista", "Ver case de sucesso", "Calcular meu ROI"],
      ctaSales:   ["Contratar agora", "Solicitar proposta", "Iniciar período de teste"],
      hookDirective: "ROI específico + problema que resolve + número de clientes como prova social",
      forbidden:  ["comprar agora", "frete grátis", "entrega rápida", "guia para iniciantes", "aluguel"],
      compliance: "Sem promessas de resultado garantido. Use 'pode', 'ajuda a', 'contribui para'.",
    },
    ui: {
      objective:           "leads",
      platform:            "both",
      budget:              5000,
      duration:            30,
      qualifyingQuestion:  "Qual é o tamanho da sua empresa?",
      qualifyingOptions:   ["1-10 funcionários", "11-50 funcionários", "51-200 funcionários", "200+ funcionários"],
    },
    detection: {
      nicheKeys:    ["b2b", "empresa", "saas", "software", "tecnologia", "gestão", "gestao", "corporativo"],
      promptContext: `Segmento: B2B — soluções para empresas.
COPIES: ROI + problema específico + credibilidade com número de clientes.
CTAs OBRIGATÓRIOS: "Demo gratuita" | "Falar com especialista" | "Ver case"
PLATAFORMAS: Google (intenção ativa) + LinkedIn (cargo/empresa) + Meta (remarketing).
PÚBLICO: Decisores (CEO, Diretor, Gerente), 10-500 funcionários.
COMPLIANCE: Sem resultado garantido. Use 'pode', 'ajuda a'.`,
    },
  },

  // ── OUTRO ─────────────────────────────────────────────────────────────────

  // ── VEÍCULOS ──────────────────────────────────────────────────────────────
  veiculos: {
    value: "veiculos",
    label: "Veículos e Automotivo",
    icon:  "🚗",
    desc:  "Carros, motos, caminhões, oficinas, autopeças",
    detection: {
      nicheKeys: [
        "carro", "automóvel", "automovel", "veículo", "veiculo", "moto", "caminhão", "caminhao",
        "frota", "seminovo", "0km", "concessionária", "concessionaria", "revenda",
        "mecânica", "mecanica", "autoelétrica", "autoeletrica", "funilaria", "pintura",
        "pneu", "oficina mecânica", "auto peças", "autopeças", "carros usados"
      ],
      promptContext: `Segmento: VEÍCULOS e automotivo.
COPIES: Condição do veículo, preço, financiamento, garantia, diferenciais, revisão, manutenção.
CTAs OBRIGATÓRIOS: "Agendar visita" | "Falar com vendedor" | "Simular financiamento"
CTAs PROIBIDOS: "agendar consulta", "aula grátis", "download"`,
    },
    copy: {
      headline: "🚗 {produto} — {diferencial}",
      description: `{empresa}: {nichoLabel} com qualidade e procedência.`,
      cta: "Agendar visita",
    },
    examples: [
      { headline: "Hilux 2020 — 45.000 km, revisada", description: "Concessionária XYZ: seminovos com garantia de 1 ano.", cta: "Agendar visita" },
      { headline: "Moto 0km — Financiamento facilitado", description: "Yamaha XYZ: entrada a partir de R$ 2.000.", cta: "Simular financiamento" },
    ],
    fallback: {
      headline: `{empresa} — {nichoLabel} com procedência`,
      copy: "Conheça nossos veículos e serviços de {nichoLabel}. Atendimento especializado.`,
      cta: "Falar com vendedor",
    },
    strategy: {
      duration: "30 dias",
      budget: 50,
      targetAudience: `25-55 anos interessados em {nichoLabel}`,
      adSets: [
        { name: "TOF — Interesse em veículos", funnelStage: "topo", objective: "awareness", budget: 20, audience: `Interesse em carros, motos e {nichoLabel}, 25-55 anos`, cta: "Saber mais" },
        { name: "MOF — Visitantes do estoque", funnelStage: "meio", objective: "consideration", budget: 15, audience: `Visitantes do site de {nichoLabel}, 25-55 anos`, cta: "Agendar visita" },
        { name: "BOF — Interessados em financiamento", funnelStage: "fundo", objective: "conversion", budget: 15, audience: `Interessados em financiamento de veículos, 25-55 anos`, cta: "Simular financiamento" },
      ],
    },
  },

  // ── CONSTRUÇÃO ─────────────────────────────────────────────────────────────
  construcao: {
    value: "construcao",
    label: "Material de Construção",
    icon:  "🧱",
    desc:  "Materiais, reforma, acabamento, ferramentas",
    detection: {
      nicheKeys: [
        "construção", "construcao", "material", "obra", "cimento", "tijolo", "telha",
        "madeira", "ferragem", "elétrica", "eletrica", "hidráulica", "hidraulica",
        "acabamento", "revestimento", "piso", "porcelanato", "tinta", "ferramenta",
        "depot", "home center", "reforma", "pedreiro", "arquiteto", "engenheiro",
        "construtora", "gesso", "drywall", "azulejo", "cerâmica", "ceramica"
      ],
      promptContext: `Segmento: MATERIAL DE CONSTRUÇÃO e reforma.
COPIES: Qualidade do material, preço, entrega, prazo, atendimento técnico, variedade.
CTAs OBRIGATÓRIOS: "Fazer orçamento" | "Consultar preço" | "Falar com especialista"
CTAs PROIBIDOS: "agendar visita" (a menos que seja showroom), "aula grátis"`,
    },
    copy: {
      headline: "🧱 {produto} — {diferencial}",
      description: `{empresa}: {nichoLabel} com preço justo e entrega rápida.`,
      cta: "Fazer orçamento",
    },
    examples: [
      { headline: "Cimento 50kg — Melhor preço da região", description: "Depot XYZ: entrega em 24h para obras em Itajaí.", cta: "Fazer orçamento" },
      { headline: "Revestimento importado — Acabamento premium", description: "Cerâmica XYZ: porcelanatos e pisos para projetos de alto padrão.", cta: "Falar com especialista" },
    ],
    fallback: {
      headline: `{empresa} — {nichoLabel} com entrega rápida`,
      copy: "Conheça nossos materiais de {nichoLabel}. Orçamento sem compromisso.`,
      cta: "Consultar preço",
    },
    strategy: {
      duration: "30 dias",
      budget: 50,
      targetAudience: `30-60 anos interessados em {nichoLabel}`,
      adSets: [
        { name: "TOF — Profissionais da construção", funnelStage: "topo", objective: "awareness", budget: 20, audience: `Pedreiros, arquitetos e engenheiros, 30-60 anos`, cta: "Saber mais" },
        { name: "MOF — Visitantes do showroom", funnelStage: "meio", objective: "consideration", budget: 15, audience: `Visitantes do site de {nichoLabel}, 30-60 anos`, cta: "Fazer orçamento" },
        { name: "BOF — Orçamentos pendentes", funnelStage: "fundo", objective: "conversion", budget: 15, audience: `Pessoas que solicitaram orçamento de {nichoLabel}, 30-60 anos`, cta: "Falar com especialista" },
      ],
    },
  },

  // ── EDUCAÇÃO ───────────────────────────────────────────────────────────────
  educacao: {
    value: "educacao",
    label: "Educação Presencial",
    icon:  "📚",
    desc:  "Escolas, cursos, faculdades, aulas particulares",
    detection: {
      nicheKeys: [
        "escola", "faculdade", "universidade", "curso presencial", "aula particular",
        "reforço", "reforco", "idioma", "inglês", "ingles", "espanhol",
        "preparatório", "preparatorio", "enem", "vestibular", "colegio", "colégio",
        "berçário", "bercario", "creche", "ensino", "educação", "educacao",
        "professor particular", "tutor", "intercâmbio", "intercambio"
      ],
      promptContext: `Segmento: EDUCAÇÃO presencial.
COPIES: Metodologia, corpo docente, infraestrutura, resultados de alunos, valores, diferenciais pedagógicos.
CTAs OBRIGATÓRIOS: "Agendar visita" | "Saber mais sobre o curso" | "Falar com coordenador"
CTAs PROIBIDOS: "comprar agora", "frete grátis"`,
    },
    copy: {
      headline: "📚 {produto} — {diferencial}",
      description: `{empresa}: {nichoLabel} com metodologia comprovada.`,
      cta: "Agendar visita",
    },
    examples: [
      { headline: "Inglês para crianças — Aulas lúdicas", description: "Escola XYZ: método natural de aprendizado para crianças de 4 a 10 anos.", cta: "Agendar visita" },
      { headline: "Pré-Enem — Aprovação garantida", description: "Curso XYZ: 95% de aprovação nos vestibulares.", cta: "Saber mais sobre o curso" },
    ],
    fallback: {
      headline: `{empresa} — {nichoLabel} com metodologia diferenciada`,
      copy: "Conheça nossos cursos de {nichoLabel}. Aulas com professores qualificados.`,
      cta: "Falar com coordenador",
    },
    strategy: {
      duration: "30 dias",
      budget: 50,
      targetAudience: `25-50 anos (pais) e 16-25 anos (alunos)`,
      adSets: [
        { name: "TOF — Pais em busca de educação", funnelStage: "topo", objective: "awareness", budget: 20, audience: `Pais de crianças e adolescentes, 30-50 anos`, cta: "Saber mais" },
        { name: "MOF — Visitantes do site", funnelStage: "meio", objective: "consideration", budget: 15, audience: `Visitantes do site de {nichoLabel}, 25-50 anos`, cta: "Agendar visita" },
        { name: "BOF — Matrículas pendentes", funnelStage: "fundo", objective: "conversion", budget: 15, audience: `Pais que iniciaram matrícula de {nichoLabel}, 30-50 anos`, cta: "Falar com coordenador" },
      ],
    },
  },

  // ── EVENTOS ────────────────────────────────────────────────────────────────
  eventos: {
    value: "eventos",
    label: "Eventos e Festas",
    icon:  "🎉",
    desc:  "Buffet, decoração, casamentos, aniversários, som",
    detection: {
      nicheKeys: [
        "festa", "casamento", "debutante", "aniversário", "aniversario", "evento",
        "buffet", "decoração", "decoracao", "dj", "som", "iluminação", "iluminacao",
        "cerimonial", "fotografia", "filmagem", "noiva", "noivo", "festa de 15",
        "festa infantil", "chá de bebê", "chá de cozinha", "formatura"
      ],
      promptContext: `Segmento: EVENTOS e festas.
COPIES: Experiência, personalização, portfolio, depoimentos de noivos/aniversariantes, pacotes, diferenciais.
CTAs OBRIGATÓRIOS: "Agendar visita" | "Ver portfolio" | "Solicitar orçamento"
CTAs PROIBIDOS: "comprar agora"`,
    },
    copy: {
      headline: "🎉 {produto} — {diferencial}",
      description: `{empresa}: {nichoLabel} para momentos inesquecíveis.`,
      cta: "Solicitar orçamento",
    },
    examples: [
      { headline: "Buffet de casamento — Menu degustação grátis", description: "Buffet XYZ: gastronomia premium para até 300 convidados.", cta: "Agendar visita" },
      { headline: "Decoração de festa infantil — Temas exclusivos", description: "Decoração XYZ: projetos personalizados para festas de 1 a 10 anos.", cta: "Ver portfolio" },
    ],
    fallback: {
      headline: `{empresa} — {nichoLabel} para momentos especiais`,
      copy: "Conheça nossos serviços de {nichoLabel}. Orçamento personalizado.`,
      cta: "Solicitar orçamento",
    },
    strategy: {
      duration: "30 dias",
      budget: 50,
      targetAudience: `25-45 anos (noivos/aniversariantes)`,
      adSets: [
        { name: "TOF — Noivos e aniversariantes", funnelStage: "topo", objective: "awareness", budget: 20, audience: `Noivos e pais de debutantes, 25-45 anos`, cta: "Saber mais" },
        { name: "MOF — Visitantes do portfolio", funnelStage: "meio", objective: "consideration", budget: 15, audience: `Visitantes do site de {nichoLabel}, 25-45 anos`, cta: "Ver portfolio" },
        { name: "BOF — Orçamentos solicitados", funnelStage: "fundo", objective: "conversion", budget: 15, audience: `Pessoas que solicitaram orçamento de {nichoLabel}, 25-45 anos`, cta: "Solicitar orçamento" },
      ],
    },
  },

  // ── TURISMO ────────────────────────────────────────────────────────────────
  turismo: {
    value: "turismo",
    label: "Turismo e Hotelaria",
    icon:  "🏖️",
    desc:  "Hotéis, pousadas, passeios, pacotes turísticos",
    detection: {
      nicheKeys: [
        "hotel", "pousada", "hostel", "turismo", "viagem", "passeio", "tour",
        "resort", "agência de viagens", "agencia de viagens", "pacote turístico",
        "pacote turistico", "hospedagem", "quarto", "diária", "diaria",
        "praia", "montanha", "serra", "cachoeira", "ecoturismo", "cruzeiro"
      ],
      promptContext: `Segmento: TURISMO e hotelaria.
COPIES: Experiência, localização, diferenciais, pacotes, temporada, avaliações de hóspedes.
CTAs OBRIGATÓRIOS: "Reservar agora" | "Ver disponibilidade" | "Falar com consultor"
CTAs PROIBIDOS: "comprar agora" (a menos que seja pacote), "agendar consulta"`,
    },
    copy: {
      headline: "🏖️ {produto} — {diferencial}",
      description: `{empresa}: {nichoLabel} com vista privilegiada.`,
      cta: "Ver disponibilidade",
    },
    examples: [
      { headline: "Pousada na Praia Brava — Vista para o mar", description: "Pousada XYZ: café da manhã regional e atendimento personalizado.", cta: "Reservar agora" },
      { headline: "Tour gastronômico — Sabores de Itajaí", description: "Tour XYZ: 5 paradas em restaurantes típicos da região.", cta: "Falar com consultor" },
    ],
    fallback: {
      headline: `{empresa} — {nichoLabel} com experiência única`,
      copy: "Conheça nossas opções de {nichoLabel}. Reserve com antecedência.`,
      cta: "Ver disponibilidade",
    },
    strategy: {
      duration: "30 dias",
      budget: 50,
      targetAudience: `25-55 anos interessados em {nichoLabel}`,
      adSets: [
        { name: "TOF — Viajantes em planejamento", funnelStage: "topo", objective: "awareness", budget: 20, audience: `Interesse em viagem e turismo, 25-55 anos`, cta: "Saber mais" },
        { name: "MOF — Visitantes do site", funnelStage: "meio", objective: "consideration", budget: 15, audience: `Visitantes do site de {nichoLabel}, 25-55 anos`, cta: "Ver disponibilidade" },
        { name: "BOF — Reservas iniciadas", funnelStage: "fundo", objective: "conversion", budget: 15, audience: `Pessoas que iniciaram reserva de {nichoLabel}, 25-55 anos`, cta: "Reservar agora" },
      ],
    },
  },

  // ── PET ────────────────────────────────────────────────────────────────────
  pet: {
    value: "pet",
    label: "Pet e Animais",
    icon:  "🐾",
    desc:  "Petshop, veterinário, adestramento, produtos para pets",
    detection: {
      nicheKeys: [
        "pet", "animal", "cachorro", "gato", "veterinário", "veterinario",
        "petshop", "ração", "racao", "adestramento", "banho e tosa",
        "clínica veterinária", "clinica veterinaria", "cuidado animal",
        "hotel para cachorro", "creche canina", "passeador de cães"
      ],
      promptContext: `Segmento: PET — cuidados com animais.
COPIES: Bem-estar do pet, qualidade do serviço, ambiente seguro, produtos especializados, amor aos animais.
CTAs OBRIGATÓRIOS: "Agendar banho e tosa" | "Falar com veterinário" | "Ver produtos"
CTAs PROIBIDOS: "comprar agora" (a menos que seja loja de produtos), "aula grátis"`,
    },
    copy: {
      headline: "🐾 {produto} — {diferencial}",
      description: `{empresa}: {nichoLabel} com carinho e profissionalismo.`,
      cta: "Agendar serviço",
    },
    examples: [
      { headline: "Banho e tosa — Seu pet merece o melhor", description: "Petshop XYZ: produtos hipoalergênicos e ambiente climatizado.", cta: "Agendar banho e tosa" },
      { headline: "Veterinário 24h — Atendimento de emergência", description: "Clínica XYZ: plantão veterinário todos os dias da semana.", cta: "Falar com veterinário" },
    ],
    fallback: {
      headline: `{empresa} — {nichoLabel} com amor e cuidado`,
      copy: "Conheça nossos serviços de {nichoLabel}. Seu pet em boas mãos.`,
      cta: "Agendar serviço",
    },
    strategy: {
      duration: "30 dias",
      budget: 50,
      targetAudience: `25-50 anos (tutores de pets)`,
      adSets: [
        { name: "TOF — Tutores de pets", funnelStage: "topo", objective: "awareness", budget: 20, audience: `Tutores de cães e gatos, 25-50 anos`, cta: "Saber mais" },
        { name: "MOF — Visitantes do site", funnelStage: "meio", objective: "consideration", budget: 15, audience: `Visitantes do site de {nichoLabel}, 25-50 anos`, cta: "Agendar serviço" },
        { name: "BOF — Agendamentos pendentes", funnelStage: "fundo", objective: "conversion", budget: 15, audience: `Tutores que iniciaram agendamento de {nichoLabel}, 25-50 anos`, cta: "Confirmar agendamento" },
      ],
    },
  },
  outro: {
    value: "outro",
    label: "Outro segmento",
    icon:  "✏️",
    desc:  "Configurar manualmente",
    copy: {
      headlines:       ["Conheça nossa solução", "Fale com um especialista"],
      shortCopies:     ["Descubra como podemos ajudar seu negócio a crescer."],
      ctaLeads:        ["Quero saber mais", "Falar com especialista"],
      ctaSales:        ["Comprar agora", "Ver oferta"],
      hookDirective:   "dor do cliente + solução clara + CTA direto",
      forbidden:       [],
      compliance:      "Verifique as políticas da plataforma para seu segmento.",
    },
    ui: {
      objective:           "leads",
      platform:            "meta",
      budget:              1500,
      duration:            30,
      qualifyingQuestion:  "Como podemos te ajudar?",
      qualifyingOptions:   ["Quero mais informações", "Quero fazer um orçamento", "Quero falar com especialista"],
    },
    detection: {
      nicheKeys:    [],
      promptContext: "",
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FUNÇÕES UTILITÁRIAS — usadas por frontend e backend
// ─────────────────────────────────────────────────────────────────────────────

/** Retorna a definição do segmento ou o fallback */
export function getSegment(value: string): SegmentDefinition {
  return SEGMENT_CONFIG[value] ?? SEGMENT_CONFIG["outro"]!;
}

/** Retorna as regras de copy do segmento com fallback */
export function getSegmentCopy(value: string): SegmentCopy {
  return SEGMENT_CONFIG[value]?.copy ?? SEGMENT_FALLBACK;
}

/** Detecta segmento automaticamente pelo nicho do cliente */
export function detectRealEstateSegment(value: string): string | null {
  const text = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const property = /\b(imoveis(?:_venda|_locacao)?|imovel|imobiliari[ao]s?|apartamento|cobertura|sala comercial|casa|terreno|condominio)\b/.test(text);
  if (!property) return null;
  // Broad property words must not win over the explicit rental purpose.
  return /\b(locacao|aluguel|alugar|locar|temporada|airbnb)\b|imoveis_locacao/.test(text)
    ? "imoveis_locacao"
    : "imoveis_venda";
}

export function detectSegmentFromNiche(niche: string): string {
  if (!niche) return "outro";
  const realEstate = detectRealEstateSegment(niche);
  if (realEstate) return realEstate;
  const n = niche.toLowerCase();
  for (const [key, def] of Object.entries(SEGMENT_CONFIG)) {
    if (def.detection.nicheKeys.some(k => n.includes(k))) return key;
  }
  return "outro";
}

/** Monta o bloco de instrução para o prompt da IA */
export function getSegmentPromptBlock(segment: string, objective: string): string {
  const def = getSegment(segment);
  const copy = def.copy;
  const ctaList = objective === "sales" ? copy.ctaSales : copy.ctaLeads;

  return [
    def.detection.promptContext,
    `CTAs PARA USAR: ${ctaList.slice(0, 3).join(" | ")}`,
    `HOOK IDEAL: ${copy.hookDirective}`,
    `PALAVRAS PROIBIDAS: ${copy.forbidden.join(", ")}`,
    `COMPLIANCE: ${copy.compliance}`,
  ].filter(Boolean).join("\n");
}

/** Lista ordenada de segmentos para UI */
export const SEGMENT_LIST: SegmentDefinition[] = Object.values(SEGMENT_CONFIG);

/** Mapa segmento → nicho da learning base */
export const SEGMENT_TO_NICHE: Record<string, string> = {
  imoveis_venda:   "imobiliario",
  imoveis_locacao: "imobiliario",
  ecommerce:       "ecommerce",
  servicos_locais: "servicos",
  infoprodutos:    "infoprodutos",
  saude_estetica:  "saude",
  alimentacao:     "alimentacao",
  moda_varejo:     "moda",
  b2b:             "b2b",
  outro:           "geral",
};