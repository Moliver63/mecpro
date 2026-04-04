import { useState } from "react";
import { toast } from "sonner";
import { useParams, useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { usePlanLimit } from "@/hooks/usePlanLimit";
import IntelligenceRecommendation from "@/components/IntelligenceRecommendation";
import CreativeDistributionPanel from "@/components/CreativeDistributionPanel";

const OBJECTIVES = [
  { value: "leads",       label: "Captação de leads",    icon: "🎯", desc: "Formulários, landing pages" },
  { value: "sales",       label: "Vendas diretas",        icon: "💰", desc: "E-commerce, checkout" },
  { value: "branding",    label: "Branding / alcance",    icon: "📢", desc: "Reconhecimento de marca" },
  { value: "traffic",     label: "Tráfego para site",     icon: "🌐", desc: "Blog, conteúdo, SEO" },
  { value: "engagement",  label: "Engajamento",           icon: "❤️", desc: "Curtidas, comentários, shares" },
];

const PLATFORMS = [
  { value: "meta",    label: "Meta Ads",       icon: "📘", desc: "Facebook + Instagram" },
  { value: "google",  label: "Google Ads",     icon: "🔍", desc: "Search, Display, YouTube" },
  { value: "tiktok",  label: "TikTok Ads",     icon: "🎵", desc: "TikTok + Reels + Shorts" },
  { value: "both",    label: "Meta + Google",  icon: "⚡", desc: "Meta + Google integrados" },
  { value: "all",     label: "Todas",          icon: "🚀", desc: "Meta + Google + TikTok" },
];

const BUDGETS = [
  { value: 500,   label: "R$ 500/mês",    tier: "Starter" },
  { value: 1500,  label: "R$ 1.500/mês",  tier: "Growth" },
  { value: 3000,  label: "R$ 3.000/mês",  tier: "Pro" },
  { value: 5000,  label: "R$ 5.000/mês",  tier: "Scale" },
  { value: 10000, label: "R$ 10.000/mês", tier: "Enterprise" },
];

const DURATIONS = [7, 14, 21, 30, 60, 90];

// ── Segmentos de mercado com configurações otimizadas ──────────────────────
const SEGMENTS = [
  // ── IMÓVEIS ──────────────────────────────────────────────────────────────
  { value: "imoveis_venda", label: "Imóveis — Venda", icon: "🏠", desc: "Apartamentos, casas, terrenos à venda",
    config: { objective: "leads", platform: "meta", budget: 3000, duration: 30,
      extraContext: `Segmento: Imóveis para venda.
COPIES LEADS: Foque em despertar desejo pelo imóvel — localização, m², diferenciais, condições de pagamento facilitadas. Ex: "Seu apartamento em [cidade] por menos do que você imagina. Entrada de R$ 50k e parcelas que cabem no bolso."
COPIES VENDAS: Urgência e escassez — unidades limitadas, condição especial por tempo determinado. Ex: "Últimas 5 unidades com entrada de R$ 50k. Não consigo garantir esse preço por muito tempo."
CTA LEADS: "Quero saber as condições" | "Agendar visita" | "Falar com corretor"
CTA VENDAS: "Garantir minha unidade" | "Ver condição especial" | "Falar agora"
FORMATOS: Carrossel com fotos do imóvel (horizontal 16:9 para feed, vertical 9:16 para Stories/Reels).
FUNIL: Frio → foto externa/localização. Morno → tour interno/diferenciais. Quente → condição especial/urgência.
PÚBLICO MORADIA: 28-48 anos, estados SC/PR/SP/RS. PÚBLICO INVESTIDOR: 32-58 anos, Brasil + exterior (PT, US, EU).
INTERNACIONALIZAÇÃO: Para compradores no exterior use inglês/português, destaque valorização, retorno de aluguel temporada, proximidade praias.
COMPLIANCE META: Evite claims de valorização garantida. Não use "melhor preço" sem comprovação.` } },

  { value: "imoveis_locacao", label: "Imóveis — Locação", icon: "🔑", desc: "Apartamentos, casas, salas para alugar",
    config: { objective: "leads", platform: "meta", budget: 1500, duration: 30,
      extraContext: `Segmento: Imóveis para locação.
COPIES LEADS: Destaque disponibilidade imediata, valor do aluguel, localização e facilidades. Ex: "Apartamento disponível agora em [bairro]. [X] suítes, [Y]m², vaga inclusa. Agende visita hoje."
CTA: "Ver disponibilidade" | "Agendar visita" | "Consultar valores"
FORMATOS: Carrossel com fotos + vídeo tour 15-30s no Stories.
PÚBLICO: 22-45 anos, raio de 15km da propriedade, recém-mudados, profissionais.
INTERNACIONALIZAÇÃO: Para aluguel temporada destaque proximidade turística, retorno por diária, plataformas (Airbnb/Booking).
COMPLIANCE META: Não discrimine por critérios protegidos (raça, família, religião).` } },

  // ── E-COMMERCE ───────────────────────────────────────────────────────────
  { value: "ecommerce", label: "E-commerce", icon: "🛒", desc: "Loja virtual, produtos físicos",
    config: { objective: "sales", platform: "meta", budget: 3000, duration: 30,
      extraContext: `Segmento: E-commerce — produtos físicos.
COPIES VENDAS: Produto + preço + frete grátis + prazo de entrega + garantia. Ex: "Frete grátis hoje! [Produto] por R$ [X] com entrega em 2 dias e 30 dias para trocar."
COPIES LEADS (lista/newsletter): "Cadastre-se e ganhe 10% de desconto na primeira compra."
CTA VENDAS: "Comprar agora" | "Ver oferta" | "Garantir com desconto" | "Comprar com frete grátis"
FORMATOS: Carrossel de produtos (catálogo dinâmico), vídeo de unboxing 15s, imagem de produto com preço visível.
FUNIL: TOF → produto em uso (lifestyle). MOF → reviews/depoimentos. BOF → oferta com urgência/desconto.
SAZONALIDADE: Ajuste copy para Black Friday, Natal, Dia das Mães, Dia dos Namorados.
INTERNACIONALIZAÇÃO: Para venda internacional destaque moeda local, envio internacional, tempo de entrega, política de devolução.
COMPLIANCE META: Preço deve ser exato. Evite "melhor do mundo" sem comprovação. Desconto real (preço de vs preço atual).` } },

  // ── SERVIÇOS LOCAIS ───────────────────────────────────────────────────────
  { value: "servicos_locais", label: "Serviços Locais", icon: "📍", desc: "Clínicas, salões, restaurantes, oficinas",
    config: { objective: "leads", platform: "meta", budget: 1500, duration: 30,
      extraContext: `Segmento: Serviços locais.
COPIES LEADS: Destaque localização, horários, avaliações e diferencial. Ex: "A [X] minutos de você. Agende agora e ganhe [benefício] na primeira visita."
CTA: "Agendar agora" | "Ligar agora" | "Ver horários disponíveis" | "Reservar meu horário"
FORMATOS: Vídeo curto mostrando o ambiente (15-30s), foto do resultado/produto com localização geotag.
SEGMENTAÇÃO: Raio de 5-15km do estabelecimento. Use "Pessoas que moram aqui" (não visitantes).
PÚBLICO: 20-55 anos, interesse relacionado ao serviço específico.
FUNIL: TOF → awareness local (foto/vídeo do ambiente). BOF → oferta de primeira visita com CTA direto.
INTERNACIONALIZAÇÃO: Para serviços em destinos turísticos, crie versão em inglês/espanhol para turistas.
COMPLIANCE META: Saúde: sem claims médicos não comprovados. Alimentação: fotos reais do produto.` } },

  // ── INFOPRODUTOS ─────────────────────────────────────────────────────────
  { value: "infoprodutos", label: "Infoprodutos / Cursos", icon: "🎓", desc: "Cursos online, mentorias, ebooks",
    config: { objective: "leads", platform: "both", budget: 3000, duration: 30,
      extraContext: `Segmento: Infoprodutos e cursos online.
COPIES LEADS (lista/webinar gratuito): Transformação prometida + prova social + baixo atrito. Ex: "Descubra como [resultado desejado] em [tempo] — mesmo sem [objeção principal]. Aula gratuita com [X] mil alunos."
COPIES VENDAS (curso pago): Urgência + escassez + garantia. Ex: "Turma fechando hoje. [X] alunos já transformaram [resultado]. 7 dias de garantia total."
CTA LEADS: "Quero minha vaga gratuita" | "Acessar aula grátis" | "Entrar para a lista VIP"
CTA VENDAS: "Garantir minha vaga" | "Quero me inscrever" | "Acessar agora com desconto"
FORMATOS: VSL (vídeo de vendas 2-5 min), Stories com depoimentos, carrossel com antes/depois de resultados.
FUNIL: TOF → conteúdo educacional gratuito. MOF → webinar/aula gratuita. BOF → oferta do produto com urgência.
INTERNACIONALIZAÇÃO: Para mercado lusófono (PT, MZ, AO): adapte exemplos e moeda. Para mercado hispânico: versão em espanhol com exemplos locais.
COMPLIANCE META: Evite promessas de ganho específico ("ganhe R$ X por mês"). Use "resultados variam".` } },

  // ── SAÚDE & ESTÉTICA ─────────────────────────────────────────────────────
  { value: "saude_estetica", label: "Saúde & Estética", icon: "💆", desc: "Clínicas, procedimentos, bem-estar",
    config: { objective: "leads", platform: "meta", budget: 2000, duration: 30,
      extraContext: `Segmento: Saúde e estética.
COPIES LEADS: Foque em autoestima, bem-estar e resultados sem claims médicos proibidos. Ex: "Recupere sua autoestima com [procedimento]. Avaliação gratuita com especialista."
CTA: "Agendar avaliação gratuita" | "Quero minha avaliação" | "Falar com especialista"
FORMATOS: Vídeo do ambiente/equipe (não before/after), depoimento em vídeo de paciente satisfeito.
PÚBLICO: Mulheres 25-55 anos principalmente; adapte por procedimento específico.
FUNIL: TOF → educação sobre o procedimento. MOF → depoimentos/resultados. BOF → avaliação gratuita com urgência de agenda.
COMPLIANCE META CRÍTICO: PROIBIDO before/after. PROIBIDO claims médicos ("cura", "elimina", "trata"). Use "pode ajudar", "favorece", "contribui". Sem exposição de corpo nu ou partes íntimas.
INTERNACIONALIZAÇÃO: Turismo médico — destaque acreditações, preços competitivos vs país de origem, estrutura.` } },

  // ── ALIMENTAÇÃO ───────────────────────────────────────────────────────────
  { value: "alimentacao", label: "Alimentação & Delivery", icon: "🍔", desc: "Restaurantes, lanchonetes, delivery",
    config: { objective: "sales", platform: "meta", budget: 1000, duration: 30,
      extraContext: `Segmento: Alimentação e delivery.
COPIES VENDAS: Apelo visual + velocidade + conveniência. Ex: "Entrega em 30 minutos. [Prato] por R$ [X] com taxa grátis hoje."
CTA: "Pedir agora" | "Ver cardápio" | "Pedir no WhatsApp" | "Fazer meu pedido"
FORMATOS: Foto/vídeo do produto em close (apetitoso), vídeo do preparo 15s, stories com promoção do dia.
HORÁRIOS: Publicar anúncios 30-60 min antes dos horários de pico (11h30, 18h30).
SEGMENTAÇÃO: Raio de 5-8km. Público 18-45 anos.
FUNIL: TOF → conteúdo de bastidores/preparo. MOF → destaques do cardápio. BOF → promoção do dia/semana com CTA direto.
INTERNACIONALIZAÇÃO: Para turistas, versão em inglês com foto do prato + preço em USD/EUR.
COMPLIANCE META: Foto real do produto (não ilustrativa). Preço exato. Bebidas alcoólicas: configurar restrição de idade.` } },

  // ── MODA & VAREJO ─────────────────────────────────────────────────────────
  { value: "moda_varejo", label: "Moda & Varejo", icon: "👗", desc: "Roupas, calçados, acessórios",
    config: { objective: "sales", platform: "meta", budget: 2000, duration: 30,
      extraContext: `Segmento: Moda e varejo.
COPIES VENDAS: Estilo + ocasião + preço + frete. Ex: "Nova coleção chegou. [Peça] por R$ [X] com frete grátis hoje. Estoque limitado."
CTA: "Comprar agora" | "Ver coleção" | "Garantir o meu" | "Aproveitar oferta"
FORMATOS: Carrossel lifestyle (modelo usando a peça), vídeo de desfile curto 15s, Reels com styling tips.
FUNIL: TOF → lifestyle/inspiração. MOF → produto em detalhe + preço. BOF → oferta com urgência/frete grátis.
SAZONALIDADE: Verão/inverno, Black Friday, Natal, Dia das Mães, Dia dos Namorados.
INTERNACIONALIZAÇÃO: Para exportação, adapte tamanhos (BR vs US vs EU), moeda e prazo de entrega internacional.
COMPLIANCE META: Fotos reais do produto. Preço exato. Sem discriminação de tamanho/corpo no copy.` } },

  // ── B2B ───────────────────────────────────────────────────────────────────
  { value: "b2b", label: "B2B / Empresas", icon: "🏢", desc: "Soluções para empresas, SaaS, serviços",
    config: { objective: "leads", platform: "both", budget: 5000, duration: 30,
      extraContext: `Segmento: B2B — soluções para empresas.
COPIES LEADS: ROI + problema específico + credibilidade. Ex: "Reduza [X]% do tempo gasto em [processo]. +500 empresas já usam. Solicite uma demo gratuita."
CTA: "Solicitar demo gratuita" | "Falar com especialista" | "Ver case de sucesso" | "Calcular meu ROI"
FORMATOS: Vídeo explicativo 30-60s, carrossel com cases/resultados, imagem com dado de impacto.
PLATAFORMAS: Google Ads (demanda ativa — palavras-chave de intenção). LinkedIn Ads (segmentação por cargo/empresa). Meta (remarketing e awareness).
FUNIL: TOF → conteúdo educacional (artigo/webinar). MOF → case study/demo. BOF → trial gratuito/proposta.
PÚBLICO: Decisores (CEO, Diretor, Gerente), empresas de 10-500 funcionários, segmentação por setor.
INTERNACIONALIZAÇÃO: English copy para mercados US/EU. Adapte cases por país/região. GDPR compliance para Europa.
COMPLIANCE: Sem promessas de resultado garantido. Use "pode", "ajuda a", "contribui para".` } },

  // ── OUTRO ─────────────────────────────────────────────────────────────────
  { value: "outro", label: "Outro segmento", icon: "✏️", desc: "Configurar manualmente",
    config: { objective: "leads", platform: "meta", budget: 1500, duration: 30, extraContext: "" } },
];

// Mapa segmento → nicho da learning base
const SEGMENT_TO_NICHE: Record<string, string> = {
  imoveis_venda:   "imobiliario",
  imoveis_locacao: "imobiliario",
  ecommerce:       "varejo",
  servicos_locais: "servicos",
  infoprodutos:    "infoprodutos",
  saude_estetica:  "saude",
  alimentacao:     "varejo",
  moda_varejo:     "varejo",
  b2b:             "geral",
  outro:           "geral",
};

export default function CampaignBuilder() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id || 0);
  const [, setLocation] = useLocation();

  const { data: campaigns, refetch } = trpc.campaigns.list.useQuery(
    { projectId }, { enabled: !!projectId }
  );
  const { data: clientProfile } = trpc.clientProfile.get.useQuery(
    { projectId }, { enabled: !!projectId }
  );
  const { data: marketAnalysis } = trpc.market.get.useQuery(
    { projectId }, { enabled: !!projectId }
  );
  const generate = trpc.campaigns.generate.useMutation({
    onSuccess: (data: any) => {
      toast.success("✅ Campanha gerada com sucesso!");
      refetch();
      setLocation(`/projects/${projectId}/campaign/result/${data.id}`);
    },
    onError: (e: any) => toast.error(`Erro ao gerar campanha: ${e.message}`),
  });

  const matchMutation = (trpc as any).campaigns?.matchScore?.useMutation?.({
    onError: (e: any) => toast.error(`Erro ao calcular match: ${e.message}`),
  }) ?? { mutateAsync: null, isLoading: false };

  // Verificação de plano
  const { canGenerateCampaign, canUseMeta, canUseGoogle, planName } = usePlanLimit();
  const now = new Date();
  const campaignsThisMonth = ((campaigns as any[]) || []).filter((c: any) => {
    const d = new Date(c.createdAt || 0);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const campaignCheck = canGenerateCampaign(campaignsThisMonth);
  const metaCheck = canUseMeta();
  const googleCheck = canUseGoogle();
  const hasClientProfile = !!(clientProfile as any)?.companyName || !!(clientProfile as any)?.niche || !!(clientProfile as any)?.productService;
  const hasMarketAnalysis = !!(marketAnalysis as any)?.competitiveGaps || !!(marketAnalysis as any)?.unexploredOpportunities || !!(marketAnalysis as any)?.suggestedPositioning || !!(marketAnalysis as any)?.threats || !!(marketAnalysis as any)?.competitiveMap;
  const creationBlocked = !campaignCheck.allowed || !hasClientProfile || !hasMarketAnalysis;

  function isPlatformAllowed(platform: string) {
    if (platform === "meta")   return metaCheck.allowed;
    if (platform === "google") return googleCheck.allowed;
    if (platform === "tiktok") return true;
    if (platform === "both")   return metaCheck.allowed && googleCheck.allowed;
    if (platform === "all")    return metaCheck.allowed || googleCheck.allowed;
    return true;
  }

  function platformRestrictionMessage(platform: string) {
    if (platform === "meta")   return metaCheck.reason;
    if (platform === "google") return googleCheck.reason;
    if (platform === "tiktok") return undefined;
    if (platform === "both")   return !metaCheck.allowed ? metaCheck.reason : !googleCheck.allowed ? googleCheck.reason : undefined;
    if (platform === "all")    return undefined;
    return undefined;
  }

  const [step, setStep] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [matchResult, setMatchResult] = useState<any>(null);
  const [matching, setMatching] = useState(false);
  const [segment, setSegment]   = useState<string>("");
  const [form, setForm] = useState({
    name: "",
    objective: "leads",
    platform: "meta",
    budget: 1500,
    duration: 30,
    extraContext: "",
    // Novos campos — Ajustes 1, 2, 3
    regions:    [] as string[],   // estados selecionados ([] = Brasil todo)
    ageMin:     18,               // faixa etária mínima
    ageMax:     65,               // faixa etária máxima
    mediaFormat: "mixed" as "horizontal" | "vertical" | "square" | "mixed", // tipo de mídia
    audienceProfile: "moradia" as "moradia" | "investidor" | "geral",       // perfil do público
  });

  // Nicho atual para recomendação de inteligência
  const currentNiche = (clientProfile as any)?.niche
    || SEGMENT_TO_NICHE[segment]
    || "geral";

  const STEPS = ["Segmento", "Objetivo", "Plataforma", "Orçamento", "Detalhes", "Match IA", "Gerar"];

  async function handleMatch() {
    setMatching(true);
    try {
      if (matchMutation.mutateAsync) {
        const result = await matchMutation.mutateAsync({
          projectId, objective: form.objective, platform: form.platform,
          budget: form.budget, duration: form.duration,
        });
        setMatchResult(result);
        const recScore = result.recommended?.score || 0;
        const curScore = result.alternatives?.find((a: any) => a.platform === form.platform)?.score || recScore;
        if (result.recommended?.platform !== form.platform && recScore - curScore > 10) {
          setForm(f => ({ ...f, platform: result.recommended.platform }));
        }
      }
      setStep(7);
    } catch {
      setStep(7);
    } finally {
      setMatching(false);
    }
  }

  async function handleGenerate() {
    if (!form.name.trim()) return;
    setGenerating(true);
    try {
      await generate.mutateAsync({
        projectId,
        ...form,
        extraContext: [
          form.extraContext,
          form.regions.length > 0 ? `Região de atuação: ${form.regions.join(', ')}` : '',
          form.ageMin !== 18 || form.ageMax !== 65 ? `Faixa etária: ${form.ageMin}–${form.ageMax} anos` : '',
          form.mediaFormat !== 'mixed' ? `Formato de mídia: ${form.mediaFormat}` : '',
          form.audienceProfile !== 'geral' ? `Perfil do público: ${form.audienceProfile}` : '',
        ].filter(Boolean).join('. '),
      });
    } finally {
      setGenerating(false);
    }
  }

  const selectedObj    = OBJECTIVES.find(o => o.value === form.objective);
  const selectedPlat   = PLATFORMS.find(p => p.value === form.platform);
  const selectedBudget = BUDGETS.find(b => b.value === form.budget);

  return (
    <Layout>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--green-l)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>⚡</div>
          <div>
            <button className="btn btn-sm btn-ghost" onClick={() => setLocation(`/projects/${projectId}/market`)} style={{ paddingLeft: 0, marginBottom: 6 }}>← Módulo 3</button>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 2 }}>Construção de Campanha</h1>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>Módulo 4 — Geração de campanha com IA baseada em inteligência competitiva</p>
          </div>
        </div>
      </div>

      {!projectId ? (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 48, textAlign: "center" }}>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Acesse a partir de um projeto.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}>

          {/* Builder */}
          <div>
            {/* Steps */}
            <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
              {STEPS.map((s, i) => {
                const n = i + 1;
                const done = step > n;
                const active = step === n;
                return (
                  <div key={s} onClick={() => n < step && setStep(n)}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: n < step ? "pointer" : "default" }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      background: done ? "var(--green)" : active ? "var(--navy)" : "var(--border)",
                      color: done || active ? "white" : "var(--muted)", fontSize: 12, fontWeight: 700
                    }}>{done ? "✓" : n}</div>
                    <span style={{ fontSize: 11, color: active ? "var(--navy)" : "var(--muted)", fontWeight: active ? 700 : 400 }}>{s}</span>
                  </div>
                );
              })}
            </div>

            <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 28 }}>

              {(!hasClientProfile || !hasMarketAnalysis) && (
                <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
                  {!hasClientProfile && (
                    <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12, padding: "12px 14px" }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#9a3412", marginBottom: 4 }}>⚠️ Perfil do cliente incompleto</p>
                      <p style={{ fontSize: 12, color: "#9a3412", marginBottom: 8 }}>Preencha empresa, nicho, produto e público-alvo para a IA gerar campanhas melhores.</p>
                      <button className="btn btn-sm btn-ghost" onClick={() => setLocation(`/projects/${projectId}/client`)}>Abrir Módulo 1 →</button>
                    </div>
                  )}
                  {!hasMarketAnalysis && (
                    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: "12px 14px" }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#1d4ed8", marginBottom: 4 }}>ℹ️ Análise de mercado ainda não gerada</p>
                      <p style={{ fontSize: 12, color: "#1d4ed8", marginBottom: 8 }}>Gere o Módulo 3 para enriquecer a campanha com gaps, posicionamento e oportunidades reais.</p>
                      <button className="btn btn-sm btn-ghost" onClick={() => setLocation(`/projects/${projectId}/market`)}>Abrir Módulo 3 →</button>
                    </div>
                  )}
                </div>
              )}

              {/* Step 1: Segmento */}
              {step === 1 && (
                <div>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, color: "var(--black)", marginBottom: 6 }}>Qual é o segmento do negócio?</h2>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>A IA vai configurar automaticamente objetivo, CTA, copy e estratégia para o seu segmento.</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {SEGMENTS.map(seg => (
                      <div key={seg.value}
                        onClick={() => {
                          setSegment(seg.value);
                          if (seg.value !== "outro") {
                            setForm(f => ({
                              ...f,
                              objective:    seg.config.objective,
                              platform:     seg.config.platform,
                              budget:       seg.config.budget,
                              duration:     seg.config.duration,
                              extraContext: seg.config.extraContext,
                            }));
                          }
                        }}
                        style={{
                          border: `2px solid ${segment === seg.value ? "var(--green)" : "var(--border)"}`,
                          borderRadius: 12, padding: "12px 16px", cursor: "pointer",
                          background: segment === seg.value ? "var(--green-l)" : "white",
                          transition: "all .15s",
                        }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 22 }}>{seg.icon}</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", margin: 0 }}>{seg.label}</p>
                            <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>{seg.desc}</p>
                          </div>
                          {segment === seg.value && <span style={{ color: "var(--green)", fontWeight: 700, fontSize: 16 }}>✓</span>}
                        </div>
                        {segment === seg.value && seg.value !== "outro" && (
                          <div style={{ marginTop: 8, padding: "6px 10px", background: "var(--green-xl)", borderRadius: 8, display: "flex", gap: 12, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--green-dk)" }}>🎯 {seg.config.objective}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--green-dk)" }}>📘 {seg.config.platform}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--green-dk)" }}>💰 R$ {seg.config.budget.toLocaleString()}/mês</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Objetivo */}
              {step === 2 && (
                <div>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, color: "var(--black)", marginBottom: 6 }}>Qual é o objetivo da campanha?</h2>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>A IA vai adaptar toda a estratégia para este objetivo.</p>
                  <div style={{ display: "grid", gap: 10 }}>
                    {OBJECTIVES.map(obj => (
                      <div key={obj.value}
                        onClick={() => setForm(f => ({ ...f, objective: obj.value }))}
                        style={{
                          border: `2px solid ${form.objective === obj.value ? "var(--green)" : "var(--border)"}`,
                          borderRadius: 12, padding: "14px 18px", cursor: "pointer",
                          background: form.objective === obj.value ? "var(--green-l)" : "white",
                          display: "flex", alignItems: "center", gap: 14, transition: "all .15s"
                        }}>
                        <span style={{ fontSize: 24 }}>{obj.icon}</span>
                        <div>
                          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)", marginBottom: 2 }}>{obj.label}</p>
                          <p style={{ fontSize: 12, color: "var(--muted)" }}>{obj.desc}</p>
                        </div>
                        {form.objective === obj.value && <span style={{ marginLeft: "auto", color: "var(--green)", fontWeight: 700 }}>✓</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3: Plataforma */}
              {step === 3 && (
                <div>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, color: "var(--black)", marginBottom: 6 }}>Onde vai rodar a campanha?</h2>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>A IA vai gerar criativos e estratégias específicas para cada plataforma.</p>
                  <div style={{ display: "grid", gap: 10 }}>
                    {PLATFORMS.map(plat => (
                      <div key={plat.value}
                        onClick={() => {
                          if (!isPlatformAllowed(plat.value)) {
                            toast.error(platformRestrictionMessage(plat.value) || "Plataforma indisponível no seu plano.");
                            return;
                          }
                          setForm(f => ({ ...f, platform: plat.value }));
                        }}
                        style={{
                          border: `2px solid ${form.platform === plat.value ? "var(--green)" : !isPlatformAllowed(plat.value) ? "#fed7aa" : "var(--border)"}`,
                          borderRadius: 12, padding: "18px 20px", cursor: isPlatformAllowed(plat.value) ? "pointer" : "not-allowed",
                          background: form.platform === plat.value ? "var(--green-l)" : !isPlatformAllowed(plat.value) ? "#fff7ed" : "white",
                          opacity: isPlatformAllowed(plat.value) ? 1 : 0.7,
                          display: "flex", alignItems: "center", gap: 14, transition: "all .15s"
                        }}>
                        <span style={{ fontSize: 28 }}>{plat.icon}</span>
                        <div>
                          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--black)", marginBottom: 2 }}>{plat.label}</p>
                          <p style={{ fontSize: 12, color: "var(--muted)" }}>{plat.desc}</p>
                        </div>
                        <div style={{ marginLeft: "auto", textAlign: "right" }}>
                          {form.platform === plat.value && <span style={{ color: "var(--green)", fontSize: 18, fontWeight: 700, display: "block" }}>✓</span>}
                          {!isPlatformAllowed(plat.value) && (
                            <span style={{ color: "#c2410c", fontSize: 10, fontWeight: 700 }}>Upgrade necessário</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Distribuicao inteligente de formatos */}
                  <CreativeDistributionPanel
                    platform={form.platform}
                    objective={form.objective}
                    onFormatSelect={(rec) => {
                      setForm(f => ({
                        ...f,
                        extraContext: f.extraContext
                          ? f.extraContext
                          : 'Formato: ' + rec.ratio + ' (' + rec.type + '). Placements: ' + rec.placements.join(', '),
                      }));
                    }}
                  />
                </div>
              )}

              {/* Step 4: Orçamento */}
              {step === 4 && (
                <div>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, color: "var(--black)", marginBottom: 6 }}>Orçamento mensal</h2>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 24 }}>Arraste o slider para definir seu orçamento. A IA vai sugerir a alocação ideal.</p>

                  <div style={{ marginBottom: 28 }}>
                    <div style={{ textAlign: "center", marginBottom: 16 }}>
                      <p style={{ fontSize: 42, fontWeight: 900, color: "var(--green-d)", fontFamily: "var(--font-display)", margin: 0, lineHeight: 1 }}>
                        R$ {form.budget.toLocaleString("pt-BR")}
                      </p>
                      <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                        ≈ <strong style={{ color: "var(--black)" }}>R$ {Math.round(form.budget / 30).toLocaleString("pt-BR")}/dia</strong>
                        {" · "}
                        {form.budget <= 500 ? "🌱 Starter" : form.budget <= 1500 ? "📈 Growth" : form.budget <= 3000 ? "⚡ Pro" : form.budget <= 5000 ? "🚀 Scale" : "🏆 Enterprise"}
                      </p>
                    </div>

                    <div style={{ position: "relative", padding: "0 8px" }}>
                      <input
                        type="range" min={300} max={15000} step={100} value={form.budget}
                        onChange={e => setForm(f => ({ ...f, budget: Number(e.target.value) }))}
                        style={{
                          width: "100%", height: 6, appearance: "none", WebkitAppearance: "none",
                          background: `linear-gradient(to right, var(--green) 0%, var(--green) ${((form.budget - 300) / (15000 - 300)) * 100}%, #e2e8f0 ${((form.budget - 300) / (15000 - 300)) * 100}%, #e2e8f0 100%)`,
                          borderRadius: 99, outline: "none", cursor: "pointer",
                        }}
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                        {[300, 1500, 3000, 7500, 15000].map(v => (
                          <button key={v} onClick={() => setForm(f => ({ ...f, budget: v }))}
                            style={{
                              fontSize: 10, fontWeight: 700, color: form.budget === v ? "var(--green-d)" : "var(--muted)",
                              background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
                              borderBottom: form.budget === v ? "2px solid var(--green)" : "2px solid transparent",
                            }}>
                            R${v >= 1000 ? `${v/1000}k` : v}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 16 }}>
                      {[
                        { min: 300,  max: 999,   label: "Pequeno",  color: "#6b7280", desc: "Teste e aprendizado" },
                        { min: 1000, max: 4999,  label: "Médio",    color: "#2563eb", desc: "Crescimento consistente" },
                        { min: 5000, max: 15000, label: "Alto",     color: "#16a34a", desc: "Escala e dominância" },
                      ].map(tier => {
                        const isActive = form.budget >= tier.min && form.budget <= tier.max;
                        return (
                          <div key={tier.label} style={{
                            padding: "10px 12px", borderRadius: 10,
                            background: isActive ? `${tier.color}11` : "var(--off)",
                            border: `1.5px solid ${isActive ? tier.color : "var(--border)"}`,
                            textAlign: "center", transition: "all .2s",
                          }}>
                            <p style={{ fontSize: 11, fontWeight: 800, color: isActive ? tier.color : "var(--muted)", margin: 0 }}>{tier.label}</p>
                            <p style={{ fontSize: 9, color: "var(--muted)", margin: "2px 0 0" }}>{tier.desc}</p>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ marginTop: 16, background: "var(--navy)", borderRadius: 12, padding: "12px 16px" }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.5)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Estimativas para R$ {form.budget.toLocaleString("pt-BR")}/mês</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                        {[
                          { label: "Alcance est.", value: `${Math.round(form.budget * 8 / 10).toLocaleString()}–${Math.round(form.budget * 12 / 10).toLocaleString()}` },
                          { label: "Cliques est.", value: `${Math.round(form.budget * 1.2).toLocaleString()}–${Math.round(form.budget * 2).toLocaleString()}` },
                          { label: "CPC médio", value: `R$ ${(form.budget > 5000 ? 0.45 : form.budget > 1500 ? 0.60 : 0.80).toFixed(2)}` },
                        ].map(m => (
                          <div key={m.label} style={{ textAlign: "center" }}>
                            <p style={{ fontSize: 13, fontWeight: 800, color: "white", margin: 0 }}>{m.value}</p>
                            <p style={{ fontSize: 9, color: "rgba(255,255,255,.4)", margin: "2px 0 0" }}>{m.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 10 }}>Duração da campanha</label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {DURATIONS.map(d => (
                        <button key={d}
                          onClick={() => setForm(f => ({ ...f, duration: d }))}
                          style={{
                            padding: "8px 14px", borderRadius: 8, border: `2px solid ${form.duration === d ? "var(--green)" : "var(--border)"}`,
                            background: form.duration === d ? "var(--green-l)" : "white",
                            color: form.duration === d ? "var(--green-d)" : "var(--muted)",
                            fontWeight: 700, fontSize: 13, cursor: "pointer"
                          }}>{d}d</button>
                      ))}
                    </div>
                    <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--green-l)", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--green-d)", fontWeight: 600 }}>💰 Investimento total estimado:</span>
                      <span style={{ fontSize: 15, fontWeight: 900, color: "var(--green-d)" }}>
                        R$ {Math.round(form.budget * form.duration / 30).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Step 5: Detalhes — com IntelligenceRecommendation ── */}
              {step === 5 && (
                <div>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, color: "var(--black)", marginBottom: 6 }}>Detalhes da campanha</h2>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>Quanto mais contexto, mais precisa será a estratégia da IA.</p>

                  {/* ── RECOMENDAÇÃO INTELIGENTE (nova) ── */}
                  <IntelligenceRecommendation
                    platform={form.platform}
                    objective={form.objective}
                    niche={currentNiche}
                    onApply={(rec) => {
                      const budgetMap: Record<string, number> = {
                        low: 500, mid: 1500, high: 3000, premium: 5000,
                      };
                      const durationMap: Record<string, number> = {
                        short: 7, mid: 30, long: 60,
                      };
                      setForm(f => ({
                        ...f,
                        budget:       budgetMap[rec.recommendedBudget]    ?? f.budget,
                        duration:     durationMap[rec.recommendedDuration] ?? f.duration,
                        extraContext: f.extraContext
                          ? f.extraContext
                          : `Formato recomendado: ${rec.recommendedFormat}. Gatilho: ${rec.recommendedTrigger}. CTA: ${rec.recommendedCta}. Baseado em campanhas reais do segmento ${currentNiche}.`,
                      }));
                      toast.success("✅ Parâmetros da inteligência aplicados!");
                    }}
                  />

                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Nome da campanha *</label>
                  <input className="input" placeholder="Ex: Campanha Leads Q1 2026"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    style={{ marginBottom: 16, width: "100%" }} />

                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>
                    Contexto adicional <span style={{ fontWeight: 400, color: "var(--muted)" }}>(opcional)</span>
                  </label>
                  <textarea className="input" rows={5}
                    placeholder="Ex: Temos uma promoção de lançamento com 30% de desconto válida por 7 dias. Queremos priorizar público feminino de 25-45 anos em SP e RJ..."
                    value={form.extraContext}
                    onChange={e => setForm(f => ({ ...f, extraContext: e.target.value }))}
                    style={{ width: "100%", resize: "vertical", marginBottom: 8 }} />
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>
                    A IA também usará os dados do perfil do cliente e dos concorrentes analisados.
                  </p>

                  {/* ── REGIÃO / PAÍS / GEOLOCALIZAÇÃO ── */}
                  <div style={{ marginTop: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 8 }}>
                      📍 Localização do público
                    </label>

                    {/* Modo de segmentação */}
                    <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                      {[
                        { value: "brasil",  label: "🇧🇷 Brasil" },
                        { value: "paises",  label: "🌎 Internacional" },
                        { value: "raio",    label: "📍 Por raio" },
                      ].map(m => (
                        <button key={m.value}
                          onClick={() => setForm(f => ({ ...f, locationMode: m.value as any, regions: [], countries: [] }))}
                          style={{
                            padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                            border: `1px solid ${(form as any).locationMode === m.value ? "var(--green)" : "var(--border)"}`,
                            background: (form as any).locationMode === m.value ? "var(--green-l)" : "white",
                            color: (form as any).locationMode === m.value ? "var(--green-d)" : "var(--muted)",
                            cursor: "pointer",
                          }}>
                          {m.label}
                        </button>
                      ))}
                    </div>

                    {/* MODO BRASIL — estados */}
                    {(!(form as any).locationMode || (form as any).locationMode === "brasil") && (
                      <div>
                        <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>Selecione os estados (deixe vazio para Brasil todo)</p>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                          {["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map(uf => (
                            <button key={uf}
                              onClick={() => setForm(f => ({
                                ...f,
                                regions: f.regions.includes(uf)
                                  ? f.regions.filter(r => r !== uf)
                                  : [...f.regions, uf],
                              }))}
                              style={{
                                padding: "4px 10px", borderRadius: 16, fontSize: 11, fontWeight: 700,
                                border: `1px solid ${form.regions.includes(uf) ? "var(--green)" : "var(--border)"}`,
                                background: form.regions.includes(uf) ? "var(--green-l)" : "white",
                                color: form.regions.includes(uf) ? "var(--green-d)" : "var(--muted)",
                                cursor: "pointer",
                              }}>
                              {uf}
                            </button>
                          ))}
                        </div>
                        {form.regions.length > 0 && (
                          <p style={{ fontSize: 11, color: "var(--green-d)", fontWeight: 600 }}>
                            ✅ {form.regions.join(", ")}
                          </p>
                        )}
                      </div>
                    )}

                    {/* MODO INTERNACIONAL — países */}
                    {(form as any).locationMode === "paises" && (
                      <div>
                        <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>Selecione os países</p>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                          {[
                            { code: "BR", label: "🇧🇷 Brasil" },
                            { code: "PT", label: "🇵🇹 Portugal" },
                            { code: "US", label: "🇺🇸 EUA" },
                            { code: "AR", label: "🇦🇷 Argentina" },
                            { code: "CL", label: "🇨🇱 Chile" },
                            { code: "CO", label: "🇨🇴 Colômbia" },
                            { code: "MX", label: "🇲🇽 México" },
                            { code: "ES", label: "🇪🇸 Espanha" },
                            { code: "FR", label: "🇫🇷 França" },
                            { code: "DE", label: "🇩🇪 Alemanha" },
                            { code: "IT", label: "🇮🇹 Itália" },
                            { code: "GB", label: "🇬🇧 Reino Unido" },
                            { code: "CA", label: "🇨🇦 Canadá" },
                            { code: "AU", label: "🇦🇺 Austrália" },
                            { code: "JP", label: "🇯🇵 Japão" },
                            { code: "AO", label: "🇦🇴 Angola" },
                            { code: "MZ", label: "🇲🇿 Moçambique" },
                            { code: "UY", label: "🇺🇾 Uruguai" },
                            { code: "PY", label: "🇵🇾 Paraguai" },
                            { code: "PE", label: "🇵🇪 Peru" },
                          ].map(c => {
                            const countries = (form as any).countries || [];
                            return (
                              <button key={c.code}
                                onClick={() => setForm(f => ({
                                  ...f,
                                  countries: countries.includes(c.code)
                                    ? countries.filter((x: string) => x !== c.code)
                                    : [...countries, c.code],
                                } as any))}
                                style={{
                                  padding: "5px 12px", borderRadius: 16, fontSize: 11, fontWeight: 700,
                                  border: `1px solid ${countries.includes(c.code) ? "var(--green)" : "var(--border)"}`,
                                  background: countries.includes(c.code) ? "var(--green-l)" : "white",
                                  color: countries.includes(c.code) ? "var(--green-d)" : "var(--muted)",
                                  cursor: "pointer",
                                }}>
                                {c.label}
                              </button>
                            );
                          })}
                        </div>
                        {((form as any).countries || []).length > 0 && (
                          <p style={{ fontSize: 11, color: "var(--green-d)", fontWeight: 600 }}>
                            ✅ {((form as any).countries || []).join(", ")}
                          </p>
                        )}
                      </div>
                    )}

                    {/* MODO RAIO — cidade + km */}
                    {(form as any).locationMode === "raio" && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Cidade / endereço</label>
                          <input className="input"
                            placeholder="Ex: Balneário Camboriú, SC"
                            value={(form as any).geoCity || ""}
                            onChange={e => setForm(f => ({ ...f, geoCity: e.target.value } as any))}
                            style={{ fontSize: 12 }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Raio</label>
                          <select className="input"
                            value={(form as any).geoRadius || 15}
                            onChange={e => setForm(f => ({ ...f, geoRadius: Number(e.target.value) } as any))}
                            style={{ fontSize: 12, width: 100 }}>
                            {[5,10,15,20,30,40,50,80,100].map(r => (
                              <option key={r} value={r}>{r} km</option>
                            ))}
                          </select>
                        </div>
                        {(form as any).geoCity && (
                          <p style={{ fontSize: 11, color: "var(--green-d)", fontWeight: 600, gridColumn: "1/-1" }}>
                            ✅ Raio de {(form as any).geoRadius || 15}km em torno de {(form as any).geoCity}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── AJUSTE 3: Faixa etária ── */}
                  <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>
                        👤 Idade mínima
                      </label>
                      <select className="input" value={form.ageMin}
                        onChange={e => setForm(f => ({ ...f, ageMin: Number(e.target.value) }))}
                        style={{ fontSize: 12 }}>
                        {[18,21,25,28,30,32,35,40,45,50].map(a => (
                          <option key={a} value={a}>{a} anos</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>
                        👤 Idade máxima
                      </label>
                      <select className="input" value={form.ageMax}
                        onChange={e => setForm(f => ({ ...f, ageMax: Number(e.target.value) }))}
                        style={{ fontSize: 12 }}>
                        {[35,40,45,48,50,55,58,60,65].map(a => (
                          <option key={a} value={a}>{a} anos</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* ── AJUSTE 2: Formato de mídia ── */}
                  <div style={{ marginTop: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>
                      🖼️ Formato das imagens/vídeos
                    </label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {[
                        { value: "vertical",   label: "📱 Vertical (9:16)",    desc: "Stories, Reels, TikTok" },
                        { value: "square",     label: "⬜ Quadrado (1:1)",     desc: "Feed universal" },
                        { value: "horizontal", label: "🖥️ Horizontal (16:9)", desc: "YouTube, Display" },
                        { value: "mixed",      label: "🔀 Misto",              desc: "A IA decide" },
                      ].map(opt => (
                        <button key={opt.value}
                          onClick={() => setForm(f => ({ ...f, mediaFormat: opt.value as any }))}
                          style={{
                            padding: "8px 14px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                            border: `1px solid ${form.mediaFormat === opt.value ? "var(--green)" : "var(--border)"}`,
                            background: form.mediaFormat === opt.value ? "var(--green-l)" : "white",
                            color: form.mediaFormat === opt.value ? "var(--green-d)" : "var(--muted)",
                            cursor: "pointer", textAlign: "left" as const,
                          }}>
                          <div>{opt.label}</div>
                          <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2 }}>{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── AJUSTE 4: Perfil do público — dinâmico por segmento ── */}
                  <div style={{ marginTop: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>
                      🎯 Perfil do público
                    </label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {((): { value: string; label: string; desc: string }[] => {
                        // Perfis dinâmicos por segmento
                        const profiles: Record<string, { value: string; label: string; desc: string }[]> = {
                          imoveis_venda: [
                            { value: "moradia",    label: "🏠 Moradia",    desc: "Comprar para morar" },
                            { value: "investidor", label: "💰 Investidor", desc: "Renda passiva/aluguel" },
                            { value: "geral",      label: "👥 Ambos",      desc: "Moradia e investimento" },
                          ],
                          imoveis_locacao: [
                            { value: "moradia",    label: "🏠 Residencial", desc: "Morar no imóvel" },
                            { value: "investidor", label: "🏖️ Temporada",   desc: "Airbnb/aluguel curto" },
                            { value: "geral",      label: "👥 Ambos",       desc: "Todos os perfis" },
                          ],
                          ecommerce: [
                            { value: "geral",      label: "🛒 Comprador",   desc: "Público geral consumidor" },
                            { value: "moradia",    label: "🎁 Presente",    desc: "Comprando para oferecer" },
                            { value: "investidor", label: "🏪 Revendedor",  desc: "Compra para revender" },
                          ],
                          servicos_locais: [
                            { value: "geral",      label: "👥 Geral",       desc: "Público local" },
                            { value: "moradia",    label: "👤 Pessoa física", desc: "Consumidor individual" },
                            { value: "investidor", label: "🏢 Empresa",     desc: "Pessoa jurídica" },
                          ],
                          infoprodutos: [
                            { value: "moradia",    label: "🌱 Iniciante",   desc: "Começando do zero" },
                            { value: "investidor", label: "📈 Avançado",    desc: "Já tem experiência" },
                            { value: "geral",      label: "👥 Todos",       desc: "Todos os níveis" },
                          ],
                          saude_estetica: [
                            { value: "moradia",    label: "💆 Bem-estar",   desc: "Saúde e qualidade de vida" },
                            { value: "investidor", label: "✨ Estética",    desc: "Procedimentos estéticos" },
                            { value: "geral",      label: "👥 Ambos",       desc: "Saúde e estética" },
                          ],
                          alimentacao: [
                            { value: "geral",      label: "🍔 Delivery",    desc: "Pede em casa" },
                            { value: "moradia",    label: "🪑 No local",    desc: "Come no restaurante" },
                            { value: "investidor", label: "🎉 Eventos",     desc: "Catering/encomendas" },
                          ],
                          moda_varejo: [
                            { value: "geral",      label: "👗 Consumidor",  desc: "Compra para si" },
                            { value: "moradia",    label: "🎁 Presente",    desc: "Compra para oferecer" },
                            { value: "investidor", label: "🏪 Revendedor",  desc: "Compra para revender" },
                          ],
                          b2b: [
                            { value: "moradia",    label: "🏢 PME",         desc: "Pequenas e médias empresas" },
                            { value: "investidor", label: "🏭 Enterprise",  desc: "Grandes empresas" },
                            { value: "geral",      label: "👥 Todos",       desc: "Todos os portes" },
                          ],
                        };
                        return profiles[segment] || [
                          { value: "geral",      label: "👥 Geral",       desc: "Público amplo" },
                          { value: "moradia",    label: "👤 Específico",  desc: "Perfil definido" },
                          { value: "investidor", label: "🎯 Avançado",    desc: "Alta intenção" },
                        ];
                      })().map(opt => (
                        <button key={opt.value}
                          onClick={() => setForm(f => ({ ...f, audienceProfile: opt.value as any }))}
                          style={{
                            flex: 1, padding: "10px 12px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                            border: `1px solid ${form.audienceProfile === opt.value ? "var(--green)" : "var(--border)"}`,
                            background: form.audienceProfile === opt.value ? "var(--green-l)" : "white",
                            color: form.audienceProfile === opt.value ? "var(--green-d)" : "var(--muted)",
                            cursor: "pointer",
                          }}>
                          <div>{opt.label}</div>
                          <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2 }}>{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 6: Match IA */}
              {step === 6 && (
                <div>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, color: "var(--black)", marginBottom: 6 }}>🧠 Intelligent Matching Engine</h2>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>A IA analisa seu perfil, nicho e objetivo para recomendar a configuração com maior chance de sucesso.</p>
                  {!matchResult && (
                    <div style={{ textAlign: "center", padding: "32px 0" }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
                      <p style={{ fontSize: 14, color: "var(--dark)", fontWeight: 600, marginBottom: 8 }}>Calcular score de compatibilidade</p>
                      <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 24 }}>O motor analisa nicho, objetivo, público, plataforma, budget e histórico para gerar um score 0–100.</p>
                      <button onClick={handleMatch} disabled={matching}
                        style={{ background: "linear-gradient(135deg,#1d4ed8,#7c3aed)", color: "white", fontWeight: 700, fontSize: 14, padding: "12px 28px", borderRadius: 12, border: "none", cursor: matching ? "wait" : "pointer", minWidth: 220 }}>
                        {matching ? "⏳ Calculando..." : "✨ Calcular Match Score"}
                      </button>
                    </div>
                  )}
                  {matchResult && (
                    <div>
                      <div style={{ background: "linear-gradient(135deg,#0f172a,#1e3a5f)", borderRadius: 14, padding: 20, marginBottom: 16, color: "white" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                          <div>
                            <p style={{ fontSize: 11, color: "rgba(255,255,255,.6)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>Plataforma recomendada</p>
                            <p style={{ fontSize: 16, fontWeight: 800 }}>{matchResult.recommended?.label}</p>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 42, fontWeight: 900, color: matchResult.recommended?.score >= 80 ? "#4ade80" : "#fbbf24", lineHeight: 1 }}>{matchResult.recommended?.score}</div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>/ 100</div>
                          </div>
                        </div>
                        <div style={{ background: "rgba(255,255,255,.15)", borderRadius: 6, height: 8, marginBottom: 12 }}>
                          <div style={{ background: matchResult.recommended?.score >= 80 ? "#4ade80" : "#fbbf24", borderRadius: 6, height: "100%", width: `${matchResult.recommended?.score}%` }} />
                        </div>
                        <p style={{ fontSize: 12, color: "rgba(255,255,255,.75)", lineHeight: 1.6 }}>{matchResult.reasoning}</p>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                        {[
                          { icon: "💡", label: "Ângulo criativo", value: matchResult.topAngle },
                          { icon: "🎬", label: "Tipo de criativo", value: matchResult.topCreativeType },
                          { icon: "👆", label: "CTA recomendado", value: matchResult.topCTA },
                          { icon: "👥", label: "Público ideal",   value: matchResult.audienceSummary },
                        ].map(item => (
                          <div key={item.label} style={{ background: "var(--off)", borderRadius: 10, padding: "12px 14px" }}>
                            <p style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>{item.icon} {item.label}</p>
                            <p style={{ fontSize: 12, color: "var(--dark)", lineHeight: 1.4 }}>{item.value}</p>
                          </div>
                        ))}
                      </div>
                      {matchResult.budgetTip && (
                        <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
                          <p style={{ fontSize: 12, color: "#92400e" }}>💰 {matchResult.budgetTip}</p>
                        </div>
                      )}
                      {matchResult.recommended?.insights?.map((ins: string, i: number) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                          <span style={{ color: "var(--green)", flexShrink: 0 }}>✓</span>
                          <p style={{ fontSize: 12, color: "var(--dark)" }}>{ins}</p>
                        </div>
                      ))}
                      {matchResult.recommended?.warnings?.map((w: string, i: number) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                          <span style={{ flexShrink: 0 }}>⚠️</span>
                          <p style={{ fontSize: 12, color: "#92400e" }}>{w}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Step 7: Confirmação */}
              {step === 7 && (
                <div>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, color: "var(--black)", marginBottom: 6 }}>Pronto para gerar</h2>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>Confirme os parâmetros e a IA vai criar sua estratégia completa.</p>

                  {!campaignCheck.allowed && (
                    <div style={{ background:"#fef3c7", border:"1px solid #fcd34d", borderRadius:12, padding:"14px 16px", marginBottom:16 }}>
                      <p style={{ fontSize:13, fontWeight:700, color:"#92400e", marginBottom:4 }}>⚠️ Limite do plano {planName}</p>
                      <p style={{ fontSize:12, color:"#b45309", marginBottom:8 }}>{campaignCheck.reason}</p>
                      <a href="/pricing" style={{ fontSize:12, fontWeight:700, color:"#d97706" }}>Fazer upgrade →</a>
                    </div>
                  )}
                  {matchResult && (
                    <div style={{ background: "var(--green-l)", border: "1px solid var(--green)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 20 }}>🎯</span>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--green-d)" }}>Match Score: {matchResult.recommended?.score}/100</p>
                        <p style={{ fontSize: 11, color: "var(--green-d)" }}>Configuração otimizada pelo Matching Engine</p>
                      </div>
                    </div>
                  )}
                  {[
                    ["Nome",       form.name || "—"],
                    ["Objetivo",   `${selectedObj?.icon} ${selectedObj?.label}`],
                    ["Plataforma", `${selectedPlat?.icon} ${selectedPlat?.label}`],
                    ["Orçamento",  `${selectedBudget?.label ?? `R$ ${form.budget.toLocaleString()}/mês`} (${selectedBudget?.tier ?? ""})`],
                    ["Duração",    `${form.duration} dias`],
                    ["Nicho",      currentNiche],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ fontSize: 13, color: "var(--muted)" }}>{k}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 20, background: "var(--navy)", borderRadius: 12, padding: 16 }}>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,.8)", lineHeight: 1.7 }}>🤖 A IA vai gerar: estratégia completa, conjuntos de anúncios, criativos, copies, funil de conversão e plano de execução.</p>
                  </div>
                </div>
              )}

              {/* Navegação */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
                {step > 1 ? <button className="btn btn-md btn-ghost" onClick={() => setStep(s => s - 1)}>← Voltar</button> : <div />}
                {step === 1
                  ? <button className="btn btn-md btn-primary" onClick={() => setStep(2)} disabled={!segment}>
                      {segment ? "Continuar →" : "Selecione um segmento"}
                    </button>
                  : step < 5
                  ? <button className="btn btn-md btn-primary" onClick={() => setStep(s => s + 1)}>Continuar →</button>
                  : step === 5
                  ? <button className="btn btn-md btn-primary" onClick={() => {
                      if (!form.name.trim()) { toast.error("Informe o nome da campanha antes de continuar."); return; }
                      setStep(6);
                    }}>Calcular Match →</button>
                  : step === 6
                  ? <button className="btn btn-md btn-primary" onClick={() => matchResult ? setStep(7) : handleMatch()} disabled={matching}>
                      {matching ? "⏳ Calculando..." : matchResult ? "Continuar →" : "Calcular Match →"}
                    </button>
                  : <button className="btn btn-md btn-green" onClick={handleGenerate} disabled={generating || !form.name.trim() || creationBlocked} style={{ minWidth: 200 }}>
                      {generating ? "⏳ Gerando campanha..." : creationBlocked ? "⚠️ Ajuste os pré-requisitos" : "✨ Gerar com IA"}
                    </button>
                }
              </div>
            </div>
          </div>

          {/* Sidebar: campanhas anteriores */}
          <div>
            <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", marginBottom: 14 }}>
                Campanhas geradas <span style={{ color: "var(--muted)", fontWeight: 400 }}>({campaigns?.length || 0})</span>
              </p>
              {!campaigns?.length ? (
                <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: "24px 0" }}>
                  Nenhuma campanha gerada ainda.
                </p>
              ) : (
                campaigns.map((c: any) => (
                  <div key={c.id}
                    onClick={() => setLocation(`/projects/${projectId}/campaign/result/${c.id}`)}
                    style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", marginBottom: 8, cursor: "pointer", transition: "all .15s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--green)"; e.currentTarget.style.background = "var(--green-l)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "white"; }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", marginBottom: 4 }}>{c.name}</p>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, background: "var(--green-xl)", color: "var(--green-dk)", fontWeight: 700, padding: "2px 8px", borderRadius: 4 }}>{c.objective}</span>
                      <span style={{ fontSize: 10, background: "#eff6ff", color: "#1e40af", fontWeight: 700, padding: "2px 8px", borderRadius: 4 }}>{c.platform}</span>
                    </div>
                    <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                      {c.generatedAt ? new Date(c.generatedAt).toLocaleDateString("pt-BR") : "—"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 24px; height: 24px; border-radius: 50%;
          background: var(--green); cursor: pointer;
          box-shadow: 0 2px 10px rgba(34,197,94,.5);
          border: 3px solid white; transition: transform .15s;
        }
        input[type=range]::-webkit-slider-thumb:hover { transform: scale(1.2); }
        input[type=range]::-moz-range-thumb {
          width: 24px; height: 24px; border-radius: 50%;
          background: var(--green); cursor: pointer;
          box-shadow: 0 2px 10px rgba(34,197,94,.5);
          border: 3px solid white;
        }
        input[type=range]:focus { outline: none; }
      `}</style>
    </Layout>
  );
}

