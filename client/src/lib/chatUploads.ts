/**
 * chatUploads — regras puras de anexos do chat (fotos e videos), sem React.
 * Separado do hook para ser testado e para o limite vir de um lugar so.
 */

export interface LimitesDeMidia {
  fotoBytes: number;
  videoBytes: number;
  fotosPorConversa: number;
  videosPorMensagem: number;
}

/** Valores de reserva; o servidor informa os reais em GET /api/chat/media-limits (configuraveis por ambiente). */
export const LIMITES_PADRAO: LimitesDeMidia = {
  fotoBytes: 6 * 1024 * 1024,
  videoBytes: 100 * 1024 * 1024,
  fotosPorConversa: 10,
  videosPorMensagem: 3,
};

export const TIPOS_DE_FOTO = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/heic-sequence"]);
export const TIPOS_DE_VIDEO = new Set(["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/x-matroska", "video/3gpp", "video/x-m4v"]);

/** Valor do atributo accept do seletor: fotos e videos juntos. */
export const ACEITA_FOTOS_E_VIDEOS = "image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm,video/3gpp,video/x-m4v,.heic,.heif,.mov,.mp4,.webm,.3gp,.m4v";

const EXTENSAO_PARA_TIPO: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", avi: "video/x-msvideo", mkv: "video/x-matroska", "3gp": "video/3gpp", m4v: "video/x-m4v",
};

type ArquivoLike = { name: string; type: string; size: number };

/** Tipo efetivo. Celulares as vezes entregam .mov/.mp4 com type vazio; nesse caso vale a extensao. */
export function tipoDoArquivo(f: Pick<ArquivoLike, "name" | "type">): string {
  const t = (f.type || "").toLowerCase();
  if (t) return t;
  const ext = f.name.toLowerCase().split(".").pop() || "";
  return EXTENSAO_PARA_TIPO[ext] ?? "";
}

export function classificarArquivo(f: Pick<ArquivoLike, "name" | "type">): "foto" | "video" | null {
  const t = tipoDoArquivo(f);
  if (TIPOS_DE_FOTO.has(t)) return "foto";
  if (TIPOS_DE_VIDEO.has(t)) return "video";
  return null;
}

const mb = (bytes: number) => `${Math.round((bytes / 1048576) * 10) / 10}MB`.replace(".0MB", "MB");

export function validarArquivo(f: ArquivoLike, limites: LimitesDeMidia = LIMITES_PADRAO): string | null {
  const tipo = classificarArquivo(f);
  if (!tipo) return `"${f.name}": formato não suportado. Use JPG, PNG, WEBP ou HEIC para fotos e MP4, MOV ou WEBM para vídeos.`;
  if (f.size <= 0) return `"${f.name}" está vazio.`;
  if (tipo === "foto" && f.size > limites.fotoBytes) return `A foto "${f.name}" tem ${mb(f.size)} e o limite é ${mb(limites.fotoBytes)}. Comprima antes de anexar.`;
  if (tipo === "video" && f.size > limites.videoBytes) return `O vídeo "${f.name}" tem ${mb(f.size)} e o limite é ${mb(limites.videoBytes)}.`;
  return null;
}

export interface SelecaoDeArquivos<T> { fotos: T[]; videos: T[]; erros: string[] }

/**
 * Separa o que o usuario escolheu (ou soltou) em fotos e videos, descarta o invalido com mensagem clara
 * e respeita as vagas que sobram. Arquivo repetido na mesma selecao (mesmo nome, tamanho e data) entra uma vez so.
 */
export function separarArquivos<T extends ArquivoLike & { lastModified?: number }>(
  arquivos: T[],
  vagas: { fotos: number; videos: number },
  limites: LimitesDeMidia = LIMITES_PADRAO,
  jaAnexados: Array<{ fileName: string; size: number }> = [],
): SelecaoDeArquivos<T> {
  const fotos: T[] = [];
  const videos: T[] = [];
  const erros: string[] = [];
  const vistos = new Set(jaAnexados.map((a) => `${a.fileName}|${a.size}`));
  let fotosCortadas = 0;
  let videosCortados = 0;
  for (const f of arquivos) {
    const chave = `${f.name}|${f.size}`;
    if (vistos.has(chave)) continue;
    const erro = validarArquivo(f, limites);
    if (erro) { erros.push(erro); continue; }
    vistos.add(chave);
    if (classificarArquivo(f) === "foto") { if (fotos.length < vagas.fotos) fotos.push(f); else fotosCortadas++; }
    else if (videos.length < vagas.videos) videos.push(f); else videosCortados++;
  }
  if (fotosCortadas) erros.push(`O chat aceita até ${limites.fotosPorConversa} fotos por conversa; ${fotosCortadas} não ${fotosCortadas === 1 ? "foi anexada" : "foram anexadas"}.`);
  if (videosCortados) erros.push(`O chat aceita até ${limites.videosPorMensagem} vídeos por mensagem; ${videosCortados} não ${videosCortados === 1 ? "foi anexado" : "foram anexados"}.`);
  return { fotos, videos, erros };
}

