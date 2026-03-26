import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/hooks/useAuth";

export default function EditProfile() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ name: "", bio: "", phone: "", company: "", website: "" });

  useEffect(() => {
    if (user) setForm(f => ({ ...f, name: (user as any).name || "" }));
  }, [user]);

  function handleSave() {
    setSaved(true);
    setTimeout(() => { setSaved(false); setLocation("/profile"); }, 1800);
  }

  return (
    <Layout>
      <div style={{ marginBottom: 24 }}>
        <button className="btn btn-sm btn-ghost" onClick={() => setLocation("/profile")} style={{ paddingLeft: 0, marginBottom: 10 }}>← Perfil</button>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Editar Perfil</h1>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Atualize suas informações pessoais</p>
      </div>

      <div style={{ maxWidth: 600 }}>
        {/* Avatar */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24, marginBottom: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 18, fontFamily: "var(--font-display)" }}>Foto de perfil</p>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: "white", fontWeight: 800 }}>
              {form.name[0]?.toUpperCase() || "U"}
            </div>
            <div>
              <button className="btn btn-sm btn-outline" onClick={() => alert("Upload de foto em breve.")}>Trocar foto</button>
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>JPG ou PNG, máximo 2MB</p>
            </div>
          </div>
        </div>

        {/* Dados pessoais */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24, marginBottom: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 18, fontFamily: "var(--font-display)" }}>Dados pessoais</p>
          {[
            { label: "Nome completo", k: "name", placeholder: "Seu nome" },
            { label: "Telefone", k: "phone", placeholder: "+55 (11) 99999-9999" },
            { label: "Empresa", k: "company", placeholder: "Nome da sua empresa" },
            { label: "Site", k: "website", placeholder: "https://..." },
          ].map(field => (
            <div key={field.k} style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>{field.label}</label>
              <input className="input" placeholder={field.placeholder} value={(form as any)[field.k]}
                onChange={e => setForm(f => ({ ...f, [field.k]: e.target.value }))}
                style={{ width: "100%" }} />
            </div>
          ))}
          <div style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Bio</label>
            <textarea className="input" rows={3} placeholder="Conte um pouco sobre você..."
              value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
              style={{ width: "100%", resize: "vertical" }} />
          </div>
        </div>

        {/* E-mail (readonly) */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 18, fontFamily: "var(--font-display)" }}>E-mail</p>
          <input className="input" value={user?.email || ""} disabled style={{ width: "100%", opacity: .6 }} />
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>Para alterar o e-mail, entre em contato com o suporte.</p>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {saved && <span style={{ fontSize: 13, color: "var(--green-d)", fontWeight: 600 }}>✓ Perfil atualizado!</span>}
          <button className="btn btn-lg btn-green" onClick={handleSave}>💾 Salvar alterações</button>
          <button className="btn btn-lg btn-ghost" onClick={() => setLocation("/profile")}>Cancelar</button>
        </div>
      </div>
    </Layout>
  );
}
