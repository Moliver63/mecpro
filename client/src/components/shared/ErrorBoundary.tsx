import React from "react";

interface State { hasError: boolean; error?: Error; errorInfo?: React.ErrorInfo; }

export default class ErrorBoundary extends React.Component<{
  children:   React.ReactNode;
  fallback?:  React.ReactNode;
  context?:   string;          // ex: "Análise de Concorrentes"
}, State> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log silencioso — sem expor ao usuário
    console.error("[ErrorBoundary]", error.message, info.componentStack?.slice(0, 200));
    this.setState({ errorInfo: info });
  }

  render() {
    if (this.state.hasError) {
      // Se foi passado um fallback customizado, usa ele
      if (this.props.fallback) return this.props.fallback;

      const context = this.props.context || "esta página";

      return (
        <div style={{
          minHeight: "40vh", display: "flex", alignItems: "center", justifyContent: "center",
          padding: 32,
        }}>
          <div style={{
            background: "white", borderRadius: 20, padding: 36, maxWidth: 480, width: "100%",
            boxShadow: "0 8px 32px rgba(0,0,0,.08)", textAlign: "center",
            border: "1px solid #fee2e2",
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontWeight: 800, fontSize: 20, color: "#111", marginBottom: 8 }}>
              Algo deu errado
            </h2>
            <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, marginBottom: 24 }}>
              Ocorreu um erro inesperado em <strong>{context}</strong>.
              Isso pode acontecer após uma atualização do sistema.
              Recarregue a página para continuar.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: "#0f172a", color: "white", border: "none", borderRadius: 10,
                  padding: "10px 22px", fontWeight: 700, fontSize: 14, cursor: "pointer",
                }}>
                🔄 Recarregar página
              </button>
              <button
                onClick={() => this.setState({ hasError: false, error: undefined })}
                style={{
                  background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 10,
                  padding: "10px 22px", fontWeight: 700, fontSize: 14, cursor: "pointer",
                }}>
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
