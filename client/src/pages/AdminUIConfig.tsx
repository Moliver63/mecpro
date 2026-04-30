/**
 * AdminUIConfig.tsx — Controle de visibilidade do menu para usuários
 * Admin define quais páginas aparecem no sidebar de cada usuário
 */
import { useState, useEffect } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// Espelho exato do NAV_USER do Layout
const ALL_PAGES = [
  { key: "dashboard",        label: "Dashboard",        icon: "⊞", desc: "Painel principal do usuário",                          alwaysVisible: true },
  { key: "projects",         label: "Projetos",          icon: "◫", desc: "Gestão de projetos e campanhas",                       alwaysVisible: true },
  { key: "meta-campaigns",   label: "Meta Ads",          icon: "◈", desc: "Publicação no Facebook e Instagram Ads",               alwaysVisible: false },
  { key: "google-campaigns", label: "Google Ads",        icon: "◉", desc: "Publicação no Google Search e Display",                alwaysVisible: false },
  { key: "tiktok-campaigns", label: "TikTok Ads",        icon: "◍", desc: "Publicação e gestão de campanhas TikTok",              alwaysVisible: false },
  { key: "autonomous-agent", label: "Agente Autônomo",   icon: "⟳", desc: "Motor híbrido de geração automática de campanhas",     alwaysVisible: false },
  { key: "financeiro",       label: "Financeiro",        icon: "▣", desc: "Saldo de mídia, recargas e histórico de transações",   alwaysVisible: false },
  { key: "marketplace",      label: "Marketplace",       icon: "🛒", desc: "Vitrine de serviços e anúncios",                       alwaysVisible: false },
  { key: "academy",          label: "Academia",          icon: "⊙", desc: "Cursos, mini-aulas e certificados",                    alwaysVisible: false },
  { key: "notifications",    label: "Notificações",      icon: "◻", desc: "Central de alertas e notificações",                    alwaysVisible: false },
  { key: "messages",         label: "Mensagens",         icon: "◷", desc: "Histórico de mensagens",                              alwaysVisible: false },
  { key: "my-subscription",  label: "Assinatura",        icon: "⊘", desc: "Plano atual, upgrade e histórico de cobranças",        alwaysVisible: false },
  { key: "settings",         label: "Configurações",     icon: "⚙", desc: "Perfil, senha e preferências do usuário",              alwaysVisible: true },
];

// Presets rápidos
const PRESETS: Record<string, { label: string; desc: string; keys: string[] }> = {
  minimal: {
    label: "Mínimo",
    desc: "Só o essencial — Dashboard, Projetos e Configurações",
    keys: [],  // alwaysVisible handles dashboard/projects/settings
  },
  campaigns: {
    label: "Campanhas",
    desc: "Focado em campanhas — adiciona Meta, Google e TikTok",
    keys: ["meta-campaigns", "google-campaigns", "tiktok-campaigns"],
  },
  full: {
    label: "Completo",
    desc: "Tudo visível — exibe todas as páginas",
    keys: ALL_PAGES.filter(p => !p.alwaysVisible).map(p => p.key),
  },
  saas: {
    label: "SaaS",
    desc: "Ideal para agências — Campanhas + Financeiro + Academia",
    keys: ["meta-campaigns", "google-campaigns", "financeiro", "academy", "my-subscription"],
  },
};

