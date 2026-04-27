/**
 * PublishListing.tsx — Wizard de publicação no Marketplace
 * Publicação automática: preenche → clica publicar → IA gera e publica
 * Rota: /marketplace/publish (protegida)
 * Rota: /marketplace/publish?campaignId=X (vindo de CampaignResult)
 */
import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import Layout from "@/components/layout/Layout";
import { toast } from "sonner";
import { NICHE_TAXONOMY, NICHE_MAP, type NicheConfig } from "@/lib/nicheTaxonomy";

// Niches now from NICHE_TAXONOMY in nicheTaxonomy.ts

const CHECKOUT_TYPES = [
  { key: "whatsapp", label: "WhatsApp",    icon: "💬", desc: "Contato direto pelo WhatsApp" },
  { key: "link",     label: "Link externo",icon: "🔗", desc: "Hotmart, Eduzz, Kiwify, etc." },
  { key: "email",    label: "E-mail",      icon: "📧", desc: "Contato por e-mail" },
];

const PRICE_TYPES = [
  { key: "fixed",      label: "Preço fixo" },
  { key: "monthly",    label: "Mensal / Assinatura" },
  { key: "negotiable", label: "A negociar" },
  { key: "free",       label: "Gratuito" },
];

const BR_STATES = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const STEPS = ["Oferta", "Preço & Local", "Contato", "Publicar"];

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
          }}>{i < current ? "✓" : i + 1}</div>
          {i < STEPS.length - 1 && (
            <>
              <div style={{ fontSize: 10, color: i === current ? "var(--blue)" : "var(--muted)", fontWeight: i === current ? 700 : 400, margin: "0 4px" }}>{s}</div>
              <div style={{ width: 20, height: 1, background: i < current ? "#30d158" : "var(--border)" }} />
            </>
          )}
        </div>
      ))}
      <div style={{ fontSize: 10, color: STEPS.length - 1 === current ? "var(--blue)" : "var(--muted)", fontWeight: STEPS.length - 1 === current ? 700 : 400, marginLeft: 4 }}>
        {STEPS[STEPS.length - 1]}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 5 }}>
        {label}{required && <span style={{ color: "#ff453a" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

export default function PublishListing() {
  const [, setLocation] = useLocation();
  const qs = useSearch();
  const campaignId = new URLSearchParams(qs).get("campaignId");

  const [step, setStep]         = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished]   = useState<any>(null);
  const [publishProgress, setPublishProgress] = useState("");

  const [form, setForm] = useState({
    title: "", niche: "", subniche: "", description: "", benefits: "",
    price: "", priceType: "fixed",
    checkoutType: "whatsapp" as string, whatsappNumber: "", checkoutUrl: "", contactEmail: "",
    city: "", state: "", isNational: true,
  });

  function set(k: string, v: any) { setForm(f => ({ ...f, [k]: v })); }

  // selectedNiche derivado do niche selecionado
  const selectedNiche = NICHE_MAP[form.niche] || null;

  // Pré-preenche se veio de campanha
  useEffect(() => {
    if (!campaignId) return;
    fetch(`/api/campaigns/${campaignId}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d?.name)        set("title", d.name);
        if (d?.niche)       set("niche", d.niche);
        if (d?.description) set("description", d.description);
      })
      .catch(() => {});
  }, [campaignId]);

  // ── Publicação automática: gera landing + publica em 1 chamada ──
  async function publishDirect() {
    if (!form.title || !form.niche) {
      toast.error("Preencha pelo menos o título e o nicho antes de publicar.");
      setStep(0);
      return;
    }

    setPublishing(true);
    setPublishProgress("✦ Gerando landing page com IA...");

    try {
      // Pequeno delay para o usuário ver o progresso
      await new Promise(r => setTimeout(r, 300));
      setPublishProgress("📝 Criando copy e seções da página...");

      const res = await fetch("/api/marketplace/publish-direct", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          nicheLabel:  selectedNiche?.label || form.niche,
          price:       form.price ? Number(form.price) : undefined,
          benefits:    form.benefits.split("\n").filter(Boolean),
          campaignId:  campaignId ? Number(campaignId) : undefined,
          copyHints:   selectedNiche?.copyHints,
        }),
      });

      setPublishProgress("🚀 Publicando no marketplace...");
      const data = await res.json();

      if (data.success) {
        setPublished(data);
        setPublishProgress("");
        toast.success("🎉 Oferta publicada com sucesso!");
      } else {
        const errMsg = data.error || "Erro ao publicar. Tente novamente.";
        toast.error(`✕ ${errMsg}`, { duration: 10000 });
        console.error("[publish-direct] server error:", data);
        setPublishProgress("");
      }
    } catch (err: any) {
      const msg = err?.message || "Erro de conexão";
      toast.error(`✕ ${msg}. Verifique sua internet e tente novamente.`, { duration: 8000 });
      setPublishProgress("");
    } finally {
      setPublishing(false);
    }
  }

  const canPublish = form.title.trim().length > 3 && form.niche;

  // ── Tela de sucesso ───────────────────────────────────────────────
  if (published) {
    const lp = published.landingPage;
    return (
      <Layout>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 16px 80px", fontFamily: "var(--font)", textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "var(--black)", margin: "0 0 10px", letterSpacing: "-0.03em" }}>
            Oferta publicada!
          </h1>
          <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 28 }}>
            Sua landing page está no ar e já aparece na vitrine do marketplace.
          </p>

          {/* Score da IA */}
          {lp?.aiScore && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--blue-l)", borderRadius: 20, padding: "6px 16px", marginBottom: 24 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--blue)" }}>✦ IA Score: {lp.aiScore}/100</span>
            </div>
          )}

          {/* Link */}
          <div style={{ background: "var(--off)", borderRadius: 14, padding: "16px 20px", marginBottom: 24, textAlign: "left" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6, fontWeight: 700 }}>🔗 Link público da sua oferta</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--blue)", wordBreak: "break-all", marginBottom: 10 }}>
              {window.location.origin}/marketplace/{published.slug}
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/marketplace/${published.slug}`); toast.success("Link copiado!"); }}
              style={{ fontSize: 11, fontWeight: 700, background: "var(--blue)", color: "white", border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer" }}>
              📋 Copiar link
            </button>
          </div>

          {/* Sugestões da IA */}
          {lp?.aiSuggestions?.length > 0 && (
            <div style={{ background: "var(--blue-l)", borderRadius: 14, padding: "14px 18px", marginBottom: 24, textAlign: "left" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--blue)", marginBottom: 8 }}>💡 Sugestões da IA para melhorar</div>
              {lp.aiSuggestions.slice(0, 3).map((s: string, i: number) => (
                <div key={i} style={{ fontSize: 12, color: "var(--blue)", marginBottom: 4 }}>• {s}</div>
              ))}
            </div>
          )}

          {/* Ações */}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-md btn-primary" style={{ fontWeight: 700, background: "var(--blue)" }}
              onClick={() => setLocation(`/marketplace/${published.slug}`)}>
              Ver minha oferta →
            </button>
            <button className="btn btn-md" style={{ fontWeight: 700 }}
              onClick={() => setLocation("/marketplace/seller")}>
              Dashboard de vendas
            </button>
            <button className="btn btn-md" style={{ fontWeight: 600 }}
              onClick={() => setLocation("/marketplace")}>
              Ver vitrine
            </button>
            <button className="btn btn-md" style={{ fontWeight: 600, fontSize: 12 }}
              onClick={() => { setPublished(null); setForm({ title:"", niche:"", subniche:"", description:"", benefits:"", price:"", priceType:"fixed", checkoutType:"whatsapp", whatsappNumber:"", checkoutUrl:"", contactEmail:"", city:"", state:"", isNational:true }); setStep(0); }}>
              + Publicar outra
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px 80px", fontFamily: "var(--font)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button className="btn btn-sm" onClick={() => setLocation("/marketplace")} style={{ fontSize: 12 }}>← Voltar</button>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "var(--black)", letterSpacing: "-0.03em" }}>
              Publicar no Marketplace
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
              {campaignId ? "🔗 Vinculado à campanha — IA vai gerar e publicar automaticamente" : "A IA gera a landing page e publica automaticamente"}
            </p>
          </div>
        </div>

        <StepIndicator current={step} />

        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: "24px 22px" }}>

          {/* ── STEP 0: Informações da oferta ── */}
          {step === 0 && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--black)" }}>📝 Informações da oferta</h2>

              <Field label="Título da oferta" required>
                <input className="input" value={form.title} onChange={e => set("title", e.target.value)}
                  placeholder="Ex: Apartamentos no Centro com financiamento facilitado"
                  style={{ width: "100%", fontSize: 14 }} />
              </Field>

              <Field label="Segmento" required>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
                  {NICHE_TAXONOMY.map(n => (
                    <button key={n.key} onClick={() => { set("niche", n.key); set("subniche", ""); set("priceType", n.defaultPriceType); }} style={{
                      border: `2px solid ${form.niche === n.key ? n.color : "var(--border)"}`,
                      borderRadius: 10, padding: "8px 12px", cursor: "pointer",
                      background: form.niche === n.key ? n.bg : "transparent",
                      textAlign: "left", transition: "all .15s",
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: form.niche === n.key ? n.color : "var(--black)" }}>{n.icon} {n.label}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)" }}>{n.desc}</div>
                    </button>
                  ))}
                </div>
              </Field>

              {/* Subnicho — aparece após selecionar o segmento */}
              {selectedNiche && selectedNiche.subniches.length > 0 && (
                <Field label={`Tipo de ${selectedNiche.label.replace(/[^\w\sÀ-ú]/g, "").trim() || selectedNiche.label}`}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {selectedNiche.subniches.map(s => (
                      <button key={s.key} onClick={() => set("subniche", s.key)} style={{
                        border: `2px solid ${form.subniche === s.key ? selectedNiche.color : "var(--border)"}`,
                        borderRadius: 20, padding: "5px 14px", cursor: "pointer", fontSize: 12,
                        background: form.subniche === s.key ? selectedNiche.bg : "transparent",
                        color: form.subniche === s.key ? selectedNiche.color : "var(--muted)",
                        fontWeight: form.subniche === s.key ? 700 : 400, transition: "all .15s",
                      }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  {form.subniche && (
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                      {selectedNiche.subniches.find(s => s.key === form.subniche)?.desc}
                    </div>
                  )}
                </Field>
              )}

              <Field label="Descrição (o que você oferece)">
                <textarea className="input" value={form.description} onChange={e => set("description", e.target.value)}
                  placeholder="Descreva sua oferta em 2-3 frases para a IA criar um copy personalizado..."
                  style={{ width: "100%", height: 80, fontSize: 13, resize: "vertical" }} />
              </Field>

              <Field label="Benefícios principais (1 por linha — opcional)">
                <textarea className="input" value={form.benefits} onChange={e => set("benefits", e.target.value)}
                  placeholder={"Localização privilegiada\nDocumentação 100% digital\nFinanciamento facilitado"}
                  style={{ width: "100%", height: 72, fontSize: 13, resize: "vertical" }} />
              </Field>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button className="btn btn-md btn-primary" onClick={() => setStep(1)}
                  disabled={!form.title || !form.niche} style={{ fontWeight: 700 }}>
                  Próximo: Preço →
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 1: Preço & localização ── */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--black)" }}>💰 Preço & Localização</h2>

              <Field label="Tipo de preço">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {PRICE_TYPES.map(p => (
                    <button key={p.key} onClick={() => set("priceType", p.key)} style={{
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
                      💡 A IA vai calcular as parcelas automaticamente
                    </p>
                  )}
                </Field>
              )}

              <Field label="Abrangência">
                <div style={{ display: "flex", gap: 8 }}>
                  {[{v:true,l:"🇧🇷 Nacional"},{v:false,l:"📍 Regional"}].map(o => (
                    <button key={String(o.v)} onClick={() => set("isNational", o.v)} style={{
                      flex: 1, border: `2px solid ${form.isNational === o.v ? "var(--blue)" : "var(--border)"}`,
                      borderRadius: 8, padding: "8px", cursor: "pointer",
                      background: form.isNational === o.v ? "var(--blue-l)" : "transparent",
                      fontSize: 12, fontWeight: 600, color: form.isNational === o.v ? "var(--blue)" : "var(--muted)",
                    }}>{o.l}</button>
                  ))}
                </div>
              </Field>

              {!form.isNational && (
                <div style={{ display: "flex", gap: 8 }}>
                  <Field label="Cidade">
                    <input className="input" value={form.city} onChange={e => set("city", e.target.value)}
                      placeholder="Ex: Balneário Camboriú" style={{ fontSize: 13 }} />
                  </Field>
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
                <button className="btn btn-md btn-primary" onClick={() => setStep(2)} style={{ fontWeight: 700 }}>Próximo: Contato →</button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Checkout / contato ── */}
          {step === 2 && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, color: "var(--black)" }}>🔗 Como os clientes entram em contato?</h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {CHECKOUT_TYPES.map(c => (
                  <button key={c.key} onClick={() => set("checkoutType", c.key)} style={{
                    border: `2px solid ${form.checkoutType === c.key ? "var(--blue)" : "var(--border)"}`,
                    borderRadius: 12, padding: "12px 16px", cursor: "pointer", textAlign: "left",
                    background: form.checkoutType === c.key ? "var(--blue-l)" : "transparent",
                    display: "flex", alignItems: "center", gap: 12,
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
                <Field label="WhatsApp (com DDD, sem +55)">
                  <input className="input" value={form.whatsappNumber} onChange={e => set("whatsappNumber", e.target.value)}
                    placeholder="47999999999" style={{ width: "100%", fontSize: 14 }} />
                </Field>
              )}
              {form.checkoutType === "link" && (
                <Field label="Link de checkout / pagamento">
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
                <button className="btn btn-md btn-primary" onClick={() => setStep(3)} style={{ fontWeight: 700 }}>Revisar e publicar →</button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Revisar e publicar ── */}
          {step === 3 && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4, color: "var(--black)" }}>🚀 Pronto para publicar!</h2>
              <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>
                A IA vai gerar sua landing page e publicar automaticamente na vitrine.
              </p>

              {/* Resumo */}
              <div style={{ background: "var(--off)", borderRadius: 14, padding: "16px 18px", marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Resumo da oferta</div>
                {[
                  { label: "Título",       val: form.title },
                  { label: "Segmento",    val: selectedNiche?.label || form.niche },
                  ...(form.subniche ? [{ label: "Tipo", val: selectedNiche?.subniches.find(s => s.key === form.subniche)?.label || form.subniche }] : []),
                  { label: "Preço",        val: form.priceType === "free" ? "Gratuito" : form.priceType === "negotiable" ? "A negociar" : form.price ? `R$ ${Number(form.price).toLocaleString("pt-BR")} (${PRICE_TYPES.find(p=>p.key===form.priceType)?.label})` : "Não informado" },
                  { label: "Abrangência",  val: form.isNational ? "🇧🇷 Nacional" : `📍 ${[form.city, form.state].filter(Boolean).join(", ")}` },
                  { label: "Contato",      val: form.checkoutType === "whatsapp" ? `WhatsApp: ${form.whatsappNumber || "não informado"}` : form.checkoutType === "link" ? `Link: ${form.checkoutUrl || "não informado"}` : `E-mail: ${form.contactEmail || "não informado"}` },
                ].map(row => (
                  <div key={row.label} style={{ display: "flex", gap: 12, marginBottom: 8, fontSize: 13 }}>
                    <span style={{ color: "var(--muted)", fontWeight: 600, minWidth: 90 }}>{row.label}:</span>
                    <span style={{ color: "var(--black)", fontWeight: 500 }}>{row.val}</span>
                  </div>
                ))}
              </div>

              {/* O que a IA vai gerar */}
              <div style={{ background: "var(--blue-l)", borderRadius: 14, padding: "14px 18px", marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--blue)", marginBottom: 8 }}>✦ A IA vai gerar automaticamente</div>
                {["Headline persuasiva e subheadline", "Seção de problema/dores do nicho", "Benefícios em cards", "3 depoimentos simulados", "FAQ com 4 perguntas", "CTA otimizado para conversão", "Garantia adaptada ao nicho"].map((item, i) => (
                  <div key={i} style={{ fontSize: 12, color: "var(--blue)", marginBottom: 3 }}>✓ {item}</div>
                ))}
              </div>

              {/* Botão publicar */}
              {publishing ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ fontSize: 32, marginBottom: 12, animation: "pulse 1s infinite" }}>⚙️</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--black)", marginBottom: 6 }}>{publishProgress}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Isso pode levar alguns segundos...</div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn btn-md" onClick={() => setStep(2)} style={{ fontWeight: 600 }}>← Voltar</button>
                  <button className="btn btn-md btn-primary" onClick={publishDirect}
                    disabled={!canPublish}
                    style={{ flex: 1, fontWeight: 800, fontSize: 14, background: canPublish ? "#30d158" : "var(--muted)", border: "none", padding: "12px" }}>
                    🚀 Gerar com IA e Publicar agora
                  </button>
                </div>
              )}

              <p style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 12 }}>
                Você poderá editar e otimizar a oferta depois no Dashboard de vendas
              </p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
