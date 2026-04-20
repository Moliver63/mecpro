/**
 * GoogleAdsOAuthCallback.tsx
 * Página de callback do OAuth do Google Ads.
 * Recebe o ?code= da URL, envia para a janela pai via postMessage e fecha.
 */
import { useEffect, useState } from "react";

export default function GoogleAdsOAuthCallback() {
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [msg, setMsg] = useState("Processando autorização Google...");

  useEffect(() => {
    const params    = new URLSearchParams(window.location.search);
    const code      = params.get("code");
    const state     = params.get("state");
    const error     = params.get("error");
    const errorDesc = params.get("error_description");

    if (error) {
      setStatus("error");
      setMsg(errorDesc || "Autorização negada pelo Google.");
      window.opener?.postMessage(
        { type: "GOOGLE_OAUTH_CODE", code: null, error },
        window.location.origin
      );
      setTimeout(() => window.close(), 2000);
      return;
    }

    if (code) {
      setStatus("success");
      setMsg("Autorização concluída! Fechando...");
      window.opener?.postMessage(
        { type: "GOOGLE_OAUTH_CODE", code, state },
        window.location.origin
      );
      setTimeout(() => window.close(), 1500);
      return;
    }

    setStatus("error");
    setMsg("Parâmetros inválidos na resposta do Google.");
    setTimeout(() => window.close(), 2000);
  }, []);

  const COLOR = {
    processing: "#1a73e8",
    success:    "#16a34a",
    error:      "#dc2626",
  }[status];

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#f8fafc", fontFamily: "'Geist', -apple-system, sans-serif",
    }}>
      <div style={{ textAlign: "center", padding: 32 }}>
        {/* Logo Google */}
        <div style={{
          width: 64, height: 64, borderRadius: 18,
          background: "linear-gradient(135deg,#4285F4,#34A853,#FBBC05,#EA4335)",
          display: "flex", alignItems: "center",
          justifyContent: "center", margin: "0 auto 20px", fontSize: 32,
        }}>
          🔵
        </div>

        <div style={{ fontSize: 40, marginBottom: 12 }}>
          {status === "processing" ? "⏳" : status === "success" ? "✅" : "❌"}
        </div>

        <div style={{ fontSize: 16, fontWeight: 700, color: COLOR, marginBottom: 8 }}>
          {status === "processing"
            ? "Conectando Google Ads..."
            : status === "success"
            ? "Google Ads conectado!"
            : "Erro na autorização"}
        </div>

        <div style={{ fontSize: 13, color: "#64748b", maxWidth: 280, margin: "0 auto" }}>
          {msg}
        </div>

        {status !== "processing" && (
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 16 }}>
            Esta janela fechará automaticamente
          </div>
        )}

        {/* Spinner animado enquanto processa */}
        {status === "processing" && (
          <div style={{
            width: 32, height: 32, border: "3px solid #e2e8f0",
            borderTop: "3px solid #1a73e8", borderRadius: "50%",
            margin: "20px auto 0",
            animation: "spin 0.8s linear infinite",
          }} />
        )}

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  );
}
