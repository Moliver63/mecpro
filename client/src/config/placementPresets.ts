/**
 * placementPresets.ts
 * Presets de posicionamento por nicho para o PlacementPresetSelector
 * Cada preset define quais placements ativar por padrão para um segmento
 */

export interface PlacementPreset {
  id:          string;
  label:       string;
  emoji:       string;
  description: string;
  placements:  string[];   // IDs dos placements ativos (vazio = Advantage+)
  cta:         string;
  objective:   string;
  tip:         string;
}

export const PLACEMENT_PRESETS: PlacementPreset[] = [
  {
    id: "ecommerce",
    label: "E-commerce",
    emoji: "🛍️",
    description: "Lojas online e produtos físicos",
    placements: ["fb_feed", "ig_feed", "ig_reels", "fb_marketplace"],
    cta: "Comprar agora",
    objective: "OUTCOME_SALES",
    tip: "Feed + Reels convertem melhor para e-commerce. Marketplace ideal para produtos físicos.",
  },
  {
    id: "infoproduto",
    label: "Infoproduto",
    emoji: "🎓",
    description: "Cursos, e-books e mentorias",
    placements: ["fb_feed", "ig_feed", "fb_story", "ig_story"],
    cta: "Saiba mais",
    objective: "OUTCOME_LEADS",
    tip: "Feed para alcance + Stories para remarketing. Evite Reels para públicos frios.",
  },
  {
    id: "local",
    label: "Negócio Local",
    emoji: "📍",
    description: "Restaurantes, clínicas, lojas físicas",
    placements: ["fb_feed", "ig_feed", "fb_marketplace", "ig_explore"],
    cta: "Ver mais",
    objective: "OUTCOME_AWARENESS",
    tip: "Feed + Explorar para alcance local. Marketplace ideal para serviços.",
  },
  {
    id: "leads",
    label: "Geração de Leads",
    emoji: "📋",
    description: "Formulários, consultas e orçamentos",
    placements: ["fb_feed", "ig_feed"],
    cta: "Cadastre-se",
    objective: "OUTCOME_LEADS",
    tip: "Feed tem maior taxa de preenchimento de formulários. Mantenha o criativo simples.",
  },
  {
    id: "branding",
    label: "Branding",
    emoji: "✨",
    description: "Reconhecimento de marca",
    placements: [],  // vazio = Meta Advantage+ (todos os posicionamentos)
    cta: "Ver mais",
    objective: "OUTCOME_AWARENESS",
    tip: "Advantage+ otimiza automaticamente os melhores posicionamentos para alcance.",
  },
  {
    id: "imoveis",
    label: "Imóveis",
    emoji: "🏠",
    description: "Lançamentos e vendas imobiliárias",
    placements: ["fb_feed", "ig_feed", "ig_reels", "fb_story"],
    cta: "Ver imóvel",
    objective: "OUTCOME_LEADS",
    tip: "Reels para vídeos de tour + Feed para anúncios de lançamento. Foque em imagens de alta qualidade.",
  },
  {
    id: "saude",
    label: "Saúde & Beleza",
    emoji: "💆",
    description: "Clínicas, estética e bem-estar",
    placements: ["ig_feed", "ig_reels", "ig_story", "fb_feed"],
    cta: "Agendar",
    objective: "OUTCOME_LEADS",
    tip: "Instagram performa melhor para saúde e beleza. Reels para antes/depois.",
  },
  {
    id: "app",
    label: "App Mobile",
    emoji: "📱",
    description: "Instalações e engajamento de apps",
    placements: ["fb_feed", "ig_feed", "ig_reels"],
    cta: "Instalar agora",
    objective: "OUTCOME_APP_PROMOTION",
    tip: "Reels e Feed mobile-first. Use vídeos curtos mostrando o app em uso.",
  },
];

export default PLACEMENT_PRESETS;
