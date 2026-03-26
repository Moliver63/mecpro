import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const TABS = ["Conta", "Segurança", "Notificações", "Integrações"];

export default function Settings() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState("Conta");
  const { data: integrations } = trpc.integrations.list.useQuery();
  const metaConnected = (integrations as any[])?.some(i => i.provider === "meta" && i.isActive);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ name: user?.name || "", email: user?.email || "" });
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [notif, setNotif] = useState({ email_campaigns: true, email_analysis: true, email_system: false, browser: true });

  const updateProfile = trpc.auth.updateProfile?.useMutation?.({
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  });

  // B04 FIX: alteração de senha real via tRPC
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const changePassword = trpc.auth.changePassword?.useMutation?.({
    onSuccess: () => {
      setPwSuccess(true);
      setPwError("");
      setPwForm({ current: "", next: "", confirm: "" });
      setTimeout(() => setPwSuccess(false), 3000);
    },
    onError: (err: any) => setPwError(err.message || "Erro ao alterar senha"),
  });

  function TabBtn({ label }: { label: string; key?: string }) {
    return (
      <button onClick={() => setTab(label)} style={{
        padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
        background: tab === label ? "var(--navy)" : "transparent",
        color: tab === label ? "white" : "var(--muted)",
        transition: "all .15s"
      }}>{label}</button>
    );
  }

  return (
    <Layout>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Configurações</h1>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Gerencie sua conta e preferências</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, background: "var(--off)", borderRadius: 10, padding: 4, marginBottom: 24, width: "fit-content" }}>
        {TABS.map(t => <TabBtn key={t} label={t} />)}
      </div>

      {/* Conta */}
      {tab === "Conta" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 20, fontFamily: "var(--font-display)" }}>Informações pessoais</p>

            {/* Avatar */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "white", fontWeight: 800 }}>
                {(user?.name || "U")[0].toUpperCase()}
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)" }}>{user?.name || "Usuário"}</p>
                <p style={{ fontSize: 12, color: "var(--muted)" }}>{user?.email}</p>
                <span style={{ fontSize: 10, fontWeight: 700, background: "var(--green-xl)", color: "var(--green-dk)", padding: "2px 8px", borderRadius: 4 }}>
                  {(user as any)?.role || "user"}
                </span>
              </div>
            </div>

            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Nome</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ width: "100%", marginBottom: 16 }} />

            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>E-mail</label>
            <input className="input" value={form.email} disabled style={{ width: "100%", marginBottom: 20, opacity: .6 }} />
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 20 }}>O e-mail não pode ser alterado por aqui.</p>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {saved && <span style={{ fontSize: 13, color: "var(--green-d)", fontWeight: 600 }}>✓ Salvo!</span>}
              <button className="btn btn-md btn-green" onClick={() => updateProfile?.mutate?.(form)}>Salvar alterações</button>
            </div>
          </div>

          {/* Info do plano */}
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 20, fontFamily: "var(--font-display)" }}>Plano atual</p>
            <div style={{ background: "var(--navy)", borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: "white", fontFamily: "var(--font-display)", textTransform: "capitalize" }}>
                  {(user as any)?.plan || "Free"}
                </span>
                <span style={{ fontSize: 11, background: "var(--green)", color: "white", fontWeight: 700, padding: "3px 10px", borderRadius: 6 }}>ATIVO</span>
              </div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>Membro desde {user ? new Date((user as any).createdAt || Date.now()).toLocaleDateString("pt-BR") : "—"}</p>
            </div>
            <a href="/my-subscription" style={{ display: "block", textAlign: "center", background: "var(--green-l)", color: "var(--green-d)", fontWeight: 700, fontSize: 13, padding: "10px", borderRadius: 10, textDecoration: "none" }}>
              Ver assinatura completa →
            </a>
          </div>
        </div>
      )}

      {/* Segurança */}
      {tab === "Segurança" && (
        <div style={{ maxWidth: 480 }}>
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24, marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 20, fontFamily: "var(--font-display)" }}>Alterar senha</p>
            {["current", "next", "confirm"].map((k, i) => (
              <div key={k} style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>
                  {["Senha atual", "Nova senha", "Confirmar nova senha"][i]}
                </label>
                <input type="password" className="input" style={{ width: "100%" }}
                  value={(pwForm as any)[k]}
                  onChange={e => setPwForm(f => ({ ...f, [k]: e.target.value }))} />
              </div>
            ))}
            {pwError && (
              <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#dc2626", marginBottom:12 }}>
                ⚠️ {pwError}
              </div>
            )}
            {pwSuccess && (
              <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#15803d", marginBottom:12 }}>
                ✓ Senha alterada com sucesso!
              </div>
            )}
            <button className="btn btn-md btn-green"
              disabled={!pwForm.current || pwForm.next !== pwForm.confirm || pwForm.next.length < 8 || changePassword?.isPending}
              onClick={() => {
                setPwError("");
                changePassword?.mutate?.({ currentPassword: pwForm.current, newPassword: pwForm.next });
              }}>
              {changePassword?.isPending ? "Alterando..." : "Atualizar senha"}
            </button>
          </div>

          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 12, fontFamily: "var(--font-display)" }}>Login social</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>🔵</span>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>Google</p>
                  <p style={{ fontSize: 12, color: (user as any)?.loginMethod === "google" ? "var(--green-d)" : "var(--muted)" }}>
                    {(user as any)?.loginMethod === "google" ? "✓ Conectado" : "Não conectado"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notificações */}
      {tab === "Notificações" && (
        <div style={{ maxWidth: 520 }}>
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 20, fontFamily: "var(--font-display)" }}>Preferências de notificação</p>
            {[
              { k: "email_campaigns", label: "Campanhas geradas", desc: "Quando uma campanha com IA é concluída" },
              { k: "email_analysis",  label: "Análises prontas",  desc: "Quando a análise de concorrentes é concluída" },
              { k: "email_system",    label: "Avisos do sistema", desc: "Atualizações, manutenção, novidades" },
              { k: "browser",         label: "Notificações no browser", desc: "Alertas em tempo real" },
            ].map(n => (
              <div key={n.k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", marginBottom: 2 }}>{n.label}</p>
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>{n.desc}</p>
                </div>
                <div onClick={() => setNotif(prev => ({ ...prev, [n.k]: !(prev as any)[n.k] }))}
                  style={{ width: 44, height: 24, borderRadius: 12, background: (notif as any)[n.k] ? "var(--green)" : "#e2e8f0", cursor: "pointer", position: "relative", transition: "all .2s" }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: (notif as any)[n.k] ? 23 : 3, transition: "all .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
                </div>
              </div>
            ))}
            <button className="btn btn-md btn-green" style={{ marginTop: 20 }}>Salvar preferências</button>
          </div>
        </div>
      )}

      {/* Integrações */}
      {tab === "Integrações" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          
          
          
          {/* Alertas & Relatórios */}
          <div
            onClick={() => setLocation("/settings/alerts")}
            style={{ background: "white", border: "2px solid var(--border)", borderRadius: 14, padding: 20, cursor: "pointer", transition: "all .15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#f59e0b"; e.currentTarget.style.boxShadow = "0 4px 16px #f59e0b20"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 22 }}>🔔</span>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)" }}>Alertas & Relatórios</p>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: "#fef9c3", color: "#713f12" }}>
                Configurar
              </span>
            </div>
            <p style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700 }}>CPC/CPL alertas · Relatório semanal →</p>
          </div>

          {/* TikTok Ads — dinâmico */}
          <div
            onClick={() => setLocation("/settings/tiktok")}
            style={{ background: "white", border: `2px solid ${(integrations as any[])?.some(i => i.provider === "tiktok" && i.isActive) ? "#bbf7d0" : "var(--border)"}`, borderRadius: 14, padding: 20, cursor: "pointer", transition: "all .15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#010101"; e.currentTarget.style.boxShadow = "0 4px 16px #01010120"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = (integrations as any[])?.some(i => i.provider === "tiktok" && i.isActive) ? "#bbf7d0" : "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 22 }}>🎵</span>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)" }}>TikTok Ads</p>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: (integrations as any[])?.some(i => i.provider === "tiktok" && i.isActive) ? "var(--green-xl)" : "#fef9c3", color: (integrations as any[])?.some(i => i.provider === "tiktok" && i.isActive) ? "var(--green-dk)" : "#713f12" }}>
                {(integrations as any[])?.some(i => i.provider === "tiktok" && i.isActive) ? "✓ Conectado" : "⚠ Pendente"}
              </span>
            </div>
            <p style={{ fontSize: 12, color: "#010101", fontWeight: 700 }}>{(integrations as any[])?.some(i => i.provider === "tiktok" && i.isActive) ? "Gerenciar integração →" : "Conectar agora →"}</p>
          </div>

          {/* Google Ads — dinâmico, abre página de configuração */}
          <div
            onClick={() => setLocation("/settings/google")}
            style={{ background: "white", border: `2px solid ${(integrations as any[])?.some(i => i.provider === "google" && i.isActive) ? "#bbf7d0" : "var(--border)"}`, borderRadius: 14, padding: 20, cursor: "pointer", transition: "all .15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#1a73e8"; e.currentTarget.style.boxShadow = "0 4px 16px #1a73e820"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = (integrations as any[])?.some(i => i.provider === "google" && i.isActive) ? "#bbf7d0" : "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 22 }}>🔵</span>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)" }}>Google Ads</p>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: (integrations as any[])?.some(i => i.provider === "google" && i.isActive) ? "var(--green-xl)" : "#fef9c3", color: (integrations as any[])?.some(i => i.provider === "google" && i.isActive) ? "var(--green-dk)" : "#713f12" }}>
                {(integrations as any[])?.some(i => i.provider === "google" && i.isActive) ? "✓ Conectado" : "⚠ Pendente"}
              </span>
            </div>
            <p style={{ fontSize: 12, color: "#1a73e8", fontWeight: 700 }}>{(integrations as any[])?.some(i => i.provider === "google" && i.isActive) ? "Gerenciar integração →" : "Conectar agora →"}</p>
          </div>

          {/* Meta Ads — dinâmico, abre página de configuração */}
          <div
            onClick={() => setLocation("/settings/meta")}
            style={{ background: "white", border: `2px solid ${metaConnected ? "#bbf7d0" : "var(--border)"}`, borderRadius: 14, padding: 20, cursor: "pointer", transition: "all .15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#1877f2"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(24,119,242,.1)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = metaConnected ? "#bbf7d0" : "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 24 }}>📘</span>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)" }}>Meta Ads</p>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: metaConnected ? "var(--green-xl)" : "#fef9c3", color: metaConnected ? "var(--green-dk)" : "#713f12" }}>
                {metaConnected ? "✓ Conectado" : "⚠ Pendente"}
              </span>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Publique campanhas e acesse métricas reais da sua conta</p>
            <p style={{ fontSize: 12, color: "#1877f2", fontWeight: 700 }}>{metaConnected ? "Gerenciar integração →" : "Conectar agora →"}</p>
          </div>

          {/* IA MECPro — B05 FIX: marca proprietária */}
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 24 }}>🤖</span>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)" }}>IA MECPro</p>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: "var(--green-xl)", color: "var(--green-dk)" }}>✓ Ativo</span>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Motor de inteligência artificial proprietário MECPro</p>
            <p style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>IA MECPro v2.0 — Configurada e operacional</p>
          </div>

          {/* Stripe */}
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 24 }}>💳</span>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)" }}>Stripe</p>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: "var(--green-xl)", color: "var(--green-dk)" }}>✓ Ativo</span>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Pagamentos e assinaturas</p>
            <p style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>Configurado via STRIPE_SECRET_KEY</p>
          </div>

          {/* Resend */}
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 24 }}>📧</span>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)" }}>Resend</p>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: "var(--green-xl)", color: "var(--green-dk)" }}>✓ Ativo</span>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Envio de e-mails transacionais</p>
            <p style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>Configurado via RESEND_API_KEY</p>
          </div>

        </div>
      )}
    </Layout>
  );
}
