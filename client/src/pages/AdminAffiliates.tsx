import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";

const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

export default function AdminAffiliates() {
  const utils = (trpc as any).useUtils?.();
  const report = (trpc as any).affiliates?.report?.useQuery?.() ?? { data: undefined, isLoading: false };
  const [form, setForm] = useState({ code: "", name: "", email: "", pixKey: "", commissionPct: "10", maxPayments: "3", holdDays: "7" });
  const [editing, setEditing] = useState<any>(null);
  const [msg, setMsg] = useState("");

  const refresh = () => utils?.affiliates?.report?.invalidate?.();

  const create = (trpc as any).affiliates?.create?.useMutation?.({
    onSuccess: (a: any) => { setMsg(`Parceiro criado. Link: ${a.link}`); setForm({ code: "", name: "", email: "", pixKey: "", commissionPct: "10", maxPayments: "3", holdDays: "7" }); refresh(); },
    onError: (e: any) => setMsg("Erro: " + (e?.message ?? "não foi possível criar")),
  }) ?? { mutate: () => {}, isPending: false };

  const update = (trpc as any).affiliates?.update?.useMutation?.({
    onSuccess: () => { setMsg("Parceiro atualizado. Mudanças valem para comissões futuras."); setEditing(null); refresh(); },
    onError: (e: any) => setMsg("Erro: " + (e?.message ?? "não foi possível atualizar")),
  }) ?? { mutate: () => {}, isPending: false };

  const markPaid = (trpc as any).affiliates?.markPaid?.useMutation?.({
    onSuccess: (r: any) => { setMsg(`Repasse registrado: ${brl(r.paidCents)} (${r.commissions} comissões)`); refresh(); },
    onError: (e: any) => setMsg("Erro: " + (e?.message ?? "não foi possível registrar")),
  }) ?? { mutate: () => {}, isPending: false };

  const rows: any[] = report.data?.affiliates ?? [];
  const field = { border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 13, width: "100%" } as const;

  return (
    <Layout>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Parceiros</h1>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          Percentual, nº de pagamentos e carência são definidos por parceiro (padrão 10%, 3 pagamentos, 7 dias). A carência nunca é menor que 7 dias corridos (direito de arrependimento).
        </p>
      </div>

      {msg && <div style={{ background: "var(--green-l)", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{msg}</div>}

      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 20 }}>
        <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Novo parceiro</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginBottom: 12 }}>
          <input style={field} placeholder="Código (ex: JOAO10)" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
          <input style={field} placeholder="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input style={field} placeholder="E-mail" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <input style={field} placeholder="Chave Pix" value={form.pixKey} onChange={e => setForm({ ...form, pixKey: e.target.value })} />
          <label style={{ fontSize: 11, color: "var(--muted)" }}>Comissão (%)
            <input style={field} type="number" min={1} max={50} value={form.commissionPct} onChange={e => setForm({ ...form, commissionPct: e.target.value })} /></label>
          <label style={{ fontSize: 11, color: "var(--muted)" }}>Nº de pagamentos
            <input style={field} type="number" min={1} max={36} value={form.maxPayments} onChange={e => setForm({ ...form, maxPayments: e.target.value })} /></label>
          <label style={{ fontSize: 11, color: "var(--muted)" }}>Carência (dias, mín. 7)
            <input style={field} type="number" min={7} max={90} value={form.holdDays} onChange={e => setForm({ ...form, holdDays: e.target.value })} /></label>
        </div>
        <button className="btn btn-green" disabled={create.isPending || !form.code || !form.name}
          onClick={() => create.mutate({ code: form.code, name: form.name, email: form.email || undefined, pixKey: form.pixKey || undefined, commissionPct: Number(form.commissionPct) || 10, maxPayments: Number(form.maxPayments) || 3, holdDays: Math.max(7, Number(form.holdDays) || 7) })}>
          {create.isPending ? "Criando..." : "Criar parceiro"}
        </button>
      </div>

      {report.isLoading && <p style={{ fontSize: 13, color: "var(--muted)" }}>Carregando...</p>}
      {!report.isLoading && rows.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)" }}>Nenhum parceiro cadastrado.</p>}

      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((a) => (
          <div key={a.id} style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <div>
                <p style={{ fontWeight: 800, fontSize: 15 }}>{a.name} <span style={{ fontWeight: 500, color: "var(--muted)" }}>· {a.code}</span></p>
                <p style={{ fontSize: 12, color: "var(--muted)" }}>Pix: {a.pixKey || "não informado"} · {a.referrals} indicados · {a.commissionPct}% por {a.maxPayments} pagamentos</p>
              </div>
              <button className="btn btn-green" disabled={!a.atingeMinimo || markPaid.isPending}
                title={a.atingeMinimo ? "" : "Abaixo do mínimo de R$ 20,00"}
                onClick={() => {
                  const ref = window.prompt(`Pix de ${brl(a.aPagarCents)} feito? Informe o comprovante ou data (ex: Pix 10/12):`);
                  if (ref) markPaid.mutate({ affiliateId: a.id, payoutRef: ref });
                }}>
                Registrar repasse {brl(a.aPagarCents)}
              </button>
            </div>
            <div style={{ marginBottom: 12 }}>
              {editing?.id === a.id ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, alignItems: "end" }}>
                  <label style={{ fontSize: 11, color: "var(--muted)" }}>Comissão (%)
                    <input style={field} type="number" min={1} max={50} value={editing.commissionPct} onChange={e => setEditing({ ...editing, commissionPct: e.target.value })} /></label>
                  <label style={{ fontSize: 11, color: "var(--muted)" }}>Nº de pagamentos
                    <input style={field} type="number" min={1} max={36} value={editing.maxPayments} onChange={e => setEditing({ ...editing, maxPayments: e.target.value })} /></label>
                  <label style={{ fontSize: 11, color: "var(--muted)" }}>Carência (dias)
                    <input style={field} type="number" min={7} max={90} value={editing.holdDays} onChange={e => setEditing({ ...editing, holdDays: e.target.value })} /></label>
                  <label style={{ fontSize: 11, color: "var(--muted)" }}>Chave Pix
                    <input style={field} value={editing.pixKey} onChange={e => setEditing({ ...editing, pixKey: e.target.value })} /></label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-green" disabled={update.isPending}
                      onClick={() => update.mutate({ affiliateId: a.id, commissionPct: Number(editing.commissionPct), maxPayments: Number(editing.maxPayments), holdDays: Math.max(7, Number(editing.holdDays)), pixKey: editing.pixKey })}>Salvar</button>
                    <button className="btn" onClick={() => setEditing(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <button className="btn" onClick={() => setEditing({ id: a.id, commissionPct: String(a.commissionPct), maxPayments: String(a.maxPayments), holdDays: String(a.holdDays), pixKey: a.pixKey || "" })}>
                  Editar regras
                </button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              {[
                { label: `Em carência (${a.holdDays} dias)`, v: a.carenciaCents },
                { label: "Liberado", v: a.liberadoCents },
                { label: "A descontar (reembolso)", v: a.descontarCents },
                { label: "Já pago", v: a.pagoCents },
              ].map(s => (
                <div key={s.label} style={{ background: "var(--off)", borderRadius: 10, padding: "10px 12px" }}>
                  <p style={{ fontSize: 17, fontWeight: 800 }}>{brl(s.v)}</p>
                  <p style={{ fontSize: 11, color: "var(--muted)" }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
