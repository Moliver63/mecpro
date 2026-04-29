/**
 * PWAInstallBanner.tsx
 * Banner de instalação do app — aparece automaticamente quando o browser
 * suporta PWA e o app ainda não foi instalado.
 * Não quebra nada se o browser não suportar.
 */
import { useState, useEffect } from "react";

export default function PWAInstallBanner() {
  const [prompt, setPrompt]     = useState<any>(null);   // evento beforeinstallprompt
  const [visible, setVisible]   = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS]       = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Verifica se já foi dispensado anteriormente
    if (localStorage.getItem("pwa-banner-dismissed") === "1") return;
    // Verifica se já está instalado (modo standalone)
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    // Bump SW cache version to force reinstall after fixes
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration('/').then(reg => {
        if (reg) reg.update(); // force check for new SW version
      }).catch(() => {});
    }

    // iOS — não tem beforeinstallprompt, mostra instrução manual
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    if (ios) {
      setIsIOS(true);
      setTimeout(() => setVisible(true), 3000); // mostra após 3s
      return;
    }

    // Android/Chrome/Edge — intercepta o prompt nativo
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e);
      setTimeout(() => setVisible(true), 3000);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Detecta instalação concluída
    window.addEventListener("appinstalled", () => {
      setInstalled(true);
      setVisible(false);
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    setVisible(false);
    setDismissed(true);
    localStorage.setItem("pwa-banner-dismissed", "1");
  }

  async function install() {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
    }
    setVisible(false);
  }

  if (!visible || dismissed || installed) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 16,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 9999,
      width: "min(420px, calc(100vw - 32px))",
      background: "white",
      borderRadius: 16,
      boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)",
      border: "1px solid #e2e8f0",
      padding: "14px 16px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      animation: "slideUp .35s cubic-bezier(.16,1,.3,1) both",
      fontFamily: "var(--font)",
    }}>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(24px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      {/* Ícone do app */}
      <img
        src="/favicon-192.png"
        alt="MecProAI"
        style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0,
          border: "1px solid #e2e8f0" }}
      />

      {/* Texto */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 2 }}>
          Instalar MecProAI
        </div>
        {isIOS ? (
          <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
            Toque em <strong>⬆ Compartilhar</strong> e depois em{" "}
            <strong>"Adicionar à Tela de Início"</strong>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
            Instale como app e acesse mais rápido — funciona offline
          </div>
        )}
      </div>

      {/* Botões */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
        {!isIOS && (
          <button
            onClick={install}
            style={{
              background: "#16a34a", color: "white", border: "none",
              borderRadius: 8, padding: "6px 14px", fontSize: 12,
              fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
            }}>
            Instalar
          </button>
        )}
        <button
          onClick={dismiss}
          style={{
            background: "transparent", color: "#94a3b8",
            border: "none", padding: "4px 0", fontSize: 11,
            cursor: "pointer", textAlign: "center",
          }}>
          {isIOS ? "Entendi" : "Agora não"}
        </button>
      </div>
    </div>
  );
}
