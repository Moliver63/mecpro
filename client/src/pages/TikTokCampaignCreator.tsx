import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";

const OBJECTIVES = [
  { value: "REACH",         label: "📢 Alcance" },
  { value: "TRAFFIC",       label: "🚦 Tráfego" },
  { value: "VIDEO_VIEWS",   label: "▶️ Visualizações de vídeo" },
  { value: "LEAD_GENERATION", label: "📋 Geração de leads" },
  { value: "APP_PROMOTION", label: "📱 Promoção de app" },
  { value: "CONVERSIONS",   label: "💰 Conversões" },
  { value: "PRODUCT_SALES", label: "🛒 Vendas de produto" },
];

const PLACEMENTS = [
  { value: "PLACEMENT_TIKTOK",      label: "TikTok Feed" },
  { value: "PLACEMENT_TOPVIEW",     label: "TopView" },
  { value: "PLACEMENT_BRAND_TAKEOVER", label: "Brand Takeover" },
];

const GENDERS = [
  { value: "ALL",    label: "Todos" },
  { value: "MALE",   label: "Masculino" },
  { value: "FEMALE", label: "Feminino" },
];

const STEPS = ["Campanha", "Orçamento", "Público", "Criativos", "Revisão & Publicar"];

function parseJsonSafe(s?: string | null): any {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}

function objectiveToTikTok(objective?: string): string {
  const map: Record<string, string> = {
    leads: "LEAD_GENERATION", sales: "CONVERSIONS",
    traffic: "TRAFFIC", awareness: "REACH", engagement: "VIDEO_VIEWS",
  };
  return map[objective?.toLowerCase() || ""] || "TRAFFIC";
}

interface TikTokAd {
  videoUrl: string;
  coverImageUrl: string;
  adText: string;
  callToAction: string;
  landingPageUrl: string;
}

interface FormState {
  campaignName: string;
  objective: string;
  budgetType: "DAILY" | "LIFETIME";
  budget: string;
  startDate: string;
  endDate: string;
  placements: string[];
  ageMin: number;
  ageMax: number;
  gender: string;
  locations: string[];
  interests: string;
  ads: TikTokAd[];
  publishingState: "idle" | "loading" | "success" | "error";
  aiFilledFrom?: string;
  strategy?: string;
}

