import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";

export default function AdminInvites() {
  const [, setLocation] = useLocation();
  const { data: invites, isLoading, refetch } = trpc.admin.listInvites.useQuery();
  const deleteInvite = trpc.admin.deleteInvite.useMutation({ onSuccess: () => refetch() });

  return (
    <Layout>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Convites</h1>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>Convites de acesso administrativo enviados</p>
        </div>
        <button className="btn btn-md btn-green" onClick={() => setLocation("/admin/manage-admins")}>+ Novo convite</button>
      </div>

      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--off)" }}>
              {["E-mail", "Cargo", "Convidado por", "Data", "Status", "Ações"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Carregando...</td></tr>
            ) : !invites?.length ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Nenhum convite enviado</td></tr>
            ) : invites.map((inv: any) => (
              <tr key={inv.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--black)" }}>{inv.email}</td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, background: inv.role === "superadmin" ? "#f5f3ff" : "var(--green-xl)", color: inv.role === "superadmin" ? "#7c3aed" : "var(--green-dk)", padding: "2px 8px", borderRadius: 4 }}>
                    {inv.role.toUpperCase()}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted)" }}>Admin #{inv.invitedBy || "—"}</td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted)" }}>{inv.createdAt ? new Date(inv.createdAt).toLocaleDateString("pt-BR") : "—"}</td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, background: inv.usedAt ? "var(--green-xl)" : "#fef9c3", color: inv.usedAt ? "var(--green-dk)" : "#713f12", padding: "2px 8px", borderRadius: 4 }}>
                    {inv.usedAt ? "✓ USADO" : "PENDENTE"}
                  </span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  {!inv.usedAt && (
                    <button className="btn btn-sm btn-danger" style={{ fontSize: 11 }} onClick={() => deleteInvite.mutate({ id: inv.id })}>Revogar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
