import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";

export default function AdminAccountSettings() {
  const { user } = useAuth();
  const [tab, setTab]     = useState<"profile"|"security"|"notifications">("profile");
  const [saved, setSaved] = useState(false);
  const [form, setForm]   = useState({ name: (user as any)?.name || "", email: (user as any)?.email || "" });
  const [pw, setPw]       = useState({ current: "", next: "", confirm: "" });

  function handleSave() { setSaved(true); setTimeout(() => setSaved(false), 2000); }

  return (
    <Layout>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Minha Conta Admin</h1>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Configurações da sua conta de administrador</p>
      </div>

      <div style={{ display: "flex", gap: 4, background: "var(--off)", borderRadius: 10, padding: 4, width: "fit-content", marginBottom: 24 }}>
        {(["profile","security","notifications"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: tab===t?"white":"transparent", color: tab===t?"var(--black)":"var(--muted)" }}>
            {t === "profile" ? "Perfil" : t === "security" ? "Segurança" : "Notificações"}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <div style={{ maxWidth: 520 }}>
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid var(--border)" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "white", fontWeight: 800 }}>
                {(form.name || "A")[0].toUpperCase()}
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: "var(--black)" }}>{form.name || "Admin"}</p>
                <span style={{ fontSize: 11, fontWeight: 700, background: "#f5f3ff", color: "#7c3aed", padding: "2px 10px", borderRadius: 6 }}>
                  {(user as any)?.role?.toUpperCase()}
                </span>
              </div>
            </div>
            {[
              { label: "Nome", k: "name" },
              { label: "E-mail", k: "email", disabled: true },
            ].map(f => (
              <div key={f.k} style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>{f.label}</label>
                <input className="input" value={(form as any)[f.k]} disabled={f.disabled} onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))} style={{ width: "100%", opacity: f.disabled ? .6 : 1 }} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4 }}>
              {saved && <span style={{ fontSize: 13, color: "var(--green-d)", fontWeight: 600 }}>✓ Salvo!</span>}
              <button className="btn btn-md btn-green" onClick={handleSave}>Salvar alterações</button>
            </div>
          </div>
        </div>
      )}

      {tab === "security" && (
        <div style={{ maxWidth: 480 }}>
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24, marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 20 }}>Alterar senha</p>
            {[["current","Senha atual"],["next","Nova senha"],["confirm","Confirmar nova senha"]].map(([k, label]) => (
              <div key={k} style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>{label}</label>
                <input type="password" className="input" style={{ width: "100%" }} value={(pw as any)[k]} onChange={e => setPw(p => ({ ...p, [k]: e.target.value }))} />
              </div>
            ))}
            <button className="btn btn-md btn-green" disabled={!pw.current || pw.next !== pw.confirm || pw.next.length < 8}>Atualizar senha</button>
          </div>
          <div style={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: 12, padding: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#713f12", marginBottom: 4 }}>⚠ Sessão ativa</p>
            <p style={{ fontSize: 12, color: "#92400e" }}>Você está logado como administrador. Mantenha sua senha segura.</p>
          </div>
        </div>
      )}

      {tab === "notifications" && (
        <div style={{ maxWidth: 500 }}>
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 20 }}>Alertas de admin</p>
            {[
              { label: "Novo usuário cadastrado", desc: "Receber e-mail quando um novo usuário se registrar" },
              { label: "Pagamento realizado",     desc: "Notificação de novas assinaturas" },
              { label: "Usuário suspenso",        desc: "Log de ações de moderação" },
              { label: "Erro no sistema",         desc: "Alertas críticos do servidor" },
            ].map((n, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>{n.label}</p>
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>{n.desc}</p>
                </div>
                <div style={{ width: 44, height: 24, borderRadius: 12, background: i < 2 ? "var(--green)" : "#e2e8f0", cursor: "pointer", position: "relative" }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: i < 2 ? 23 : 3, boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}
