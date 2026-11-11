import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";

const brl = (cents: number) => `R$ ${((cents || 0) / 100).toFixed(2).replace(".", ",")}`;
const field = { border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 14, width: "100%" } as const;
const card = { background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: 18 } as const;

const STATUS: Record<string, string> = { pending: "Em carência", paid: "Pago", cancelled: "Cancelada" };

export default function Afiliados() {
  const utils = (trpc as any).useUtils?.();
  const me = (trpc as any).affiliates?.me?.useQuery?.() ?? { data: undefined, isLoading: false };
  const [form, setForm] = useState({ name: "", pixKey: "", code: "" });
  const [pix, setPix] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = () => utils?.affiliates?.me?.invalidate?.();

  const join = (trpc as any).affiliates?.join?.useMutation?.({
    onSuccess: () => { setMsg("Cadastro feito. Seu link de indicação já está pronto."); refresh(); },
    onError: (e: any) => setMsg(e?.message ?? "Não foi possível concluir o cadastro."),
  }) ?? { mutate: () => {}, isPending: false };

  const updateMine = (trpc as any).affiliates?.updateMine?.useMutation?.({
    onSuccess: () => { setMsg("Chave Pix atualizada."); setPix(null); refresh(); },
    onError: (e: any) => setMsg(e?.message ?? "Não foi possível atualizar."),
  }) ?? { mutate: () => {}, isPending: false };

  const data = me.data;
  const aff = data?.affiliate;
  const dash = data?.dashboard;
  const minPayout = data?.minPayoutCents ?? 2000;

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* sem clipboard */ }
  };

  return (
    <Layout>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Programa de afiliados</h1>
        <p style={{ fontSize: 13, color: "var(--muted)", maxWidth: 640 }}>
          Indique o MecPro e receba comissão sobre a mensalidade de quem assinar pelo seu link.
        </p>
      </div>

      {msg && <div style={{ background: "var(--green-l)", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{msg}</div>}
      {me.isLoading && <p style={{ fontSize: 13, color: "var(--muted)" }}>Carregando...</p>}

      {!me.isLoading && !aff && (
        <div style={{ ...card, maxWidth: 560 }}>
          <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Quero ser afiliado</p>
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
            Comissão padrão de 10% sobre o valor pago, nos 3 primeiros pagamentos de cada indicado. A comissão fica liberada 7 dias após o pagamento
            (prazo de arrependimento) e o repasse é feito por Pix a partir de {brl(minPayout)}.
          </p>
          <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
            <input style={field} placeholder="Seu nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input style={field} placeholder="Chave Pix para receber" value={form.pixKey} onChange={e => setForm({ ...form, pixKey: e.target.value })} />
            <input style={field} placeholder={`Código do link (opcional, ex: ${data?.suggestedCode || "SEUNOME"})`}
              value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
          </div>
          <button className="btn btn-green" disabled={join.isPending || form.name.trim().length < 2 || form.pixKey.trim().length < 3}
            onClick={() => { setMsg(""); join.mutate({ name: form.name.trim(), pixKey: form.pixKey.trim(), code: form.code.trim() || undefined }); }}>
            {join.isPending ? "Cadastrando..." : "Criar meu link de afiliado"}
          </button>
          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
            Indicar a si mesmo não gera comissão. Reembolsos cancelam ou descontam a comissão correspondente.
          </p>
        </div>
      )}

      {aff && (
        <div style={{ display: "grid", gap: 16 }}>
          {!aff.active && (
            <div style={{ background: "#fff4e5", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>
              Seu cadastro está pausado. Novas indicações não geram comissão até a reativação.
            </div>
          )}

          <div style={card}>
            <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Seu link de indicação</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input readOnly style={{ ...field, flex: 1, minWidth: 220 }} value={aff.link} onFocus={e => e.currentTarget.select()} />
              <button className="btn btn-green" onClick={() => copy(aff.link)}>{copied ? "Copiado" : "Copiar link"}</button>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
              Código <b>{aff.code}</b> · {aff.commissionPct}% sobre os {aff.maxPayments} primeiros pagamentos · carência de {aff.holdDays} dias
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
            {[
              ["Indicados", String(dash?.referrals ?? 0)],
              ["Em carência", brl(dash?.carenciaCents ?? 0)],
              ["Liberado para repasse", brl(dash?.aPagarCents ?? 0)],
              ["Já recebido", brl(dash?.pagoCents ?? 0)],
            ].map(([label, value]) => (
              <div key={label} style={card}>
                <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>{label}</p>
                <p style={{ fontSize: 22, fontWeight: 800 }}>{value}</p>
              </div>
            ))}
          </div>
          {dash && dash.aPagarCents > 0 && !dash.atingeMinimo && (
            <p style={{ fontSize: 12, color: "var(--muted)" }}>O repasse acontece quando o valor liberado chegar a {brl(minPayout)}.</p>
          )}
          {dash && dash.descontarCents > 0 && (
            <p style={{ fontSize: 12, color: "var(--muted)" }}>{brl(dash.descontarCents)} serão descontados no próximo repasse por reembolso de um indicado.</p>
          )}

          <div style={card}>
            <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Chave Pix</p>
            {pix === null ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13 }}>{aff.pixKey || "não informada"}</span>
                <button className="btn" onClick={() => setPix(aff.pixKey || "")}>Alterar</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input style={{ ...field, flex: 1, minWidth: 220 }} value={pix} onChange={e => setPix(e.target.value)} />
                <button className="btn btn-green" disabled={updateMine.isPending || pix.trim().length < 3}
                  onClick={() => updateMine.mutate({ pixKey: pix.trim() })}>Salvar</button>
                <button className="btn" onClick={() => setPix(null)}>Cancelar</button>
              </div>
            )}
          </div>

          <div style={card}>
            <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Últimas comissões</p>
            {!dash?.commissions?.length && <p style={{ fontSize: 13, color: "var(--muted)" }}>Nenhuma comissão ainda. Elas aparecem quando um indicado paga a assinatura.</p>}
            <div style={{ display: "grid", gap: 8 }}>
              {(dash?.commissions ?? []).map((c: any, i: number) => {
                const liberada = c.status === "pending" && new Date(c.releaseAt).getTime() <= Date.now();
                const label = liberada ? "Liberada" : (STATUS[c.status] ?? c.status);
                const when = c.status === "paid" && c.paidAt ? `pago em ${new Date(c.paidAt).toLocaleDateString("pt-BR")}`
                  : c.status === "pending" && !liberada ? `libera em ${new Date(c.releaseAt).toLocaleDateString("pt-BR")}` : "";
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                    <span>Pagamento nº {c.paymentNumber} · {label}{when ? ` · ${when}` : ""}</span>
                    <b>{brl(c.commissionCents)}</b>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
