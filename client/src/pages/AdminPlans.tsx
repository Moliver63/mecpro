import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";

// Preços reais definidos no seed (em centavos)
// Free: 0 | Basic: 9700 (R$97) | Premium: 19700 (R$197) | VIP: 39700 (R$397)

const PLAN_META: Record<string, { color: string; bg: string; icon: string; highlight?: boolean }> = {
  free:    { color: "#64748b", bg: "#f8fafc",       icon: "🆓" },
  basic:   { color: "#2563eb", bg: "#eff6ff",       icon: "⚡" },
  premium: { color: "#16a34a", bg: "var(--green-l)", icon: "◈", highlight: true },
  vip:     { color: "#7c3aed", bg: "#f5f3ff",       icon: "◇" },
};

const FEATURE_LABELS: Record<string, string> = {
  hasAiAnalysis:       "Análise com IA (Gemini)",
  hasMetaIntegration:  "Integração Meta Ads Library",
  hasGoogleIntegration:"Integração Google Ads",
  hasExportPdf:        "Exportar relatórios PDF",
  hasExportXlsx:       "Exportar relatórios XLSX",
};

const EMPTY_PLAN = {
  name: "", slug: "", description: "",
  price: 0, billingInterval: "month" as "month" | "year",
  maxProjects: 1, maxCompetitors: 5,
  hasAiAnalysis: 0, hasMetaIntegration: 0, hasGoogleIntegration: 0,
  hasExportPdf: 0, hasExportXlsx: 0,
  stripePriceId: "", isActive: 1,
};

