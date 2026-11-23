// F7: anexos da conversa (fotos e videos) guardados na sessao, sem migracao.
// Fotos e videos dividem a coluna jsonb chat_sessions.pendingPhotoUrls; o
// campo kind:"video" separa os dois. Funcoes puras, testaveis sem banco.

export interface AnexoDaSessao { url: string; fileName: string; kind?: "video"; sha?: string }
export const MAX_ANEXOS_POR_SESSAO = 10;

export function ehVideo(a: unknown): boolean {
  return !!a && typeof a === "object" && (a as any).kind === "video";
}
export function somenteFotos(lista: unknown): AnexoDaSessao[] {
  return Array.isArray(lista) ? lista.filter((a) => a && typeof a.url === "string" && !ehVideo(a)) : [];
}
export function somenteVideos(lista: unknown): AnexoDaSessao[] {
  return Array.isArray(lista) ? lista.filter((a) => a && typeof a.url === "string" && ehVideo(a)) : [];
}

/** Acrescenta sem duplicar (mesma URL ou mesmo hash do mesmo tipo) e mantem os mais recentes. */
export function acrescentarAnexo(lista: unknown, novo: AnexoDaSessao, max = MAX_ANEXOS_POR_SESSAO): { lista: AnexoDaSessao[]; duplicado: AnexoDaSessao | null } {
  const atual: AnexoDaSessao[] = Array.isArray(lista) ? lista.filter((a) => a && typeof a.url === "string") : [];
  const igual = atual.find((a) => ehVideo(a) === ehVideo(novo) && (a.url === novo.url || (!!novo.sha && !!a.sha && a.sha === novo.sha)));
  if (igual) return { lista: atual, duplicado: igual };
  return { lista: [...atual, novo].slice(-max), duplicado: null };
}

/** Depois de gerar a campanha as fotos foram consumidas; os videos seguem ate virem anexados a um criativo. */
export function semFotos(lista: unknown): AnexoDaSessao[] {
  return somenteVideos(lista);
}

export type EtapaDaConversa =
  | "coletando_briefing" | "pronto_para_gerar" | "rascunho_criado" | "conta_escolhida";

export interface EntradaEtapa {
  briefingCompleto: boolean;
  temRascunho: boolean;
  contaEscolhida: boolean;
  fotos: number;
  videos: number;
  /** URLs dos videos guardados na conversa (os mais recentes), para o modelo poder agir sobre eles em mensagens seguintes. */
  urlsDeVideo?: string[];
}

export function etapaDaConversa(e: EntradaEtapa): EtapaDaConversa {
  if (e.temRascunho) return e.contaEscolhida ? "conta_escolhida" : "rascunho_criado";
  return e.briefingCompleto ? "pronto_para_gerar" : "coletando_briefing";
}

/** Nota curta para o modelo retomar sem repetir o briefing. Sem URLs nem dados do usuario. */
export function notaDeRetomada(e: EntradaEtapa): string {
  const etapa = etapaDaConversa(e);
  const anexos = [e.fotos ? `${e.fotos} foto(s)` : "", e.videos ? `${e.videos} video(s)` : ""].filter(Boolean).join(" e ");
  const base: Record<EtapaDaConversa, string> = {
    coletando_briefing: "Etapa: coletando o briefing. Peca so o que ainda falta; nao repita o que ja esta no contexto.",
    pronto_para_gerar: "Etapa: briefing completo. Nao refaca perguntas; gere o rascunho.",
    rascunho_criado: "Etapa: ja existe um rascunho nesta conversa. Nao crie outro a menos que o usuario peca uma nova campanha; falta escolher a conta Meta e revisar antes de publicar.",
    conta_escolhida: "Etapa: rascunho criado e conta Meta escolhida. Nao crie outro a menos que o usuario peca uma nova campanha; revise e peca confirmacao para publicar.",
  };
  const urls = (e.urlsDeVideo ?? []).slice(-3);
  const listaDeVideos = urls.length ? ` Videos guardados (use estas URLs exatas em adaptar_video/anexar_video_criativo; analisar_anexos ja le tudo da conversa): ${urls.join(" ; ")}.` : "";
  return anexos ? `${base[etapa]} Anexos guardados nesta conversa: ${anexos}. Nao peca o reenvio.${listaDeVideos}` : base[etapa];
}
