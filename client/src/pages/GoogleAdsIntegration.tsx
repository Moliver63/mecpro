import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function GoogleAdsIntegration() {
  const [, setLocation] = useLocation();
  const [clientId, setClientId]         = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [developerToken, setDeveloperToken] = useState("");
  const [customerId, setCustomerId]     = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [loading, setLoading]           = useState(false);

  const { data: integrations, refetch } =
    trpc.integrations.list.useQuery(undefined, { retry: false });

  const existingGoogle = (integrations as any[])?.find(
    (i) => i.provider === "google" && i.isActive
  );

  const upsertGoogle = trpc.integrations.upsertGoogle.useMutation({
    onSuccess: () => {
      toast.success("◎ Google Ads conectado com sucesso!");
      refetch();
      setLoading(false);
    },
    onError: (e) => {
      toast.error("Erro ao salvar: " + e.message);
      setLoading(false);
    },
  });

  const deleteGoogle = trpc.integrations.delete.useMutation({
    onSuccess: () => {
      toast.success("Integração Google Ads removida.");
      refetch();
    },
  });

  const testGoogle = trpc.integrations.testGoogle.useMutation({
    onSuccess: (d: any) => toast.success(`◎ Token válido — conta: ${d.name}`),
    onError: (e) => toast.error("Token inválido: " + e.message),
  });

  const handleSave = () => {
    if (!refreshToken) { toast.error("Refresh Token obrigatório"); return; }
    if (!customerId)    { toast.error("Customer ID obrigatório"); return; }
    if (!developerToken){ toast.error("Developer Token obrigatório"); return; }
    setLoading(true);
    upsertGoogle.mutate({ clientId, clientSecret, developerToken, customerId, refreshToken });
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 14px", border: "1.5px solid #e2e8f0",
    borderRadius: 10, fontSize: 14, outline: "none", marginBottom: 12,
    background: "#f8fafc",
  };
  const btn = (bg: string, col = "#fff"): React.CSSProperties => ({
    padding: "10px 22px", borderRadius: 10, border: "none", cursor: "pointer",
    background: bg, color: col, fontWeight: 700, fontSize: 14,
  });

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: 32 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button onClick={() => setLocation("/settings")}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22 }}>←</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🔵 Google Ads</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
            Conecte sua conta para publicar campanhas diretamente.
          </p>
        </div>
        {existingGoogle && (
          <span style={{ marginLeft: "auto", background: "#dcfce7", color: "#166534",
            padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
            ✓ Conectado
          </span>
        )}
      </div>

      {/* Status card */}
      {existingGoogle && (
        <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0",
          borderRadius: 14, padding: 16, marginBottom: 20, display: "flex",
          justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Conta conectada</p>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
              Customer ID: {existingGoogle.accountId}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn("#1a73e8")}
              onClick={() => testGoogle.mutate({ provider: "google" })}>
              Testar
            </button>
            <button style={btn("#fee2e2", "#b91c1c")}
              onClick={() => deleteGoogle.mutate({ provider: "google" })}>
              Remover
            </button>
          </div>
        </div>
      )}

      {/* Form */}
      <div style={{ background: "#fff", border: "1.5px solid #e2e8f0",
        borderRadius: 16, padding: 24 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>
          {existingGoogle ? "Atualizar credenciais" : "Adicionar credenciais"}
        </h3>

        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Developer Token *</label>
        <input style={inp} placeholder="ABcDeFgHiJkL..." value={developerToken}
          onChange={e => setDeveloperToken(e.target.value)} />

        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Customer ID (sem traços) *</label>
        <input style={inp} placeholder="1234567890" value={customerId}
          onChange={e => setCustomerId(e.target.value)} />

        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Refresh Token *</label>
        <input style={inp} placeholder="1//04xyz..." value={refreshToken}
          onChange={e => setRefreshToken(e.target.value)} type="password" />

        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>OAuth Client ID (opcional)</label>
        <input style={inp} placeholder="xxx.apps.googleusercontent.com" value={clientId}
          onChange={e => setClientId(e.target.value)} />

        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>OAuth Client Secret (opcional)</label>
        <input style={inp} placeholder="GOCSPX-..." value={clientSecret}
          onChange={e => setClientSecret(e.target.value)} type="password" />

        <button onClick={handleSave} disabled={loading} style={btn("#1a73e8")}>
          {loading ? "Salvando…" : "💾 Salvar integração"}
        </button>
      </div>

      {/* Help */}
      <div style={{ marginTop: 20, background: "#eff6ff", border: "1.5px solid #bfdbfe",
        borderRadius: 14, padding: 16 }}>
        <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 13 }}>📖 Como obter as credenciais</p>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#374151", lineHeight: 1.8 }}>
          <li><strong>Developer Token</strong>: Google Ads → API Center → aplique para acesso.</li>
          <li><strong>Customer ID</strong>: número de 10 dígitos no topo do Google Ads.</li>
          <li><strong>Refresh Token</strong>: gere via OAuth2 Playground ou Google Ads API script.</li>
          <li><strong>Client ID/Secret</strong>: Google Cloud Console → APIs → Credentials.</li>
        </ol>
      </div>
    </div>
  );
}
