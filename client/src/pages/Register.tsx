import { useState } from "react";
import { trpc } from "@/lib/trpc";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const register = trpc.auth.register.useMutation({
    onSuccess: () => setDone(true),
    onError: (err: any) => setError(err.message || "Erro ao criar conta"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name || !email || !password) return setError("Preencha todos os campos");
    if (password.length < 8) return setError("Senha deve ter no mínimo 8 caracteres");
    register.mutate({ name, email, password });
  };

  if (done) return (
    <div style={{ minHeight:"100vh", background:"var(--off)", display:"flex", flexDirection:"column", fontFamily:"var(--font)" }}>
      <nav style={{ height:56, background:"var(--glass-bg)", backdropFilter:"var(--glass-blur)", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", padding:"0 32px" }}>
        <a href="/" style={{ fontSize:18, fontWeight:800, color:"var(--black)", textDecoration:"none", letterSpacing:"-0.04em" }}>
          MEC<span style={{ color:"var(--green-d)" }}>PRO</span>
        </a>
      </nav>
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"clamp(16px,4vw,40px)" }}>
        <div style={{ background:"var(--glass-bg)", backdropFilter:"var(--glass-blur)", border:"1px solid var(--glass-border)", borderRadius:"var(--r-xl)", padding:"clamp(28px,5vw,52px)", maxWidth:440, width:"100%", textAlign:"center", boxShadow:"var(--glass-shadow)" }}>

          {/* Ícone */}
          <div style={{ width:72, height:72, borderRadius:"50%", background:"var(--blue-l)", border:"1.5px solid rgba(0,113,227,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:32, color:"var(--blue)", margin:"0 auto 24px", fontWeight:300 }}>
            ◉
          </div>

          <h2 style={{ fontSize:22, fontWeight:800, color:"var(--black)", marginBottom:10, letterSpacing:"-0.03em" }}>
            Confirme seu e-mail
          </h2>

          <p style={{ fontSize:14, color:"var(--muted)", lineHeight:1.7, marginBottom:8 }}>
            Enviamos um link de ativação para:
          </p>
          <div style={{ background:"var(--off)", borderRadius:"var(--r-sm)", padding:"10px 16px", marginBottom:20, fontSize:15, fontWeight:700, color:"var(--dark)" }}>
            {email}
          </div>

          <div style={{ background:"rgba(0,113,227,0.06)", border:"1px solid rgba(0,113,227,0.15)", borderRadius:"var(--r-sm)", padding:"14px 16px", marginBottom:24, textAlign:"left" }}>
            {["Abra seu email", "Clique no botão 'Ativar conta'", "Você será redirecionado automaticamente"].map((step, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom: i < 2 ? 10 : 0 }}>
                <div style={{ width:22, height:22, borderRadius:"50%", background:"var(--blue)", color:"white", fontSize:11, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</div>
                <span style={{ fontSize:13, color:"var(--body)" }}>{step}</span>
              </div>
            ))}
          </div>

          <p style={{ fontSize:12, color:"var(--muted)", marginBottom:20 }}>
            Não recebeu? Verifique a pasta de <strong>spam</strong> ou{" "}
            <button onClick={async () => {
              await fetch("/api/auth/resend-verification", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ email }) });
              alert("Novo link enviado!");
            }} style={{ background:"none", border:"none", color:"var(--blue)", fontWeight:700, cursor:"pointer", padding:0, fontSize:12 }}>
              reenvie o link
            </button>
          </p>

          <div style={{ height:1, background:"var(--border)", margin:"20px 0" }} />
          <a href="/login" style={{ fontSize:13, color:"var(--muted)", fontWeight:600, textDecoration:"none" }}>← Voltar ao login</a>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"var(--off)", display:"flex", flexDirection:"column" }}>
      <nav style={{ height:60, background:"white", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", padding:"0 32px" }}>
        <a href="/" style={{ fontFamily:"var(--font)", fontSize:20, fontWeight:800, color:"var(--black)", textDecoration:"none" }}>
          MEC<span style={{ color:"var(--green-d)" }}>PRO</span>
        </a>
      </nav>
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
        <div style={{ width:"100%", maxWidth:440 }}>
          <div style={{ background:"white", border:"1px solid var(--border)", borderRadius:20, padding:40, boxShadow:"var(--shadow-sm)" }}>
            <div className="badge badge-green" style={{ marginBottom:16 }}>Grátis para sempre no plano básico</div>
            <h1 style={{ fontFamily:"var(--font)", fontSize:26, fontWeight:800, color:"var(--black)", marginBottom:6 }}>Criar conta</h1>
            <p style={{ fontSize:14, color:"var(--muted)", marginBottom:24 }}>Comece a gerar campanhas inteligentes hoje</p>

            {/* Google OAuth */}
            <a href={`${(import.meta as any).env.PROD ? "" : ((import.meta as any).env.VITE_API_URL || "http://localhost:5000")}/api/auth/google`}
              style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, padding:"11px 20px", background:"white", border:"1.5px solid var(--border2)", borderRadius:10, textDecoration:"none", fontSize:14, fontWeight:500, color:"var(--dark)", marginBottom:20, transition:"border-color .15s" }}
              onMouseEnter={e=>(e.currentTarget.style.borderColor="#adb5bd")}
              onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--border2)")}>
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#4285F4" d="M47.5 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h13.2c-.6 3-2.3 5.6-4.9 7.3v6h7.9c4.6-4.3 7.3-10.6 7.3-17.5z"/>
                <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.9-6c-2.2 1.5-5 2.3-8 2.3-6.1 0-11.3-4.1-13.2-9.7H2.6v6.2C6.5 42.6 14.7 48 24 48z"/>
                <path fill="#FBBC05" d="M10.8 28.8A14.9 14.9 0 0 1 10.8 19.2V13H2.6A24 24 0 0 0 2.6 35l8.2-6.2z"/>
                <path fill="#EA4335" d="M24 9.5c3.4 0 6.5 1.2 8.9 3.5l6.6-6.6C35.9 2.5 30.4 0 24 0 14.7 0 6.5 5.4 2.6 13l8.2 6.2C12.7 13.6 17.9 9.5 24 9.5z"/>
              </svg>
              Cadastrar com Google
            </a>

            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
              <div style={{ flex:1, height:1, background:"var(--border)" }} />
              <span style={{ fontSize:12, color:"var(--muted)" }}>ou com e-mail</span>
              <div style={{ flex:1, height:1, background:"var(--border)" }} />
            </div>

            {error && (
              <div style={{ background:"var(--error-l)", border:"1px solid #fecaca", borderRadius:10, padding:"10px 14px", fontSize:13, color:"var(--error)", marginBottom:16 }}>
                ⚠️ {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom:14 }}>
                <label style={{ display:"block", fontSize:13, fontWeight:500, color:"var(--dark)", marginBottom:6 }}>Nome completo</label>
                <input className="input-field" type="text" placeholder="Seu nome" value={name} onChange={e=>setName(e.target.value)} />
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ display:"block", fontSize:13, fontWeight:500, color:"var(--dark)", marginBottom:6 }}>E-mail</label>
                <input className="input-field" type="email" placeholder="seu@email.com" value={email} onChange={e=>setEmail(e.target.value)} />
              </div>
              <div style={{ marginBottom:24 }}>
                <label style={{ display:"block", fontSize:13, fontWeight:500, color:"var(--dark)", marginBottom:6 }}>Senha</label>
                <input className="input-field" type="password" placeholder="Mínimo 8 caracteres" value={password} onChange={e=>setPassword(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-lg btn-green btn-full" disabled={register.isPending} style={{ opacity:register.isPending ? .7 : 1 }}>
                {register.isPending ? "Criando conta..." : "Criar conta grátis →"}
              </button>
            </form>

            <p style={{ textAlign:"center", fontSize:12, color:"#adb5bd", marginTop:16 }}>
              Ao criar uma conta você concorda com os{" "}
              <a href="/terms" style={{ color:"var(--muted)" }}>Termos</a> e{" "}
              <a href="/privacy" style={{ color:"var(--muted)" }}>Privacidade</a>
            </p>
            <div style={{ height:1, background:"var(--border)", margin:"20px 0" }} />
            <p style={{ textAlign:"center", fontSize:14, color:"var(--muted)" }}>
              Já tem conta?{" "}
              <a href="/login" style={{ color:"var(--green-d)", fontWeight:600, textDecoration:"none" }}>Entrar</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
