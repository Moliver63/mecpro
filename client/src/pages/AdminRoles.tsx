import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Descrição dos perfis ─────────────────────────────────────────────────
const PROFILES = [
  {
    key: "marketing",
    label: "Marketing",
    icon: "📢",
    color: "#3b82f6",
    bg: "#eff6ff",
    desc: "Gerencia campanhas, criativos e relatórios. Sem acesso a finanças ou RH.",
    can: ["Criar e editar campanhas", "Visualizar relatórios de performance", "Gerenciar criativos", "Acessar módulos de análise"],
    cannot: ["Acessar dados financeiros", "Modificar planos de usuário", "Gerenciar equipe (RH)", "Aprovar mudanças críticas"],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    icon: "💰",
    color: "#10b981",
    bg: "#f0fdf4",
    desc: "Acesso a relatórios financeiros. Pode solicitar mudanças de plano (pendente aprovação do Superadmin).",
    can: ["Visualizar relatórios financeiros", "Acessar faturamento e assinaturas", "Solicitar mudança de plano (requer aprovação)", "Ver histórico de pagamentos"],
    cannot: ["Aprovar mudanças sem Superadmin", "Gerenciar campanhas", "Acessar dados de RH", "Modificar configurações do sistema"],
  },
  {
    key: "rh",
    label: "RH",
    icon: "👥",
    color: "#8b5cf6",
    bg: "#f5f3ff",
    desc: "Gestão de pessoas. Sem acesso a campanhas ou dados financeiros.",
    can: ["Gerenciar usuários e membros", "Visualizar perfis de equipe", "Gerenciar programas de treinamento", "Acessar certificados e cursos"],
    cannot: ["Acessar dados financeiros", "Gerenciar campanhas", "Modificar planos", "Aprovar mudanças financeiras"],
  },
];

const ROLE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  user:       { label: "Usuário",    color: "#6b7280", bg: "#f3f4f6" },
  admin:      { label: "Admin",      color: "#3b82f6", bg: "#dbeafe" },
  superadmin: { label: "Superadmin", color: "#dc2626", bg: "#fee2e2" },
};
const PROFILE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  marketing:  { label: "Marketing",  color: "#3b82f6", bg: "#dbeafe" },
  financeiro: { label: "Financeiro", color: "#10b981", bg: "#d1fae5" },
  rh:         { label: "RH",         color: "#8b5cf6", bg: "#ede9fe" },
};

