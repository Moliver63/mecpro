
// ══════════════════════════════════════════════════════════════════════
// TAXONOMIA COMPLETA DE NICHOS — MecProAI Marketplace
// Cada nicho tem subnichos, priceType default e copyConfig para IA
// ══════════════════════════════════════════════════════════════════════

export interface NicheConfig {
  key: string;
  label: string;
  icon: string;
  desc: string;
  color: string;
  bg: string;
  defaultPriceType: string;
  priceUnit: string;
  subniches: { key: string; label: string; desc: string }[];
  copyHints: {
    painTemplate: string;
    ctaTemplate: string;
    guaranteeTemplate: string;
  };
}

export const NICHE_TAXONOMY: NicheConfig[] = [
  // ── IMOBILIÁRIO ────────────────────────────────────────────────────
  {
    key: "imovel_venda", label: "🏠 Imóvel à Venda", icon: "🏠",
    desc: "Casas, aptos, terrenos, comerciais para venda",
    color: "#1a5276", bg: "#d6eaf8",
    defaultPriceType: "fixed", priceUnit: "R$",
    subniches: [
      { key: "apartamento_venda",  label: "Apartamento",       desc: "Studios, 1 a 4+ quartos, cobertura" },
      { key: "casa_venda",         label: "Casa",               desc: "Casa residencial, sobrado, vila" },
      { key: "terreno_venda",      label: "Terreno / Lote",     desc: "Terreno urbano, loteamento, chácara" },
      { key: "comercial_venda",    label: "Sala / Loja",        desc: "Sala comercial, loja, galpão" },
      { key: "lancamento",         label: "Lançamento",         desc: "Imóvel na planta, pré-lançamento" },
      { key: "rural_venda",        label: "Rural / Sítio",      desc: "Sítio, fazenda, chácara, haras" },
    ],
    copyHints: {
      painTemplate: "Dificuldade em encontrar imóvel com localização ideal, documentação limpa e preço justo",
      ctaTemplate: "Agendar visita", guaranteeTemplate: "Documentação 100% verificada",
    },
  },
  {
    key: "imovel_aluguel", label: "🔑 Imóvel para Alugar", icon: "🔑",
    desc: "Imóveis residenciais e comerciais para locação",
    color: "#1a7a4a", bg: "#d5f5e3",
    defaultPriceType: "monthly", priceUnit: "R$/mês",
    subniches: [
      { key: "apartamento_aluguel", label: "Apartamento",        desc: "Long stay, short stay, temporada" },
      { key: "casa_aluguel",        label: "Casa",               desc: "Casa residencial para aluguel" },
      { key: "temporada",           label: "Temporada / Airbnb", desc: "Diária, semanal, temporada praia/verão" },
      { key: "comercial_aluguel",   label: "Comercial",          desc: "Sala, loja, galpão para locação" },
      { key: "kitnet_aluguel",      label: "Kitnet / Studio",    desc: "Kitnet, studio, quarto individual" },
    ],
    copyHints: {
      painTemplate: "Dificuldade em encontrar aluguel sem fiador, com localização e preço compatíveis",
      ctaTemplate: "Ver disponibilidade", guaranteeTemplate: "Sem burocracia — processo 100% digital",
    },
  },
  // ── SAÚDE & BEM-ESTAR ──────────────────────────────────────────────
  {
    key: "saude_estetica", label: "💆 Estética & Beleza", icon: "💆",
    desc: "Clínicas, salões, procedimentos estéticos",
    color: "#7d3c98", bg: "#f4ecf7",
    defaultPriceType: "fixed", priceUnit: "R$/sessão",
    subniches: [
      { key: "estetica_facial",    label: "Estética Facial",     desc: "Limpeza, botox, harmonização, peeling" },
      { key: "estetica_corporal",  label: "Estética Corporal",   desc: "Massagem, drenagem, criolipólise" },
      { key: "cabelo",             label: "Cabelo & Salão",      desc: "Corte, coloração, tratamentos capilares" },
      { key: "unhas",              label: "Unhas & Nail Design",  desc: "Manicure, pedicure, alongamento" },
      { key: "depilacao",          label: "Depilação",           desc: "Cera, laser, luz pulsada" },
      { key: "tatuagem",           label: "Tatuagem & Piercing", desc: "Tatuagem artística, piercing, micropigmentação" },
    ],
    copyHints: {
      painTemplate: "Insatisfação com aparência, baixa autoestima ou resultados insatisfatórios anteriores",
      ctaTemplate: "Agendar avaliação grátis", guaranteeTemplate: "Satisfação garantida ou refazemos",
    },
  },
  {
    key: "saude_fitness", label: "💪 Fitness & Academia", icon: "💪",
    desc: "Academias, personal trainer, nutrição",
    color: "#e74c3c", bg: "#fdeaea",
    defaultPriceType: "monthly", priceUnit: "R$/mês",
    subniches: [
      { key: "academia",           label: "Academia",            desc: "Musculação, funcional, cardio" },
      { key: "personal_trainer",   label: "Personal Trainer",    desc: "Treino presencial ou online" },
      { key: "nutricao",           label: "Nutrição",            desc: "Consultoria nutricional, dieta" },
      { key: "yoga_pilates",       label: "Yoga / Pilates",      desc: "Aulas presenciais ou online" },
      { key: "crossfit",           label: "CrossFit / Funcional",desc: "Box, HIIT, treino funcional" },
      { key: "artes_marciais",     label: "Artes Marciais",      desc: "Jiu-jitsu, muay thai, boxe, judô" },
    ],
    copyHints: {
      painTemplate: "Falta de resultado, sedentarismo, dificuldade em manter rotina de exercícios",
      ctaTemplate: "Começar agora — 1ª semana grátis", guaranteeTemplate: "30 dias para ver resultado ou devolução",
    },
  },
  {
    key: "saude_clinica", label: "🏥 Saúde & Clínicas", icon: "🏥",
    desc: "Clínicas médicas, odontológicas, terapias",
    color: "#1a7a4a", bg: "#d5f5e3",
    defaultPriceType: "fixed", priceUnit: "R$/consulta",
    subniches: [
      { key: "odontologia",        label: "Odontologia",         desc: "Ortodontia, clareamento, implante" },
      { key: "psicologia",         label: "Psicologia",          desc: "Consulta presencial ou online" },
      { key: "fisioterapia",       label: "Fisioterapia",        desc: "Reabilitação, RPG, pilates clínico" },
      { key: "medico_clinico",     label: "Clínica Médica",      desc: "Consultas, exames, check-up" },
      { key: "terapias",           label: "Terapias Alternativas",desc: "Acupuntura, reiki, florais" },
      { key: "veterinaria",        label: "Veterinária / Pet",   desc: "Consulta, banho, tosa, vacina" },
    ],
    copyHints: {
      painTemplate: "Dor física, mal-estar ou necessidade de cuidado preventivo",
      ctaTemplate: "Agendar consulta", guaranteeTemplate: "Atendimento humanizado e resultado comprovado",
    },
  },
  // ── EDUCAÇÃO ───────────────────────────────────────────────────────
  {
    key: "educacao_online", label: "🎓 Cursos Online", icon: "🎓",
    desc: "Cursos digitais, mentorias, infoprodutos",
    color: "#2471a3", bg: "#d6eaf8",
    defaultPriceType: "fixed", priceUnit: "R$",
    subniches: [
      { key: "curso_profissional", label: "Curso Profissional",  desc: "Marketing, TI, design, financeiro" },
      { key: "curso_idiomas",      label: "Idiomas",             desc: "Inglês, espanhol, outros idiomas" },
      { key: "mentoria",           label: "Mentoria",            desc: "Mentoria individual ou em grupo" },
      { key: "ebook",              label: "E-book / Material",   desc: "E-book, PDF, templates, planilhas" },
      { key: "concurso",           label: "Concurso / Vestibular",desc: "Preparatório, simulados, apostilas" },
      { key: "desenvolvimento_pessoal", label: "Desenvolvimento Pessoal", desc: "Produtividade, mindset, liderança" },
    ],
    copyHints: {
      painTemplate: "Falta de qualificação, dificuldade em evoluir na carreira ou mudar de área",
      ctaTemplate: "Acessar agora", guaranteeTemplate: "7 dias de garantia — devolução sem perguntas",
    },
  },
  {
    key: "educacao_presencial", label: "📚 Escola & Cursos Presenciais", icon: "📚",
    desc: "Escolas, cursos técnicos, faculdades",
    color: "#1a5276", bg: "#d6eaf8",
    defaultPriceType: "monthly", priceUnit: "R$/mês",
    subniches: [
      { key: "escola_infantil",    label: "Escola / Creche",     desc: "Educação infantil, pré-escola" },
      { key: "curso_tecnico",      label: "Curso Técnico",       desc: "SENAI, SENAC, cursos profissionalizantes" },
      { key: "reforco_escolar",    label: "Reforço Escolar",     desc: "Aulas particulares, tutoria" },
      { key: "musica_arte",        label: "Música & Arte",       desc: "Violão, piano, canto, desenho" },
    ],
    copyHints: {
      painTemplate: "Dificuldade de aprendizado, falta de base ou necessidade de qualificação profissional",
      ctaTemplate: "Matricular agora", guaranteeTemplate: "Primeira aula grátis — experimente sem compromisso",
    },
  },
  // ── SERVIÇOS ───────────────────────────────────────────────────────
  {
    key: "servicos_casa", label: "🔧 Serviços para Casa", icon: "🔧",
    desc: "Reforma, manutenção, limpeza residencial",
    color: "#784212", bg: "#fdebd0",
    defaultPriceType: "fixed", priceUnit: "R$",
    subniches: [
      { key: "reformas",           label: "Reformas & Obras",    desc: "Pintura, alvenaria, acabamentos" },
      { key: "eletrica",           label: "Elétrica",            desc: "Instalações, reparos elétricos" },
      { key: "hidraulica",         label: "Hidráulica / Encanamento", desc: "Reparos, instalações hidráulicas" },
      { key: "marcenaria",         label: "Marcenaria / Móveis", desc: "Móveis planejados, reparos, montagem" },
      { key: "limpeza",            label: "Limpeza & Faxina",    desc: "Limpeza residencial, pós-obra, vidros" },
      { key: "jardinagem",         label: "Jardinagem / Paisagismo", desc: "Jardins, poda, manutenção de áreas verdes" },
      { key: "dedetizacao",        label: "Dedetização / Controle de Pragas", desc: "Cupim, baratas, ratos" },
    ],
    copyHints: {
      painTemplate: "Problema em casa sem solução, medo de contratar profissional não qualificado",
      ctaTemplate: "Solicitar orçamento grátis", guaranteeTemplate: "Serviço garantido — refazemos se necessário",
    },
  },
  {
    key: "servicos_profissionais", label: "💼 Serviços Profissionais", icon: "💼",
    desc: "Consultoria, jurídico, contábil, marketing",
    color: "#1a3a5c", bg: "#d6eaf8",
    defaultPriceType: "fixed", priceUnit: "R$",
    subniches: [
      { key: "juridico",           label: "Advocacia / Jurídico",desc: "Consultoria jurídica, processos" },
      { key: "contabilidade",      label: "Contabilidade",       desc: "BPO fiscal, abertura de empresa, IR" },
      { key: "marketing_digital",  label: "Marketing Digital",   desc: "Gestão de tráfego, redes sociais, SEO" },
      { key: "design",             label: "Design & Criação",    desc: "Identidade visual, logo, material gráfico" },
      { key: "ti_tecnologia",      label: "TI & Tecnologia",     desc: "Sistemas, sites, apps, suporte" },
      { key: "rh_gestao",          label: "RH & Gestão",         desc: "Recrutamento, treinamento, consultoria" },
      { key: "fotografia",         label: "Fotografia & Vídeo",  desc: "Ensaios, eventos, vídeos corporativos" },
    ],
    copyHints: {
      painTemplate: "Falta de especialista confiável, desperdício de tempo e dinheiro com amadores",
      ctaTemplate: "Falar com especialista", guaranteeTemplate: "Primeira consulta grátis",
    },
  },
  // ── ALIMENTAÇÃO ────────────────────────────────────────────────────
  {
    key: "alimentacao", label: "🍽️ Alimentação & Gastronomia", icon: "🍽️",
    desc: "Restaurantes, delivery, marmitas, doces",
    color: "#922b21", bg: "#fdedec",
    defaultPriceType: "fixed", priceUnit: "R$",
    subniches: [
      { key: "restaurante",        label: "Restaurante / Lanchonete", desc: "Almoço, jantar, fast food" },
      { key: "delivery",           label: "Delivery",                desc: "iFood, Rappi, delivery próprio" },
      { key: "marmita",            label: "Marmita & Quentinha",    desc: "Marmita fitness, caseira, executiva" },
      { key: "doces_confeitaria",  label: "Doces & Confeitaria",    desc: "Bolos, docinhos, chocolates, tortas" },
      { key: "eventos_catering",   label: "Catering & Eventos",     desc: "Buffet, coffee break, eventos" },
      { key: "bebidas",            label: "Bebidas & Drinks",       desc: "Bar, cervejaria artesanal, drinks" },
    ],
    copyHints: {
      painTemplate: "Dificuldade em comer bem fora de casa ou falta de opções saudáveis e saborosas",
      ctaTemplate: "Fazer pedido agora", guaranteeTemplate: "Entrega garantida no prazo ou reembolso",
    },
  },
  // ── PRODUTOS ───────────────────────────────────────────────────────
  {
    key: "produtos_fisicos", label: "📦 Produtos Físicos", icon: "📦",
    desc: "Produtos para venda, e-commerce, loja",
    color: "#1a5276", bg: "#d6eaf8",
    defaultPriceType: "fixed", priceUnit: "R$",
    subniches: [
      { key: "moda_vestuario",     label: "Moda & Vestuário",    desc: "Roupas, calçados, acessórios" },
      { key: "casa_decoracao",     label: "Casa & Decoração",    desc: "Móveis, decoração, utilidades" },
      { key: "eletronicos",        label: "Eletrônicos & Tech",  desc: "Smartphones, computadores, gadgets" },
      { key: "bebe_infantil",      label: "Bebê & Infantil",     desc: "Roupas, brinquedos, enxoval" },
      { key: "pet_shop",           label: "Pet Shop",            desc: "Produtos para pets, ração, acessórios" },
      { key: "artesanato",         label: "Artesanato & Handmade", desc: "Produtos artesanais, personalizados" },
      { key: "agro_rural",         label: "Agro & Rural",        desc: "Insumos, equipamentos, produtos rurais" },
    ],
    copyHints: {
      painTemplate: "Dificuldade em encontrar produto de qualidade com preço justo e entrega rápida",
      ctaTemplate: "Comprar agora", guaranteeTemplate: "30 dias para troca ou devolução",
    },
  },
  // ── AUTOMÓVEIS ─────────────────────────────────────────────────────
  {
    key: "automoveis", label: "🚗 Automóveis & Veículos", icon: "🚗",
    desc: "Venda, locação e serviços automotivos",
    color: "#1c2833", bg: "#d5d8dc",
    defaultPriceType: "fixed", priceUnit: "R$",
    subniches: [
      { key: "carro_venda",        label: "Carro — Venda",       desc: "Veículos novos, seminovos, usados" },
      { key: "moto_venda",         label: "Moto — Venda",        desc: "Motos novas e seminovas" },
      { key: "locacao_veiculos",   label: "Locação de Veículos", desc: "Aluguel de carros, vans, caminhões" },
      { key: "oficina",            label: "Oficina Mecânica",    desc: "Revisão, conserto, funilaria, pintura" },
      { key: "estética_automotiva",label: "Estética Automotiva", desc: "Higienização, polimento, blindagem" },
    ],
    copyHints: {
      painTemplate: "Medo de comprar carro com problemas escondidos ou pagar mais do que o justo",
      ctaTemplate: "Ver veículos disponíveis", guaranteeTemplate: "Laudos de vistoria e garantia de procedência",
    },
  },
  // ── NEGÓCIOS LOCAIS ────────────────────────────────────────────────
  {
    key: "negocios_locais", label: "📍 Negócios Locais", icon: "📍",
    desc: "Comércio local, lojas físicas, serviços de bairro",
    color: "#0f6e56", bg: "#d5f5e3",
    defaultPriceType: "fixed", priceUnit: "R$",
    subniches: [
      { key: "loja_fisica",        label: "Loja Física",         desc: "Varejo local, loja de bairro" },
      { key: "farmacia",           label: "Farmácia & Saúde",    desc: "Medicamentos, cosmético, suplementos" },
      { key: "supermercado",       label: "Mercado / Mercearia", desc: "Produtos alimentícios, hortifruti" },
      { key: "lavanderia",         label: "Lavanderia",          desc: "Lavagem, passa-roupas, tinturaria" },
      { key: "barbearia",          label: "Barbearia",           desc: "Corte masculino, barba, tratamentos" },
    ],
    copyHints: {
      painTemplate: "Necessidade de comodidade no bairro com qualidade e atendimento personalizado",
      ctaTemplate: "Visitar ou encomendar", guaranteeTemplate: "Atendimento personalizado garantido",
    },
  },
  // ── EVENTOS ────────────────────────────────────────────────────────
  {
    key: "eventos", label: "🎉 Eventos & Entretenimento", icon: "🎉",
    desc: "Festas, casamentos, formaturas, shows",
    color: "#6c3483", bg: "#f5eef8",
    defaultPriceType: "fixed", priceUnit: "R$",
    subniches: [
      { key: "casamento",          label: "Casamento & Noivado", desc: "Decoração, buffet, fotografia, DJ" },
      { key: "festa_infantil",     label: "Festa Infantil",      desc: "Decoração, buffet, recreação" },
      { key: "formaturas",         label: "Formaturas",          desc: "Baile, colação, fotos e vídeo" },
      { key: "eventos_corporativos",label: "Eventos Corporativos",desc: "Confraternização, treinamento, congressos" },
      { key: "dj_musica",          label: "DJ & Música",         desc: "DJs, bandas, animação de festas" },
    ],
    copyHints: {
      painTemplate: "Medo de o evento não sair como planejado ou contratar fornecedor não confiável",
      ctaTemplate: "Solicitar orçamento", guaranteeTemplate: "Contrato com garantias e suporte total no dia",
    },
  },
  // ── FINANCEIRO ─────────────────────────────────────────────────────
  {
    key: "financeiro", label: "💰 Financeiro & Investimentos", icon: "💰",
    desc: "Crédito, seguros, investimentos, câmbio",
    color: "#1a5276", bg: "#d6eaf8",
    defaultPriceType: "fixed", priceUnit: "R$",
    subniches: [
      { key: "credito_financiamento", label: "Crédito & Financiamento", desc: "Empréstimo, consignado, FGTS" },
      { key: "seguros",            label: "Seguros",             desc: "Auto, vida, saúde, residencial" },
      { key: "consorcio",          label: "Consórcio",           desc: "Imóvel, veículo, serviços" },
      { key: "investimentos",      label: "Investimentos",       desc: "Ações, fundos, renda fixa, cripto" },
      { key: "cambio",             label: "Câmbio & Internacional", desc: "Remessa, intercâmbio, turismo" },
    ],
    copyHints: {
      painTemplate: "Dívidas, juros altos ou dificuldade em realizar sonhos por falta de crédito",
      ctaTemplate: "Simular agora", guaranteeTemplate: "Análise gratuita e sem compromisso",
    },
  },
];

