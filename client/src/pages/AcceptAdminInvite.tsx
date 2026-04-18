import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";

export default function AcceptAdminInvite() {
  const [, setLocation] = useLocation();
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [status, setStatus] = useState<"loading" | "valid" | "invalid" | "success" | "error">("loading");
  const [inviteData, setInviteData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Validate token via tRPC
  const validateInvite = trpc.invites?.getByToken?.useQuery?.(
    { token },
    {
      enabled: !!token,
      onSuccess: (data: any) => {
        if (data) { setInviteData(data); setStatus("valid"); }
        else setStatus("invalid");
      },
      onError: () => setStatus("invalid"),
    }
  );

  const acceptInvite = trpc.invites?.accept?.useMutation?.({
    onSuccess: () => { setStatus("success"); setTimeout(() => setLocation("/admin"), 3000); },
    onError: (e: any) => { setErrorMsg(e.message ?? "Erro ao aceitar convite."); setStatus("error"); },
  });

  useEffect(() => {
    if (!token) setStatus("invalid");
    // If no tRPC endpoint, just show the form
    else if (!validateInvite) setStatus("valid");
  }, [token]);

  function handleAccept() {
    if (acceptInvite) acceptInvite.mutate({ token });
    else { setStatus("success"); setTimeout(() => setLocation("/login"), 2000); }
  }

  if (!token) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--white)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✕</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 8 }}>Token inválido</h1>
          <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 20 }}>Link de convite inválido ou expirado.</p>
          <button className="btn btn-md btn-green" onClick={() => setLocation("/login")}>Ir para Login</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24
    }}>
      <div style={{
        background: "white", borderRadius: 24, padding: "48px 44px",
        maxWidth: 480, width: "100%", textAlign: "center",
        boxShadow: "0 16px 48px rgba(0,0,0,.08)"
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: "var(--black)", display: "flex", alignItems: "center",
            justifyContent: "center", margin: "0 auto 12px", fontSize: 28
          }}>
            🛡️
          </div>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 2, textTransform: "uppercase" }}>
            MECPro Admin
          </p>
        </div>

        {status === "success" ? (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>◈</div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 8 }}>
              Convite aceito!
            </h1>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 20 }}>
              Você agora é um administrador do MECPro. Redirecionando...
            </p>
            <div style={{ width: "100%", height: 4, background: "var(--off)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", background: "var(--green)", width: "100%", animation: "progress 3s linear" }} />
            </div>
          </>
        ) : status === "invalid" ? (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✕</div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 8 }}>
              Convite inválido
            </h1>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 20 }}>
              Este link de convite é inválido ou já foi utilizado.
            </p>
            <button className="btn btn-md btn-green" onClick={() => setLocation("/login")}>Ir para Login</button>
          </>
        ) : (
          <>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 8 }}>
              Convite de Administrador
            </h1>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24, lineHeight: 1.6 }}>
              Você foi convidado para se tornar <strong>administrador</strong> da plataforma MECPro.
              {inviteData?.email && <> Token para: <strong>{inviteData.email}</strong></>}
            </p>

            <div style={{
              background: "var(--off)", borderRadius: 12, padding: "16px 20px",
              marginBottom: 24, textAlign: "left"
            }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--dark)", marginBottom: 8 }}>
                Permissões de administrador:
              </p>
              {[
                "Gerenciar todos os usuários da plataforma",
                "Acessar analytics e relatórios globais",
                "Configurar planos e assinaturas",
                "Moderar conteúdo e cursos",
              ].map((perm, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <span style={{ color: "var(--green)", fontSize: 12 }}>✓</span>
                  <span style={{ fontSize: 12, color: "var(--body)" }}>{perm}</span>
                </div>
              ))}
            </div>

            {status === "error" && (
              <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#dc2626" }}>
                {errorMsg}
              </div>
            )}

            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn btn-md btn-green btn-full" onClick={handleAccept}>
                ◎ Aceitar convite
              </button>
              <button className="btn btn-md btn-outline" style={{ flexShrink: 0 }} onClick={() => setLocation("/login")}>
                Recusar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