export default function TikTokCampaignCreator() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string; campaignId?: string }>();
  const projectId  = params.id       ? Number(params.id)       : undefined;
  const campaignId = params.campaignId ? Number(params.campaignId) : undefined;

  const [step, setStep]       = useState(0);
  const [aiFilled, setAiFilled] = useState(false);

  const [form, setForm] = useState<FormState>({
    campaignName: "",
    objective:    "TRAFFIC",
    budgetType:   "DAILY",
    budget:       "50",
    startDate:    new Date().toISOString().split("T")[0],
    endDate:      "",
    placements:   ["PLACEMENT_TIKTOK"],
    ageMin:       18,
    ageMax:       45,
    gender:       "ALL",
    locations:    ["BR"],
    interests:    "",
    ads:          [{ videoUrl: "", coverImageUrl: "", adText: "", callToAction: "SHOP_NOW", landingPageUrl: "" }],
    publishingState: "idle",
  });

  // ── Load AI campaign data ────────────────────────────────────────────────
  const { data: campaign } = trpc.campaigns.get.useQuery(
    { id: campaignId! }, { enabled: !!campaignId, retry: false }
  );
  const { data: clientProfile } = trpc.clientProfile.get.useQuery(
    { projectId: projectId! }, { enabled: !!projectId, retry: false }
  );

  useEffect(() => {
    if (!campaign || aiFilled) return;
    const c      = campaign as any;
    const extra  = parseJsonSafe(c.aiResponse);
    const crs    = parseJsonSafe(c.creatives);

    const websiteUrl = (clientProfile as any)?.websiteUrl || "";
    const ads = Array.isArray(crs) && crs.length > 0
      ? crs.slice(0, 3).map((cr: any) => {
          // TikTok adText: hook + copy — os primeiros segundos são cruciais
          const hookClean = (cr.hook || "").replace(/^["']|["']$/g, "").trim();
          const copyRaw   = (cr.copy || cr.description || "").trim();
          const headline  = (cr.headline || "").trim();

          // Monta o texto do anúncio TikTok: hook impactante + copy direto
          // TikTok limita a 100 chars no adText
          let adText = "";
          if (hookClean && copyRaw) {
            // Hook curto + copy: "Dívidas te impedindo? Descubra como sair do vermelho."
            const hookShort = hookClean.slice(0, 40).replace(/\?$/, "") + "?";
            adText = `${hookShort} ${copyRaw}`.slice(0, 100);
          } else if (hookClean) {
            adText = hookClean.slice(0, 100);
          } else if (copyRaw) {
            adText = copyRaw.slice(0, 100);
          } else {
            adText = headline.slice(0, 100);
          }

          // CTA TikTok válidos
          const tiktokCtas: Record<string, string> = {
            LEARN_MORE:       "LEARN_MORE",
            SIGN_UP:          "SIGN_UP",
            CONTACT_US:       "CONTACT_US",
            APPLY_NOW:        "APPLY_NOW",
            GET_QUOTE:        "GET_QUOTE",
            BOOK_NOW:         "BOOK_NOW",
            SHOP_NOW:         "SHOP_NOW",
            DOWNLOAD:         "DOWNLOAD",
            WHATSAPP_MESSAGE: "CONTACT_US",
            CALL_NOW:         "CONTACT_US",
          };
          const ctaKey = (cr.cta || "").toUpperCase().replace(/[^A-Z0-9_]/g, "_");
          const callToAction = tiktokCtas[ctaKey] || "LEARN_MORE";

          return {
            videoUrl:       "",
            coverImageUrl:  "",
            adText:         adText.trim(),
            callToAction,
            landingPageUrl: websiteUrl,
          };
        })
      : form.ads;

    const dailyBudget = c.suggestedBudgetDaily
      ? String(c.suggestedBudgetDaily)
      : String(Math.round((c.suggestedBudgetMonthly || 1500) / 30));

    setForm(f => ({
      ...f,
      campaignName: extra?.campaignName || c.name || "",
      objective:    objectiveToTikTok(c.objective),
      budget:       dailyBudget,
      ads,
      strategy:     c.strategy || "",
      aiFilledFrom: extra?.campaignName || c.name || "",
    }));
    setAiFilled(true);
    toast.success("🤖 Campanha TikTok pré-preenchida pela IA!");
  }, [campaign, clientProfile, aiFilled]);

  const publishMutation = trpc.campaigns.publishToTikTok.useMutation({
    onSuccess: (d: any) => {
      toast.success(`◎ Campanha TikTok criada! ID: ${d.tiktokCampaignId}`);
      setForm(f => ({ ...f, publishingState: "success" }));
    },
    onError: (e) => {
      toast.error("Erro: " + e.message);
      setForm(f => ({ ...f, publishingState: "error" }));
    },
  });

  const set = (k: keyof FormState, v: any) => setForm(f => ({ ...f, [k]: v }));
  const togglePlacement = (p: string) =>
    set("placements", form.placements.includes(p)
      ? form.placements.filter(x => x !== p)
      : [...form.placements, p]);
  const setAd = (i: number, k: keyof TikTokAd, v: string) => {
    const ads = [...form.ads]; (ads[i] as any)[k] = v; set("ads", ads);
  };

  const handlePublish = () => {
    if (!form.campaignName.trim()) { toast.error("Nome da campanha obrigatório"); return; }
    if (!campaignId || campaignId <= 0) { toast.error("Campanha inválida. Volte e gere a campanha novamente."); return; }
    if (!projectId  || projectId  <= 0) { toast.error("Projeto inválido."); return; }
    if (!form.budget || Number(form.budget) <= 0) { toast.error("Orçamento diário obrigatório"); return; }
    if (form.ads.length === 0) { toast.error("Adicione ao menos um anúncio"); return; }
    for (let i = 0; i < form.ads.length; i++) {
      const ad = form.ads[i];
      if (!ad.adText?.trim()) { toast.error(`Anúncio ${i + 1}: texto do anúncio obrigatório`); return; }
      if (!ad.videoUrl?.trim()) { toast.error(`Anúncio ${i + 1}: informe o vídeo principal ou o video_id do TikTok.`); return; }
      if (!ad.landingPageUrl?.trim()) { toast.error(`Anúncio ${i + 1}: URL de destino obrigatória`); return; }
      if (!ad.landingPageUrl.startsWith("http")) { toast.error(`Anúncio ${i + 1}: URL deve começar com https://`); return; }
    }
    if (!form.budget)       { toast.error("Orçamento obrigatório"); return; }
    set("publishingState", "loading");
    publishMutation.mutate({
      campaignId:  campaignId || 0,
      projectId:   projectId  || 0,
      campaignName: form.campaignName,
      objective:   form.objective,
      budgetType:  form.budgetType,
      budget:      Number(form.budget),
      startDate:   form.startDate.replace(/-/g, ""),
      endDate:     form.endDate ? form.endDate.replace(/-/g, "") : undefined,
      placements:  form.placements,
      ageMin:      form.ageMin,
      ageMax:      form.ageMax,
      gender:      form.gender,
      locations:   form.locations,
      interests:   form.interests.split(",").map(s => s.trim()).filter(Boolean),
      ads:         form.ads,
    });
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 14px", border: "1.5px solid #e2e8f0",
    borderRadius: 10, fontSize: 14, outline: "none", marginBottom: 12,
    background: "#f8fafc", boxSizing: "border-box",
  };
  const btn = (bg: string, col = "#fff"): React.CSSProperties => ({
    padding: "10px 18px", borderRadius: 10, border: "none", cursor: "pointer",
    background: bg, color: col, fontWeight: 700, fontSize: 13,
  });

  const renderStep = () => {
    if (step === 0) return (
      <div>
        {aiFilled && (
          <div style={{ background: "#fafafa", border: "1.5px solid #e2e8f0",
            borderRadius: 10, padding: 10, marginBottom: 14, fontSize: 12 }}>
            🤖 Pré-preenchido da campanha "{form.aiFilledFrom}"
          </div>
        )}
        <label style={{ fontSize: 12, fontWeight: 600 }}>Nome da Campanha *</label>
        <input style={inp} value={form.campaignName}
          onChange={e => set("campaignName", e.target.value)} />
        <label style={{ fontSize: 12, fontWeight: 600 }}>Objetivo</label>
        <select style={inp} value={form.objective}
          onChange={e => set("objective", e.target.value)}>
          {OBJECTIVES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {form.strategy && (
          <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0",
            borderRadius: 10, padding: 10, fontSize: 12 }}>
            <strong>🧠 Estratégia IA:</strong>
            <p style={{ margin: "4px 0 0", color: "#374151" }}>{form.strategy.slice(0, 300)}…</p>
          </div>
        )}
      </div>
    );

    if (step === 1) return (
      <div>
        <label style={{ fontSize: 12, fontWeight: 600 }}>Tipo de Orçamento</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {(["DAILY", "LIFETIME"] as const).map(t => (
            <button key={t} style={btn(form.budgetType === t ? "#010101" : "#f1f5f9",
              form.budgetType === t ? "#fff" : "#374151")}
              onClick={() => set("budgetType", t)}>
              {t === "DAILY" ? "Diário" : "Total"}
            </button>
          ))}
        </div>
        <label style={{ fontSize: 12, fontWeight: 600 }}>
          Valor (R$) *{aiFilled && <span style={{ color: "#010101", marginLeft: 8, fontSize: 11 }}>💡 Sugerido: R$ {form.budget}</span>}
        </label>
        <input style={inp} type="number" value={form.budget}
          onChange={e => set("budget", e.target.value)} />
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
        <label style={{ fontSize: 12, fontWeight: 600 }}>Placements</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 12 }}>
          {PLACEMENTS.map(p => (
            <button key={p.value} style={btn(form.placements.includes(p.value) ? "#010101" : "#f1f5f9",
              form.placements.includes(p.value) ? "#fff" : "#374151")}
              onClick={() => togglePlacement(p.value)}>{p.label}</button>
          ))}
        </div>
      </div>
    );

    if (step === 2) return (
      <div>
        <label style={{ fontSize: 12, fontWeight: 600 }}>Gênero</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {GENDERS.map(g => (
            <button key={g.value} style={btn(form.gender === g.value ? "#010101" : "#f1f5f9",
              form.gender === g.value ? "#fff" : "#374151")}
              onClick={() => set("gender", g.value)}>{g.label}</button>
          ))}
        </div>
        <label style={{ fontSize: 12, fontWeight: 600 }}>Faixa etária</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: "#64748b" }}>Mínima</label>
            <input style={inp} type="number" min={13} max={55} value={form.ageMin}
              onChange={e => set("ageMin", Number(e.target.value))} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#64748b" }}>Máxima</label>
            <input style={inp} type="number" min={13} max={55} value={form.ageMax}
              onChange={e => set("ageMax", Number(e.target.value))} />
          </div>
        </div>
        <label style={{ fontSize: 12, fontWeight: 600 }}>Países (separados por vírgula)</label>
        <input style={inp} value={form.locations.join(", ")}
          onChange={e => set("locations", e.target.value.split(",").map(s => s.trim()))} />
        <label style={{ fontSize: 12, fontWeight: 600 }}>Interesses (separados por vírgula)</label>
        <input style={inp} placeholder="marketing, empreendedorismo, negócios" value={form.interests}
          onChange={e => set("interests", e.target.value)} />
      </div>
    );

    if (step === 3) return (
      <div>
        {aiFilled && (
          <div style={{ background: "#fafafa", border: "1.5px solid #e2e8f0",
            borderRadius: 10, padding: 10, marginBottom: 12, fontSize: 11 }}>
            🤖 Textos dos anúncios gerados pela IA. Adicione URLs de vídeo e imagem de capa.
          </div>
        )}
        <div style={{ background: "#ecfeff", border: "1.5px solid #a5f3fc", borderRadius: 10, padding: 10, marginBottom: 12, fontSize: 11, lineHeight: 1.7, color: "#155e75" }}>
          <strong>📱 Validação profissional:</strong> TikTok é <strong>video-first</strong>. Para evitar criativo desalinhado, cada anúncio precisa ter um <strong>vídeo principal</strong> preenchido. O formato recomendado é <strong>vertical 9:16</strong>.
        </div>
        {form.ads.map((ad, i) => (
          <div key={i} style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0",
            borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <p style={{ fontWeight: 700, fontSize: 14, margin: "0 0 10px" }}>🎬 Anúncio {i + 1}</p>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>
              Texto do anúncio (máx 100 chars) — {ad.adText.length}/100
            </label>
            <input style={inp} maxLength={100} value={ad.adText}
              onChange={e => setAd(i, "adText", e.target.value)} />
            <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>URL do vídeo *</label>
            <input style={inp} placeholder="https://... ou ID do TikTok" value={ad.videoUrl}
              onChange={e => setAd(i, "videoUrl", e.target.value)} />
            <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>URL da imagem de capa</label>
            <input style={inp} placeholder="https://..." value={ad.coverImageUrl}
              onChange={e => setAd(i, "coverImageUrl", e.target.value)} />
            <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Call to Action</label>
            <select style={inp} value={ad.callToAction}
              onChange={e => setAd(i, "callToAction", e.target.value)}>
              {["SHOP_NOW","LEARN_MORE","SIGN_UP","CONTACT_US","DOWNLOAD_NOW","BOOK_NOW","GET_QUOTE"].map(c =>
                <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
            </select>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>URL da Landing Page *</label>
            <input style={inp} value={ad.landingPageUrl}
              onChange={e => setAd(i, "landingPageUrl", e.target.value)} />
          </div>
        ))}
        <button style={btn("#f1f5f9", "#374151")} onClick={() =>
          set("ads", [...form.ads, { videoUrl: "", coverImageUrl: "", adText: "", callToAction: "SHOP_NOW", landingPageUrl: "" }])}>
          + Adicionar anúncio
        </button>
      </div>
    );

    if (step === 4) return (
      <div>
        <div style={{ background: "#fafafa", border: "1.5px solid #e2e8f0",
          borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 800 }}>📋 Revisão</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
            <div><strong>Nome:</strong> {form.campaignName}</div>
            <div><strong>Objetivo:</strong> {form.objective}</div>
            <div><strong>Orçamento:</strong> R$ {form.budget}/{form.budgetType === "DAILY" ? "dia" : "total"}</div>
            <div><strong>Início:</strong> {form.startDate}</div>
            <div><strong>Gênero:</strong> {form.gender}</div>
            <div><strong>Idade:</strong> {form.ageMin}-{form.ageMax}</div>
            <div><strong>Países:</strong> {form.locations.join(", ")}</div>
            <div><strong>Anúncios:</strong> {form.ads.length}</div>
            <div><strong>Fonte:</strong> {aiFilled ? "🤖 IA + Concorrentes" : "✍️ Manual"}</div>
          </div>
        </div>
        {form.publishingState === "success" ? (
          <div style={{ background: "#dcfce7", border: "1.5px solid #86efac",
            borderRadius: 14, padding: 20, textAlign: "center" as const }}>
            <p style={{ fontSize: 28 }}>◈</p>
            <p style={{ fontWeight: 800, fontSize: 16 }}>Campanha TikTok publicada!</p>
            <button style={{ ...btn("#010101"), marginTop: 12 }}
              onClick={() => setLocation(`/projects/${projectId}/campaign/result/${campaignId}`)}>
              Voltar ao resultado
            </button>
          </div>
        ) : (
          <button style={{ ...btn("#010101"), width: "100%", padding: 14, fontSize: 15 }}
            disabled={form.publishingState === "loading"} onClick={handlePublish}>
            {form.publishingState === "loading" ? "⏳ Publicando…" : "🚀 Publicar no TikTok Ads"}
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
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🎵 TikTok Ads Creator</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
            {aiFilled ? "◎ Pré-preenchido com IA e inteligência competitiva" : "Nova campanha TikTok"}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 28 }}>
        {STEPS.map((s, i) => (
          <div key={i} onClick={() => i < step && setStep(i)} style={{
            flex: 1, padding: "8px 4px", textAlign: "center" as const,
            borderRadius: 8, fontSize: 11, fontWeight: 700,
            cursor: i < step ? "pointer" : "default",
            background: i === step ? "#010101" : i < step ? "#dcfce7" : "#f1f5f9",
            color:      i === step ? "#fff"    : i < step ? "#166534" : "#94a3b8",
          }}>{s}</div>
        ))}
      </div>

      <div style={{ background: "#fff", border: "1.5px solid #e2e8f0",
        borderRadius: 16, padding: 24, minHeight: 260 }}>
        {renderStep()}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
        <button style={{ padding: "10px 22px", borderRadius: 10, border: "1.5px solid #e2e8f0",
          cursor: "pointer", fontWeight: 700, background: "#f1f5f9", color: "#374151" }}
          disabled={step === 0} onClick={() => setStep(s => s - 1)}>← Anterior</button>
        {step < STEPS.length - 1 && (
          <button style={{ padding: "10px 22px", borderRadius: 10, border: "none",
            cursor: "pointer", fontWeight: 700, background: "#010101", color: "#fff" }}
            onClick={() => setStep(s => s + 1)}>Próximo →</button>
        )}
      </div>
    </div>
  );
}