export default function AdminRoles() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [confirmModal, setConfirmModal] = useState<{
    userId: number; userName: string;
    profile: "marketing" | "financeiro" | "rh" | null;
  } | null>(null);

  const { data: users = [], refetch } = trpc.admin.users.useQuery();
  const setProfile = trpc.admin.setUserProfile.useMutation({
    onSuccess: () => {
      toast.success("Perfil atualizado com sucesso!");
      refetch();
      setConfirmModal(null);
    },
    onError: (err: any) => toast.error(err.message ?? "Erro ao atualizar perfil"),
  });

  const adminUsers = (users as any[]).filter(u =>
    ["admin", "superadmin"].includes(u.role)
  );
  const filtered = adminUsers.filter(u =>
    !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <button className="btn btn-sm btn-ghost" onClick={() => setLocation("/admin")} style={{ paddingLeft: 0, marginBottom: 8 }}>
          ← Painel Admin
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🏛️</div>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 2 }}>Hierarquia de Usuários</h1>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>Gerencie perfis e permissões da equipe admin</p>
          </div>
        </div>
      </div>

      {/* Perfis Explicados */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--black)", marginBottom: 14 }}>📋 Estrutura de Perfis</h2>
        <div style={{ background: "#1a2744", borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>👑 Superadmin — Topo da hierarquia</div>
          <p style={{ color: "#94a3b8", fontSize: 13 }}>
            Acesso total ao sistema. Aprova mudanças de plano, recebe notificações críticas, gerencia todos os perfis. Não responde a nenhum outro perfil.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
          {PROFILES.map(p => (
            <div key={p.key} style={{ background: p.bg, border: `1.5px solid ${p.color}30`, borderRadius: 14, padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 22 }}>{p.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, color: p.color, fontSize: 15 }}>{p.label}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Responde ao Superadmin</div>
                </div>
              </div>
              <p style={{ fontSize: 13, color: "#374151", marginBottom: 10 }}>{p.desc}</p>
              <div style={{ fontSize: 12 }}>
                <div style={{ fontWeight: 600, color: "#16a34a", marginBottom: 4 }}>✅ Pode:</div>
                {p.can.map(c => <div key={c} style={{ color: "#374151", paddingLeft: 8, marginBottom: 2 }}>• {c}</div>)}
                <div style={{ fontWeight: 600, color: "#dc2626", marginTop: 8, marginBottom: 4 }}>❌ Não pode:</div>
                {p.cannot.map(c => <div key={c} style={{ color: "#374151", paddingLeft: 8, marginBottom: 2 }}>• {c}</div>)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabela de Usuários Admin */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--black)" }}>👤 Usuários Administrativos</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{filtered.length} admins encontrados</div>
          </div>
          <input
            className="input input-sm"
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 260 }}
          />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Usuário","E-mail","Role","Perfil Atual","Ações"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: "32px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Nenhum usuário admin encontrado</td></tr>
              ) : filtered.map((u: any) => {
                const roleBadge  = ROLE_BADGE[u.role]    ?? ROLE_BADGE["user"];
                const profBadge  = u.profile ? PROFILE_BADGE[u.profile] : null;
                return (
                  <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, color: "#1a2744" }}>
                          {(u.name || u.email)[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>{u.name ?? "—"}</div>
                          <div style={{ fontSize: 12, color: "#94a3b8" }}>#{u.id}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#374151" }}>{u.email}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ background: roleBadge.bg, color: roleBadge.color, fontWeight: 600, fontSize: 11, padding: "3px 10px", borderRadius: 20 }}>
                        {roleBadge.label}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {profBadge ? (
                        <span style={{ background: profBadge.bg, color: profBadge.color, fontWeight: 600, fontSize: 11, padding: "3px 10px", borderRadius: 20 }}>
                          {profBadge.label}
                        </span>
                      ) : (
                        <span style={{ color: "#94a3b8", fontSize: 12 }}>Sem perfil</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {u.role === "superadmin" ? (
                        <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>👑 Superadmin</span>
                      ) : (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {PROFILES.map(p => (
                            <button
                              key={p.key}
                              className={`btn btn-xs ${u.profile === p.key ? "btn-primary" : "btn-outline"}`}
                              style={{ fontSize: 11 }}
                              onClick={() => setConfirmModal({ userId: u.id, userName: u.name ?? u.email, profile: u.profile === p.key ? null : p.key as any })}
                            >
                              {p.icon} {p.label}
                            </button>
                          ))}
                          {u.profile && (
                            <button
                              className="btn btn-xs btn-ghost"
                              style={{ fontSize: 11, color: "#dc2626" }}
                              onClick={() => setConfirmModal({ userId: u.id, userName: u.name ?? u.email, profile: null })}
                            >
                              ✕ Remover
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm Modal */}
      {confirmModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 420, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>
              {confirmModal.profile ? PROFILES.find(p => p.key === confirmModal.profile)?.icon ?? "🔄" : "🗑️"}
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>
              {confirmModal.profile ? `Atribuir perfil ${confirmModal.profile}` : "Remover perfil"}
            </h3>
            <p style={{ fontSize: 14, color: "#6b7280", textAlign: "center", marginBottom: 20 }}>
              {confirmModal.profile
                ? `Deseja atribuir o perfil "${confirmModal.profile}" ao usuário ${confirmModal.userName}?`
                : `Deseja remover o perfil de ${confirmModal.userName}?`}
            </p>
            {confirmModal.profile && (
              <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px", marginBottom: 20 }}>
                {PROFILES.find(p => p.key === confirmModal.profile)?.can.map(c => (
                  <div key={c} style={{ fontSize: 12, color: "#374151", marginBottom: 4 }}>✅ {c}</div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-outline flex-1" onClick={() => setConfirmModal(null)}>Cancelar</button>
              <button
                className="btn btn-primary flex-1"
                disabled={setProfile.isPending}
                onClick={() => setProfile.mutate({ userId: confirmModal.userId, profile: confirmModal.profile })}
              >
                {setProfile.isPending ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