// Mapa rápido para lookup por key
export const NICHE_MAP = Object.fromEntries(NICHE_TAXONOMY.map(n => [n.key, n]));

// Lista flat de todos os subnichos para filtros
export const ALL_SUBNICHES = NICHE_TAXONOMY.flatMap(n =>
  n.subniches.map(s => ({ ...s, parentKey: n.key, parentLabel: n.label, color: n.color, bg: n.bg }))
);

// Grupos para display na vitrine (agrupa nichos relacionados)
export const NICHE_GROUPS = [
  { label: "Imobiliário",   keys: ["imovel_venda", "imovel_aluguel"] },
  { label: "Saúde",         keys: ["saude_estetica", "saude_fitness", "saude_clinica"] },
  { label: "Educação",      keys: ["educacao_online", "educacao_presencial"] },
  { label: "Serviços",      keys: ["servicos_casa", "servicos_profissionais"] },
  { label: "Alimentação",   keys: ["alimentacao"] },
  { label: "Produtos",      keys: ["produtos_fisicos"] },
  { label: "Automóveis",    keys: ["automoveis"] },
  { label: "Negócios",      keys: ["negocios_locais"] },
  { label: "Eventos",       keys: ["eventos"] },
  { label: "Financeiro",    keys: ["financeiro"] },
];
