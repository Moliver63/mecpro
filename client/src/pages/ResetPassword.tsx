import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const params = useParams<{ token?: string }>();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const token = params?.token || new URLSearchParams(window.location.search).get("token") || "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Senha deve ter no mínimo 8 caracteres");
    if (password !== confirm) return setError("Senhas não coincidem");
    setLoading(true);
    const r = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await r.json();
    setLoading(false);
    if (data.success) setDone(true);
    else setError(data.error || "Token inválido ou expirado");
  };

  if (done) return (
    <div style={{ minHeight:"100vh", background:"var(--off)", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:"white", border:"1px solid var(--border)", borderRadius:20, padding:48, maxWidth:420, width:"100%", textAlign:"center" }}>
        <div style={{ fontSize:40, marginBottom:16 }}>◎</div>
        <h2 style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:800, marginBottom:8 }}>Senha redefinida!</h2>
        <p style={{ fontSize:14, color:"var(--muted)", marginBottom:24 }}>Sua senha foi atualizada com sucesso.</p>
        <button className="btn btn-lg btn-green btn-full" onClick={() => setLocation("/login")}>Ir para o login →</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"var(--off)", display:"flex", flexDirection:"column" }}>
      <nav style={{ height:60, background:"white", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", padding:"0 32px" }}>
        <a href="/" style={{ fontFamily:"var(--font-display)", fontSize:20, fontWeight:800, color:"var(--black)", textDecoration:"none" }}>
          MEC<span style={{ color:"var(--green-d)" }}>PRO</span>
        </a>
      </nav>
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
        <div style={{ width:"100%", maxWidth:420 }}>
          <div style={{ background:"white", border:"1px solid var(--border)", borderRadius:20, padding:40, boxShadow:"var(--shadow-sm)" }}>
            <h1 style={{ fontFamily:"var(--font-display)", fontSize:24, fontWeight:800, color:"var(--black)", marginBottom:6 }}>Nova senha</h1>
            <p style={{ fontSize:14, color:"var(--muted)", marginBottom:28 }}>Digite e confirme sua nova senha</p>
            {error && <div style={{ background:"var(--error-l)", border:"1px solid #fecaca", borderRadius:10, padding:"10px 14px", fontSize:13, color:"var(--error)", marginBottom:16 }}>⚠️ {error}</div>}
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom:14 }}>
                <label style={{ display:"block", fontSize:13, fontWeight:500, color:"var(--dark)", marginBottom:6 }}>Nova senha</label>
                <input className="input-field" type="password" placeholder="Mínimo 8 caracteres" value={password} onChange={e=>setPassword(e.target.value)} />
              </div>
              <div style={{ marginBottom:24 }}>
                <label style={{ display:"block", fontSize:13, fontWeight:500, color:"var(--dark)", marginBottom:6 }}>Confirmar senha</label>
                <input className="input-field" type="password" placeholder="Repita a senha" value={confirm} onChange={e=>setConfirm(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-lg btn-primary btn-full" disabled={loading}>{loading ? "Salvando..." : "Salvar nova senha"}</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
