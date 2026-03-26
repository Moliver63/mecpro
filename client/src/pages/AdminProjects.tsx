import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";

export default function AdminProjects() {
  const { data: projects, isLoading } = trpc.admin.projects.useQuery();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = (projects ?? []).filter((p: any) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || p.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <Layout>
      <div style={{ marginBottom:24, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <h1 style={{ fontFamily:"var(--font-display)", fontSize:26, fontWeight:800, color:"var(--black)", marginBottom:4 }}>Projetos</h1>
          <p style={{ fontSize:14, color:"var(--muted)" }}>{projects?.length ?? 0} projetos na plataforma</p>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ background:"white", border:"1px solid var(--border)", borderRadius:12, padding:"14px 18px", marginBottom:16, display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
        <input className="input-field" placeholder="Buscar projeto..." value={search} onChange={e=>setSearch(e.target.value)} style={{ maxWidth:280 }} />
        <div style={{ display:"flex", gap:6 }}>
          {["all","draft","analyzing","completed","archived"].map(s => (
            <button key={s} onClick={()=>setFilter(s)}
              className={`btn btn-sm ${filter===s?"btn-primary":"btn-outline"}`}>
              {s==="all"?"Todos":s==="draft"?"Rascunho":s==="analyzing"?"Analisando":s==="completed"?"Concluído":"Arquivado"}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div style={{ background:"white", border:"1px solid var(--border)", borderRadius:16, overflow:"hidden" }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nome</th>
                <th>Usuário</th>
                <th>Status</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} style={{ textAlign:"center", padding:32, color:"var(--muted)" }}>Carregando...</td></tr>
              ) : !filtered.length ? (
                <tr><td colSpan={5} style={{ textAlign:"center", padding:32, color:"var(--muted)" }}>Nenhum projeto encontrado</td></tr>
              ) : filtered.map((p: any) => (
                <tr key={p.id}>
                  <td style={{ color:"var(--muted)", fontSize:12 }}>#{p.id}</td>
                  <td style={{ fontWeight:500 }}>{p.name}</td>
                  <td style={{ color:"var(--muted)" }}>ID {p.userId}</td>
                  <td>
                    <span className={`badge ${p.status==="completed"?"badge-green":p.status==="analyzing"?"badge-navy":p.status==="archived"?"badge-error":"badge-gray"}`} style={{ fontSize:11 }}>
                      {p.status==="draft"?"Rascunho":p.status==="analyzing"?"Analisando":p.status==="completed"?"Concluído":"Arquivado"}
                    </span>
                  </td>
                  <td style={{ color:"var(--muted)", fontSize:12 }}>
                    {p.createdAt ? new Date(p.createdAt).toLocaleDateString("pt-BR") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
