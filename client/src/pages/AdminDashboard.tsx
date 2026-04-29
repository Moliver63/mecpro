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

  const { data: stats, isLoading: loadingStats } = trpc.admin.stats.useQuery();
  const { data: users = [] }    = trpc.admin.users.useQuery();
  const { data: projects = [] } = trpc.admin.projects.useQuery();
  const { data: overview }      = (trpc as any).admin?.financialOverview?.useQuery?.() ?? { data: null };

  const [showMyPlan, setShowMyPlan] = useState(false);
  const [myPlanValue, setMyPlanValue] = useState((user as any)?.plan || "free");

  const updatePlan = trpc.admin.updateUserPlan.useMutation({
    onSuccess: () => { toast.success("Plano atualizado!"); setShowMyPlan(false); window.location.reload(); },
    onError: (e) => toast.error(e.message),
  });

  const st = stats as any;
  const ov = overview as any;

  // Métricas principais
  const STAT_CARDS = [
    { label: "Total de usuários",  value: st?.totalUsers    ?? users.length, sub: `+${st?.newUsersMonth ?? 0} este mês`,  icon: "👥",  color: "#eff6ff", border: "#bfdbfe", path: "/admin/users" },
    { label: "Usuários premium",   value: st?.premiumUsers  ?? 0,            sub: `${st?.freeUsers ?? 0} no plano free`, icon: "◈",   color: "#f0fdf4", border: "#bbf7d0", path: "/admin/manage-subscriptions" },
    { label: "Projetos ativos",    value: st?.activeProjects ?? 0,           sub: `${st?.totalProjects ?? projects.length} total`,      icon: "◫",   color: "#fef3c7", border: "#fde68a", path: null },
    { label: "Assinaturas ativas", value: st?.activeSubsCount ?? 0,          sub: "em vigência",                          icon: "💳",  color: "#fdf4ff", border: "#e9d5ff", path: "/admin/manage-subscriptions" },
    { label: "Receita total",      value: `R$ ${((st?.totalRevenue ?? 0)/100).toLocaleString("pt-BR",{minimumFractionDigits:2})}`, sub: `R$ ${((st?.revenueMonth ?? 0)/100).toLocaleString("pt-BR",{minimumFractionDigits:2})} este mês`, icon: "◉", color: "#fff7ed", border: "#fed7aa", path: "/admin/financeiro" },
  ];

  // Breakdown de planos
  const planBreakdown = st?.planBreakdown ?? { free: 0, basic: 0, premium: 0, vip: 0 };
  const totalPlanUsers = Object.values(planBreakdown).reduce((a: any, b: any) => a + b, 0) || 1;
  const PLANS = [
    { key: "free",    label: "Free",    color: "#6b7280", bg: "#f9fafb" },
    { key: "basic",   label: "Basic",   color: "#2563eb", bg: "#eff6ff" },
    { key: "premium", label: "Premium", color: "#16a34a", bg: "#f0fdf4" },
    { key: "vip",     label: "VIP",     color: "#7c3aed", bg: "#fdf4ff" },
  ];

  return (
    <Layout>
      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>
            Painel Admin
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
            {isSuperadmin ? "Superadmin" : "Admin"} · {(user as any)?.email}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "Usuários",       path: "/admin/users",                  icon: "👥" },
            { label: "Assinaturas",    path: "/admin/manage-subscriptions",   icon: "💳" },
            { label: "Planos",         path: "/admin/plans",                  icon: "🏷" },
            { label: "Financeiro",     path: "/admin/financeiro",             icon: "◉" },
            { label: "Admins",         path: "/admin/manage-admins",          icon: "🛡" },
          ].map(a => (
            <button key={a.path} onClick={() => setLocation(a.path)}
              style={{ background: "white", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "var(--black)", display: "flex", alignItems: "center", gap: 5 }}>
              {a.icon} {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 24 }}>
        {STAT_CARDS.map(s => (
          <div key={s.label}
            onClick={() => s.path && setLocation(s.path)}
            style={{ background: s.color, border: `1px solid ${s.border}`, borderRadius: 14, padding: "18px 16px", cursor: s.path ? "pointer" : "default", transition: "transform .15s, box-shadow .15s" }}
            onMouseEnter={e => { if (s.path) { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 20px rgba(0,0,0,.08)"; } }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--black)", letterSpacing: "-0.5px", lineHeight: 1 }}>
              {loadingStats ? "—" : s.value}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{s.label}</div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, opacity: 0.7 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>

        {/* Breakdown de planos */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 22px" }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--black)", marginBottom: 16, margin: "0 0 16px" }}>
            Distribuição de planos
          </h2>
          {PLANS.map(p => {
            const count = (planBreakdown as any)[p.key] ?? 0;
            const pct   = Math.round((count / (totalPlanUsers as number)) * 100);
            return (
              <div key={p.key} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: p.color }}>{p.label}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{count} usuários · {pct}%</span>
                </div>
                <div style={{ height: 6, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: p.color, borderRadius: 99, transition: "width .5s ease" }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Receita — top usuários por saldo */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--black)", margin: 0 }}>Top usuários por saldo</h2>
            <button onClick={() => setLocation("/admin/financeiro")}
              style={{ fontSize: 11, color: "var(--blue)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
              Ver financeiro →
            </button>
          </div>
          {!ov?.topUsers?.length ? (
            <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>Nenhum dado disponível</p>
          ) : ov.topUsers.slice(0, 5).map((u: any, i: number) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < 4 ? "1px solid var(--border)" : "none" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--green-l)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "var(--green-dk)", flexShrink: 0 }}>
                {(u.name || u.email || "?")[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--black)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name || u.email}</div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>{u.email}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--green-dk)" }}>R$ {u.balance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>saldo</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>

        {/* Usuários recentes */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--black)", margin: 0 }}>Usuários recentes</h2>
            <button onClick={() => setLocation("/admin/users")} style={{ fontSize: 11, color: "var(--blue)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Ver todos →</button>
          </div>
          <div style={{ padding: "8px 0" }}>
            {(users as any[]).slice(0, 6).map((u: any) => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 20px" }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--green-l)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "var(--green-dk)", flexShrink: 0 }}>
                  {(u.name || u.email || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--black)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name || u.email}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: u.plan === "free" ? "#f1f5f9" : u.plan === "premium" ? "#f0fdf4" : u.plan === "vip" ? "#fdf4ff" : "#eff6ff", color: u.plan === "free" ? "#6b7280" : u.plan === "premium" ? "#16a34a" : u.plan === "vip" ? "#7c3aed" : "#2563eb" }}>
                  {u.plan?.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Transações recentes */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--black)", margin: 0 }}>Transações recentes</h2>
            <button onClick={() => setLocation("/admin/financeiro")} style={{ fontSize: 11, color: "var(--blue)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Ver financeiro →</button>
          </div>
          <div style={{ padding: "8px 0" }}>
            {!ov?.recentTx?.length ? (
              <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>Nenhuma transação ainda</p>
            ) : ov.recentTx.slice(0, 6).map((tx: any, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 20px" }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: tx.type === "deposit" ? "#f0fdf4" : "#fff7ed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                  {tx.type === "deposit" ? "↓" : "↑"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--black)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.email}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>{tx.method} · {new Date(tx.createdAt).toLocaleDateString("pt-BR")}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: tx.type === "deposit" ? "var(--green-dk)" : "#f59e0b", flexShrink: 0 }}>
                  {tx.type === "deposit" ? "+" : "-"}R$ {tx.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Atalhos rápidos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { icon: "👥", label: "Usuários",       path: "/admin/users" },
          { icon: "💳", label: "Assinaturas",    path: "/admin/manage-subscriptions" },
          { icon: "🏷", label: "Planos",          path: "/admin/plans" },
          { icon: "◉",  label: "Financeiro",     path: "/admin/financeiro" },
          { icon: "🛡",  label: "Admins",         path: "/admin/manage-admins" },
        ].map(a => (
          <button key={a.path} onClick={() => setLocation(a.path)}
            style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer", transition: "all .15s", fontSize: 22 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--blue-l)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.transform = ""; }}>
            {a.icon}
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>{a.label}</span>
          </button>
        ))}
      </div>

      {/* Barra do meu plano (superadmin) */}
      {isSuperadmin && (
        <div style={{ background: "linear-gradient(135deg,#0f172a,#1e3a5f)", borderRadius: 14, padding: "16px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)", marginBottom: 4 }}>Meu plano atual (superadmin)</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#4ade80" }}>
              {{ free: "Free", basic: "Basic", premium: "Premium", vip: "VIP" }[(user as any)?.plan] || "Free"}
            </div>
          </div>
          <button onClick={() => setShowMyPlan(true)}
            style={{ background: "rgba(255,255,255,.12)", color: "white", border: "1px solid rgba(255,255,255,.2)", borderRadius: 10, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Alterar meu plano
          </button>
        </div>
      )}

      {/* Modal alterar plano */}
      {showMyPlan && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "white", borderRadius: 18, padding: 28, maxWidth: 400, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, marginBottom: 18, color: "var(--black)" }}>Alterar meu plano</h3>
            <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
              {([
                { value: "free",    label: "Free",    desc: "Sem custo — acesso básico" },
                { value: "basic",   label: "Basic",   desc: "R$ 97/mês" },
                { value: "premium", label: "Premium", desc: "R$ 197/mês" },
                { value: "vip",     label: "VIP",     desc: "R$ 397/mês" },
              ] as const).map(opt => (
                <button key={opt.value} onClick={() => setMyPlanValue(opt.value)}
                  style={{ padding: "12px 16px", borderRadius: 10, border: `2px solid ${myPlanValue === opt.value ? "var(--blue)" : "var(--border)"}`, background: myPlanValue === opt.value ? "#eff6ff" : "white", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: myPlanValue === opt.value ? "var(--blue)" : "var(--black)" }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{opt.desc}</div>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowMyPlan(false)} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid var(--border)", background: "white", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Cancelar</button>
              <button onClick={() => updatePlan.mutate({ userId: (user as any)!.id, plan: myPlanValue as any })}
                disabled={updatePlan.isPending}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none", background: "var(--blue)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                {updatePlan.isPending ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
