import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";

const field = { border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 14, width: "100%" } as const;
const card = { background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: 18 } as const;

const CATEGORIA: Record<string, string> = {
  elogio: "Elogio", preco: "Preço", interesse: "Interesse", duvida: "Dúvida",
  curto: "Reação curta", critica: "Crítica", sensivel: "Sensível", spam: "Spam", outro: "Outro",
};
const STATUS_TABS = [
  ["pendente", "Pendentes"], ["escalada", "Para você responder"], ["enviada", "Enviadas"],
  ["ignorada", "Ignoradas"], ["erro", "Com erro"],
] as const;

function chipStyle(cat: string) {
  const forte = cat === "sensivel" || cat === "critica";
  return {
    fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
    background: forte ? "#fde8e8" : "var(--green-l)", color: forte ? "#9b1c1c" : "var(--black)",
  } as const;
}

export default function Comentarios() {
  const utils = (trpc as any).useUtils?.();
  const paginas = (trpc as any).comentarios?.paginas?.useQuery?.() ?? { data: undefined, isLoading: false };
  const [pageId, setPageId] = useState("");
  const paginaAtiva = pageId || paginas.data?.paginas?.[0]?.id || "";
  const config = (trpc as any).comentarios?.config?.useQuery?.({ pageId: paginaAtiva }, { enabled: !!paginaAtiva }) ?? { data: undefined };
  const [status, setStatus] = useState<string>("pendente");
  const lista = (trpc as any).comentarios?.listar?.useQuery?.({ status }) ?? { data: undefined, isLoading: false };
  const [msg, setMsg] = useState("");
  const [cfg, setCfg] = useState<{ enabled: boolean; link: string; preco: string } | null>(null);
  const [edicao, setEdicao] = useState<Record<number, string>>({});
  const [sim, setSim] = useState({ texto: "", nome: "" });
  const [simResultado, setSimResultado] = useState<any>(null);

  const refresh = () => { utils?.comentarios?.listar?.invalidate?.(); utils?.comentarios?.config?.invalidate?.(); };

  const salvar = (trpc as any).comentarios?.salvarConfig?.useMutation?.({
    onSuccess: () => { setMsg("Configuração salva. Modo sugestão: nada é enviado sem a sua aprovação."); setCfg(null); refresh(); },
    onError: (e: any) => setMsg(e?.message ?? "Não foi possível salvar."),
  }) ?? { mutate: () => {}, isPending: false };
  const aprovar = (trpc as any).comentarios?.aprovar?.useMutation?.({
    onSuccess: () => { setMsg("Resposta publicada no comentário."); refresh(); },
    onError: (e: any) => { setMsg(e?.message ?? "Não foi possível enviar."); refresh(); },
  }) ?? { mutate: () => {}, isPending: false };
  const ignorar = (trpc as any).comentarios?.ignorar?.useMutation?.({ onSuccess: refresh }) ?? { mutate: () => {}, isPending: false };
  const simular = (trpc as any).comentarios?.simular?.useMutation?.({
    onSuccess: (r: any) => setSimResultado(r),
    onError: (e: any) => setMsg(e?.message ?? "Não foi possível simular."),
  }) ?? { mutate: () => {}, isPending: false };

  const c = cfg ?? { enabled: !!config.data?.enabled, link: config.data?.link ?? "", preco: config.data?.preco ?? "" };
  const itens: any[] = lista.data ?? [];

  return (
    <Layout>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Comentários</h1>
        <p style={{ fontSize: 13, color: "var(--muted)", maxWidth: 680 }}>
          Sugestões de resposta para os comentários das suas campanhas. Nada é publicado sem a sua aprovação; comentários sensíveis e críticas ficam sempre com você.
        </p>
      </div>

      {msg && <div style={{ background: "var(--green-l)", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{msg}</div>}

      <div style={{ ...card, marginBottom: 16 }}>
        <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Configuração</p>
        {!paginas.data?.conectado && !paginas.isLoading && (
          <p style={{ fontSize: 13, color: "var(--muted)" }}>Conecte sua conta Meta em Configurações para escolher uma página.</p>
        )}
        {paginas.data?.conectado && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, alignItems: "end" }}>
            <label style={{ fontSize: 11, color: "var(--muted)" }}>Página
              <select style={field} value={paginaAtiva} onChange={e => { setPageId(e.target.value); setCfg(null); }}>
                {(paginas.data?.paginas ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 11, color: "var(--muted)" }}>Link divulgado (opcional)
              <input style={field} placeholder="https://..." value={c.link} onChange={e => setCfg({ ...c, link: e.target.value })} />
            </label>
            <label style={{ fontSize: 11, color: "var(--muted)" }}>Preço divulgado (opcional)
              <input style={field} placeholder="R$ 19,90" value={c.preco} onChange={e => setCfg({ ...c, preco: e.target.value })} />
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" checked={c.enabled} onChange={e => setCfg({ ...c, enabled: e.target.checked })} /> Sugestões ativas
            </label>
            <button className="btn btn-green" disabled={salvar.isPending || !paginaAtiva}
              onClick={() => salvar.mutate({ pageId: paginaAtiva, enabled: c.enabled, link: c.link || "", preco: c.preco || "" })}>
              {salvar.isPending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        )}
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Testar um comentário</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input style={{ ...field, flex: 2, minWidth: 220 }} placeholder="Texto do comentário" value={sim.texto} onChange={e => setSim({ ...sim, texto: e.target.value })} />
          <input style={{ ...field, flex: 1, minWidth: 140 }} placeholder="Nome (opcional)" value={sim.nome} onChange={e => setSim({ ...sim, nome: e.target.value })} />
          <button className="btn" disabled={simular.isPending || !sim.texto.trim()}
            onClick={() => simular.mutate({ texto: sim.texto, nome: sim.nome || undefined, link: c.link || undefined, preco: c.preco || undefined })}>Simular</button>
        </div>
        {simResultado && (
          <div style={{ marginTop: 10, fontSize: 13, display: "grid", gap: 4 }}>
            <span><span style={chipStyle(simResultado.categoria)}>{CATEGORIA[simResultado.categoria] ?? simResultado.categoria}</span> · ação: <b>{simResultado.acao}</b> · {simResultado.motivo}</span>
            {simResultado.resposta && <span style={{ background: "var(--green-l)", borderRadius: 8, padding: "8px 10px" }}>{simResultado.resposta}</span>}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {STATUS_TABS.map(([valor, rotulo]) => (
          <button key={valor} className="btn" onClick={() => setStatus(valor)}
            style={status === valor ? { background: "var(--black)", color: "white" } : undefined}>{rotulo}</button>
        ))}
      </div>

      {lista.isLoading && <p style={{ fontSize: 13, color: "var(--muted)" }}>Carregando...</p>}
      {!lista.isLoading && itens.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          Nenhum comentário aqui. Eles aparecem quando o webhook da Meta estiver registrado e alguém comentar nas publicações da página.
        </p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {itens.map((item: any) => {
          const texto = edicao[item.id] ?? item.resposta ?? "";
          const aberto = item.status === "pendente" || item.status === "escalada" || item.status === "erro";
          return (
            <div key={item.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                <span style={{ fontSize: 13 }}><b>{item.fromName || "Sem nome"}</b> · {new Date(item.createdAt).toLocaleString("pt-BR")}</span>
                <span style={chipStyle(item.categoria)}>{CATEGORIA[item.categoria] ?? item.categoria}</span>
              </div>
              <p style={{ fontSize: 14, marginBottom: 8 }}>{item.message}</p>
              {item.motivo && <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>{item.motivo}</p>}
              {item.status === "erro" && item.erro && <p style={{ fontSize: 12, color: "#9b1c1c", marginBottom: 8 }}>Erro: {item.erro}</p>}
              {item.status === "enviada" && item.resposta && (
                <p style={{ fontSize: 13, background: "var(--green-l)", borderRadius: 8, padding: "8px 10px" }}>Respondido: {item.resposta}</p>
              )}
              {aberto && (
                <div style={{ display: "grid", gap: 8 }}>
                  <textarea style={{ ...field, minHeight: 60 }} placeholder="Escreva ou edite a resposta antes de aprovar"
                    value={texto} onChange={e => setEdicao({ ...edicao, [item.id]: e.target.value })} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-green" disabled={aprovar.isPending || !texto.trim()}
                      onClick={() => aprovar.mutate({ id: item.id, texto })}>Aprovar e responder</button>
                    <button className="btn" disabled={ignorar.isPending} onClick={() => ignorar.mutate({ id: item.id })}>Ignorar</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Layout>
  );
}