export default function AdminPlans() {
  const { data: plans, refetch, isLoading } = trpc.admin.listPlans.useQuery();
  const upsert = trpc.admin.upsertPlan.useMutation({ onSuccess: () => { refetch(); setEditing(null); setSavedId(null); } });
  const remove = trpc.admin.deletePlan?.useMutation?.({ onSuccess: () => refetch() });

  const [editing, setEditing]   = useState<any>(null);
  const [savedId, setSavedId]   = useState<number | null>(null);
  const [view, setView]         = useState<"cards" | "table">("cards");
  const [confirmDel, setConfirmDel] = useState<any>(null);

  function openEdit(plan: any) { setEditing({ ...plan }); }
  function openNew()           { setEditing({ ...EMPTY_PLAN }); }

  function handleSave() {
    if (!editing?.name || !editing?.slug) return;
    upsert.mutate(editing, {
      onSuccess: (saved: any) => { setSavedId(saved?.id); setTimeout(() => setSavedId(null), 2000); }
    });
  }

  const fmt = (cents: number) =>
    cents === 0 ? "Grátis" : `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

  const Toggle = ({ k }: { k: string }) => (
    <div
      onClick={() => setEditing((p: any) => ({ ...p, [k]: p[k] ? 0 : 1 }))}
      style={{ width: 44, height: 24, borderRadius: 12, background: editing?.[k] ? "var(--green)" : "#e2e8f0", cursor: "pointer", position: "relative", transition: "background .2s", flexShrink: 0 }}>
      <div style={{ width: 18, height: 18, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: editing?.[k] ? 23 : 3, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
    </div>
  );

  return (
    <Layout>
      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Planos de Assinatura</h1>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>Gerencie preços, features e limites de cada plano</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {/* Toggle view */}
          <div style={{ display: "flex", background: "var(--off)", borderRadius: 8, padding: 3, gap: 2 }}>
            {(["cards", "table"] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: view === v ? "white" : "transparent", color: view === v ? "var(--black)" : "var(--muted)" }}>
                {v === "cards" ? "⊞ Cards" : "☰ Tabela"}
              </button>
            ))}
          </div>
          <button className="btn btn-md btn-green" onClick={openNew}>+ Novo plano</button>
        </div>
      </div>

      {/* Modal de confirmação delete */}
      {confirmDel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: 16, padding: 28, width: 400, boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
            <p style={{ fontSize: 18, fontWeight: 800, color: "#dc2626", marginBottom: 8 }}>Desativar plano?</p>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>O plano <strong>{confirmDel.name}</strong> será desativado. Usuários existentes não serão afetados.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-md btn-danger" style={{ flex: 1 }} onClick={() => { remove?.mutate({ id: confirmDel.id }); setConfirmDel(null); }}>Desativar</button>
              <button className="btn btn-md btn-ghost" onClick={() => setConfirmDel(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Editor Drawer */}
      {editing && (
        <div style={{ background: "white", border: "1.5px solid var(--green)", borderRadius: 16, padding: 28, marginBottom: 28, boxShadow: "0 4px 24px rgba(34,197,94,.1)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: "var(--black)", fontFamily: "var(--font-display)" }}>
              {editing.id ? `✏️ Editando: ${editing.name}` : "✨ Novo plano"}
            </p>
            <button onClick={() => setEditing(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--muted)" }}>✕</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 20 }}>
            {/* Coluna 1: Identidade */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Identidade</p>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Nome do plano <span style={{ color: "#ef4444" }}>*</span></label>
                <input className="input" value={editing.name} onChange={e => setEditing((p: any) => ({ ...p, name: e.target.value }))} placeholder="Ex: Premium" style={{ width: "100%" }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Slug <span style={{ color: "#ef4444" }}>*</span></label>
                <input className="input" value={editing.slug} onChange={e => setEditing((p: any) => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s/g, "-") }))} placeholder="Ex: premium" style={{ width: "100%", fontFamily: "monospace" }} />
                <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Usado internamente. Não altere após criar.</p>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Descrição</label>
                <textarea className="input" rows={2} value={editing.description || ""} onChange={e => setEditing((p: any) => ({ ...p, description: e.target.value }))} placeholder="Frase curta do plano..." style={{ width: "100%", resize: "none" }} />
              </div>
            </div>

            {/* Coluna 2: Preço e Limites */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Preço & Limites</p>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Preço (centavos) <span style={{ color: "#ef4444" }}>*</span></label>
                <input className="input" type="number" min={0} value={editing.price} onChange={e => setEditing((p: any) => ({ ...p, price: Number(e.target.value) }))} style={{ width: "100%" }} />
                <p style={{ fontSize: 11, color: "var(--green-d)", marginTop: 4, fontWeight: 600 }}>
                  = {fmt(editing.price)}
                  {editing.billingInterval === "month" ? "/mês" : "/ano"}
                </p>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Período</label>
                <select className="input" value={editing.billingInterval} onChange={e => setEditing((p: any) => ({ ...p, billingInterval: e.target.value }))} style={{ width: "100%" }}>
                  <option value="month">Mensal</option>
                  <option value="year">Anual</option>
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Máx. projetos</label>
                  <input className="input" type="number" min={-1} value={editing.maxProjects ?? ""} placeholder="null = ∞" onChange={e => setEditing((p: any) => ({ ...p, maxProjects: e.target.value === "" ? null : Number(e.target.value) }))} style={{ width: "100%" }} />
                  <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>Vazio = ilimitado</p>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Máx. concorrentes</label>
                  <input className="input" type="number" min={-1} value={editing.maxCompetitors ?? ""} placeholder="null = ∞" onChange={e => setEditing((p: any) => ({ ...p, maxCompetitors: e.target.value === "" ? null : Number(e.target.value) }))} style={{ width: "100%" }} />
                  <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>Vazio = ilimitado</p>
                </div>
              </div>
            </div>

            {/* Coluna 3: Features & Stripe */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Features & Integração</p>
              <div style={{ marginBottom: 16 }}>
                {Object.entries(FEATURE_LABELS).map(([k, label]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 12, color: "var(--body)" }}>{label}</span>
                    <Toggle k={k} />
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Stripe Price ID</label>
                <input className="input" value={editing.stripePriceId || ""} onChange={e => setEditing((p: any) => ({ ...p, stripePriceId: e.target.value }))} placeholder="price_..." style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }} />
                <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Cole o ID do Stripe Dashboard</p>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--black)" }}>Plano ativo</span>
                <div onClick={() => setEditing((p: any) => ({ ...p, isActive: p.isActive ? 0 : 1 }))}
                  style={{ width: 44, height: 24, borderRadius: 12, background: editing.isActive ? "var(--green)" : "#e2e8f0", cursor: "pointer", position: "relative", transition: "background .2s" }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: editing.isActive ? 23 : 3, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
                </div>
              </div>
            </div>
          </div>

          {/* Footer do editor */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <button className="btn btn-lg btn-green" onClick={handleSave} disabled={upsert.isLoading || !editing.name || !editing.slug}>
              {upsert.isLoading ? "Salvando..." : editing.id ? "💾 Salvar alterações" : "✨ Criar plano"}
            </button>
            <button className="btn btn-lg btn-ghost" onClick={() => setEditing(null)}>Cancelar</button>
            {savedId && <span style={{ fontSize: 13, color: "var(--green-d)", fontWeight: 700 }}>✓ Plano salvo com sucesso!</span>}
            {upsert.isError && <span style={{ fontSize: 13, color: "#dc2626", fontWeight: 600 }}>Erro ao salvar. Verifique os campos.</span>}
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div style={{ textAlign: "center", padding: 60, color: "var(--muted)", fontSize: 14 }}>Carregando planos...</div>
      )}

      {/* VIEW: CARDS */}
      {!isLoading && view === "cards" && (
        <>
          {/* Banner de preços */}
          <div style={{ background: "var(--navy)", borderRadius: 16, padding: "20px 28px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ fontSize: 16, fontWeight: 800, color: "white", fontFamily: "var(--font-display)", marginBottom: 4 }}>Preços atuais da plataforma</p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,.6)" }}>Estes são os valores exibidos aos clientes. Qualquer edição reflete imediatamente na página de preços.</p>
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              {(plans || []).filter((p: any) => p.isActive).map((p: any) => (
                <div key={p.id} style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,.5)", textTransform: "capitalize", marginBottom: 2 }}>{p.name}</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: "white", fontFamily: "var(--font-display)" }}>{fmt(p.price)}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18 }}>
            {(plans || []).map((plan: any) => {
              const meta = PLAN_META[plan.slug] || { color: "#64748b", bg: "#f8fafc", icon: "📦" };
              const features = Object.entries(FEATURE_LABELS).filter(([k]) => plan[k] === 1);
              const isSaved = savedId === plan.id;
              return (
                <div key={plan.id} style={{
                  background: "white",
                  border: `2px solid ${meta.highlight ? "var(--green)" : isSaved ? "var(--green)" : plan.isActive ? "var(--border)" : "#fecaca"}`,
                  borderRadius: 18, padding: 22, position: "relative",
                  opacity: plan.isActive ? 1 : .65,
                  boxShadow: meta.highlight ? "0 0 0 4px rgba(34,197,94,.08)" : "none",
                  transition: "border-color .3s",
                }}>
                  {meta.highlight && plan.isActive && (
                    <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "var(--green)", color: "white", fontSize: 10, fontWeight: 800, padding: "3px 14px", borderRadius: 20, whiteSpace: "nowrap" }}>
                      MAIS POPULAR
                    </div>
                  )}
                  {!plan.isActive && (
                    <div style={{ position: "absolute", top: 12, right: 12, background: "#fef2f2", color: "#dc2626", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>INATIVO</div>
                  )}
                  {isSaved && (
                    <div style={{ position: "absolute", top: 12, right: 12, background: "var(--green-xl)", color: "var(--green-dk)", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>✓ SALVO</div>
                  )}

                  {/* Cabeçalho */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: meta.bg, border: `1.5px solid ${meta.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                      {meta.icon}
                    </div>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 800, color: "var(--black)", fontFamily: "var(--font-display)" }}>{plan.name}</p>
                      <p style={{ fontSize: 11, color: "var(--muted)" }}>{plan.description || "—"}</p>
                    </div>
                  </div>

                  {/* Preço */}
                  <div style={{ background: meta.bg, borderRadius: 12, padding: "14px 16px", marginBottom: 16, border: `1px solid ${meta.color}22` }}>
                    <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Preço atual</p>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                      <span style={{ fontSize: 30, fontWeight: 900, color: meta.color, fontFamily: "var(--font-display)", lineHeight: 1 }}>
                        {fmt(plan.price)}
                      </span>
                      {plan.price > 0 && (
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>/{plan.billingInterval === "month" ? "mês" : "ano"}</span>
                      )}
                    </div>
                    {plan.stripePriceId && (
                      <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 4, fontFamily: "monospace" }}>Stripe: {plan.stripePriceId.slice(0, 22)}...</p>
                    )}
                  </div>

                  {/* Limites */}
                  <div style={{ marginBottom: 14 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: .5 }}>Limites</p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ flex: 1, background: "var(--off)", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                        <p style={{ fontSize: 16, fontWeight: 800, color: "var(--black)", fontFamily: "var(--font-display)" }}>
                          {plan.maxProjects == null ? "∞" : plan.maxProjects}
                        </p>
                        <p style={{ fontSize: 10, color: "var(--muted)" }}>projetos</p>
                      </div>
                      <div style={{ flex: 1, background: "var(--off)", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                        <p style={{ fontSize: 16, fontWeight: 800, color: "var(--black)", fontFamily: "var(--font-display)" }}>
                          {plan.maxCompetitors == null ? "∞" : plan.maxCompetitors}
                        </p>
                        <p style={{ fontSize: 10, color: "var(--muted)" }}>concorrentes</p>
                      </div>
                    </div>
                  </div>

                  {/* Features */}
                  <div style={{ marginBottom: 18 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: .5 }}>Features</p>
                    {Object.entries(FEATURE_LABELS).map(([k, label]) => (
                      <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: plan[k] ? "var(--green)" : "#e2e8f0", lineHeight: 1 }}>{plan[k] ? "✓" : "✗"}</span>
                        <span style={{ fontSize: 12, color: plan[k] ? "var(--body)" : "var(--muted)" }}>{label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Ações */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-sm btn-green" style={{ flex: 1 }} onClick={() => openEdit(plan)}>✏️ Editar</button>
                    {plan.slug !== "free" && plan.isActive && (
                      <button className="btn btn-sm btn-ghost" style={{ color: "#ef4444", padding: "0 10px" }} onClick={() => setConfirmDel(plan)} title="Desativar">🗑</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* VIEW: TABLE */}
      {!isLoading && view === "table" && (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--off)" }}>
                {["Plano", "Preço", "Período", "Projetos", "Concorrentes", "IA", "Meta", "Google", "PDF", "XLSX", "Stripe ID", "Status", "Ações"].map(h => (
                  <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--muted)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(plans || []).map((p: any) => {
                const meta = PLAN_META[p.slug] || { color: "#64748b", icon: "📦" };
                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--border)", background: p.isActive ? "white" : "#fff5f5" }}>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{meta.icon}</span>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>{p.name}</p>
                          <p style={{ fontSize: 10, color: "var(--muted)", fontFamily: "monospace" }}>{p.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: meta.color, fontFamily: "var(--font-display)" }}>{fmt(p.price)}</p>
                    </td>
                    <td style={{ padding: "12px 14px", fontSize: 12, color: "var(--muted)" }}>{p.billingInterval === "month" ? "Mensal" : "Anual"}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 700, color: "var(--black)", textAlign: "center" }}>{p.maxProjects ?? "∞"}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 700, color: "var(--black)", textAlign: "center" }}>{p.maxCompetitors ?? "∞"}</td>
                    {["hasAiAnalysis","hasMetaIntegration","hasGoogleIntegration","hasExportPdf","hasExportXlsx"].map(k => (
                      <td key={k} style={{ padding: "12px 14px", textAlign: "center" }}>
                        <span style={{ fontSize: 14, color: p[k] ? "var(--green)" : "#e2e8f0" }}>{p[k] ? "✓" : "✗"}</span>
                      </td>
                    ))}
                    <td style={{ padding: "12px 14px", fontSize: 10, color: "var(--muted)", fontFamily: "monospace", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.stripePriceId || "—"}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: p.isActive ? "var(--green-xl)" : "#fef2f2", color: p.isActive ? "var(--green-dk)" : "#dc2626" }}>
                        {p.isActive ? "ATIVO" : "INATIVO"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-sm btn-outline" style={{ fontSize: 11 }} onClick={() => openEdit(p)}>Editar</button>
                        {p.slug !== "free" && p.isActive && (
                          <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, color: "#ef4444" }} onClick={() => setConfirmDel(p)}>✕</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Aviso Stripe */}
      {!isLoading && (
        <div style={{ marginTop: 20, background: "#fef9c3", border: "1px solid #fde047", borderRadius: 12, padding: "14px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ fontSize: 20 }}>◬</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#713f12", marginBottom: 2 }}>Configure os Stripe Price IDs para ativar o checkout</p>
            <p style={{ fontSize: 12, color: "#92400e" }}>No Stripe Dashboard → Products → copie o Price ID de cada plano e cole no campo "Stripe Price ID" acima. Rode <code style={{ background: "#fef08a", padding: "1px 4px", borderRadius: 3 }}>pnpm seed:plans</code> para criar os planos padrão no banco.</p>
          </div>
        </div>
      )}
    </Layout>
  );
}
