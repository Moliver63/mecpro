import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";

export default function AdminSettings() {
  const save = trpc.admin.saveSettings.useMutation();
  const [saved, setSaved] = useState(false);
  const [general, setGeneral] = useState({ appName: "MECPro", supportEmail: "contato@mecproai.com", maxProjects: "10", maintenanceMode: false });
  const [features, setFeatures] = useState({ enableAI: true, enableStripe: true, enableOAuth: true, enableEmail: true });

  function handleSave() {
    save.mutate({ key: "general", value: JSON.stringify(general) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <Layout>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Configurações do Sistema</h1>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Configurações globais da plataforma</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Geral */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 20, fontFamily: "var(--font-display)" }}>⚙️ Geral</p>
          {[
            { label: "Nome da aplicação", k: "appName" },
            { label: "E-mail de suporte",  k: "supportEmail" },
            { label: "Máx. projetos por usuário (free)", k: "maxProjects" },
          ].map(f => (
            <div key={f.k} style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>{f.label}</label>
              <input className="input" value={(general as any)[f.k]} onChange={e => setGeneral(p => ({ ...p, [f.k]: e.target.value }))} style={{ width: "100%" }} />
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>Modo manutenção</p>
              <p style={{ fontSize: 12, color: "var(--muted)" }}>Bloqueia acesso de usuários não-admin</p>
            </div>
            <div onClick={() => setGeneral(p => ({ ...p, maintenanceMode: !p.maintenanceMode }))}
              style={{ width: 44, height: 24, borderRadius: 12, background: general.maintenanceMode ? "#ef4444" : "#e2e8f0", cursor: "pointer", position: "relative", transition: "all .2s" }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: general.maintenanceMode ? 23 : 3, transition: "all .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
            </div>
          </div>
        </div>

        {/* Features flags */}
        <div>
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24, marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 20, fontFamily: "var(--font-display)" }}>🚩 Feature Flags</p>
            {[
              { k: "enableAI",     label: "IA (Gemini)",           desc: "Geração de campanhas e análises com IA" },
              { k: "enableStripe", label: "Stripe / Pagamentos",   desc: "Checkout e gerenciamento de assinaturas" },
              { k: "enableOAuth",  label: "Login Google",          desc: "Autenticação via Google OAuth" },
              { k: "enableEmail",  label: "E-mails transacionais", desc: "Envio via Resend" },
            ].map(flag => (
              <div key={flag.k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>{flag.label}</p>
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>{flag.desc}</p>
                </div>
                <div onClick={() => setFeatures(p => ({ ...p, [flag.k]: !(p as any)[flag.k] }))}
                  style={{ width: 44, height: 24, borderRadius: 12, background: (features as any)[flag.k] ? "var(--green)" : "#e2e8f0", cursor: "pointer", position: "relative", transition: "all .2s", flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: (features as any)[flag.k] ? 23 : 3, transition: "all .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
                </div>
              </div>
            ))}
          </div>

          {/* Versão / Info */}
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 14, fontFamily: "var(--font-display)" }}>📦 Informações</p>
            {[["Versão","1.0.0"],["Stack","React + tRPC + PostgreSQL"],["Node","v20+"],["Ambiente","Development"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{k}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--black)", fontFamily: "monospace" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 14 }}>
        {saved && <span style={{ fontSize: 13, color: "var(--green-d)", fontWeight: 600 }}>✓ Configurações salvas!</span>}
        <button className="btn btn-lg btn-green" onClick={handleSave} disabled={save.isPending}>
          {save.isPending ? "Salvando..." : "💾 Salvar configurações"}
        </button>
      </div>
    </Layout>
  );
}
