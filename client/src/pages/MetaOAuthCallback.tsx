/**
 * MetaOAuthCallback.tsx
 * Página de callback do OAuth do Facebook.
 * Recebe o ?code= da URL, envia para a janela pai via postMessage e fecha.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

export default function MetaOAuthCallback() {
  const [location] = useLocation();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [msg, setMsg] = useState("Processando autorização...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get("code");
    const error  = params.get("error");
    const errorDesc = params.get("error_description");

    if (error) {
      setStatus("error");
      setMsg(errorDesc || "Autorização negada pelo Facebook.");
      // Notifica janela pai
      window.opener?.postMessage({ type: "META_OAUTH_CODE", code: null, error }, window.location.origin);
      setTimeout(() => window.close(), 2000);
      return;
    }

    if (code) {
      setStatus("success");
      setMsg("Autorização concluída! Fechando...");
      // Envia code para a janela pai
      window.opener?.postMessage({ type: "META_OAUTH_CODE", code }, window.location.origin);
      setTimeout(() => window.close(), 1500);
      return;
    }

    setStatus("error");
    setMsg("Parâmetros inválidos na resposta do Facebook.");
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
          {status === "processing" ? "Processando..." : status === "success" ? "Conectado!" : "Erro"}
        </div>
        <div style={{ fontSize: 13, color: "#64748b" }}>{msg}</div>
        {status !== "processing" && (
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 12 }}>Esta janela fechará automaticamente</div>
        )}
      </div>
    </div>
  );
}