export default function AdminUIConfig() {
  const { data: uiConfig, refetch } = (trpc as any).public?.getUIConfig?.useQuery?.() ?? { data: null, refetch: () => {} };
  const saveConfig = (trpc as any).public?.saveUIConfig?.useMutation?.({
    onSuccess: () => { toast.success("Configuração salva! Usuários verão o menu atualizado."); refetch(); },
    onError:   (e: any) => toast.error(e.message || "Erro ao salvar"),
  });

  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if ((uiConfig as any)?.visibility) {
      setVisibility((uiConfig as any).visibility);
    }
  }, [uiConfig]);

  const toggle = (key: string, val: boolean) => {
    setVisibility(v => ({ ...v, [key]: val }));
    setDirty(true);
  };

  const applyPreset = (preset: keyof typeof PRESETS) => {
    const p = PRESETS[preset];
    const newVis: Record<string, boolean> = {};
    ALL_PAGES.forEach(page => {
      if (page.alwaysVisible) return; // não controla
      newVis[page.key] = p.keys.includes(page.key);
    });
    setVisibility(newVis);
    setDirty(true);
    toast.info(`Preset "${p.label}" aplicado — salve para confirmar`);
  };

  const save = () => {
    saveConfig?.mutate({ visibility });
    setDirty(false);
  };

  const isVisible = (key: string) => {
    if (!(key in visibility)) return true; // padrão: visível
    return visibility[key];
  };

  const visibleCount = ALL_PAGES.filter(p => p.alwaysVisible || isVisible(p.key)).length;

  return (
    <Layout>
      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>
            Visibilidade do Menu
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
            Controle quais páginas aparecem no sidebar dos usuários. Admins sempre veem tudo.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {visibleCount} de {ALL_PAGES.length} páginas visíveis
          </span>
          {dirty && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#d97706", background: "#fef3c7", padding: "3px 10px", borderRadius: 99, border: "1px solid #fde68a" }}>
              Não salvo
            </span>
          )}
          <button
            onClick={save}
            disabled={saveConfig?.isPending || !dirty}
            style={{
              background: dirty ? "var(--green)" : "#e5e7eb",
              color: dirty ? "white" : "#9ca3af",
              border: "none", borderRadius: 10, padding: "9px 22px",
              fontSize: 13, fontWeight: 700, cursor: dirty ? "pointer" : "default",
              transition: "all .15s",
            }}>
            {saveConfig?.isPending ? "Salvando..." : "💾 Salvar"}
          </button>
        </div>
      </div>

      {/* Presets */}
      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 24px", marginBottom: 20 }}>
        <p style={{ fontWeight: 700, fontSize: 13, color: "var(--black)", marginBottom: 14 }}>⚡ Presets rápidos</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          {Object.entries(PRESETS).map(([k, p]) => (
            <button
              key={k}
              onClick={() => applyPreset(k as keyof typeof PRESETS)}
              style={{
                background: "#f9fafb", border: "1px solid var(--border)", borderRadius: 12,
                padding: "14px 16px", textAlign: "left", cursor: "pointer",
                transition: "all .15s", fontFamily: "inherit",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--green)"; (e.currentTarget as HTMLElement).style.background = "#f0fdf4"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.background = "#f9fafb"; }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: "var(--black)", marginBottom: 4 }}>{p.label}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Toggle list */}
      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: "var(--black)", margin: 0 }}>Páginas individuais</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { const v: Record<string,boolean> = {}; ALL_PAGES.filter(p => !p.alwaysVisible).forEach(p => { v[p.key] = true; }); setVisibility(v); setDirty(true); }}
              style={{ fontSize: 11, fontWeight: 600, color: "var(--green)", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}>
              Mostrar todas
            </button>
            <button
              onClick={() => { const v: Record<string,boolean> = {}; ALL_PAGES.filter(p => !p.alwaysVisible).forEach(p => { v[p.key] = false; }); setVisibility(v); setDirty(true); }}
              style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}>
              Ocultar todas
            </button>
          </div>
        </div>

        {ALL_PAGES.map((page, i) => {
          const visible  = page.alwaysVisible || isVisible(page.key);
          const isLast   = i === ALL_PAGES.length - 1;
          return (
            <div
              key={page.key}
              style={{
                display: "flex", alignItems: "center", gap: 16,
                padding: "14px 24px",
                borderBottom: isLast ? "none" : "1px solid var(--border)",
                background: visible ? "white" : "#fafafa",
                transition: "background .15s",
              }}>
              {/* Icon */}
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: visible ? "var(--green-l)" : "#f1f5f9",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 17, transition: "all .2s",
              }}>
                {page.icon}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: visible ? "var(--black)" : "#9ca3af" }}>
                    {page.label}
                  </span>
                  {page.alwaysVisible && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe" }}>
                      Sempre visível
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>{page.desc}</p>
              </div>

              {/* Toggle */}
              {page.alwaysVisible ? (
                <div style={{ width: 44, height: 24, borderRadius: 99, background: "#d1fae5", display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 3px", flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#16a34a" }} />
                </div>
              ) : (
                <button
                  onClick={() => toggle(page.key, !visible)}
                  style={{
                    width: 44, height: 24, borderRadius: 99, border: "none", cursor: "pointer",
                    background: visible ? "#16a34a" : "#e2e8f0",
                    display: "flex", alignItems: "center",
                    justifyContent: visible ? "flex-end" : "flex-start",
                    padding: "0 3px", transition: "all .2s", flexShrink: 0,
                  }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "white", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
                </button>
              )}

              {/* Status */}
              <span style={{
                fontSize: 11, fontWeight: 700, minWidth: 52, textAlign: "center",
                color: visible ? "#16a34a" : "#9ca3af",
              }}>
                {page.alwaysVisible ? "Fixo" : visible ? "Visível" : "Oculto"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Note */}
      <div style={{ marginTop: 16, padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10 }}>
        <p style={{ margin: 0, fontSize: 12, color: "#92400e", lineHeight: 1.6 }}>
          <strong>Nota:</strong> Usuários com role <strong>admin</strong> ou <strong>superadmin</strong> sempre veem o menu completo, independente desta configuração.
          As páginas ocultas continuam acessíveis via URL direta — isso controla apenas a visibilidade no menu lateral.
        </p>
      </div>
    </Layout>
  );
}
