import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import Layout from "@/components/layout/Layout";

const SECTIONS = [
  {
    title: "Visibilidade de Páginas",
    desc: "Controla quais módulos aparecem no menu para os usuários",
    fields: [
      { key: "showMarketplace",     label: "Marketplace",       desc: "Vitrine de produtos e serviços" },
      { key: "showAcademy",         label: "Academy",           desc: "Cursos e treinamentos" },
      { key: "showAutonomousAgent", label: "Agente Autônomo",   desc: "Painel de IA e quota" },
      { key: "showLeaderboard",     label: "Leaderboard",       desc: "Ranking de usuários" },
      { key: "showAffiliate",       label: "Afiliados",         desc: "Programa de afiliados" },
      { key: "showCashback",        label: "Cashback",          desc: "Programa de cashback" },
    ],
  },
  {
    title: "Features Ativas",
    desc: "Liga ou desliga funcionalidades específicas da plataforma",
    fields: [
      { key: "enableMarketplace", label: "Publicação no Marketplace", desc: "Permite que usuários publiquem ofertas" },
      { key: "enableTikTok",      label: "Integração TikTok Ads",    desc: "Publicação e análise no TikTok" },
      { key: "enableGoogle",      label: "Integração Google Ads",    desc: "Publicação e análise no Google" },
    ],
  },
  {
    title: "Manutenção",
    desc: "Modo de manutenção exibe aviso para usuários sem bloquear admins",
    fields: [
      { key: "maintenanceMode", label: "Modo Manutenção", desc: "Exibe banner de manutenção para todos os usuários" },
    ],
  },
];

const DEFAULTS: Record<string, boolean> = {
  showMarketplace:     true,
  showAcademy:         true,
  showAutonomousAgent: true,
  showLeaderboard:     true,
  showAffiliate:       false,
  showCashback:        false,
  enableMarketplace:   true,
  enableTikTok:        true,
  enableGoogle:        true,
  maintenanceMode:     false,
};

export default function AdminUIConfig() {
  const [config, setConfig]   = useState<Record<string, any>>(DEFAULTS);
  const [saving, setSaving]   = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty]     = useState(false);

  const getUIConfig  = (trpc as any).admin?.getUIConfig?.useQuery?.();
  const saveUIConfig = (trpc as any).admin?.saveUIConfig?.useMutation?.({
    onSuccess: () => { toast.success("◎ Configurações salvas!"); setDirty(false); },
    onError:   (e: any) => toast.error(`Erro: ${e.message}`),
  });

  useEffect(() => {
    if (getUIConfig?.data) {
      const vis = (getUIConfig.data as any)?.visibility;
      setConfig({ ...DEFAULTS, ...(vis || {}) });
      setLoading(false);
    } else if (getUIConfig?.isError) {
      setLoading(false);
    } else if (!getUIConfig?.isLoading) {
      setLoading(false);
    }
  }, [getUIConfig?.data, getUIConfig?.isLoading, getUIConfig?.isError]);

  function toggle(key: string) {
    setConfig(prev => ({ ...prev, [key]: !prev[key] }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveUIConfig?.mutateAsync({ visibility: config });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 16px 80px", fontFamily: "var(--font)" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "var(--black)", margin: "0 0 4px", letterSpacing: "-0.04em" }}>
            ⚙️ Configuração de UI
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
            Controle a visibilidade de páginas e features da plataforma em tempo real.
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>⏳ Carregando configurações...</div>
        ) : (
          <>
            {SECTIONS.map(section => (
              <div key={section.title} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 22px", marginBottom: 16 }}>
                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", margin: "0 0 3px", letterSpacing: "-0.02em" }}>
                    {section.title}
                  </h2>
                  <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>{section.desc}</p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {section.fields.map(field => {
                    const isOn = !!config[field.key];
                    return (
                      <div key={field.key}
                        onClick={() => toggle(field.key)}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                          background: isOn ? "var(--blue-l, #eff6ff)" : "var(--off)",
                          border: `1px solid ${isOn ? "var(--blue, #2563eb)22" : "var(--border)"}`,
                          transition: "all .15s",
                        }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", marginBottom: 2 }}>
                            {field.label}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>{field.desc}</div>
                        </div>

                        {/* Toggle */}
                        <div style={{
                          width: 42, height: 24, borderRadius: 12, flexShrink: 0,
                          background: isOn ? "var(--blue, #2563eb)" : "#cbd5e1",
                          position: "relative", transition: "background .2s",
                        }}>
                          <div style={{
                            position: "absolute", top: 3, left: isOn ? 20 : 3,
                            width: 18, height: 18, borderRadius: "50%",
                            background: "white", boxShadow: "0 1px 3px rgba(0,0,0,.2)",
                            transition: "left .2s",
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Save bar */}
            <div style={{
              position: "fixed", bottom: 0, left: 0, right: 0,
              background: "var(--card)", borderTop: "1px solid var(--border)",
              padding: "14px 24px", display: "flex", alignItems: "center",
              justifyContent: "space-between", zIndex: 100,
              boxShadow: "0 -4px 20px rgba(0,0,0,.08)",
            }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {dirty
                  ? "⚠️ Alterações não salvas"
                  : "✓ Configurações atualizadas"}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {dirty && (
                  <button onClick={() => { setConfig({ ...DEFAULTS, ...((getUIConfig?.data as any)?.visibility || {}) }); setDirty(false); }}
                    style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>
                    Descartar
                  </button>
                )}
                <button onClick={handleSave} disabled={saving || !dirty}
                  style={{
                    padding: "9px 24px", borderRadius: 10, border: "none",
                    background: dirty ? "var(--black, #0f172a)" : "var(--border)",
                    color: dirty ? "white" : "var(--muted)",
                    cursor: dirty && !saving ? "pointer" : "not-allowed",
                    fontSize: 13, fontWeight: 800, transition: "all .15s",
                  }}>
                  {saving ? "⏳ Salvando..." : "◎ Salvar alterações"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
