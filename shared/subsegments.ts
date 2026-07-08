/**
 * subsegments.ts — Tabela escalável de subsegmentos (tipos de oferta) por segmento.
 *
 * Dado, não código: para adicionar um subsegmento novo, acrescente uma entrada
 * no array do segmento correspondente. Nenhuma lógica muda.
 *
 * Os "signals" são padrões regex (string) de alto sinal usados pela inferência
 * determinística de tipo de oferta (inferOfferType em server/ai.ts).
 *
 * "strong: true" → o sinal sozinho já indica confiança alta.
 */

import type { Subsegment } from "./segmentConfig";

export const SUBSEGMENTS: Record<string, Subsegment[]> = {

  // ── IMÓVEIS — VENDA ────────────────────────────────────────────────────────
  imoveis_venda: [
    { key: "venda_pronta", label: "Imóvel pronto", strong: true,
      signals: ["\\bà venda\\b", "\\bvende-se\\b", "escritura", "pronto para morar", "entrega imediata"],
      hookOverride: "sonho da casa própria / sair do aluguel / pronto para morar" },
    { key: "lancamento", label: "Lançamento / Na planta", strong: true,
      signals: ["lan[çc]amento", "na planta", "pr[ée]-lan[çc]amento", "stand de vendas", "breve lan[çc]amento"],
      hookOverride: "condição de lançamento / valorização na planta / primeiras unidades",
      ctaOverride: ["Garantir na planta", "Ver condições de lançamento", "Quero conhecer"] },
    { key: "alto_padrao", label: "Alto padrão", strong: false,
      signals: ["alto padr[ãa]o", "luxo", "cobertura", "exclusiv", "sofisticad"],
      hookOverride: "exclusividade / sofisticação / estilo de vida premium",
      ctaOverride: ["Agendar visita exclusiva", "Conhecer o empreendimento"] },
    { key: "mcmv", label: "Minha Casa Minha Vida", strong: true,
      signals: ["minha casa minha vida", "\\bmcmv\\b", "subs[íi]dio", "entrada facilitada", "financiamento caixa"],
      hookOverride: "realize o sonho da casa própria com subsídio / parcelas que cabem no bolso",
      ctaOverride: ["Ver se você tem direito", "Simular financiamento"] },
    { key: "investimento", label: "Investimento imobiliário", strong: false,
      signals: ["invest", "renda passiva", "valoriza", "rentabilidade", "\\bfii\\b", "renda de aluguel"],
      hookOverride: "rentabilidade / valorização / renda passiva com imóvel",
      ctaOverride: ["Ver rentabilidade", "Falar com consultor de investimento"] },
    { key: "comercial", label: "Imóvel comercial", strong: false,
      signals: ["sala comercial", "loja", "gal[ãa]o", "ponto comercial", "escrit[óo]rio"],
      hookOverride: "localização estratégica / visibilidade / fluxo de clientes" },
  ],

  // ── IMÓVEIS — LOCAÇÃO ──────────────────────────────────────────────────────
  imoveis_locacao: [
    { key: "locacao_anual", label: "Locação anual", strong: true,
      signals: ["\\bR\\$\\s?[\\d.,]+\\s?\\/\\s?m[êe]s\\b", "aluguel", "aluga(r|-se)?", "loca[çc][ãa]o", "locar", "contrato de 12 meses"],
      hookOverride: "disponibilidade imediata / mudança fácil / localização ideal",
      ctaOverride: ["Ver disponibilidade", "Agendar visita", "Quero alugar"] },
    { key: "temporada", label: "Temporada / Diária", strong: true,
      signals: ["temporada", "di[áa]ria", "airbnb", "por noite", "fim de semana", "aluguel de f[ée]rias"],
      hookOverride: "experiência / localização turística / conforto para a estadia",
      ctaOverride: ["Ver datas disponíveis", "Reservar", "Consultar diária"] },
    { key: "comercial_locacao", label: "Comercial para alugar", strong: false,
      signals: ["sala comercial para alugar", "loja para alugar", "ponto para alugar", "gal[ãa]o para alugar"],
      hookOverride: "ponto estratégico / pronto para seu negócio" },
  ],

  // ── SAÚDE & ESTÉTICA ───────────────────────────────────────────────────────
  saude_estetica: [
    { key: "harmonizacao", label: "Harmonização facial", strong: true,
      signals: ["harmoniza[çc][ãa]o", "preenchimento", "botox", "toxina", "bioestimulador", "[áa]cido hialur[ôo]nico"],
      hookOverride: "autoestima / naturalidade / resultado harmônico (sem claim médico)",
      ctaOverride: ["Agendar avaliação", "Falar com especialista"] },
    { key: "odontologia", label: "Odontologia / Ortodontia", strong: true,
      signals: ["ortodont", "aparelho", "implante", "lente de contato dental", "clareamento", "invisalign", "dentista"],
      hookOverride: "sorriso / confiança / saúde bucal",
      ctaOverride: ["Agendar avaliação", "Marcar consulta"] },
    { key: "estetica_corporal", label: "Estética corporal", strong: false,
      signals: ["emagrec", "gordura localizada", "criolip", "massagem modeladora", "drenagem", "celulite"],
      hookOverride: "bem-estar / autoestima (sem promessa de resultado / sem antes-depois)" },
    { key: "consulta_medica", label: "Consulta / Avaliação", strong: false,
      signals: ["agende sua consulta", "avalia[çc][ãa]o gratuita", "primeira consulta", "marque sua avalia[çc][ãa]o"],
      ctaOverride: ["Agendar avaliação gratuita", "Marcar consulta"] },
  ],

  // ── SERVIÇOS LOCAIS ────────────────────────────────────────────────────────
  servicos_locais: [
    { key: "agendamento", label: "Serviço com agendamento", strong: true,
      signals: ["agende", "agendar", "marcar hor[áa]rio", "reserve seu hor[áa]rio", "hor[áa]rio dispon[íi]vel"],
      ctaOverride: ["Agendar agora", "Ver horários", "Reservar meu horário"] },
    { key: "orcamento", label: "Serviço sob orçamento", strong: true,
      signals: ["or[çc]amento", "solicite um or[çc]amento", "or[çc]amento gr[áa]tis", "fa[çc]a um or[çc]amento"],
      hookOverride: "solução para o problema + orçamento sem compromisso",
      ctaOverride: ["Solicitar orçamento", "Pedir orçamento grátis"] },
    { key: "emergencia", label: "Serviço de emergência", strong: false,
      signals: ["24 horas", "24h", "emerg[êe]ncia", "atendimento imediato", "urg[êe]ncia"],
      hookOverride: "urgência / disponibilidade imediata / resolução rápida",
      ctaOverride: ["Chamar agora", "Falar no WhatsApp"] },
  ],

  // ── ALIMENTAÇÃO ────────────────────────────────────────────────────────────
  alimentacao: [
    { key: "delivery", label: "Delivery", strong: true,
      signals: ["delivery", "pe[çc]a (agora|j[áa]|no whats)", "entrega r[áa]pida", "ifood", "tele-?entrega"],
      hookOverride: "foto apetitosa / entrega rápida / promoção do dia",
      ctaOverride: ["Pedir agora", "Pedir delivery", "Fazer meu pedido"] },
    { key: "reserva", label: "Reserva de mesa", strong: true,
      signals: ["reserve sua mesa", "reserva", "jantar", "ambiente", "happy hour"],
      hookOverride: "experiência / ambiente / ocasião especial",
      ctaOverride: ["Reservar mesa", "Garantir meu lugar"] },
    { key: "eventos", label: "Eventos / Buffet", strong: false,
      signals: ["buffet", "evento", "festa", "confraterniza[çc][ãa]o", "casamento", "anivers[áa]rio"],
      hookOverride: "seu evento inesquecível / cardápio personalizado",
      ctaOverride: ["Solicitar orçamento", "Fazer cotação"] },
  ],

  // ── E-COMMERCE ─────────────────────────────────────────────────────────────
  ecommerce: [
    { key: "produto_avulso", label: "Produto avulso", strong: true,
      signals: ["comprar? agora", "frete gr[áa]tis", "adicione ao carrinho", "em at[ée] \\d+x", "cupom", "estoque limitado"],
      ctaOverride: ["Comprar agora", "Garantir com desconto", "Ver oferta"] },
    { key: "assinatura", label: "Assinatura / Clube", strong: true,
      signals: ["assinatura", "clube", "receba todo m[êe]s", "plano mensal", "assine e ganhe"],
      hookOverride: "conveniência recorrente / economia na assinatura",
      ctaOverride: ["Assinar agora", "Começar minha assinatura"] },
    { key: "liquidacao", label: "Liquidação / Promoção", strong: false,
      signals: ["liquida[çc][ãa]o", "promo[çc][ãa]o", "black friday", "queima de estoque", "at[ée] \\d+% off"],
      hookOverride: "urgência / desconto real / estoque limitado" },
  ],

  // ── MODA & VAREJO ──────────────────────────────────────────────────────────
  moda_varejo: [
    { key: "colecao", label: "Nova coleção", strong: true,
      signals: ["nova cole[çc][ãa]o", "lan[çc]amento", "novidade", "tend[êe]ncia", "chegou"],
      hookOverride: "estilo / novidade / ocasião",
      ctaOverride: ["Ver nova coleção", "Conferir novidades"] },
    { key: "promocao_moda", label: "Promoção / Outlet", strong: false,
      signals: ["promo[çc][ãa]o", "outlet", "at[ée] \\d+% off", "liquida", "[úu]ltimas pe[çc]as"],
      ctaOverride: ["Aproveitar oferta", "Comprar com desconto"] },
  ],

  // ── INFOPRODUTOS ───────────────────────────────────────────────────────────
  infoprodutos: [
    { key: "curso", label: "Curso / Formação", strong: true,
      signals: ["curso", "matr[íi]cul", "turma", "forma[çc][ãa]o", "certificad", "aula gratuita"],
      hookOverride: "transformação prometida / prova social / baixo atrito",
      ctaOverride: ["Quero me inscrever", "Garantir minha vaga"] },
    { key: "mentoria", label: "Mentoria / Consultoria", strong: true,
      signals: ["mentoria", "consultoria", "acompanhamento", "mentor", "grupo vip"],
      hookOverride: "acesso ao especialista / resultado acompanhado",
      ctaOverride: ["Quero a mentoria", "Aplicar para a mentoria"] },
    { key: "lead_magnet", label: "Material gratuito (topo)", strong: false,
      signals: ["ebook", "guia gr[áa]tis", "material gr[áa]tis", "baixar", "download", "aula gratuita"],
      hookOverride: "isca de valor / baixo atrito para capturar lead",
      ctaOverride: ["Baixar agora", "Acessar material grátis"] },
  ],

  // ── B2B ────────────────────────────────────────────────────────────────────
  b2b: [
    { key: "saas", label: "SaaS / Software", strong: true,
      signals: ["software", "\\bsaas\\b", "plataforma", "sistema", "automatize", "\\bdemo\\b"],
      hookOverride: "ROI específico / problema que resolve / credibilidade",
      ctaOverride: ["Solicitar demo", "Iniciar teste grátis"] },
    { key: "servico_b2b", label: "Serviço corporativo", strong: false,
      signals: ["consultoria empresarial", "terceiriza", "solu[çc][ãa]o corporativa", "para sua empresa"],
      ctaOverride: ["Falar com especialista", "Solicitar proposta"] },
  ],
};

