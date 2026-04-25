/**
 * placementPresets.ts — Presets baseados nas boas práticas oficiais
 * Fontes: Meta Blueprint 2024, Google Ads Help Center, TikTok for Business 2024
 *
 * Regras gerais por plataforma:
 *
 * META:
 *  - Advantage+ (placements=[]) = padrão recomendado para orçamentos < R$150/dia
 *  - Feed: melhor para conversão e formulários (alta intenção de clique)
 *  - Stories/Reels: awareness e remarketing (formato imersivo 9:16)
 *  - Audience Network: expansão de alcance mas qualidade menor — evitar para leads
 *  - Marketplace: produtos físicos e negócios locais
 *  - Busca Facebook: alto ticket (imóveis, autos, seguros)
 *
 * GOOGLE:
 *  - Performance Max (placements=[]) = recomendado para maioria dos casos
 *  - Search: captura de intenção via palavras-chave
 *  - Display: branding e remarketing
 *  - YouTube: vídeos awareness e consideração
 *  - Shopping: exclusivo para e-commerce com feed de produtos
 *
 * TIKTOK:
 *  - In-Feed Ads: principal formato — feed nativo, CPM acessível
 *  - TopView: premium (alto custo) — só para branding com budget alto
 *  - Pangle: expansão — qualidade variável
 *  - Público 18-35 predominante — inadequado para público 45+
 */

export interface PlacementPreset {
  id:            string;
  label:         string;
  emoji:         string;
  description:   string;
  platforms:     ("meta" | "google" | "tiktok")[];  // plataformas compatíveis
  placements:    string[];    // IDs internos (vazio = automático/Advantage+)
  cta:           string;
  objective:     string;
  tip:           string;
  warning?:      string;      // alerta quando o nicho tem restrição na plataforma
  autoLabel?:    string;      // label do modo automático quando placements=[]
}