// ── Envio com progresso ──────────────────────────────────────────────────────

export interface RespostaDeUpload { status: number; data: any; erroDeRede?: boolean }

interface XhrLike {
  open(m: string, u: string): void;
  send(b: any): void;
  abort(): void;
  withCredentials: boolean;
  timeout: number;
  status: number;
  responseText: string;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  ontimeout: (() => void) | null;
  onabort: (() => void) | null;
}

/** POST multipart com porcentagem de envio (fetch nao informa progresso de upload). */
export function enviarComProgresso(
  url: string, form: FormData,
  opcoes: { onProgresso?: (pct: number) => void; criarXhr?: () => XhrLike; timeoutMs?: number; sinal?: { abortado: boolean; aoAbortar(cb: () => void): void } } = {},
): Promise<RespostaDeUpload> {
  return new Promise((resolve) => {
    const xhr = (opcoes.criarXhr ?? (() => new XMLHttpRequest() as unknown as XhrLike))();
    let terminou = false;
    const fim = (r: RespostaDeUpload) => { if (!terminou) { terminou = true; resolve(r); } };
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.timeout = opcoes.timeoutMs ?? 5 * 60 * 1000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) opcoes.onProgresso?.(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      let data: any = {};
      try { data = JSON.parse(xhr.responseText || "{}"); } catch { /* corpo nao-JSON (ex.: erro de proxy) */ }
      if (xhr.status >= 200 && xhr.status < 300) opcoes.onProgresso?.(100);
      fim({ status: xhr.status, data });
    };
    xhr.onerror = () => fim({ status: 0, data: {}, erroDeRede: true });
    xhr.ontimeout = () => fim({ status: 0, data: {}, erroDeRede: true });
    xhr.onabort = () => fim({ status: 0, data: {}, erroDeRede: true });
    opcoes.sinal?.aoAbortar(() => xhr.abort());
    xhr.send(form);
  });
}

/** Texto para o usuario quando o envio nao deu certo. */
export function mensagemDeErroDeUpload(r: RespostaDeUpload, tipo: "foto" | "video"): string {
  const nome = tipo === "foto" ? "a foto" : "o vídeo";
  if (r.erroDeRede) return `A conexão caiu ao enviar ${nome}. Verifique a internet e tente de novo (toque em enviar novamente).`;
  if (r.data?.erro && typeof r.data.erro === "string") return r.data.erro;
  if (r.status === 401) return "Sua sessão expirou. Entre na conta e envie de novo.";
  if (r.status === 413) return `${tipo === "foto" ? "A foto" : "O vídeo"} é grande demais para enviar.`;
  if (r.status === 429) return "Muitos envios seguidos. Espere um instante e tente de novo.";
  if (r.status >= 500 || r.status === 502) return `Não foi possível salvar ${nome} agora. Tente de novo em instantes.`;
  return `Não foi possível enviar ${nome}.`;
}

// ── Envio de um anexo (foto ou video) ────────────────────────────────────────

export interface ContextoDeUpload {
  /** Sessao atual NO MOMENTO do envio (ler de um ref, nao de estado de render). */
  sessionId(): number | null;
  /** Chamado quando o servidor cria/confirma a sessao; os envios seguintes ja usam essa. */
  adotarSessao(id: number): void;
  criarXhr?: () => XhrLike;
}

export type ResultadoDoAnexo =
  | { ok: true; url: string; fileName?: string; reaproveitado?: boolean; extra: Record<string, unknown> }
  | { ok: false; erro: string };

/**
 * Envia um arquivo ao chat. Achado desta auditoria: com varias fotos escolhidas antes de existir sessao,
 * cada envio lia o `sessionId` antigo do render e o servidor criava UMA SESSAO POR FOTO; so a ultima era
 * lembrada e o resto "sumia" ao recarregar. Aqui o id e lido na hora do envio e adotado assim que o servidor responde.
 */
export async function subirAnexo(
  tipo: "foto" | "video", arquivo: File, ctx: ContextoDeUpload,
  onProgresso?: (pct: number) => void, sinal?: { abortado: boolean; aoAbortar(cb: () => void): void },
): Promise<ResultadoDoAnexo> {
  const form = new FormData();
  form.append("file", arquivo, arquivo.name);
  const sid = ctx.sessionId();
  if (sid) form.append("sessionId", String(sid));
  const r = await enviarComProgresso(tipo === "foto" ? "/api/chat/upload-photo" : "/api/chat/upload-video", form, { onProgresso, criarXhr: ctx.criarXhr, sinal });
  const url = tipo === "foto" ? r.data?.photoUrl : r.data?.videoUrl;
  if (r.status < 200 || r.status >= 300 || typeof url !== "string" || !url) return { ok: false, erro: mensagemDeErroDeUpload(r, tipo) };
  if (typeof r.data?.sessionId === "number" && r.data.sessionId > 0 && r.data.sessionId !== ctx.sessionId()) ctx.adotarSessao(r.data.sessionId);
  return { ok: true, url, fileName: r.data?.fileName, reaproveitado: !!r.data?.reaproveitado, extra: r.data ?? {} };
}
