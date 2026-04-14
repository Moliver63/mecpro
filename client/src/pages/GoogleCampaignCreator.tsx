import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";

// ── constants ─────────────────────────────────────────────────────────────────
const CAMPAIGN_TYPES = [
  { value: "SEARCH",          label: "🔍 Search (texto)" },
  { value: "DISPLAY",         label: "🖼️ Display (banner)" },
  { value: "VIDEO",           label: "▶️ Video (YouTube)" },
  { value: "PERFORMANCE_MAX", label: "🚀 Performance Max" },
];

const BIDDING_STRATEGIES = [
  { value: "TARGET_CPA",            label: "CPA Alvo" },
  { value: "TARGET_ROAS",           label: "ROAS Alvo" },
  { value: "MAXIMIZE_CONVERSIONS",  label: "Maximizar Conversões" },
  { value: "MAXIMIZE_CLICKS",       label: "Maximizar Cliques" },
  { value: "MANUAL_CPC",            label: "CPC Manual" },
];

const DEVICES = [
  { value: "MOBILE",  label: "📱 Mobile"  },
  { value: "DESKTOP", label: "💻 Desktop" },
  { value: "TABLET",  label: "📟 Tablet"  },
];

const STEPS = ["Campanha", "Lances & Orçamento", "Segmentação", "Criativos", "Revisão & Publicar"];

interface GoogleAd { headlines: string[]; descriptions: string[]; finalUrl: string; }

interface FormState {
  campaignName: string;
  campaignType: string;
  biddingStrategy: string;
  targetCpa: string;
  targetRoas: string;
  dailyBudget: string;
  startDate: string;
  endDate: string;
  locations: string;
  languages: string;
  devices: string[];
  keywords: string;
  negativeKeywords: string;
  ads: GoogleAd[];
  publishingState: "idle" | "loading" | "success" | "error";
  // AI metadata
  aiFilledFrom?: string;
  strategy?: string;
  competitorInsights?: string;
}

function parseJsonSafe(s?: string | null): any {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}

/** Extract Google-relevant keywords from AI adSets audience descriptions */
function extractKeywordsFromAdSets(adSets: any[]): string[] {
  const kws: string[] = [];
  adSets.forEach(s => {
    if (s.audience) {
      // Extract quoted or capitalised terms as potential keywords
      const words = (s.audience as string)
        .replace(/[()[\]]/g, "")
        .split(/[,;–-]+/)
        .map((w: string) => w.trim())
        .filter((w: string) => w.length > 3 && w.length < 40);
      kws.push(...words.slice(0, 3));
    }
    if (s.name) kws.push(s.name);
  });
  return [...new Set(kws)].slice(0, 15);
}

