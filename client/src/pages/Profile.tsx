import Layout from "@/components/layout/Layout";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";

export default function Profile() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  if (!user) return null;
  const initials = user.name?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0,2) ?? user.email[0].toUpperCase();

  return (
    <Layout>
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontFamily:"var(--font-display)", fontSize:26, fontWeight:800, color:"var(--black)", marginBottom:4 }}>Perfil</h1>
        <p style={{ fontSize:14, color:"var(--muted)" }}>Suas informações pessoais e conta</p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:20, alignItems:"start" }}>
        {/* Card avatar */}
        <div style={{ background:"white", border:"1px solid var(--border)", borderRadius:16, padding:28, textAlign:"center" }}>
          <div style={{ width:80, height:80, borderRadius:"50%", background:"var(--green-l)", border:"3px solid var(--green-xl)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, fontWeight:800, color:"var(--green-dk)", margin:"0 auto 16px" }}>
            {initials}
          </div>
          <p style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:700, color:"var(--black)", marginBottom:4 }}>{user.name ?? "Usuário"}</p>
          <p style={{ fontSize:13, color:"var(--muted)", marginBottom:16 }}>{user.email}</p>
          <span className={`badge ${user.role === "superadmin" ? "badge-error" : user.role === "admin" ? "badge-navy" : "badge-green"}`} style={{ fontSize:12 }}>
            {user.role === "superadmin" ? "Super Admin" : user.role === "admin" ? "Admin" : "Usuário"}
          </span>
          <div style={{ height:1, background:"var(--border)", margin:"20px 0" }} />
          <button className="btn btn-md btn-outline btn-full" onClick={() => setLocation("/edit-profile")}>Editar perfil</button>
        </div>

        {/* Detalhes */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {/* Info */}
          <div style={{ background:"white", border:"1px solid var(--border)", borderRadius:16, overflow:"hidden" }}>
            <div style={{ padding:"16px 24px", borderBottom:"1px solid var(--border)" }}>
              <h2 style={{ fontFamily:"var(--font-display)", fontSize:15, fontWeight:700, color:"var(--black)" }}>Informações da conta</h2>
            </div>
            <div style={{ padding:"8px 0" }}>
              {[
                { label:"Nome", value: user.name ?? "—" },
                { label:"E-mail", value: user.email },
                { label:"Função", value: user.role },
                { label:"Membro desde", value: user.createdAt ? new Date(user.createdAt).toLocaleDateString("pt-BR") : "—" },
              ].map(row => (
                <div key={row.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 24px", borderBottom:"1px solid var(--border)" }}>
                  <span style={{ fontSize:13, color:"var(--muted)" }}>{row.label}</span>
                  <span style={{ fontSize:14, fontWeight:500, color:"var(--dark)" }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Assinatura */}
          <div style={{ background:"white", border:"1px solid var(--border)", borderRadius:16, overflow:"hidden" }}>
            <div style={{ padding:"16px 24px", borderBottom:"1px solid var(--border)" }}>
              <h2 style={{ fontFamily:"var(--font-display)", fontSize:15, fontWeight:700, color:"var(--black)" }}>Plano atual</h2>
            </div>
            <div style={{ padding:24, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <p style={{ fontFamily:"var(--font-display)", fontSize:20, fontWeight:800, color:"var(--black)", marginBottom:4 }}>
                  {user.plan?.toUpperCase() ?? "FREE"}
                </p>
                <p style={{ fontSize:13, color:"var(--muted)" }}>
                  {user.plan === "free" ? "Plano gratuito — 2 projetos, 2 concorrentes" :
                   user.plan === "premium" ? "Projetos ilimitados + IA completa" :
                   user.plan === "vip" ? "Tudo ilimitado + suporte prioritário" : "Plano básico"}
                </p>
              </div>
              {user.plan === "free" && (
                <button className="btn btn-md btn-green" onClick={() => setLocation("/pricing")}>Fazer upgrade</button>
              )}
              {user.plan !== "free" && (
                <button className="btn btn-md btn-outline" onClick={() => setLocation("/my-subscription")}>Gerenciar</button>
              )}
            </div>
          </div>

          {/* Segurança */}
          <div style={{ background:"white", border:"1px solid var(--border)", borderRadius:16, overflow:"hidden" }}>
            <div style={{ padding:"16px 24px", borderBottom:"1px solid var(--border)" }}>
              <h2 style={{ fontFamily:"var(--font-display)", fontSize:15, fontWeight:700, color:"var(--black)" }}>Segurança</h2>
            </div>
            <div style={{ padding:24, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <p style={{ fontSize:14, fontWeight:500, color:"var(--dark)", marginBottom:2 }}>Senha</p>
                <p style={{ fontSize:13, color:"var(--muted)" }}>Altere sua senha de acesso</p>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => setLocation("/settings")}>Alterar senha</button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
