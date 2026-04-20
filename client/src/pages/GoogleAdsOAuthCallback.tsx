/**
 * GoogleAdsOAuthCallback.tsx
 * Pagina de callback do OAuth Google.
 * Recebe o ?code= da URL, envia para a janela pai via postMessage e fecha.
 */
import { useEffect, useState } from "react";

export default function GoogleAdsOAuthCallback() {
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [msg, setMsg] = useState("Processando autorização...");

  useEffect(() => {
    const params    = new URLSearchParams(window.location.search);
    const code      = params.get("code");
    const error     = params.get("error");
    const errorDesc = params.get("error_description");

    if (error) {
      setStatus("error");
      setMsg(errorDesc || "Autorização negada pelo Google.");
      window.opener?.postMessage({ type: "GOOGLE_ADS_OAUTH_CODE", code: null, error }, window.location.origin);
      setTimeout(() => window.close(), 2000);
      return;
    }

    if (code) {
      setStatus("success");
      setMsg("Autorização concluída! Fechando...");
      window.opener?.postMessage({ type: "GOOGLE_ADS_OAUTH_CODE", code }, window.location.origin);
      setTimeout(() => window.close(), 1500);
      return;
    }

    setStatus("error");
    setMsg("Parâmetros inválidos na resposta do Google.");
    setTimeout(() => window.close(), 2000);
  }, []);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#f8fafc", fontFamily: "'Geist', -apple-system, sans-serif",
    }}>
      <div style={{ textAlign: "center", padding: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>
          {status === "processing" ? "⏳" : status === "success" ? "◎" : "✕"}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
          {status === "processing" ? "Processando..." : status === "success" ? "Sucesso!" : "Erro"}
        </div>
        <div style={{ fontSize: 13, color: "#64748b", maxWidth: 340 }}>{msg}</div>
      </div>
    </div>
  );
}
