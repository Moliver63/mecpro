/**
 * PublishListing.tsx — Wizard de publicação no Marketplace
 * Rota: /marketplace/publish (protegida)
 * Rota: /marketplace/publish?campaignId=X (vindo da CampaignResult)
 */
import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import Layout from "@/components/layout/Layout";
import { toast } from "sonner";

const NICHES = [
  { key: "imobiliario",      label: "🏠 Imobiliário",       desc: "Imóveis, terrenos, loteamentos" },
  { key: "servicos",         label: "⚙️ Serviços",          desc: "Consultoria, freelance, agências" },
  { key: "infoprodutos",     label: "🎓 Infoprodutos",      desc: "Cursos, e-books, mentorias" },
  { key: "produtos_fisicos", label: "📦 Produtos físicos",  desc: "Loja física, e-commerce, dropshipping" },
  { key: "negocios_locais",  label: "📍 Negócios locais",   desc: "Restaurante, clínica, academia" },
  { key: "saude_beleza",     label: "💆 Saúde & Beleza",    desc: "Estética, nutrição, terapias" },
  { key: "educacao",         label: "📚 Educação",          desc: "Escola, curso presencial, tutoria" },
  { key: "alimentacao",      label: "🍽️ Alimentação",       desc: "Delivery, buffet, food service" },
  { key: "ecommerce",        label: "🛒 E-commerce",        desc: "Loja virtual, marketplace próprio" },
  { key: "outros",           label: "◌ Outros",             desc: "Outro tipo de oferta" },
];

const CHECKOUT_TYPES = [
  { key: "whatsapp",   label: "WhatsApp", icon: "💬", desc: "Contato direto pelo WhatsApp" },
  { key: "link",       label: "Link externo", icon: "🔗", desc: "Hotmart, Eduzz, Kiwify, etc." },
  { key: "email",      label: "E-mail", icon: "📧", desc: "Contato por e-mail" },
];

const PRICE_TYPES = [
  { key: "fixed",      label: "Preço fixo" },
  { key: "monthly",    label: "Mensal / Assinatura" },
  { key: "negotiable", label: "A negociar" },
  { key: "free",       label: "Gratuito" },
];

const BR_STATES = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const STEPS = ["Oferta", "Preço", "Checkout", "IA Preview", "Publicar"];

function StepIndicator({ current }: { current: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 28 }}>
      {STEPS.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center" }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: i < current ? "#30d158" : i === current ? "var(--blue)" : "var(--off)",
            color: i <= current ? "white" : "var(--muted)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 800,
            border: i === current ? "2px solid var(--blue)" : "none",
          }}>{i < current ? "✓" : i + 1}</div>
          <div style={{ fontSize: 10, color: i === current ? "var(--blue)" : "var(--muted)", fontWeight: i === current ? 700 : 400, margin: "0 6px", display: i === STEPS.length - 1 ? "none" : "block" }}>{s}</div>
          {i < STEPS.length - 1 && <div style={{ width: 20, height: 1, background: i < current ? "#30d158" : "var(--border)" }} />}
        </div>
      ))}
    </div>
  );
}