/** Retorna os subsegmentos de um segmento (ou lista vazia). */
export function getSubsegments(segment: string): Subsegment[] {
  return SUBSEGMENTS[segment] ?? [];
}

/** Achata todos os subsegmentos de todos os segmentos em uma lista única. */
export function allSubsegmentSignals(): Array<{ segment: string; sub: Subsegment }> {
  const out: Array<{ segment: string; sub: Subsegment }> = [];
  for (const [segment, subs] of Object.entries(SUBSEGMENTS)) {
    for (const sub of subs) out.push({ segment, sub });
  }
  return out;
}

/**
 * Detecta o subsegmento (tipo de oferta) a partir do texto e do segmento.
 * Determinístico: usa os signals da config. Isolado do fluxo — retorna
 * { key, label, confidence, matched }.
 */
export interface SubsegmentInference {
  key:        string | null;
  label:      string | null;
  confidence: "alta" | "media" | "baixa";
  matched:    string[];
}

export function inferSubsegment(text: string, segment: string): SubsegmentInference {
  const subs = getSubsegments(segment);
  const t = (text || "").toLowerCase();
  if (!t.trim() || subs.length === 0) {
    return { key: null, label: null, confidence: "baixa", matched: [] };
  }

  const scores = new Map<string, { score: number; label: string; labels: string[]; strong: boolean }>();
  for (const sub of subs) {
    for (const pattern of sub.signals) {
      let re: RegExp;
      try { re = new RegExp(pattern, "i"); } catch { continue; }
      if (re.test(t)) {
        const entry = scores.get(sub.key) || { score: 0, label: sub.label, labels: [], strong: false };
        entry.score += sub.strong ? 2 : 1;
        entry.labels.push(pattern);
        if (sub.strong) entry.strong = true;
        scores.set(sub.key, entry);
      }
    }
  }

  if (scores.size === 0) {
    return { key: null, label: null, confidence: "baixa", matched: [] };
  }

  let bestKey: string | null = null;
  let best = { score: 0, label: "", labels: [] as string[], strong: false };
  for (const [key, entry] of scores.entries()) {
    if (entry.score > best.score) { bestKey = key; best = entry; }
  }

  let confidence: SubsegmentInference["confidence"];
  if (best.strong && scores.size === 1) confidence = "alta";
  else if (best.strong && best.score >= 4) confidence = "alta";
  else if (best.strong || best.score >= 2) confidence = "media";
  else confidence = "baixa";

  return { key: bestKey, label: best.label, confidence, matched: [...new Set(best.labels)] };
}