/** Build responsive search ad from AI creatives */
function buildAdsFromCreatives(creatives: any[], finalUrl: string): GoogleAd[] {
  if (!Array.isArray(creatives) || creatives.length === 0) {
    return [{ headlines: ["", "", ""], descriptions: ["", ""], finalUrl }];
  }
  return creatives.slice(0, 3).map(cr => {
    // Headline principal — proposta de valor (máx 30 chars)
    const h1 = (cr.headline || cr.title || "").trim().slice(0, 30);

    // Hook como 2º headline — gancho de abertura (máx 30 chars)
    const hookRaw = (cr.hook || "").replace(/^["']|["']$/g, "").trim();
    const h2 = hookRaw.slice(0, 30) || (cr.cta || "Saiba Mais").slice(0, 30);

    // CTA como 3º headline (máx 30 chars)
    const ctaMap: Record<string, string> = {
      LEARN_MORE:       "Saiba Mais",
      SIGN_UP:          "Cadastre-se",
      CONTACT_US:       "Fale Conosco",
      APPLY_NOW:        "Solicite Agora",
      GET_QUOTE:        "Peça Orçamento",
      BOOK_NOW:         "Agende Agora",
      SHOP_NOW:         "Compre Agora",
      WHATSAPP_MESSAGE: "WhatsApp",
      CALL_NOW:         "Ligue Agora",
    };
    const ctaLabel = ctaMap[(cr.cta || "").toUpperCase()] || cr.cta || "Saiba Mais";
    const h3 = ctaLabel.slice(0, 30);

    // Copy principal — argumentação (máx 90 chars)
    const copyFull = (cr.copy || cr.description || "").trim();
    const d1 = copyFull.slice(0, 90) || h1;

    // 2ª description — CTA como frase (máx 90 chars)
    const d2 = hookRaw
      ? hookRaw.slice(0, 90)
      : `${ctaLabel} e descubra como podemos ajudar.`.slice(0, 90);

    return {
      headlines:    [h1, h2, h3].map(h => h.slice(0, 30)).filter(Boolean),
      descriptions: [d1, d2].map(d => d.slice(0, 90)).filter(Boolean),
      finalUrl,
    };
  });
}

/** Map campaign objective to Google bidding strategy */
function objectiveToBidding(objective?: string): string {
  const map: Record<string, string> = {
    leads:       "TARGET_CPA",
    sales:       "TARGET_ROAS",
    traffic:     "MAXIMIZE_CLICKS",
    awareness:   "MAXIMIZE_CLICKS",
    engagement:  "MAXIMIZE_CLICKS",
    branding:    "MAXIMIZE_CLICKS",
  };
  return map[objective?.toLowerCase() || ""] || "MAXIMIZE_CONVERSIONS";
}

export default function GoogleCampaignCreator() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string; campaignId?: string }>();
  const projectId  = params.id       ? Number(params.id)       : undefined;
  const campaignId = params.campaignId ? Number(params.campaignId) : undefined;

  const [step, setStep] = useState(0);
  const [aiFilled, setAiFilled] = useState(false);

  const [form, setForm] = useState<FormState>({
    campaignName:    "",
    campaignType:    "SEARCH",
    biddingStrategy: "MAXIMIZE_CONVERSIONS",
    targetCpa:       "",
    targetRoas:      "",
    dailyBudget:     "50",
    startDate:       new Date().toISOString().split("T")[0],
    endDate:         "",
    locations:       "BR",
    languages:       "pt",
    devices:         ["MOBILE", "DESKTOP"],
    keywords:        "",
    negativeKeywords:"",
    ads:             [{ headlines: ["", "", ""], descriptions: ["", ""], finalUrl: "" }],
    publishingState: "idle",
  });

  // ── Load AI campaign data ────────────────────────────────────────────────
  const { data: campaign } = trpc.campaigns.get.useQuery(
    { id: campaignId! },
    { enabled: !!campaignId, retry: false }
  );

  const { data: clientProfile } = trpc.clientProfile.get.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId, retry: false }
  );

  const { data: marketAnalysis } = trpc.marketAnalysis.get.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId, retry: false }
  );

  // ── Auto-fill form from AI data ──────────────────────────────────────────
  useEffect(() => {
    if (!campaign || aiFilled) return;

    const c      = campaign as any;
    const extra  = parseJsonSafe(c.aiResponse);
    const adSets = parseJsonSafe(c.adSets);
    const crs    = parseJsonSafe(c.creatives);

    const suggestedName = extra?.campaignName || c.name || "";
    const kws = adSets ? extractKeywordsFromAdSets(Array.isArray(adSets) ? adSets : [adSets]) : [];
    const websiteUrl    = (clientProfile as any)?.websiteUrl || "";
    const ads           = buildAdsFromCreatives(Array.isArray(crs) ? crs : [], websiteUrl);
    const dailyBudget   = c.suggestedBudgetDaily
      ? String(c.suggestedBudgetDaily)
      : String(Math.round((c.suggestedBudgetMonthly || 1500) / 30));

    setForm(f => ({
      ...f,
      campaignName:    suggestedName,
      campaignType:    "SEARCH",
      biddingStrategy: objectiveToBidding(c.objective),
      dailyBudget,
      keywords:        kws.join("\n"),
      ads,
      strategy:        c.strategy || "",
      competitorInsights: [
        marketAnalysis ? `🎯 Posicionamento: ${(marketAnalysis as any).suggestedPositioning || ""}` : "",
        marketAnalysis ? `⚡ Gaps: ${(marketAnalysis as any).competitiveGaps || ""}` : "",
        marketAnalysis ? `💡 Oportunidades: ${(marketAnalysis as any).unexploredOpportunities || ""}` : "",
      ].filter(Boolean).join("\n"),
      aiFilledFrom: suggestedName,
    }));
    setAiFilled(true);
    toast.success("🤖 Campanha pré-preenchida com dados da IA!");
  }, [campaign, clientProfile, marketAnalysis, aiFilled]);

  // ── Publish mutation ─────────────────────────────────────────────────────
  const publishMutation = trpc.campaigns.publishToGoogle.useMutation({
    onSuccess: (d: any) => {
      toast.success(`✅ Campanha criada! Google ID: ${d.googleCampaignId}`);
      setForm(f => ({ ...f, publishingState: "success" }));
    },
    onError: (e) => {
      toast.error("Erro ao publicar: " + e.message);
      setForm(f => ({ ...f, publishingState: "error" }));
    },
  });

  const set = (k: keyof FormState, v: any) => setForm(f => ({ ...f, [k]: v }));
  const toggleDevice = (d: string) =>
    set("devices", form.devices.includes(d)
      ? form.devices.filter(x => x !== d)
      : [...form.devices, d]);
  const setHeadline = (ai: number, hi: number, val: string) => {
    const ads = [...form.ads]; ads[ai].headlines[hi] = val; set("ads", ads);
  };
  const setDesc = (ai: number, di: number, val: string) => {
    const ads = [...form.ads]; ads[ai].descriptions[di] = val; set("ads", ads);
  };
  const setAdUrl = (i: number, val: string) => {
    const ads = [...form.ads]; ads[i].finalUrl = val; set("ads", ads);
  };

  const handlePublish = () => {
    if (!form.campaignName.trim()) { toast.error("Nome da campanha obrigatório"); return; }
    if (!form.dailyBudget || Number(form.dailyBudget) <= 0) { toast.error("Orçamento diário obrigatório"); return; }
    if (!form.startDate)  { toast.error("Data de início obrigatória"); return; }

    if (form.campaignType !== "SEARCH") {
      toast.error("No momento esta publicação do Google está validada apenas para Search. Para Display, Video e Performance Max precisamos anexar assets visuais dedicados antes do publish.");
      return;
    }

    // Valida ads — headline e finalUrl obrigatórios
    for (let i = 0; i < form.ads.length; i++) {
      const ad = form.ads[i];
      const headlines = ad.headlines.filter((h: string) => h.trim());
      if (headlines.length < 1) { toast.error(`Anúncio ${i + 1}: informe ao menos 1 headline`); return; }
      if (!ad.finalUrl?.trim()) { toast.error(`Anúncio ${i + 1}: URL de destino obrigatória`); return; }
      if (!ad.finalUrl.startsWith("http")) { toast.error(`Anúncio ${i + 1}: URL deve começar com https://`); return; }
    }

    // Bug 4 fix: campaignId e projectId inválidos
    if (!campaignId || campaignId <= 0) { toast.error("Campanha inválida. Volte e gere a campanha novamente."); return; }
    if (!projectId  || projectId  <= 0) { toast.error("Projeto inválido."); return; }

    set("publishingState", "loading");
    publishMutation.mutate({
      campaignId:          campaignId,
      projectId:           projectId,
      campaignName:        form.campaignName,
      campaignType:        form.campaignType,
      biddingStrategy:     form.biddingStrategy,
      targetCpa:           form.targetCpa  ? Number(form.targetCpa)  : undefined,
      targetRoas:          form.targetRoas ? Number(form.targetRoas) : undefined,
      dailyBudgetMicros:   Math.round(Number(form.dailyBudget) * 1_000_000),
      startDate:           form.startDate.replace(/-/g, ""),
      endDate:             form.endDate ? form.endDate.replace(/-/g, "") : undefined,
      locations:           form.locations.split(",").map(s => s.trim()),
      languages:           form.languages.split(",").map(s => s.trim()),
      devices:             form.devices,
      keywords:            form.keywords.split("\n").map(s => s.trim()).filter(Boolean),
      negativeKeywords:    form.negativeKeywords.split("\n").map(s => s.trim()).filter(Boolean),
      ads:                 form.ads,
    });
  };

  // ── styles ────────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 14px", border: "1.5px solid #e2e8f0",
    borderRadius: 10, fontSize: 14, outline: "none", marginBottom: 12,
    background: "#f8fafc", boxSizing: "border-box",
  };
  const btn = (bg: string, col = "#fff"): React.CSSProperties => ({
    padding: "10px 22px", borderRadius: 10, border: "none", cursor: "pointer",
    background: bg, color: col, fontWeight: 700, fontSize: 14,
  });

  // ── step renderer ─────────────────────────────────────────────────────────
  const renderStep = () => {
    if (step === 0) return (
      <div>
        {aiFilled && (
          <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe",
            borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 12 }}>
            🤖 <strong>Pré-preenchido pela IA</strong> com base na campanha "{form.aiFilledFrom}"
          </div>
        )}
        <label style={{ fontSize: 12, fontWeight: 600 }}>Nome da Campanha *</label>
        <input style={inp} value={form.campaignName}
          onChange={e => set("campaignName", e.target.value)} />
        <label style={{ fontSize: 12, fontWeight: 600 }}>Tipo de Campanha</label>
        <select style={inp} value={form.campaignType}
          onChange={e => set("campaignType", e.target.value)}>
          {CAMPAIGN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {form.campaignType !== "SEARCH" && (
          <div style={{ background: "#fff7ed", border: "1.5px solid #fdba74", borderRadius: 10, padding: 12, marginTop: 4, marginBottom: 12, fontSize: 12, lineHeight: 1.7, color: "#9a3412" }}>
            <strong>⚠️ Ajuste de integração:</strong> o publish desta tela está homologado para <strong>Google Search</strong>. Para Display, Video e Performance Max ainda falta o fluxo dedicado de image assets (ex.: 1:1 e 1.91:1), então o envio é bloqueado para evitar publicar criativos no lugar errado.
          </div>
        )}
        {form.strategy && (
          <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0",
            borderRadius: 10, padding: 12, marginTop: 4, fontSize: 12, lineHeight: 1.7 }}>
            <strong>🧠 Estratégia da IA:</strong>
            <p style={{ margin: "6px 0 0", color: "#374151" }}>{form.strategy.slice(0, 400)}…</p>
          </div>
        )}
      </div>
    );

    if (step === 1) return (
      <div>
        <label style={{ fontSize: 12, fontWeight: 600 }}>Estratégia de Lance</label>
        <select style={inp} value={form.biddingStrategy}
          onChange={e => set("biddingStrategy", e.target.value)}>
          {BIDDING_STRATEGIES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
        {form.biddingStrategy === "TARGET_CPA" && (
          <><label style={{ fontSize: 12, fontWeight: 600 }}>CPA Alvo (R$)</label>
          <input style={inp} type="number" value={form.targetCpa}
            onChange={e => set("targetCpa", e.target.value)} /></>
        )}
        {form.biddingStrategy === "TARGET_ROAS" && (
          <><label style={{ fontSize: 12, fontWeight: 600 }}>ROAS Alvo</label>
          <input style={inp} type="number" step="0.1" value={form.targetRoas}
            onChange={e => set("targetRoas", e.target.value)} /></>
        )}
        <label style={{ fontSize: 12, fontWeight: 600 }}>
          Orçamento Diário (R$) *
          {aiFilled && <span style={{ color: "#1a73e8", marginLeft: 8, fontSize: 11 }}>
            💡 Sugerido pela IA: R$ {form.dailyBudget}/dia
          </span>}
        </label>
        <input style={inp} type="number" value={form.dailyBudget}
          onChange={e => set("dailyBudget", e.target.value)} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Data início</label>
            <input style={inp} type="date" value={form.startDate}
              onChange={e => set("startDate", e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Data fim</label>
            <input style={inp} type="date" value={form.endDate}
              onChange={e => set("endDate", e.target.value)} />
          </div>
        </div>
      </div>
    );

    if (step === 2) return (
      <div>
        <label style={{ fontSize: 12, fontWeight: 600 }}>Países</label>
        <input style={inp} placeholder="BR" value={form.locations}
          onChange={e => set("locations", e.target.value)} />
        <label style={{ fontSize: 12, fontWeight: 600 }}>Idiomas</label>
        <input style={inp} placeholder="pt" value={form.languages}
          onChange={e => set("languages", e.target.value)} />
        <label style={{ fontSize: 12, fontWeight: 600 }}>Dispositivos</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {DEVICES.map(d => (
            <button key={d.value} onClick={() => toggleDevice(d.value)}
              style={btn(form.devices.includes(d.value) ? "#1a73e8" : "#f1f5f9",
                         form.devices.includes(d.value) ? "#fff" : "#374151")}>
              {d.label}
            </button>
          ))}
        </div>
        {form.campaignType === "SEARCH" && (
          <>
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              Palavras-chave (uma por linha)
              {aiFilled && <span style={{ color: "#1a73e8", marginLeft: 8, fontSize: 11 }}>🤖 Geradas pela IA</span>}
            </label>
            <textarea style={{ ...inp, height: 120 } as React.CSSProperties}
              value={form.keywords} onChange={e => set("keywords", e.target.value)} />
            <label style={{ fontSize: 12, fontWeight: 600 }}>Palavras-chave negativas</label>
            <textarea style={{ ...inp, height: 60 } as React.CSSProperties}
              value={form.negativeKeywords}
              onChange={e => set("negativeKeywords", e.target.value)} />
          </>
        )}
        {form.competitorInsights && (
          <div style={{ background: "#fefce8", border: "1.5px solid #fde68a",
            borderRadius: 10, padding: 12, fontSize: 12, lineHeight: 1.7 }}>
            <strong>🔍 Inteligência Competitiva:</strong>
            <pre style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", color: "#374151" }}>
              {form.competitorInsights}
            </pre>
          </div>
        )}
      </div>
    );

    if (step === 3) return (
      <div>
        {aiFilled && (
          <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe",
            borderRadius: 10, padding: 10, marginBottom: 12, fontSize: 11 }}>
            🤖 Títulos e descrições gerados automaticamente a partir dos criativos da IA. Edite livremente.
          </div>
        )}
        {form.ads.map((ad, i) => (
          <div key={i} style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0",
            borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <p style={{ fontWeight: 700, fontSize: 14, margin: "0 0 10px" }}>
              Anúncio {i + 1}
              {i < (parseJsonSafe((campaign as any)?.creatives) || []).length && (
                <span style={{ marginLeft: 8, fontSize: 10, background: "#eff6ff",
                  color: "#1e40af", padding: "2px 6px", borderRadius: 4 }}>🤖 IA</span>
              )}
            </p>
            {ad.headlines.map((h, hi) => (
              <div key={hi}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>
                  Título {hi + 1} — {h.length}/30
                </label>
                <input style={inp} maxLength={30} value={h}
                  onChange={e => setHeadline(i, hi, e.target.value)} />
              </div>
            ))}
            {ad.descriptions.map((d, di) => (
              <div key={di}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>
                  Descrição {di + 1} — {d.length}/90
                </label>
                <input style={inp} maxLength={90} value={d}
                  onChange={e => setDesc(i, di, e.target.value)} />
              </div>
            ))}
            <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>URL Final *</label>
            <input style={inp} placeholder="https://seusite.com.br"
              value={ad.finalUrl} onChange={e => setAdUrl(i, e.target.value)} />
          </div>
        ))}
        <button style={btn("#f1f5f9", "#374151")} onClick={() =>
          set("ads", [...form.ads, { headlines: ["", "", ""], descriptions: ["", ""], finalUrl: "" }])}>
          + Adicionar anúncio
        </button>
      </div>
    );

    if (step === 4) return (
      <div>
        <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe",
          borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 800 }}>📋 Revisão</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
            <div><strong>Nome:</strong> {form.campaignName}</div>
            <div><strong>Tipo:</strong> {form.campaignType}</div>
            <div><strong>Lance:</strong> {form.biddingStrategy}</div>
            <div><strong>Orçamento:</strong> R$ {form.dailyBudget}/dia</div>
            <div><strong>Início:</strong> {form.startDate}</div>
            <div><strong>País:</strong> {form.locations}</div>
            <div><strong>Dispositivos:</strong> {form.devices.join(", ")}</div>
            <div><strong>Anúncios:</strong> {form.ads.length}</div>
            <div><strong>Keywords:</strong> {form.keywords.split("\n").filter(Boolean).length} termos</div>
            <div><strong>Fonte:</strong> {aiFilled ? "🤖 IA + Concorrentes" : "✍️ Manual"}</div>
          </div>
        </div>
        {form.publishingState === "success" ? (
          <div style={{ background: "#dcfce7", border: "1.5px solid #86efac",
            borderRadius: 14, padding: 20, textAlign: "center" }}>
            <p style={{ fontSize: 28 }}>🎉</p>
            <p style={{ fontWeight: 800, fontSize: 16 }}>Campanha publicada no Google Ads!</p>
            <button style={{ ...btn("#1a73e8"), marginTop: 12 }}
              onClick={() => setLocation(`/projects/${projectId}/campaign/result/${campaignId}`)}>
              Voltar ao resultado
            </button>
          </div>
        ) : (
          <button style={{ ...btn("#1a73e8"), width: "100%", padding: 14, fontSize: 15 }}
            disabled={form.publishingState === "loading"} onClick={handlePublish}>
            {form.publishingState === "loading" ? "⏳ Publicando…" : "🚀 Publicar no Google Ads"}
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button onClick={() => setLocation(-1 as any)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22 }}>←</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🔵 Google Ads Creator</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
            {aiFilled
              ? "✅ Pré-preenchido com dados da IA e inteligência competitiva"
              : campaignId ? `Carregando campanha #${campaignId}…` : "Nova campanha manual"}
          </p>
        </div>
      </div>

      {/* Step bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 28 }}>
        {STEPS.map((s, i) => (
          <div key={i} onClick={() => i < step && setStep(i)} style={{
            flex: 1, padding: "8px 4px", textAlign: "center" as const,
            borderRadius: 8, fontSize: 11, fontWeight: 700,
            cursor: i < step ? "pointer" : "default",
            background: i === step ? "#1a73e8" : i < step ? "#dcfce7" : "#f1f5f9",
            color:      i === step ? "#fff"     : i < step ? "#166534" : "#94a3b8",
          }}>{s}</div>
        ))}
      </div>

      <div style={{ background: "#fff", border: "1.5px solid #e2e8f0",
        borderRadius: 16, padding: 24, minHeight: 260 }}>
        {renderStep()}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
        <button style={btn("#f1f5f9", "#374151")} disabled={step === 0}
          onClick={() => setStep(s => s - 1)}>← Anterior</button>
        {step < STEPS.length - 1 && (
          <button style={btn("#1a73e8")} onClick={() => setStep(s => s + 1)}>
            Próximo →
          </button>
        )}
      </div>
    </div>
  );
}
