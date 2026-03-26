import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const PLAN_LABELS: Record<string, string> = {
  free: "Free", basic: "Basic", premium: "Premium", vip: "VIP"
};
const PLAN_COLORS: Record<string, { color: string; bg: string }> = {
  free:    { color: "#6b7280", bg: "#f3f4f6" },
  basic:   { color: "#3b82f6", bg: "#dbeafe" },
  premium: { color: "#f59e0b", bg: "#fef3c7" },
  vip:     { color: "#8b5cf6", bg: "#ede9fe" },
};
const STATUS_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  pending:  { color: "#d97706", bg: "#fef3c7", label: "⏳ Pendente" },
  approved: { color: "#16a34a", bg: "#d1fae5", label: "✅ Aprovado" },
  rejected: { color: "#dc2626", bg: "#fee2e2", label: "❌ Recusado" },
};

export default function AdminPlanRequests() {
  const [, setLocation] = useLocation();
  const [tab, setTab]   = useState<"pending" | "all">("pending");
  const [rejectModal, setRejectModal] = useState<{ id: number; userName: string } | null>(null);
  const [rejectNote, setRejectNote]   = useState("");
  const [approveModal, setApproveModal] = useState<{ id: number; userName: string; plan: string } | null>(null);
  const [approveNote, setApproveNote] = useState("");

  const { data: allRequests = [], refetch } = trpc.admin.listPlanRequests.useQuery();
  const { data: pending = [] }              = trpc.admin.pendingPlanRequests.useQuery();

  const approve = trpc.admin.approvePlanRequest.useMutation({
    onSuccess: () => { toast.success("Plano aprovado! Usuário notificado."); refetch(); setApproveModal(null); setApproveNote(""); },
    onError: (err: any) => toast.error(err.message ?? "Erro ao aprovar"),
  });
  const reject = trpc.admin.rejectPlanRequest.useMutation({
    onSuccess: () => { toast.success("Solicitação recusada. Usuário notificado."); refetch(); setRejectModal(null); setRejectNote(""); },
    onError: (err: any) => toast.error(err.message ?? "Erro ao recusar"),
  });

  const displayed = tab === "pending" ? (pending as any[]) : (allRequests as any[]);

  function fmt(d: any) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <Layout>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <button className="btn btn-sm btn-ghost" onClick={() => setLocation("/admin")} style={{ paddingLeft: 0, marginBottom: 8 }}>
          ← Painel Admin
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📋</div>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 2 }}>
              Solicitações de Mudança de Plano
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>Aprovação exclusiva do Superadmin</p>
          </div>
          {(pending as any[]).length > 0 && (
            <span style={{ background: "#dc2626", color: "#fff", borderRadius: 20, padding: "4px 12px", fontWeight: 700, fontSize: 13 }}>
              {(pending as any[]).length} pendente{(pending as any[]).length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Flow explainer */}
      <div style={{ background: "#1a2744", borderRadius: 14, padding: "16px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        {[
          { icon: "💰", label: "Financeiro solicita", desc: "mudança de plano" },
          { icon: "→", label: "", desc: "" },
          { icon: "🔔", label: "Superadmin notificado", desc: "via notificação" },
          { icon: "→", label: "", desc: "" },
          { icon: "✅", label: "Aprova ou recusa", desc: "com motivo" },
          { icon: "→", label: "", desc: "" },
          { icon: "📬", label: "Financeiro notificado", desc: "do resultado" },
        ].map((s, i) => s.icon === "→" ? (
          <span key={i} style={{ color: "#64748b", fontSize: 20 }}>→</span>
        ) : (
          <div key={i} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, marginBottom: 2 }}>{s.icon}</div>
            <div style={{ color: "#fff", fontWeight: 600, fontSize: 12 }}>{s.label}</div>
            <div style={{ color: "#94a3b8", fontSize: 11 }}>{s.desc}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[
          { key: "pending", label: `⏳ Pendentes (${(pending as any[]).length})` },
          { key: "all",     label: `📁 Todas (${(allRequests as any[]).length})` },
        ].map(t => (
          <button
            key={t.key}
            className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-outline"}`}
            onClick={() => setTab(t.key as any)}
          >{t.label}</button>
        ))}
      </div>

      {/* Requests list */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        {displayed.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 600, color: "#1e293b", marginBottom: 4 }}>
              {tab === "pending" ? "Nenhuma solicitação pendente" : "Nenhuma solicitação encontrada"}
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8" }}>
              {tab === "pending" ? "Todas as solicitações foram processadas." : "Ainda não há solicitações de mudança de plano."}
            </div>
          </div>
        ) : (
          <div>
            {displayed.map((req: any) => {
              const status = STATUS_STYLES[req.status] ?? STATUS_STYLES.pending;
              const from   = PLAN_COLORS[req.currentPlan]   ?? PLAN_COLORS.free;
              const to     = PLAN_COLORS[req.requestedPlan] ?? PLAN_COLORS.free;
              return (
                <div key={req.id} style={{ borderBottom: "1px solid #f1f5f9", padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>Solicitação #{req.id}</span>
                        <span style={{ background: status.bg, color: status.color, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>
                          {status.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: "#374151", marginBottom: 6 }}>
                        <strong>Usuário alvo:</strong> #{req.targetUserId}
                        &nbsp;·&nbsp;
                        <strong>Solicitado por:</strong> #{req.requestedByUserId}
                      </div>
                      {/* Plan change arrow */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ background: from.bg, color: from.color, fontWeight: 700, fontSize: 12, padding: "3px 12px", borderRadius: 20 }}>
                          {PLAN_LABELS[req.currentPlan] ?? req.currentPlan}
                        </span>
                        <span style={{ fontSize: 18, color: "#94a3b8" }}>→</span>
                        <span style={{ background: to.bg, color: to.color, fontWeight: 700, fontSize: 12, padding: "3px 12px", borderRadius: 20 }}>
                          {PLAN_LABELS[req.requestedPlan] ?? req.requestedPlan}
                        </span>
                      </div>
                      {req.reason && (
                        <div style={{ fontSize: 13, color: "#6b7280", background: "#f8fafc", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                          <strong>Motivo:</strong> {req.reason}
                        </div>
                      )}
                      {req.reviewNote && (
                        <div style={{ fontSize: 13, color: req.status === "approved" ? "#16a34a" : "#dc2626", background: req.status === "approved" ? "#d1fae5" : "#fee2e2", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                          <strong>Nota do Superadmin:</strong> {req.reviewNote}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>
                        Solicitado em {fmt(req.createdAt)}
                        {req.reviewedAt && ` · Revisado em ${fmt(req.reviewedAt)}`}
                      </div>
                    </div>
                    {/* Actions */}
                    {req.status === "pending" && (
                      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        <button
                          className="btn btn-sm"
                          style={{ background: "#16a34a", color: "#fff", border: "none" }}
                          onClick={() => setApproveModal({ id: req.id, userName: `#${req.targetUserId}`, plan: req.requestedPlan })}
                        >
                          ✅ Aprovar
                        </button>
                        <button
                          className="btn btn-sm btn-outline"
                          style={{ color: "#dc2626", borderColor: "#dc2626" }}
                          onClick={() => setRejectModal({ id: req.id, userName: `#${req.targetUserId}` })}
                        >
                          ❌ Recusar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Approve Modal */}
      {approveModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 400, width: "90%" }}>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>✅</div>
            <h3 style={{ fontWeight: 700, fontSize: 18, textAlign: "center", marginBottom: 8 }}>Aprovar mudança de plano</h3>
            <p style={{ fontSize: 14, color: "#6b7280", textAlign: "center", marginBottom: 16 }}>
              Usuário {approveModal.userName} será atualizado para o plano <strong>{PLAN_LABELS[approveModal.plan]}</strong>.
            </p>
            <textarea
              placeholder="Nota de aprovação (opcional)..."
              value={approveNote}
              onChange={e => setApproveNote(e.target.value)}
              className="textarea textarea-sm w-full"
              rows={3}
              style={{ marginBottom: 16, width: "100%", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-outline flex-1" onClick={() => { setApproveModal(null); setApproveNote(""); }}>Cancelar</button>
              <button
                className="btn flex-1"
                style={{ background: "#16a34a", color: "#fff", border: "none" }}
                disabled={approve.isPending}
                onClick={() => approve.mutate({ requestId: approveModal.id, note: approveNote || undefined })}
              >
                {approve.isPending ? "Aprovando..." : "Confirmar Aprovação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 400, width: "90%" }}>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>❌</div>
            <h3 style={{ fontWeight: 700, fontSize: 18, textAlign: "center", marginBottom: 8 }}>Recusar solicitação</h3>
            <p style={{ fontSize: 14, color: "#6b7280", textAlign: "center", marginBottom: 16 }}>
              Informe o motivo da recusa. O perfil Financeiro será notificado.
            </p>
            <textarea
              placeholder="Motivo da recusa (obrigatório)..."
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              className="textarea textarea-sm w-full"
              rows={3}
              style={{ marginBottom: 16, width: "100%", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-outline flex-1" onClick={() => { setRejectModal(null); setRejectNote(""); }}>Cancelar</button>
              <button
                className="btn flex-1"
                style={{ background: "#dc2626", color: "#fff", border: "none" }}
                disabled={reject.isPending || !rejectNote.trim()}
                onClick={() => reject.mutate({ requestId: rejectModal.id, note: rejectNote })}
              >
                {reject.isPending ? "Recusando..." : "Confirmar Recusa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
