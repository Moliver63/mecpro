import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

// ─── Constantes de UI ────────────────────────────────────────────────────────
const PLAN_LABELS: Record<string, string> = {
  free: "Free", basic: "Basic", premium: "Premium", vip: "VIP",
};
const PLAN_COLORS: Record<string, string> = {
  free: "bg-gray-100 text-gray-700",
  basic: "bg-blue-100 text-blue-700",
  premium: "bg-purple-100 text-purple-700",
  vip: "bg-yellow-100 text-yellow-700",
};
const ROLE_COLORS: Record<string, string> = {
  user: "bg-gray-100 text-gray-600",
  admin: "bg-indigo-100 text-indigo-700",
  superadmin: "bg-red-100 text-red-700",
};
const PROFILE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  marketing:  { label: "Marketing",  icon: "📢", color: "bg-green-100 text-green-700" },
  financeiro: { label: "Financeiro", icon: "◈", color: "bg-yellow-100 text-yellow-700" },
  rh:         { label: "RH",         icon: "👥", color: "bg-pink-100 text-pink-700" },
};

type User = {
  id: number;
  name: string;
  email: string;
  plan: string;
  role: string;
  profile?: string | null;
  createdAt?: string;
  status?: string;
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function AdminUsers() {
  const { user: me } = useAuth();
  // toast from sonner (imported directly)

  const isSuperadmin = me?.role === "superadmin";
  const isFinanceiro =
    isSuperadmin || (me?.role === "admin" && (me as any)?.profile === "financeiro");
  const isMarketing =
    isSuperadmin || (me?.role === "admin" && (me as any)?.profile === "marketing");
  const isRH =
    isSuperadmin || (me?.role === "admin" && (me as any)?.profile === "rh");

  // ── State ─────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  // Modais
  const [planModal, setPlanModal] = useState<{ user: User } | null>(null);
  const [planValue, setPlanValue] = useState("");
  const [planReason, setPlanReason] = useState("");

  const [profileModal, setProfileModal] = useState<{ user: User } | null>(null);

  const [promoteModal, setPromoteModal] = useState<{ user: User } | null>(null);
  const [demoteModal, setDemoteModal]   = useState<{ user: User } | null>(null);

  const [planReqModal, setPlanReqModal] = useState<{
    reqs: any[];
  } | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: users = [], refetch } = trpc.admin.users.useQuery();
  const { data: pendingReqs = [], refetch: refetchReqs } =
    trpc.admin.pendingPlanRequests.useQuery(undefined, { enabled: isSuperadmin });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const updatePlan = trpc.admin.updateUserPlan.useMutation({
    onSuccess: () => { refetch(); toast.success("◎ Plano atualizado!"); setPlanModal(null); },
    onError: (e) => toast.error(e.message),
  });

  const requestPlan = trpc.planRequests.request.useMutation({
    onSuccess: () => {
      toast.success("📨 Solicitação enviada ao Superadmin!");
      setPlanModal(null); setPlanReason(""); setPlanValue("");
    },
    onError: (e) => toast.error(e.message),
  });

  const setProfile = trpc.admin.setUserProfile.useMutation({
    onSuccess: () => { refetch(); toast.success("◎ Perfil atualizado!"); setProfileModal(null); },
    onError: (e) => toast.error(e.message),
  });

  const promote = trpc.admin.promoteToAdmin.useMutation({
    onSuccess: () => { refetch(); toast.success("◎ Usuário promovido a Admin!"); setPromoteModal(null); },
    onError: (e) => toast.error(e.message),
  });
  const demote = trpc.admin.demoteFromAdmin.useMutation({
    onSuccess: () => { refetch(); toast.success("◎ Admin rebaixado a Usuário!"); setDemoteModal(null); },
    onError: (e) => toast.error(e.message),
  });

  const approvePlan = trpc.admin.approvePlanRequest.useMutation({
    onSuccess: () => { refetchReqs(); toast.success("◎ Solicitação aprovada!"); },
  });
  const rejectPlan = trpc.admin.rejectPlanRequest.useMutation({
    onSuccess: () => { refetchReqs(); toast.success("🚫 Solicitação rejeitada!"); },
  });

  const suspendUser   = trpc.admin.suspendUser.useMutation({ onSuccess: () => refetch() });
  const unsuspendUser = trpc.admin.unsuspendUser.useMutation({ onSuccess: () => refetch() });
  const deleteUser    = trpc.admin.deleteUser.useMutation({
    onSuccess: () => { refetch(); toast.success("🗑️ Usuário excluído."); },
  });

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = (users as User[]).filter((u) => {
    const matchSearch =
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === "all") return true;
    if (["free","basic","premium","vip"].includes(filter)) return u.plan === filter;
    if (filter === "admin") return ["admin","superadmin"].includes(u.role);
    if (filter === "marketing")  return u.role === "admin" && u.profile === "marketing";
    if (filter === "financeiro") return u.role === "admin" && u.profile === "financeiro";
    if (filter === "rh")         return u.role === "admin" && u.profile === "rh";
    return true;
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function handlePlanSubmit() {
    if (!planModal || !planValue) return;
    if (isSuperadmin) {
      updatePlan.mutate({ userId: planModal.user.id, plan: planValue as any });
    } else if (isFinanceiro) {
      requestPlan.mutate({
        targetUserId: planModal.user.id,
        requestedPlan: planValue as any,
        reason: planReason,
      });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gerenciar Usuários</h1>
            <p className="text-sm text-gray-500">{(users as User[]).length} usuários cadastrados</p>
          </div>
          {/* Hierarquia visual */}
          <div className="text-xs bg-gray-50 border rounded-lg px-3 py-2 flex gap-2 items-center flex-wrap">
            <span className="font-semibold text-gray-500">Hierarquia:</span>
            <span className="bg-red-100 text-red-700 rounded px-2 py-0.5">🔴 Superadmin</span>
            <span className="text-gray-400">→</span>
            <span className="bg-green-100 text-green-700 rounded px-2 py-0.5">📢 Marketing</span>
            <span className="bg-yellow-100 text-yellow-700 rounded px-2 py-0.5">💰 Financeiro</span>
            <span className="bg-pink-100 text-pink-700 rounded px-2 py-0.5">👥 RH</span>
          </div>
        </div>

        {/* Pending plan requests banner (Superadmin only) */}
        {isSuperadmin && (pendingReqs as any[]).length > 0 && (
          <div
            className="mb-4 bg-yellow-50 border border-yellow-300 rounded-lg px-4 py-3 flex items-center justify-between cursor-pointer"
            onClick={() => setPlanReqModal({ reqs: pendingReqs as any[] })}
          >
            <span className="text-yellow-800 font-medium">
              ⚠️ {(pendingReqs as any[]).length} solicitação(ões) de mudança de plano pendente(s)
            </span>
            <button className="text-yellow-700 underline text-sm">Ver agora →</button>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <input
            className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]"
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {[
            { key: "all",        label: "Todos" },
            { key: "free",       label: "Free" },
            { key: "basic",      label: "Basic" },
            { key: "premium",    label: "Premium" },
            { key: "vip",        label: "VIP" },
            { key: "admin",      label: "🛡️ Admin" },
            { key: "marketing",  label: "📢 Marketing" },
            { key: "financeiro", label: "💰 Financeiro" },
            { key: "rh",         label: "👥 RH" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                filter === f.key
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Usuário</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Plano</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Função / Perfil</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cadastro</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((u) => {
                const profileInfo = u.profile ? PROFILE_LABELS[u.profile] : null;
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    {/* Usuário */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{u.name}</div>
                      <div className="text-gray-400 text-xs">{u.email}</div>
                    </td>
                    {/* Plano */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_COLORS[u.plan] ?? "bg-gray-100 text-gray-700"}`}>
                        {PLAN_LABELS[u.plan] ?? u.plan}
                      </span>
                    </td>
                    {/* Função / Perfil */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.role] ?? "bg-gray-100"}`}>
                          {u.role === "superadmin" ? "🔴 Superadmin" : u.role === "admin" ? "🛡️ Admin" : "👤 Usuário"}
                        </span>
                        {profileInfo && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${profileInfo.color}`}>
                            {profileInfo.icon} {profileInfo.label}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Cadastro */}
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    {/* Ações */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 justify-end">
                        {/* Plano: Superadmin pode alterar QUALQUER usuário inclusive outros superadmins */}
                        {(isSuperadmin || (isFinanceiro && u.role !== "superadmin")) && (
                          <button
                            onClick={() => { setPlanValue(u.plan); setPlanModal({ user: u }); }}
                            className="px-2 py-1 text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 rounded hover:bg-yellow-100"
                          >
                            💰 Plano
                          </button>
                        )}

                        {/* Perfil: Superadmin only, somente para admins */}
                        {isSuperadmin && ["admin"].includes(u.role) && (
                          <button
                            onClick={() => setProfileModal({ user: u })}
                            className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-100"
                          >
                            🏷️ Perfil
                          </button>
                        )}

                        {/* Promover: Superadmin only, somente usuários comuns */}
                        {isSuperadmin && u.role === "user" && (
                          <button
                            onClick={() => setPromoteModal({ user: u })}
                            className="px-2 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100"
                          >
                            ⬆️ Admin
                          </button>
                        )}

                        {/* Rebaixar: Superadmin only, somente admins (não superadmin) */}
                        {isSuperadmin && u.role === "admin" && (
                          <button
                            onClick={() => setDemoteModal({ user: u })}
                            className="px-2 py-1 text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded hover:bg-orange-100"
                          >
                            ⬇️ Rebaixar
                          </button>
                        )}

                        {/* Suspender / Reativar */}
                        {isSuperadmin && u.role !== "superadmin" && (
                          u.status === "suspended" ? (
                            <button
                              onClick={() => unsuspendUser.mutate({ userId: u.id })}
                              className="px-2 py-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100"
                            >
                              ◎ Reativar
                            </button>
                          ) : (
                            <button
                              onClick={() => suspendUser.mutate({ userId: u.id, reason: "Suspenso pelo painel" })}
                              className="px-2 py-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100"
                            >
                              🚫 Suspender
                            </button>
                          )
                        )}

                        {/* Excluir */}
                        {isSuperadmin && u.role !== "superadmin" && (
                          <button
                            onClick={() => {
                              if (confirm(`Excluir ${u.name}? Esta ação é irreversível.`))
                                deleteUser.mutate({ userId: u.id });
                            }}
                            className="px-2 py-1 text-xs bg-gray-50 text-gray-600 border border-gray-200 rounded hover:bg-gray-100"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-gray-400">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MODAL: Alterar / Solicitar Plano ─────────────────────────────────── */}
      {planModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-1">
              {isSuperadmin ? "💰 Alterar Plano" : "📨 Solicitar Mudança de Plano"}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Usuário: <strong>{planModal.user.name}</strong> — Plano atual:{" "}
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_COLORS[planModal.user.plan]}`}>
                {PLAN_LABELS[planModal.user.plan]}
              </span>
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Novo Plano</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm mb-4"
              value={planValue}
              onChange={(e) => setPlanValue(e.target.value)}
            >
              <option value="">Selecione...</option>
              {["free","basic","premium","vip"].map((p) => (
                <option key={p} value={p}>{PLAN_LABELS[p]}</option>
              ))}
            </select>
            {!isSuperadmin && isFinanceiro && (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Motivo da solicitação <span className="text-gray-400">(opcional)</span>
                </label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 text-sm mb-4"
                  rows={3}
                  placeholder="Descreva o motivo..."
                  value={planReason}
                  onChange={(e) => setPlanReason(e.target.value)}
                />
                <p className="text-xs text-yellow-700 bg-yellow-50 rounded p-2 mb-4">
                  ⚠️ Você não tem permissão para alterar planos diretamente. Esta solicitação será
                  enviada ao <strong>Superadmin</strong> para aprovação.
                </p>
              </>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setPlanModal(null); setPlanReason(""); setPlanValue(""); }}
                className="px-4 py-2 text-sm border rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handlePlanSubmit}
                disabled={!planValue || updatePlan.isLoading || requestPlan.isPending}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSuperadmin ? "Salvar" : "Enviar Solicitação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Definir Perfil (Superadmin only) ──────────────────────────── */}
      {profileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-1">🏷️ Definir Perfil de Admin</h2>
            <p className="text-sm text-gray-500 mb-4">
              Usuário: <strong>{profileModal.user.name}</strong>
            </p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { value: null,         icon: "🚫", label: "Sem Perfil",  color: "border-gray-200" },
                { value: "marketing",  icon: "📢", label: "Marketing",   color: "border-green-300 bg-green-50" },
                { value: "financeiro", icon: "◈", label: "Financeiro",  color: "border-yellow-300 bg-yellow-50" },
                { value: "rh",         icon: "👥", label: "RH",          color: "border-pink-300 bg-pink-50" },
              ].map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => {
                    setProfile.mutate({ userId: profileModal.user.id, profile: opt.value as any });
                  }}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 hover:scale-105 transition ${opt.color} ${
                    profileModal.user.profile === opt.value ? "ring-2 ring-indigo-500" : ""
                  }`}
                >
                  <span className="text-3xl">{opt.icon}</span>
                  <span className="text-sm font-medium mt-1">{opt.label}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setProfileModal(null)}
                className="px-4 py-2 text-sm border rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Promover a Admin ───────────────────────────────────────────── */}
      {promoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-2">⬆️ Promover a Admin</h2>
            <p className="text-sm text-gray-600 mb-4">
              Tem certeza que deseja promover <strong>{promoteModal.user.name}</strong> a Admin?
              <br />
              <span className="text-indigo-600 text-xs">Dica: após promover, você pode atribuir um perfil (Marketing, Financeiro ou RH).</span>
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPromoteModal(null)} className="px-4 py-2 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={() => promote.mutate({ userId: promoteModal.user.id })}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Promover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Rebaixar Admin ─────────────────────────────────────────────── */}
      {demoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-2">⬇️ Rebaixar Admin</h2>
            <p className="text-sm text-gray-600 mb-4">
              Rebaixar <strong>{demoteModal.user.name}</strong> para usuário comum?
              {demoteModal.user.profile && (
                <span className="block text-xs text-red-600 mt-1">
                  ⚠️ O perfil "{demoteModal.user.profile}" também será removido.
                </span>
              )}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDemoteModal(null)} className="px-4 py-2 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={() => demote.mutate({ userId: demoteModal.user.id })}
                className="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700"
              >
                Rebaixar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Solicitações de Plano pendentes (Superadmin) ──────────────── */}
      {planReqModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl my-8">
            <h2 className="text-lg font-bold mb-4">⚠️ Solicitações de Mudança de Plano</h2>
            {planReqModal.reqs.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhuma solicitação pendente.</p>
            ) : (
              <div className="divide-y">
                {planReqModal.reqs.map((r: any) => (
                  <div key={r.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium">
                        Usuário #{r.targetUserId}: {r.currentPlan} → <strong>{r.requestedPlan}</strong>
                      </div>
                      <div className="text-xs text-gray-400">
                        Solicitado por #{r.requestedByUserId} · {r.reason ?? "Sem motivo"}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => approvePlan.mutate({ requestId: r.id })}
                        className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        ◎ Aprovar
                      </button>
                      <button
                        onClick={() => rejectPlan.mutate({ requestId: r.id, note: "Rejeitado pelo Superadmin" })}
                        className="px-3 py-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100"
                      >
                        🚫 Rejeitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end mt-4">
              <button onClick={() => setPlanReqModal(null)} className="px-4 py-2 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