export default function PublishListing() {
  const [, setLocation] = useLocation();
  const qs = useSearch();
  const campaignId = new URLSearchParams(qs).get("campaignId");

  const [step, setStep]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [published, setPublished] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [generating, setGenerating] = useState(false);

  // Form state
  const [form, setForm] = useState({
    title: "", niche: "", description: "", benefits: "",
    price: "", priceType: "fixed",
    checkoutType: "whatsapp", whatsappNumber: "", checkoutUrl: "", contactEmail: "",
    city: "", state: "", isNational: true,
    campaignId: campaignId || "",
  });

  function set(k: string, v: any) { setForm(f => ({ ...f, [k]: v })); }

  // Pré-preenche se veio de uma campanha
  useEffect(() => {
    if (!campaignId) return;
    fetch(`/api/campaigns/${campaignId}`)
      .then(r => r.json())
      .then(d => {
        if (d?.name) set("title", d.name);
        if (d?.niche) set("niche", d.niche);
      })
      .catch(() => {});
  }, [campaignId]);

  async function generatePreview() {
    if (!form.title || !form.niche) {
      toast.error("Preencha título e nicho antes de gerar a preview");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/marketplace/generate-landing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title, niche: form.niche,
          description: form.description,
          price: form.price ? Number(form.price) : undefined,
          priceType: form.priceType,
          benefits: form.benefits.split("\n").filter(Boolean),
          checkoutType: form.checkoutType,
          whatsappNumber: form.whatsappNumber,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPreview(data.landingPage);
        setStep(3);
      } else {
        toast.error(data.error || "Erro ao gerar landing page");
      }
    } catch {
      toast.error("Erro de conexão. Tente novamente.");
    } finally {
      setGenerating(false);
    }
  }

  async function publish() {
    setLoading(true);
    try {
      const res = await fetch("/api/marketplace/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          price: form.price ? Number(form.price) : undefined,
          benefits: form.benefits.split("\n").filter(Boolean),
          campaignId: campaignId ? Number(campaignId) : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPublished(data);
        setStep(4);
        toast.success("🎉 Oferta publicada no marketplace!");
      } else {
        toast.error(data.error || "Erro ao publicar");
      }
    } catch {
      toast.error("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );

  return (
    <Layout>
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px 60px", fontFamily: "var(--font)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button className="btn btn-sm" onClick={() => setLocation("/marketplace")} style={{ fontSize: 12 }}>← Voltar</button>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "var(--black)", letterSpacing: "-0.03em" }}>
              Publicar no Marketplace
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
              {campaignId ? "🔗 Vinculado à campanha gerada" : "Crie e publique sua oferta com IA"}
            </p>
          </div>
        </div>

        <StepIndicator current={step} />

        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: "24px 22px" }}>

          {/* STEP 0 — Informações da oferta */}
          {step === 0 && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--black)" }}>📝 Informações da oferta</h2>
              <Field label="Título da oferta *">
                <input className="input" value={form.title} onChange={e => set("title", e.target.value)}
                  placeholder="Ex: Apartamentos no Centro com financiamento facilitado"
                  style={{ width: "100%", fontSize: 14 }} />
              </Field>
              <Field label="Nicho *">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {NICHES.map(n => (
                    <button key={n.key} onClick={() => set("niche", n.key)}
                      style={{
                        border: `2px solid ${form.niche === n.key ? "var(--blue)" : "var(--border)"}`,
                        borderRadius: 10, padding: "8px 12px", cursor: "pointer",
                        background: form.niche === n.key ? "var(--blue-l)" : "transparent",
                        textAlign: "left", transition: "all .15s",
                      }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: form.niche === n.key ? "var(--blue)" : "var(--black)" }}>{n.label}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)" }}>{n.desc}</div>
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Descrição (o que você oferece)">
                <textarea className="input" value={form.description} onChange={e => set("description", e.target.value)}
                  placeholder="Descreva sua oferta em 2-3 frases..."
                  style={{ width: "100%", height: 80, fontSize: 13, resize: "vertical" }} />
              </Field>
              <Field label="Benefícios principais (1 por linha)">
                <textarea className="input" value={form.benefits} onChange={e => set("benefits", e.target.value)}
                  placeholder={"Localização privilegiada\nDocumentação 100% digital\nFinanciamento facilitado"}
                  style={{ width: "100%", height: 80, fontSize: 13, resize: "vertical" }} />
              </Field>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button className="btn btn-md btn-primary" onClick={() => setStep(1)}
                  disabled={!form.title || !form.niche} style={{ fontWeight: 700 }}>
                  Próximo: Preço →
                </button>
              </div>
            </div>
          )}

          {/* STEP 1 — Precificação */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--black)" }}>💰 Precificação</h2>
              <Field label="Tipo de preço">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {PRICE_TYPES.map(p => (
                    <button key={p.key} onClick={() => set("priceType", p.key)}
                      style={{
                        border: `2px solid ${form.priceType === p.key ? "var(--blue)" : "var(--border)"}`,
                        borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12,
                        background: form.priceType === p.key ? "var(--blue-l)" : "transparent",
                        color: form.priceType === p.key ? "var(--blue)" : "var(--muted)", fontWeight: 600,
                      }}>{p.label}</button>
                  ))}
                </div>
              </Field>
              {form.priceType !== "free" && form.priceType !== "negotiable" && (
                <Field label={`Valor ${form.priceType === "monthly" ? "mensal" : ""} (R$)`}>
                  <input className="input" type="number" value={form.price} onChange={e => set("price", e.target.value)}
                    placeholder="Ex: 197" style={{ width: "100%", fontSize: 14 }} />
                  {form.price && Number(form.price) > 100 && (
                    <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                      💡 Parcelamento: até 12x de R$ {(Number(form.price) / 12).toFixed(2)} (IA vai calcular)
                    </p>
                  )}
                </Field>
              )}
              <Field label="Abrangência">
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => set("isNational", true)}
                    style={{ flex: 1, border: `2px solid ${form.isNational ? "var(--blue)" : "var(--border)"}`, borderRadius: 8, padding: "8px", cursor: "pointer", background: form.isNational ? "var(--blue-l)" : "transparent", fontSize: 12, fontWeight: 600, color: form.isNational ? "var(--blue)" : "var(--muted)" }}>
                    🇧🇷 Nacional
                  </button>
                  <button onClick={() => set("isNational", false)}
                    style={{ flex: 1, border: `2px solid ${!form.isNational ? "var(--blue)" : "var(--border)"}`, borderRadius: 8, padding: "8px", cursor: "pointer", background: !form.isNational ? "var(--blue-l)" : "transparent", fontSize: 12, fontWeight: 600, color: !form.isNational ? "var(--blue)" : "var(--muted)" }}>
                    📍 Regional
                  </button>
                </div>
              </Field>
              {!form.isNational && (
                <div style={{ display: "flex", gap: 8 }}>
                  <Field label="Cidade" ><input className="input" value={form.city} onChange={e => set("city", e.target.value)} placeholder="Ex: Balneário Camboriú" style={{ fontSize: 13 }} /></Field>
                  <Field label="Estado">
                    <select className="input" value={form.state} onChange={e => set("state", e.target.value)} style={{ fontSize: 13 }}>
                      <option value="">UF</option>
                      {BR_STATES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                <button className="btn btn-md" onClick={() => setStep(0)}>← Voltar</button>
                <button className="btn btn-md btn-primary" onClick={() => setStep(2)} style={{ fontWeight: 700 }}>Próximo: Checkout →</button>
              </div>
            </div>
          )}

          {/* STEP 2 — Checkout */}
          {step === 2 && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--black)" }}>🔗 Como os clientes vão entrar em contato?</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {CHECKOUT_TYPES.map(c => (
                  <button key={c.key} onClick={() => set("checkoutType", c.key)}
                    style={{
                      border: `2px solid ${form.checkoutType === c.key ? "var(--blue)" : "var(--border)"}`,
                      borderRadius: 12, padding: "12px 16px", cursor: "pointer", textAlign: "left",
                      background: form.checkoutType === c.key ? "var(--blue-l)" : "transparent", display: "flex", alignItems: "center", gap: 12,
                    }}>
                    <span style={{ fontSize: 20 }}>{c.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: form.checkoutType === c.key ? "var(--blue)" : "var(--black)" }}>{c.label}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{c.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
              {form.checkoutType === "whatsapp" && (
                <Field label="Número do WhatsApp (com DDD, sem +55)">
                  <input className="input" value={form.whatsappNumber} onChange={e => set("whatsappNumber", e.target.value)}
                    placeholder="47999999999" style={{ width: "100%", fontSize: 14 }} />
                </Field>
              )}
              {form.checkoutType === "link" && (
                <Field label="Link da página de checkout / pagamento">
                  <input className="input" value={form.checkoutUrl} onChange={e => set("checkoutUrl", e.target.value)}
                    placeholder="https://pay.hotmart.com/..." style={{ width: "100%", fontSize: 14 }} />
                </Field>
              )}
              {form.checkoutType === "email" && (
                <Field label="E-mail de contato">
                  <input className="input" type="email" value={form.contactEmail} onChange={e => set("contactEmail", e.target.value)}
                    placeholder="contato@suaempresa.com.br" style={{ width: "100%", fontSize: 14 }} />
                </Field>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                <button className="btn btn-md" onClick={() => setStep(1)}>← Voltar</button>
                <button className="btn btn-md btn-primary" onClick={generatePreview}
                  disabled={generating} style={{ fontWeight: 700, background: generating ? "var(--muted)" : undefined }}>
                  {generating ? "⏳ Gerando com IA..." : "✦ Gerar landing page →"}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — Preview da landing gerada */}
          {step === 3 && preview && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ background: "#30d158", color: "white", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 800 }}>✓ IA Score: {preview.aiScore}/100</div>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--black)", margin: 0 }}>Preview da landing page</h2>
              </div>

              {[
                { tag: "🎯 Hero", content: preview.sections?.hero?.headline, sub: preview.sections?.hero?.subheadline },
                { tag: "⚠️ Problema", content: preview.sections?.problem?.points?.slice(0,2).join(" • "), sub: null },
                { tag: "✅ Benefícios", content: preview.sections?.benefits?.items?.slice(0,3).map((b:any) => b.title).join(" · "), sub: null },
                { tag: "💬 Depoimentos", content: preview.sections?.social?.testimonials?.slice(0,1).map((t:any) => `"${t.text}" — ${t.name}`).join(""), sub: null },
                { tag: "💰 Preço + Garantia", content: preview.sections?.pricing?.price + (preview.sections?.pricing?.installments ? ` ou ${preview.sections?.pricing?.installments}` : ""), sub: preview.sections?.pricing?.guarantee },
                { tag: "❓ FAQ", content: `${preview.sections?.faq?.items?.length || 0} perguntas geradas`, sub: null },
              ].map((s, i) => (
                <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", marginBottom: 8, background: "var(--off)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{s.tag}</div>
                  <div style={{ fontSize: 13, color: "var(--black)", fontWeight: s.tag.includes("Hero") ? 700 : 400 }}>{s.content}</div>
                  {s.sub && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{s.sub}</div>}
                </div>
              ))}

              {preview.aiSuggestions?.length > 0 && (
                <div style={{ background: "var(--blue-l)", borderRadius: 10, padding: "10px 14px", marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--blue)", marginBottom: 6 }}>💡 Sugestões da IA para melhorar</div>
                  {preview.aiSuggestions.map((s: string, i: number) => (
                    <div key={i} style={{ fontSize: 12, color: "var(--blue)", marginBottom: 3 }}>• {s}</div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, gap: 8 }}>
                <button className="btn btn-md" onClick={() => setStep(2)}>← Regerar</button>
                <button className="btn btn-md btn-primary" onClick={publish}
                  disabled={loading} style={{ fontWeight: 700, background: loading ? "var(--muted)" : "#30d158", flex: 1 }}>
                  {loading ? "⏳ Publicando..." : "🚀 Publicar no marketplace!"}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4 — Sucesso */}
          {step === 4 && published && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: "var(--black)", marginBottom: 8 }}>Oferta publicada!</h2>
              <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24 }}>
                Sua landing page está no ar e já aparece na vitrine do marketplace.
              </p>
              <div style={{ background: "var(--off)", borderRadius: 12, padding: "14px 18px", marginBottom: 20, textAlign: "left" }}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>🔗 Link da sua oferta</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--blue)", wordBreak: "break-all" }}>
                  {window.location.origin}/marketplace/{published.slug}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <button className="btn btn-md btn-primary" style={{ fontWeight: 700 }}
                  onClick={() => setLocation(`/marketplace/${published.slug}`)}>Ver minha oferta →</button>
                <button className="btn btn-md" onClick={() => setLocation("/marketplace/seller")}>Dashboard de vendas</button>
                <button className="btn btn-md" onClick={() => { setStep(0); setPublished(null); setPreview(null); }}>+ Publicar outra</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
