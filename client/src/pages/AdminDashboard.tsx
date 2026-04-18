import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { toast } from "sonner";

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isSuperadmin = (user as any)?.role === "superadmin";
  const { data: users } = trpc.admin.users.useQuery();
  const { data: projects } = trpc.admin.projects.useQuery();

  const [showMyPlan, setShowMyPlan] = useState(false);
  const [myPlanValue, setMyPlanValue] = useState((user as any)?.plan || "free");

  const updatePlan = trpc.admin.updateUserPlan.useMutation({
    onSuccess: () => { toast.success("◎ Seu plano foi atualizado!"); setShowMyPlan(false); window.location.reload(); },
    onError: (e) => toast.error(e.message),
  });

  const totalUsers = users?.length ?? 0;
  const totalProjects = projects?.length ?? 0;
  const activeProjects = projects?.filter((p: any) => p.status !== "archived").length ?? 0;
  const premiumUsers = users?.filter((u: any) => ["premium","vip"].includes(u.plan)).length ?? 0;

  return (
    <Layout>
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontFamily:"var(--font-display)", fontSize:26, fontWeight:800, color:"var(--black)", marginBottom:4 }}>Painel Admin</h1>
        <p style={{ fontSize:14, color:"var(--muted)" }}>Visão geral da plataforma MECPro</p>
      </div>

      {/* Banner Intelig�ncia de Campanhas */}
      <div
        onClick={() => setLocation("/admin/intelligence")}
        style={{
          marginBottom: 24,
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #1d4ed8 100%)",
          borderRadius: 18, padding: "22px 28px", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 8px 32px rgba(15,23,42,0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ fontSize: 42 }}>??</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "white", marginBottom: 4 }}>
              Intelig�ncia de Campanhas
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
              Ranking � Score � Padr�es vencedores � Aprendizado � Dataset ML
            </div>
          </div>
        </div>
        <div style={{ fontSize: 22, color: "rgba(255,255,255,0.5)" }}>?</div>
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:16, marginBottom:28 }}>
        {[
          { label:"Total de usuários", value:totalUsers, icon:"👥", color:"#eff6ff", onClick:()=>setLocation("/admin/users") },
          { label:"Usuários premium", value:premiumUsers, icon:"◈", color:"var(--green-l)", onClick:()=>setLocation("/admin/manage-subscriptions") },
          { label:"Total de projetos", value:totalProjects, icon:"◫", color:"#fef3c7", onClick:()=>setLocation("/admin/projects") },
          { label:"Projetos ativos", value:activeProjects, icon:"◈", color:"var(--off2)", onClick:null },
        ].map(s => (
          <div key={s.label} onClick={s.onClick ?? undefined}
            style={{ background:"white", border:"1px solid var(--border)", borderRadius:16, padding:22, cursor:s.onClick?"pointer":"default", transition:"all .15s" }}
            onMouseEnter={e=>s.onClick&&(e.currentTarget.style.borderColor="#adb5bd")}
            onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--border)")}>
            <div style={{ width:40, height:40, borderRadius:10, background:s.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, marginBottom:12 }}>{s.icon}</div>
            <div style={{ fontFamily:"var(--font-display)", fontSize:30, fontWeight:800, color:"var(--black)", lineHeight:1 }}>{s.value}</div>
            <div style={{ fontSize:13, color:"var(--muted)", marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        {/* Últimos usuários */}
        <div style={{ background:"white", border:"1px solid var(--border)", borderRadius:16, overflow:"hidden" }}>
          <div style={{ padding:"16px 24px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <h2 style={{ fontFamily:"var(--font-display)", fontSize:15, fontWeight:700, color:"var(--black)" }}>Usuários recentes</h2>
            <button className="btn btn-sm btn-ghost" onClick={()=>setLocation("/admin/users")}>Ver todos →</button>
          </div>
          {!users?.length ? (
            <div style={{ padding:32, textAlign:"center", fontSize:14, color:"var(--muted)" }}>Nenhum usuário</div>
          ) : (
            <div>
              {users.slice(0,6).map((u: any) => (
                <div key={u.id} style={{ padding:"12px 24px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:32, height:32, borderRadius:"50%", background:"var(--green-l)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"var(--green-dk)" }}>
                      {u.name?.[0]?.toUpperCase() ?? u.email[0].toUpperCase()}
                    </div>
                    <div>
                      <p style={{ fontSize:13, fontWeight:500, color:"var(--dark)" }}>{u.name ?? u.email}</p>
                      <p style={{ fontSize:11, color:"var(--muted)" }}>{u.email}</p>
                    </div>
                  </div>
                  <span className={`badge ${u.plan==="premium"||u.plan==="vip"?"badge-green":"badge-gray"}`} style={{ fontSize:10 }}>
                    {u.plan?.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Últimos projetos */}
        <div style={{ background:"white", border:"1px solid var(--border)", borderRadius:16, overflow:"hidden" }}>
          <div style={{ padding:"16px 24px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <h2 style={{ fontFamily:"var(--font-display)", fontSize:15, fontWeight:700, color:"var(--black)" }}>Projetos recentes</h2>
            <button className="btn btn-sm btn-ghost" onClick={()=>setLocation("/admin/projects")}>Ver todos →</button>
          </div>
          {!projects?.length ? (
            <div style={{ padding:32, textAlign:"center", fontSize:14, color:"var(--muted)" }}>Nenhum projeto</div>
          ) : (
            <div>
              {projects.slice(0,6).map((p: any) => (
                <div key={p.id} style={{ padding:"12px 24px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <p style={{ fontSize:13, fontWeight:500, color:"var(--dark)" }}>{p.name}</p>
                    <p style={{ fontSize:11, color:"var(--muted)" }}>ID #{p.id}</p>
                  </div>
                  <span className={`badge ${p.status==="completed"?"badge-green":p.status==="analyzing"?"badge-navy":"badge-gray"}`} style={{ fontSize:10 }}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Links rápidos admin */}
      <div style={{ marginTop:20, display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
        {[
          { icon:"👥", label:"Gerenciar usuários", path:"/admin/users" },
          { icon:"💳", label:"Assinaturas", path:"/admin/manage-subscriptions" },
          { icon:"🏷️", label:"Planos", path:"/admin/plans" },
          { icon:"📊", label:"Analytics", path:"/admin/analytics" },
        ].map(link => (
          <button key={link.path} onClick={()=>setLocation(link.path)}
            style={{ background:"white", border:"1px solid var(--border)", borderRadius:12, padding:"16px 12px", display:"flex", flexDirection:"column", alignItems:"center", gap:8, cursor:"pointer", transition:"all .15s", fontSize:22 }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--green)";e.currentTarget.style.background="var(--green-l)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.background="white";}}>
            <span>{link.icon}</span>
            <span style={{ fontSize:12, fontWeight:600, color:"var(--dark)" }}>{link.label}</span>
          </button>
        ))}
      </div>

      {/* Card Meu Plano — exclusivo Superadmin */}
      {isSuperadmin && (
        <div style={{ marginTop:16, background:"linear-gradient(135deg,#0f172a,#1e3a5f)", borderRadius:14, padding:"18px 22px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <p style={{ fontSize:12, color:"rgba(255,255,255,.5)", marginBottom:4, textTransform:"uppercase", letterSpacing:1 }}>Meu plano atual</p>
            <p style={{ fontSize:18, fontWeight:800, color:"white", marginBottom:2 }}>
              {{ free:"🆓 Free", basic:"⚡ Basic", premium:"⭐ Premium", vip:"👑 VIP" }[(user as any)?.plan || "free"]}
            </p>
            <p style={{ fontSize:11, color:"rgba(255,255,255,.4)" }}>Você pode alterar seu próprio plano como superadmin</p>
          </div>
          <button onClick={() => { setMyPlanValue((user as any)?.plan || "free"); setShowMyPlan(true); }}
            style={{ background:"rgba(255,255,255,.15)", color:"white", border:"1px solid rgba(255,255,255,.2)", borderRadius:10, padding:"10px 18px", fontWeight:700, fontSize:13, cursor:"pointer" }}>
            ✏️ Alterar meu plano
          </button>
        </div>
      )}

      {/* Modal alterar meu plano */}
      {showMyPlan && isSuperadmin && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:"white", borderRadius:18, padding:28, maxWidth:400, width:"100%", boxShadow:"0 20px 60px rgba(0,0,0,.2)" }}>
            <h3 style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:800, color:"var(--black)", marginBottom:6 }}>✏️ Alterar meu plano</h3>
            <p style={{ fontSize:13, color:"var(--muted)", marginBottom:20 }}>Selecione o plano para sua conta de superadmin.</p>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:20 }}>
              {[
                { value:"free",    label:"🆓 Free",     desc:"Sem custo — acesso básico" },
                { value:"basic",   label:"⚡ Basic",    desc:"R$ 97/mês" },
                { value:"premium", label:"⭐ Premium",  desc:"R$ 197/mês" },
                { value:"vip",     label:"👑 VIP",      desc:"R$ 397/mês — todos os recursos" },
              ].map(p => (
                <div key={p.value} onClick={() => setMyPlanValue(p.value)}
                  style={{ border:`2px solid ${myPlanValue === p.value ? "var(--green)" : "var(--border)"}`, borderRadius:10, padding:"12px 16px", cursor:"pointer", background: myPlanValue === p.value ? "var(--green-l)" : "white", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <p style={{ fontWeight:700, fontSize:14, color:"var(--black)" }}>{p.label}</p>
                    <p style={{ fontSize:12, color:"var(--muted)" }}>{p.desc}</p>
                  </div>
                  {myPlanValue === p.value && <span style={{ color:"var(--green)", fontWeight:700 }}>✓</span>}
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={() => setShowMyPlan(false)} className="btn btn-md btn-ghost">Cancelar</button>
              <button onClick={() => updatePlan.mutate({ userId: (user as any).id, plan: myPlanValue as any })}
                disabled={updatePlan.isLoading} className="btn btn-md btn-green">
                {updatePlan.isLoading ? "Salvando..." : "💾 Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

