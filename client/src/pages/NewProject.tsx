import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { usePlanLimit } from "@/hooks/usePlanLimit";

export default function NewProject() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const { canCreateProject, planName, limits } = usePlanLimit();

  const { data: projects } = trpc.projects.list.useQuery();
  const projectCount = (projects as any[])?.length ?? 0;
  const planCheck = canCreateProject(projectCount);

  const create = trpc.projects.create.useMutation({
    onSuccess: (proj: any) => setLocation(`/projects/${proj.id}`),
    onError: (err: any) => setError(err.message || "Erro ao criar projeto"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Nome do projeto é obrigatório");
    if (!planCheck.allowed) return setError(planCheck.reason || "Limite do plano atingido");
    create.mutate({ name: name.trim(), description: description.trim() || undefined });
  };

  return (
    <Layout>
      <div style={{ marginBottom:28 }}>
        <button className="btn btn-sm btn-ghost" onClick={() => setLocation("/projects")} style={{ marginBottom:12 }}>← Voltar</button>
        <h1 style={{ fontFamily:"var(--font-display)", fontSize:26, fontWeight:800, color:"var(--black)", marginBottom:4 }}>Novo Projeto</h1>
        <p style={{ fontSize:14, color:"var(--muted)" }}>Configure seu projeto de campanha inteligente</p>
      </div>

      {/* Alerta de limite de plano */}
      {!planCheck.allowed && (
        <div style={{ background:"#fef3c7", border:"1px solid #fcd34d", borderRadius:12, padding:"14px 18px", marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
          <div>
            <p style={{ fontSize:13, fontWeight:700, color:"#92400e", marginBottom:2 }}>⚠️ Limite do plano {planName} atingido</p>
            <p style={{ fontSize:12, color:"#b45309" }}>{planCheck.reason}</p>
          </div>
          <button onClick={() => setLocation("/pricing")} className="btn btn-sm" style={{ background:"#f59e0b", color:"white", border:"none", flexShrink:0, fontWeight:700 }}>
            Fazer upgrade →
          </button>
        </div>
      )}      <div style={{ maxWidth:600 }}>
        <div style={{ background:"white", border:"1px solid var(--border)", borderRadius:20, padding:36 }}>
          {error && (
            <div style={{ background:"var(--error-l)", border:"1px solid #fecaca", borderRadius:10, padding:"10px 14px", fontSize:13, color:"var(--error)", marginBottom:20 }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:20 }}>
              <label style={{ display:"block", fontSize:13, fontWeight:500, color:"var(--dark)", marginBottom:6 }}>
                Nome do projeto <span style={{ color:"var(--error)" }}>*</span>
              </label>
              <input className="input-field" type="text" placeholder="Ex: Loja de Roupas Fitness" value={name} onChange={e=>setName(e.target.value)} />
              <p style={{ fontSize:12, color:"var(--muted)", marginTop:4 }}>Use um nome que identifique o cliente ou nicho</p>
            </div>

            <div style={{ marginBottom:28 }}>
              <label style={{ display:"block", fontSize:13, fontWeight:500, color:"var(--dark)", marginBottom:6 }}>Descrição (opcional)</label>
              <textarea className="input-field" placeholder="Descreva brevemente o objetivo deste projeto..." value={description} onChange={e=>setDescription(e.target.value)}
                style={{ resize:"vertical", minHeight:100 }} />
            </div>

            <div style={{ background:"var(--green-l)", border:"1px solid var(--green-xl)", borderRadius:12, padding:"14px 16px", marginBottom:28 }}>
              <p style={{ fontSize:13, color:"var(--green-dk)", fontWeight:600, marginBottom:4 }}>📋 Após criar, você vai:</p>
              <ul style={{ fontSize:13, color:"var(--green-dk)", paddingLeft:18, lineHeight:1.8 }}>
                <li>Preencher o perfil detalhado do cliente</li>
                <li>Adicionar concorrentes para análise</li>
                <li>Gerar inteligência de mercado com IA</li>
                <li>Receber campanha completa pronta para rodar</li>
              </ul>
            </div>

            <div style={{ display:"flex", gap:12 }}>
              <button type="button" className="btn btn-lg btn-outline" onClick={() => setLocation("/projects")}>Cancelar</button>
              <button type="submit" className="btn btn-lg btn-primary" style={{ flex:1 }} disabled={create.isPending}>
                {create.isPending ? "Criando..." : "Criar projeto →"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
