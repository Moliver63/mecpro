import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";

export default function TikTokIntegration() {
  const [, setLocation] = useLocation();
  const [appId,        setAppId]        = useState("");
  const [appSecret,    setAppSecret]    = useState("");
  const [accessToken,  setAccessToken]  = useState("");
  const [advertiserId, setAdvertiserId] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: integrations, refetch } =
    trpc.integrations.list.useQuery(undefined, { retry: false });

  const existing = (integrations as any[])?.find(
    i => i.provider === "tiktok" && i.isActive
  );

  const upsert = trpc.integrations.upsertTikTok.useMutation({
    onSuccess: () => { toast.success("◎ TikTok Ads conectado!"); refetch(); setLoading(false); },
    onError:   (e) => { toast.error("Erro: " + e.message); setLoading(false); },
  });

  const remove = trpc.integrations.delete.useMutation({
    onSuccess: () => { toast.success("Integração removida."); refetch(); },
  });

  const test = trpc.integrations.testTikTok.useMutation({
    onSuccess: (d: any) => toast.success(`◎ Token válido — conta: ${d.name}`),
    onError:   (e)      => toast.error("Token inválido: " + e.message),
  });

  const handleSave = () => {
    if (!accessToken)  { toast.error("Access Token obrigatório"); return; }
    if (!advertiserId) { toast.error("Advertiser ID obrigatório"); return; }
    setLoading(true);
    upsert.mutate({ appId, appSecret, accessToken, advertiserId });
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
    <Layout>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <button onClick={() => setLocation("/settings")}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22 }}>
            ←
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🎵 TikTok Ads</h2>
            <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
              Conecte sua conta TikTok Business para publicar campanhas.
            </p>
          </div>
          {existing && (
            <span style={{
              marginLeft: "auto", background: "#dcfce7", color: "#166534",
              padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
            }}>
              ✓ Conectado
            </span>
          )}
        </div>

        {existing && (
          <div style={{
            background: "#f0fdf4", border: "1.5px solid #bbf7d0",
            borderRadius: 14, padding: 16, marginBottom: 20,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Conta conectada</p>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                Advertiser ID: {existing.accountId}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={btn("#010101")} onClick={() => test.mutate({ provider: "tiktok" })}>
                Testar
              </button>
              <button style={btn("#fee2e2", "#b91c1c")} onClick={() => remove.mutate({ provider: "tiktok" })}>
                Remover
              </button>
            </div>
          </div>
        )}

        <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 16, padding: 24 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>
            {existing ? "Atualizar credenciais" : "Adicionar credenciais"}
          </h3>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Access Token *</label>
          <input style={inp} placeholder="act.xxx..." value={accessToken}
            onChange={e => setAccessToken(e.target.value)} type="password" />
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Advertiser ID *</label>
          <input style={inp} placeholder="7xxxxxxxxxxxxxxxxx" value={advertiserId}
            onChange={e => setAdvertiserId(e.target.value)} />
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>App ID (opcional)</label>
          <input style={inp} value={appId} onChange={e => setAppId(e.target.value)} />
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>App Secret (opcional)</label>
          <input style={inp} value={appSecret} onChange={e => setAppSecret(e.target.value)} type="password" />
          <button onClick={handleSave} disabled={loading} style={btn("#010101")}>
            {loading ? "Salvando…" : "💾 Salvar integração"}
          </button>
        </div>

        <div style={{
          marginTop: 20, background: "#fafafa", border: "1.5px solid #e2e8f0",
          borderRadius: 14, padding: 16,
        }}>
          <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 13 }}>📖 Como obter as credenciais</p>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#374151", lineHeight: 1.8 }}>
            <li><strong>Access Token</strong>: TikTok for Business → My Apps → Authorization → gerar token.</li>
            <li><strong>Advertiser ID</strong>: TikTok Ads Manager → URL contém o ID de 19 dígitos.</li>
            <li><strong>App ID/Secret</strong>: TikTok Developer Portal → My Apps → App credentials.</li>
          </ol>
        </div>
      </div>
    </Layout>
  );
}
