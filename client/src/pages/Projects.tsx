import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

export default function Projects() {
  const [, setLocation] = useLocation();
  const { data: projects, isLoading } = trpc.projects.list.useQuery();

  return (
    <Layout>
      <div style={{ marginBottom:24, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <h1 style={{ fontFamily:"var(--font-display)", fontSize:26, fontWeight:800, color:"var(--black)", marginBottom:4 }}>Meus Projetos</h1>
          <p style={{ fontSize:14, color:"var(--muted)" }}>{projects?.length ?? 0} projetos no total</p>
        </div>
        <button className="btn btn-md btn-primary" onClick={() => setLocation("/projects/new")}>+ Novo projeto</button>
      </div>

      {isLoading ? (
        <div style={{ background:"white", border:"1px solid var(--border)", borderRadius:16, padding:48, textAlign:"center", color:"var(--muted)" }}>Carregando...</div>
      ) : !projects?.length ? (
        <div style={{ background:"white", border:"1px solid var(--border)", borderRadius:20, padding:64, textAlign:"center" }}>
          <div style={{ fontSize:48, marginBottom:16 }}>◫</div>
          <h2 style={{ fontFamily:"var(--font-display)", fontSize:20, fontWeight:800, color:"var(--black)", marginBottom:8 }}>Nenhum projeto ainda</h2>
          <p style={{ fontSize:14, color:"var(--muted)", maxWidth:360, margin:"0 auto 24px", lineHeight:1.6 }}>
            Crie seu primeiro projeto para começar a analisar concorrentes e gerar campanhas com IA.
          </p>
          <button className="btn btn-lg btn-green" onClick={() => setLocation("/projects/new")}>Criar primeiro projeto</button>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))", gap:16 }}>
          {projects.map((p: any) => (
            <div key={p.id} onClick={() => setLocation(`/projects/${p.id}`)}
              style={{ background:"white", border:"1px solid var(--border)", borderRadius:16, padding:24, cursor:"pointer", transition:"all .2s" }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--green)";e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 0 0 3px rgba(34,197,94,.06),var(--shadow-sm)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:12 }}>
                <div style={{ width:42, height:42, borderRadius:12, background:"var(--green-l)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>◫</div>
                <span className={`badge ${p.status==="completed"?"badge-green":p.status==="analyzing"?"badge-navy":"badge-gray"}`} style={{ fontSize:11 }}>
                  {p.status==="completed"?"Concluído":p.status==="analyzing"?"Analisando":p.status==="draft"?"Rascunho":"Arquivado"}
                </span>
              </div>
              <h3 style={{ fontFamily:"var(--font-display)", fontSize:16, fontWeight:700, color:"var(--black)", marginBottom:4 }}>{p.name}</h3>
              <p style={{ fontSize:13, color:"var(--muted)", marginBottom:16, lineHeight:1.5 }}>{p.description || "Sem descrição"}</p>
              <p style={{ fontSize:12, color:"#adb5bd" }}>
                Criado em {p.createdAt ? new Date(p.createdAt).toLocaleDateString("pt-BR") : "—"}
              </p>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