export const PLACEMENT_PRESETS: PlacementPreset[] = [

  // ── Advantage+ / Automático ───────────────────────────────────────────────
  {
    id:          "advantage_plus",
    label:       "Advantage+ / Auto",
    emoji:       "🤖",
    description: "IA da plataforma escolhe automaticamente",
    platforms:   ["meta", "google", "tiktok"],
    placements:  [],   // vazio = automático em todas as plataformas
    cta:         "Ver mais",
    objective:   "OUTCOME_AWARENESS",
    autoLabel:   "Meta Advantage+ · Google Performance Max · TikTok Smart+",
    tip:         "Recomendado como ponto de partida. A IA testa todos os posicionamentos e redistribui o budget para onde o CPM é mais baixo. Após 7-14 dias de aprendizado performa melhor que seleção manual na maioria dos casos.",
  },

  // ── E-commerce ────────────────────────────────────────────────────────────
  {
    id:          "ecommerce",
    label:       "E-commerce",
    emoji:       "🛍️",
    description: "Lojas online e produtos físicos",
    platforms:   ["meta", "google", "tiktok"],
    placements:  ["fb_feed", "ig_feed", "ig_reels", "fb_reels", "fb_marketplace"],
    cta:         "Comprar agora",
    objective:   "OUTCOME_SALES",
    tip:         "META: Feed FB+IG converte melhor + Marketplace para produtos físicos + Reels para descoberta. GOOGLE: prefira Shopping + Performance Max. TIKTOK: In-Feed + TikTok Shop para conversão direta.",
  },

  // ── Infoproduto ───────────────────────────────────────────────────────────
  {
    id:          "infoproduto",
    label:       "Infoproduto",
    emoji:       "🎓",
    description: "Cursos, e-books e mentorias",
    platforms:   ["meta", "google"],
    placements:  ["fb_feed", "ig_feed", "fb_story", "ig_story", "ig_explore"],
    cta:         "Saiba mais",
    objective:   "OUTCOME_LEADS",
    tip:         "META: Feed para tráfego frio + Stories para remarketing + Explorar para descoberta. Evite Audience Network (baixa qualidade de lead). GOOGLE: Search com palavras-chave de intenção + YouTube para prova social.",
    warning:     "TikTok não recomendado para infoprodutos B2B ou ticket > R$500. Público predominante é 18-25 anos.",
  },

  // ── Geração de Leads ──────────────────────────────────────────────────────
  {
    id:          "leads",
    label:       "Geração de Leads",
    emoji:       "📋",
    description: "Formulários, consultas e orçamentos",
    platforms:   ["meta", "google"],
    placements:  ["fb_feed", "ig_feed", "fb_story", "ig_story"],
    cta:         "Cadastre-se",
    objective:   "OUTCOME_LEADS",
    tip:         "META: Feed tem maior taxa de preenchimento de formulários. Stories para remarketing de quem visitou. NUNCA use Audience Network para leads — qualidade muito baixa. GOOGLE: Search com palavras de intenção (solicitar, contratar, orçamento).",
    warning:     "Audience Network e Marketplace foram excluídos intencionalmente — geram leads de baixa qualidade para este objetivo.",
  },

  // ── Negócio Local ─────────────────────────────────────────────────────────
  {
    id:          "local",
    label:       "Negócio Local",
    emoji:       "📍",
    description: "Restaurantes, clínicas, lojas físicas",
    platforms:   ["meta", "google"],
    placements:  ["fb_feed", "ig_feed", "fb_marketplace", "ig_explore", "ig_story"],
    cta:         "Ver mais",
    objective:   "OUTCOME_AWARENESS",
    tip:         "META: Feed + Marketplace para visibilidade local + Explorar para descoberta. Sempre use segmentação por raio de km. GOOGLE: Search local + Business Profile Ads + Display geolocalizado são mais eficientes para negócios físicos.",
  },

  // ── Imóveis ───────────────────────────────────────────────────────────────
  {
    id:          "imoveis",
    label:       "Imóveis",
    emoji:       "🏠",
    description: "Lançamentos, vendas e locação",
    platforms:   ["meta", "google"],
    placements:  ["fb_feed", "ig_feed", "ig_reels", "fb_story", "ig_story", "fb_search"],
    cta:         "Ver imóvel",
    objective:   "OUTCOME_LEADS",
    tip:         "META: Feed FB é essencial — público 35-55 anos consome mais Facebook. Reels para tour virtual (9:16). Busca Facebook para alto ticket (R$500k+). Stories para remarketing. GOOGLE: Search + Display remarketing + YouTube para tour do imóvel.",
    warning:     "TikTok funciona apenas para imóveis < R$500k e studios. Público 45+ (alto ticket) não está no TikTok.",
  },

  // ── Saúde & Beleza ────────────────────────────────────────────────────────
  {
    id:          "saude",
    label:       "Saúde & Beleza",
    emoji:       "💆",
    description: "Clínicas, estética e bem-estar",
    platforms:   ["meta", "tiktok"],
    placements:  ["ig_feed", "ig_reels", "ig_story", "ig_explore", "fb_feed", "fb_story"],
    cta:         "Agendar",
    objective:   "OUTCOME_LEADS",
    tip:         "META: Instagram é o principal canal — feed + Reels para antes/depois + Explorar para descoberta. Facebook como suporte. TIKTOK: Reels de transformação (antes/depois) performam muito bem para beleza e estética. Público 18-35.",
    warning:     "Anúncios de saúde têm restrições na Meta — evite claims médicos. Imagens de procedimentos podem ser rejeitadas.",
  },

  // ── Branding ──────────────────────────────────────────────────────────────
  {
    id:          "branding",
    label:       "Branding",
    emoji:       "✨",
    description: "Reconhecimento e lembrança de marca",
    platforms:   ["meta", "google", "tiktok"],
    placements:  [],   // Advantage+ para branding = melhor CPM
    cta:         "Saiba mais",
    objective:   "OUTCOME_AWARENESS",
    autoLabel:   "Advantage+ Placements (todos os posicionamentos disponíveis)",
    tip:         "META: Advantage+ Placements para maximizar alcance com menor CPM. GOOGLE: YouTube bumper 6s + Display + Demand Gen. TIKTOK: In-Feed + TopView para awareness massivo. Para branding, deixe a IA otimizar — ela encontra o inventário mais barato.",
  },

  // ── App Mobile ────────────────────────────────────────────────────────────
  {
    id:          "app",
    label:       "App Mobile",
    emoji:       "📱",
    description: "Instalações e engajamento de apps",
    platforms:   ["meta", "google", "tiktok"],
    placements:  ["fb_feed", "ig_feed", "ig_reels", "fb_reels"],
    cta:         "Instalar agora",
    objective:   "OUTCOME_APP_PROMOTION",
    tip:         "META: Feed + Reels mobile-first com vídeos curtos mostrando o app em uso. GOOGLE: Use Universal App Campaigns (UAC) — Google distribui automaticamente entre Search, Play Store, YouTube e Display. TIKTOK: In-Feed com demonstração do app (15-30s).",
  },

  // ── Varejo / Moda ─────────────────────────────────────────────────────────
  {
    id:          "varejo",
    label:       "Varejo / Moda",
    emoji:       "👗",
    description: "Roupas, acessórios e lifestyle",
    platforms:   ["meta", "tiktok"],
    placements:  ["ig_feed", "ig_reels", "ig_story", "ig_explore", "ig_shop", "fb_feed"],
    cta:         "Comprar agora",
    objective:   "OUTCOME_SALES",
    tip:         "META: Instagram domina varejo e moda — feed + Reels para coleções + Shop para compra direta + Explorar para descoberta. TIKTOK: Formato ideal para moda — In-Feed com looks, hauls e tendências. Público 18-35 anos tem alta intenção de compra de moda.",
  },

  // ── Automóveis ────────────────────────────────────────────────────────────
  {
    id:          "autos",
    label:       "Automóveis",
    emoji:       "🚗",
    description: "Concessionárias, seguros e locadoras",
    platforms:   ["meta", "google"],
    placements:  ["fb_feed", "ig_feed", "fb_search", "ig_reels", "fb_story"],
    cta:         "Ver oferta",
    objective:   "OUTCOME_LEADS",
    tip:         "META: Feed FB+IG + Busca Facebook (alta intenção de compra) + Reels para test drive e lançamentos. GOOGLE: Search é fundamental para autos — usuários pesquisam ativamente. Display remarketing para quem visitou o site.",
    warning:     "TikTok tem baixa conversão para automóveis — público jovem tem baixo poder de compra para esse ticket.",
  },

  // ── Serviços B2B ──────────────────────────────────────────────────────────
  {
    id:          "b2b",
    label:       "Serviços B2B",
    emoji:       "🏢",
    description: "Empresas, consultorias e SaaS",
    platforms:   ["meta", "google"],
    placements:  ["fb_feed", "ig_feed"],
    cta:         "Solicitar proposta",
    objective:   "OUTCOME_LEADS",
    tip:         "META: Apenas Feed FB+IG — decisores empresariais não estão em Stories ou Reels. NUNCA use Audience Network para B2B. GOOGLE: Search é o melhor canal B2B — alta intenção. LinkedIn Ads (fora do MECPro) é mais eficiente para B2B do que Meta.",
    warning:     "TikTok é inadequado para B2B — decisores empresariais (40+) não usam a plataforma. Não recomendado.",
  },

  // ── Restaurante / Gastronomia ─────────────────────────────────────────────
  {
    id:          "gastronomia",
    label:       "Gastronomia",
    emoji:       "🍽️",
    description: "Restaurantes, delivery e alimentação",
    platforms:   ["meta", "tiktok"],
    placements:  ["ig_feed", "ig_reels", "ig_story", "fb_feed", "fb_marketplace"],
    cta:         "Pedir agora",
    objective:   "OUTCOME_AWARENESS",
    tip:         "META: Instagram visual-first para food — Reels de bastidores e pratos + Feed + Marketplace local. TIKTOK: Conteúdo de food é viral no TikTok — Reels de preparo e reação performam muito bem para restaurantes. Segmentação por raio obrigatória.",
  },
  // ── Influencer / Criador de Conteúdo ─────────────────────────────────────
  {
    id:          "influencer",
    label:       "Influencer",
    emoji:       "🎬",
    description: "Criadores de conteúdo e marca pessoal",
    platforms:   ["meta", "google", "tiktok"],
    placements:  ["ig_reels", "ig_feed", "ig_story", "ig_explore", "fb_feed", "fb_reels"],
    cta:         "Seguir",
    objective:   "OUTCOME_AWARENESS",
    tip:         "META: Reels IG é o principal formato para descoberta de criadores — algoritmo prioriza. Stories para bastidores e proximidade. Explorar para audiências novas. Feed IG como portfólio. GOOGLE: YouTube Discovery Ads aparecem no feed do YouTube e Gmail — ideal para promover canal. TIKTOK: melhor plataforma para crescimento de audiência < 35 anos. In-Feed nativo performa melhor que qualquer outro formato.",
    warning:     "Evite Audience Network e Marketplace — não são canais de descoberta de criadores. Para público 45+, priorize Facebook feed em vez de TikTok.",
  },

  // ── Político / Eleitoral ──────────────────────────────────────────────────
  {
    id:          "politico",
    label:       "Político / Eleitoral",
    emoji:       "🗳️",
    description: "Candidatos, campanhas e causas sociais",
    platforms:   ["meta", "google"],
    placements:  ["fb_feed", "ig_feed", "fb_story", "ig_story", "ig_reels", "fb_reels"],
    cta:         "Saiba mais",
    objective:   "OUTCOME_AWARENESS",
    tip:         "META: Feed FB é o canal mais eficiente para eleitores 35-60 anos. Stories para mobilização e urgência. Reels para vídeos curtos de proposta. OBRIGATÓRIO: incluir disclaimer 'Pago por [nome]' — Meta exige para anúncios políticos. GOOGLE: Search com nome do candidato + propostas. YouTube bumper 6s para awareness + vídeos de campanha 30s. Display para cobertura da área eleitoral.",
    warning:     "⚠️ ATENÇÃO LEGAL: Meta exige autorização prévia para anúncios políticos (Social Issues, Elections & Politics). Google proibiu segmentação por afinidade política. TikTok BANIU anúncios políticos pagos desde 2023 — apenas conteúdo orgânico é permitido. Consulte a legislação eleitoral do TSE sobre limites de gastos e períodos permitidos.",
  },

  // ── Apostas Esportivas (LICENCIADAS) ─────────────────────────────────────
  {
    id:          "apostas",
    label:       "Apostas Esportivas",
    emoji:       "⚽",
    description: "Apenas operadoras licenciadas pelo governo",
    platforms:   ["meta", "google"],
    placements:  ["fb_feed", "ig_feed", "fb_story", "ig_story", "ig_reels", "fb_reels"],
    cta:         "Apostar agora",
    objective:   "OUTCOME_AWARENESS",
    tip:         "META: Feed FB+IG para público 18-45 anos + Stories para promoções e odds em tempo real + Reels para conteúdo de esporte. GOOGLE: Search com termos de apostas + YouTube para branded content esportivo. Público masculino 18-40 anos tem melhor conversão.",
    warning:     "🔴 RESTRIÇÃO LEGAL OBRIGATÓRIA: Meta e Google exigem AUTORIZAÇÃO PRÉVIA por escrito para anúncios de apostas. No Brasil, apenas operadoras licenciadas pelo Ministério da Fazenda (Lei 14.790/2023) podem anunciar. TikTok PROÍBE qualquer anúncio de apostas — inclui esportivas licenciadas. Cassinos online, Tigrinho (Fortune Tiger) e jogos não licenciados são ILEGAIS no Brasil e BANIDOS em todas as plataformas.",
  },

  // ── Educação Financeira / Day Trade ──────────────────────────────────────
  {
    id:          "fintech",
    label:       "Educação Financeira",
    emoji:       "📈",
    description: "Cursos, mentorias e conteúdo de investimentos",
    platforms:   ["meta", "google"],
    placements:  ["fb_feed", "ig_feed", "ig_reels", "fb_reels", "ig_story", "fb_story"],
    cta:         "Saiba mais",
    objective:   "OUTCOME_LEADS",
    tip:         "META: Feed FB+IG para público 25-50 anos interessado em finanças + Reels para conteúdo educativo curto (dicas, conceitos) + Stories para eventos e webinars. GOOGLE: Search com palavras de intenção (aprender, curso, investir) funciona muito bem para educação financeira. Conteúdo educativo tem menor risco de rejeição que oferta direta.",
    warning:     "⚠️ ATENÇÃO: Promessas de lucro garantido, retorno fixo ou 'enriqueça rápido' são PROIBIDAS em todas as plataformas e pela CVM (Instrução 592). Day trade como serviço financeiro (sinais, robôs) exige autorização prévia da Meta e certificação Google. Criptomoedas são restritas — consulte as políticas antes de criar anúncios. Apenas educação financeira (cursos, e-books, mentorias) é amplamente aceita.",
  },

];

export default PLACEMENT_PRESETS;
