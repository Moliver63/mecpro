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
  {
    value: "imoveis_venda",
    label: "Imóveis — Venda",
    icon: "🏠",
    desc: "Apartamentos, casas, terrenos à venda",
    config: { objective: "leads", platform: "meta", budget: 3000, duration: 30,
      extraContext: "Segmento: Imóveis para venda. Use linguagem premium, destaque localização, m², diferenciais e condições de pagamento. CTA: Agendar visita ou Falar com corretor. Formato ideal: carrossel com fotos do imóvel. Considere TikTok para vídeos tour do imóvel." }
  },
  {
    value: "imoveis_locacao",
    label: "Imóveis — Locação",
    icon: "🔑",
    desc: "Apartamentos, casas, salas para alugar",
    config: { objective: "leads", platform: "meta", budget: 1500, duration: 14,
      extraContext: "Segmento: Imóveis para locação. Destaque valor do aluguel, localização, disponibilidade imediata. CTA: Ver disponibilidade ou Agendar visita. Formato ideal: carrossel com fotos do imóvel." }
  },
  {
    value: "ecommerce",
    label: "E-commerce",
    icon: "🛒",
    desc: "Loja virtual, produtos físicos",
    config: { objective: "sales", platform: "meta", budget: 3000, duration: 30,
      extraContext: "Segmento: E-commerce. Foque em produto, preço, frete grátis e prazo de entrega. Use urgência e escassez. CTA: Comprar agora ou Ver oferta. Formato carrossel para múltiplos produtos." }
  },
  {
    value: "servicos_locais",
    label: "Serviços Locais",
    icon: "📍",
    desc: "Clínicas, salões, restaurantes, oficinas",
    config: { objective: "leads", platform: "meta", budget: 1500, duration: 30,
      extraContext: "Segmento: Serviços locais. Destaque localização, horários, diferenciais e avaliações. CTA: Agendar ou Ligar agora. Use raio de segmentação geográfica." }
  },
  {
    value: "infoprodutos",
    label: "Infoprodutos / Cursos",
    icon: "🎓",
    desc: "Cursos online, mentorias, ebooks",
    config: { objective: "leads", platform: "meta", budget: 2000, duration: 14,
      extraContext: "Segmento: Infoprodutos. Use gatilhos de transformação, depoimentos e escassez. CTA: Garantir vaga ou Quero me inscrever. Foque na transformação que o aluno terá." }
  },
  {
    value: "saude_estetica",
    label: "Saúde & Estética",
    icon: "💆",
    desc: "Clínicas, procedimentos, bem-estar",
    config: { objective: "leads", platform: "meta", budget: 2000, duration: 30,
      extraContext: "Segmento: Saúde e estética. Destaque resultados (sem claims médicos proibidos), profissionais, estrutura. CTA: Agendar consulta ou Avaliar. Evite before/after. Use linguagem acolhedora." }
  },
  {
    value: "alimentacao",
    label: "Alimentação & Delivery",
    icon: "🍔",
    desc: "Restaurantes, lanchonetes, delivery",
    config: { objective: "traffic", platform: "meta", budget: 1000, duration: 14,
      extraContext: "Segmento: Alimentação. Mostre o produto com apelo visual. Destaque sabor, ingredientes, velocidade de entrega. CTA: Pedir agora ou Ver cardápio. Publique nos horários de pico de fome." }
  },
  {
    value: "moda_varejo",
    label: "Moda & Varejo",
    icon: "👗",
    desc: "Roupas, calçados, acessórios",
    config: { objective: "sales", platform: "meta", budget: 2000, duration: 14,
      extraContext: "Segmento: Moda e varejo. Use fotos de produto em uso (lifestyle). Destaque estilo, ocasião e preço. CTA: Comprar ou Ver coleção. Carrossel para mostrar múltiplas peças." }
  },
  {
    value: "b2b",
    label: "B2B / Empresas",
    icon: "🏢",
    desc: "Soluções para empresas, SaaS, serviços",
    config: { objective: "leads", platform: "both", budget: 3000, duration: 30,
      extraContext: "Segmento: B2B. Use linguagem técnica e ROI. Destaque cases, economia de tempo/custo, integrações. CTA: Falar com especialista ou Solicitar demo. Google Ads para captura de demanda ativa." }
  },
  {
    value: "outro",
    label: "Outro segmento",
    icon: "✏️",
    desc: "Configurar manualmente",
    config: { objective: "leads", platform: "meta", budget: 1500, duration: 30, extraContext: "" }
  },
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

                  {/* ── AJUSTE 1: Região de atuação ── */}
                  <div style={{ marginTop: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>
                      📍 Região de atuação
                      <span style={{ fontWeight: 400, color: "var(--muted)", marginLeft: 6 }}>(deixe vazio para Brasil todo)</span>
                    </label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                      {["SC","SP","RJ","MG","PR","RS","BA","GO","DF","PE"].map(uf => (
                        <button key={uf}
                          onClick={() => setForm(f => ({
                            ...f,
                            regions: f.regions.includes(uf)
                              ? f.regions.filter(r => r !== uf)
                              : [...f.regions, uf],
                          }))}
                          style={{
                            padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
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
                        ✅ Segmentando para: {form.regions.join(", ")}
                      </p>
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

                  {/* ── AJUSTE 4: Perfil do público (funil) ── */}
                  <div style={{ marginTop: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>
                      🎯 Perfil do público
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[
                        { value: "moradia",    label: "🏠 Moradia",    desc: "Comprar para morar" },
                        { value: "investidor", label: "💰 Investidor", desc: "Renda passiva/aluguel" },
                        { value: "geral",      label: "👥 Geral",      desc: "Ambos os perfis" },
                      ].map(opt => (
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

