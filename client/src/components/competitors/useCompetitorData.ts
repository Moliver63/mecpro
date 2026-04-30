// useCompetitorData.ts — Hook que centraliza queries e mutations dos concorrentes
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function useCompetitorData(projectId: number) {
  const { data: competitors, refetch, isLoading, isError } =
    trpc.competitors.list.useQuery({ projectId }, { enabled: !!projectId });

  const deleteComp  = trpc.competitors.delete.useMutation({ onSuccess: () => refetch() });
  const analyzeComp = trpc.competitors.analyze.useMutation({ onSuccess: () => refetch() });

  async function handleAnalyze(competitorId: number, force = false) {
    try {
      await analyzeComp.mutateAsync({ competitorId, projectId, force } as any);
      toast.success("Análise concluída!");
      await refetch();
    } catch (err: any) {
      const msg = err?.message || "Erro desconhecido";
      if (msg.includes("TIMEOUT") || msg.includes("demorou")) {
        toast.error("A análise demorou mais que o esperado. Tente novamente.", { duration: 6000 });
      } else {
        toast.error(`Erro na análise: ${msg.slice(0, 120)}`, { duration: 8000 });
      }
    }
  }

  function handleDelete(id: number, name: string, selectedId: number | null, onClearSelected: () => void) {
    if (!confirm(`Remover "${name}"?`)) return;
    deleteComp.mutate({ id } as any);
    if (selectedId === id) onClearSelected();
  }

  return {
    competitors: competitors as any[] ?? [],
    refetch,
    isLoading,
    isError,
    handleAnalyze,
    handleDelete,
    deletingId: (deleteComp as any).isPending,
  };
}

export function useClientProfile(projectId: number) {
  const { data: project       } = (trpc as any).projects?.get?.useQuery?.({ id: projectId }, { enabled: !!projectId }) ?? { data: null };
  const { data: clientProfile } = (trpc as any).clientProfile?.get?.useQuery?.({ projectId }, { enabled: !!projectId }) ?? { data: null };

  const myCompany = {
    name:      clientProfile?.companyName ?? project?.name ?? "",
    instagram: (() => { try { const l = JSON.parse(clientProfile?.socialLinks || "{}"); return l.instagram || l.ig || ""; } catch { return ""; } })(),
    facebook:  (() => { try { const l = JSON.parse(clientProfile?.socialLinks || "{}"); return l.facebook  || l.fb || ""; } catch { return ""; } })(),
    website:   clientProfile?.websiteUrl || "",
  };

  return { myCompany, project, clientProfile };
}
