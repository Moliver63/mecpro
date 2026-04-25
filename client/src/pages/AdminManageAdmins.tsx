import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";

export default function AdminManageAdmins() {
  const { user } = useAuth();
  const { data: admins, refetch: refetchAdmins } = trpc.admin.admins.useQuery();
  const { data: invites, refetch: refetchInvites } = trpc.admin.listInvites.useQuery();
  const [inviteForm, setInviteForm] = useState({ email: "", role: "admin" as "admin" | "superadmin" });
  const [sent, setSent] = useState(false);

  const createInvite  = trpc.admin.createInvite.useMutation({ onSuccess: () => { refetchInvites(); setSent(true); setInviteForm({ email: "", role: "admin" }); setTimeout(() => setSent(false), 3000); } });
  const deleteInvite  = trpc.admin.deleteInvite.useMutation({ onSuccess: () => refetchInvites() });
  const demote        = trpc.admin.demoteFromAdmin.useMutation({ onSuccess: () => refetchAdmins() });

  const isSuperAdmin = (user as any)?.role === "superadmin";

  return (
    <Layout>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Gerenciar Admins</h1>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Controle de acesso administrativo</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Lista de admins */}
        <div>
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)" }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", fontFamily: "var(--font-display)" }}>Administradores ativos ({admins?.length || 0})</p>
            </div>
            {!admins?.length ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>Nenhum admin encontrado</div>
            ) : admins.map((a: any) => (
              <div key={a.id} style={{ padding: "14px 22px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: a.role === "superadmin" ? "#f5f3ff" : "var(--green-l)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: a.role === "superadmin" ? "#7c3aed" : "var(--green-dk)" }}>
                    {a.name?.[0]?.toUpperCase() || a.email[0].toUpperCase()}
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--black)" }}>{a.name || a.email}</p>
                    <p style={{ fontSize: 11, color: "var(--muted)" }}>{a.email}</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: a.role === "superadmin" ? "#f5f3ff" : "var(--green-xl)", color: a.role === "superadmin" ? "#7c3aed" : "var(--green-dk)" }}>
                    {a.role.toUpperCase()}
                  </span>
                  {isSuperAdmin && a.role !== "superadmin" && a.id !== (user as any)?.id && (
                    <button className="btn btn-sm btn-danger" style={{ fontSize: 11 }} onClick={() => demote.mutate({ userId: a.id })}>Remover</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Convidar admin */}
        <div>
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24, marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 18, fontFamily: "var(--font-display)" }}>Convidar novo admin</p>
            {!isSuperAdmin && (
              <div style={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: "#713f12" }}>
                ⚠ Apenas super admins podem convidar novos administradores.
              </div>
            )}
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>E-mail</label>
            <input className="input" placeholder="admin@empresa.com" value={inviteForm.email}
              onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
              style={{ width: "100%", marginBottom: 14 }} disabled={!isSuperAdmin} />
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Nível de acesso</label>
            <select className="input" value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value as any }))}
              style={{ width: "100%", marginBottom: 20 }} disabled={!isSuperAdmin}>
              <option value="admin">Admin</option>
              <option value="superadmin">Super Admin</option>
            </select>
            {sent && <p style={{ fontSize: 13, color: "var(--green-d)", fontWeight: 600, marginBottom: 10 }}>✓ Convite enviado!</p>}
            <button className="btn btn-md btn-green btn-full" disabled={!isSuperAdmin || createInvite.isLoading || !inviteForm.email}
              onClick={() => createInvite.mutate(inviteForm)}>
              {createInvite.isPending ? "Enviando..." : "Enviar convite"}
            </button>
          </div>

          {/* Convites pendentes */}
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)" }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", fontFamily: "var(--font-display)" }}>Convites pendentes ({invites?.length || 0})</p>
            </div>
            {!invites?.length ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Nenhum convite pendente</div>
            ) : invites.map((inv: any) => (
              <div key={inv.id} style={{ padding: "12px 22px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ fontSize: 13, color: "var(--black)" }}>{inv.email}</p>
                  <p style={{ fontSize: 11, color: "var(--muted)" }}>{inv.role} · {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString("pt-BR") : ""}</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, background: "#fef9c3", color: "#713f12", padding: "2px 8px", borderRadius: 4 }}>PENDENTE</span>
                  {isSuperAdmin && (
                    <button className="btn btn-sm btn-danger" style={{ fontSize: 11 }} onClick={() => deleteInvite.mutate({ id: inv.id })}>✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
