import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Verificar erro OAuth na URL
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("error") === "oauth_failed") setError("Falha na autenticação com Google. Tente novamente.");
  }, []);

  const login = trpc.auth.login.useMutation({
    onSuccess: (user: any) => {
      // Usar replace() para não deixar entrada no histórico que causa "página foi removida"
      const dest = ["admin","superadmin"].includes(user.role) ? "/admin" : "/dashboard";
      window.location.replace(dest);
    },
    onError: (err: any) => { setError(err.message || "Email ou senha incorretos"); setLoading(false); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) return setError("Preencha todos os campos");
    setLoading(true);
    login.mutate({ email, password });
  };

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
            <h1 style={{ fontFamily:"var(--font-display)", fontSize:26, fontWeight:800, color:"var(--black)", marginBottom:6 }}>Bem-vindo de volta</h1>
            <p style={{ fontSize:14, color:"var(--muted)", marginBottom:28 }}>Entre na sua conta MECPro</p>

            {error && (
              <div style={{ background:"var(--error-l)", border:"1px solid #fecaca", borderRadius:10, padding:"10px 14px", fontSize:13, color:"var(--error)", marginBottom:20 }}>
                ⚠️ {error}
              </div>
            )}

            {/* Google OAuth */}
            <a href="/api/auth/google"
              style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, padding:"11px 20px", background:"white", border:"1.5px solid var(--border2)", borderRadius:10, textDecoration:"none", fontSize:14, fontWeight:500, color:"var(--dark)", marginBottom:20, transition:"border-color .15s" }}
              onMouseEnter={e=>(e.currentTarget.style.borderColor="#adb5bd")}
              onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--border2)")}>
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#4285F4" d="M47.5 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h13.2c-.6 3-2.3 5.6-4.9 7.3v6h7.9c4.6-4.3 7.3-10.6 7.3-17.5z"/>
                <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.9-6c-2.2 1.5-5 2.3-8 2.3-6.1 0-11.3-4.1-13.2-9.7H2.6v6.2C6.5 42.6 14.7 48 24 48z"/>
                <path fill="#FBBC05" d="M10.8 28.8A14.9 14.9 0 0 1 10.8 19.2V13H2.6A24 24 0 0 0 2.6 35l8.2-6.2z"/>
                <path fill="#EA4335" d="M24 9.5c3.4 0 6.5 1.2 8.9 3.5l6.6-6.6C35.9 2.5 30.4 0 24 0 14.7 0 6.5 5.4 2.6 13l8.2 6.2C12.7 13.6 17.9 9.5 24 9.5z"/>
              </svg>
              Continuar com Google
            </a>

            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
              <div style={{ flex:1, height:1, background:"var(--border)" }} />
              <span style={{ fontSize:12, color:"var(--muted)" }}>ou</span>
              <div style={{ flex:1, height:1, background:"var(--border)" }} />
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom:16 }}>
                <label style={{ display:"block", fontSize:13, fontWeight:500, color:"var(--dark)", marginBottom:6 }}>E-mail</label>
                <input className="input-field" type="email" placeholder="seu@email.com" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div style={{ marginBottom:8 }}>
                <label style={{ display:"block", fontSize:13, fontWeight:500, color:"var(--dark)", marginBottom:6 }}>Senha</label>
                <input className="input-field" type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" />
              </div>
              <div style={{ textAlign:"right", marginBottom:24 }}>
                <a href="/forgot-password" style={{ fontSize:13, color:"var(--green-d)", textDecoration:"none" }}>Esqueci minha senha</a>
              </div>
              <button type="submit" className="btn btn-lg btn-primary btn-full" disabled={loading} style={{ opacity:loading ? .7 : 1 }}>
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </form>

            <div style={{ height:1, background:"var(--border)", margin:"24px 0" }} />
            <p style={{ textAlign:"center", fontSize:14, color:"var(--muted)" }}>
              Não tem conta?{" "}
              <a href="/register" style={{ color:"var(--green-d)", fontWeight:600, textDecoration:"none" }}>Criar conta grátis</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
