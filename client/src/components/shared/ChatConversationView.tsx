import { ImagePlus, Send, X, Video, Loader2, Zap, Gauge, Turtle, ArrowDown, Megaphone, Camera, RefreshCw, Play, Plus, FileUp, Images, RotateCw } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import { ACEITA_FOTOS_E_VIDEOS } from "@/lib/chatUploads";
import type { ChatImageAttachment, ChatMessage, ChatVideoAttachment, ChatVelocidade, PropostaDeCortes } from "@/hooks/useCampaignChat";
import { ASSISTANT_IMAGE, SUGESTOES } from "@/hooks/useCampaignChat";

function FormatarTexto({ texto }: { texto: string }) {
  const paragrafos = texto.split(/\n{1,}/).filter((p) => p.trim().length > 0);
  return (
    <>
      {paragrafos.map((p, i) => {
        const partes = p.split(/(\*\*[^*]+\*\*|\/projects\/\d+\/campaign\/result\/\d+)/g).filter((s) => s.length > 0);
        return (
          <p key={i} className="campaign-chat-message-paragraph">
            {partes.map((parte, j) =>
              parte.startsWith("**") && parte.endsWith("**") ? (
                <strong key={j}>{parte.slice(2, -2)}</strong>
              ) : /^\/projects\/\d+\/campaign\/result\/\d+$/.test(parte) ? (
                <a key={j} href={parte}>Ver campanha</a>
              ) : (
                <span key={j}>{parte}</span>
              )
            )}
          </p>
        );
      })}
    </>
  );
}

export function AvatarIA() {
  return (
    <div className="campaign-chat-avatar" aria-hidden="true">
      <img src={ASSISTANT_IMAGE} alt="" />
    </div>
  );
}

interface ChatConversationViewProps {
  messages: ChatMessage[];
  loading: boolean;
  needsLogin: boolean;
  mostrarSugestoes: boolean;
  input: string;
  setInput: (v: string) => void;
  velocidade: ChatVelocidade;
  escolherVelocidade: (v: ChatVelocidade) => void;
  attachments: ChatImageAttachment[];
  addFiles: (files: FileList | File[]) => Promise<void>;
  substituirAnexo: (id: string, arquivo: File) => Promise<void>;
  tentarNovamente?: (id: string) => Promise<void>;
  removeAttachment: (id: string) => void;
  attachmentError: string;
  videoAttachments: ChatVideoAttachment[];
  removeVideoAttachment: (id: string) => void;
  send: (textoOverride?: string) => void;
  cortes?: PropostaDeCortes[];
  decidirCortes?: (id: string, acao: "aprovar" | "rejeitar", formatos?: string[]) => Promise<void>;
  scrollRef: RefObject<HTMLDivElement>;
  longeDoFim: boolean;
  naoLidas: number;
  irParaUltima: () => void;
  fullScreen?: boolean;
}

const fmtS = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Cortes sugeridos pela IA: previas leves e decisao do usuario. Nada final e processado antes do Aprovar. */
function CortesSugeridos({ propostas, decidir, ocupado }: { propostas: PropostaDeCortes[]; decidir: (id: string, acao: "aprovar" | "rejeitar", formatos?: string[]) => Promise<void>; ocupado: boolean }) {
  const [desmarcados, setDesmarcados] = useState<Record<string, boolean>>({});
  if (!propostas.length) return null;
  return (
    <div className="campaign-chat-cortes" role="region" aria-label="Cortes sugeridos para aprovação">
      {propostas.map((p) => {
        const escolhidos = p.cortes.filter((c) => !desmarcados[`${p.id}:${c.formato}`]).map((c) => c.formato);
        return (
          <section key={p.id} className="campaign-chat-cortes-card">
            <header>
              <strong>Cortes sugeridos</strong>
              <span>Prévias leves. O arquivo final só é gerado depois que você aprovar.</span>
            </header>
            <div className="campaign-chat-cortes-grade">
              {p.cortes.map((c) => (
                <label key={c.formato} className="campaign-chat-corte" data-formato={c.formato}>
                  <div className="campaign-chat-corte-topo">
                    <input type="checkbox" checked={!desmarcados[`${p.id}:${c.formato}`]} onChange={(e) => setDesmarcados((d) => ({ ...d, [`${p.id}:${c.formato}`]: !e.target.checked }))} />
                    <b>{c.rotulo}</b> <span>{c.usos}</span>
                  </div>
                  {c.previaUrl ? <video src={c.previaUrl} controls muted playsInline preload="metadata" /> : <div className="campaign-chat-corte-sem-previa">{c.previaErro || "Sem prévia"}</div>}
                  <p>{fmtS(c.inicioS)} a {fmtS(c.fimS)} ({c.duracaoS}s){c.pontuacao != null ? ` · nota ${c.pontuacao}/10` : ""}</p>
                  <small>{c.motivo}</small>
                </label>
              ))}
            </div>
            {p.limitacoes.length > 0 && <ul className="campaign-chat-cortes-limites">{p.limitacoes.map((l, i) => <li key={i}>{l}</li>)}</ul>}
            <footer>
              <button type="button" className="campaign-chat-cortes-aprovar" disabled={ocupado || !escolhidos.length} onClick={() => void decidir(p.id, "aprovar", escolhidos)}>Aprovar e processar{escolhidos.length ? ` (${escolhidos.length})` : ""}</button>
              <button type="button" className="campaign-chat-cortes-recusar" disabled={ocupado} onClick={() => void decidir(p.id, "rejeitar")}>Recusar</button>
            </footer>
          </section>
        );
      })}
    </div>
  );
}

function fmtTamanho(n?: number) { if (!n) return ""; return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`; }

export default function ChatConversationView({
  messages,
  loading,
  needsLogin,
  mostrarSugestoes,
  input,
  setInput,
  velocidade,
  escolherVelocidade,
  attachments,
  addFiles,
  substituirAnexo,
  tentarNovamente,
  removeAttachment,
  attachmentError,
  videoAttachments,
  removeVideoAttachment,
  send,
  cortes = [],
  decidirCortes,
  scrollRef,
  longeDoFim,
  naoLidas,
  irParaUltima,
  fullScreen = false,
}: ChatConversationViewProps) {
  // Arrastar e soltar (desktop): o contador evita piscar ao passar por elementos filhos.
  const [arrastando, setArrastando] = useState(false);
  const [entradas, setEntradas] = useState(0);
  const [menuAberto, setMenuAberto] = useState(false);
  const refFotos = useRef<HTMLInputElement>(null), refVideos = useRef<HTMLInputElement>(null), refArquivos = useRef<HTMLInputElement>(null), refCamera = useRef<HTMLInputElement>(null);
  const abrir = (r: RefObject<HTMLInputElement>) => { setMenuAberto(false); r.current?.click(); };
  const aoEscolher = (e: React.ChangeEvent<HTMLInputElement>) => { const files = e.currentTarget.files; if (files?.length) void addFiles(files); e.currentTarget.value = ""; };
  const temArquivos = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const algumEnviando = attachments.some((a) => a.status === "uploading") || videoAttachments.some((v) => v.status === "uploading");
  const videosProntos = videoAttachments.filter((v) => v.status === "done").length;
  return (
    <div className={fullScreen ? "campaign-chat-conversation campaign-chat-conversation-full" : "campaign-chat-conversation"}>
      <main ref={scrollRef} className="campaign-chat-main">
        <div className="campaign-chat-thread">
          {messages.map((msg, i) =>
            msg.role === "user" ? (
              <div key={i} className="campaign-chat-row campaign-chat-row-user">
                <div className="campaign-chat-bubble campaign-chat-bubble-user">
                  {msg.content}
                  {!!msg.attachments?.length && (
                    <div className="campaign-chat-message-attachments">
                      {msg.attachments.map((file) => (
                        <img key={file.id} src={file.dataUrl} alt={file.fileName} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div key={i} className="campaign-chat-row campaign-chat-row-assistant">
                <AvatarIA />
                <div className="campaign-chat-response">
                  <FormatarTexto texto={msg.content} />

                  {msg.campanha && (
                    <div className="campaign-chat-campaign-card">
                      <a href={msg.campanha.url} className="campaign-chat-campaign-link">
                        <strong>Campanha criada</strong>
                        <span>{msg.campanha.name}</span>
                        <em>Ver campanha completa</em>
                      </a>
                      {/*
                        Publicar e acao de dinheiro: este botao NAO publica. Ele
                        pede as paginas conectadas e o que falta confirmar, e a
                        publicacao so acontece depois de escolher a pagina e
                        confirmar na conversa. `publicar_campanha` exige pageId,
                        entao um clique direto seria impossivel de qualquer forma.
                      */}
                      <button
                        type="button"
                        className="campaign-chat-publicar"
                        disabled={loading}
                        onClick={() =>
                          send(
                            `Quero publicar a campanha #${msg.campanha!.id} na Meta. ` +
                            "Liste minhas paginas conectadas e me diga o que falta confirmar antes de publicar. " +
                            "Nao publique nada ainda."
                          )
                        }
                      >
                        <Megaphone size={14} strokeWidth={2.4} />
                        Publicar na Meta
                      </button>
                    </div>
                  )}

                  {needsLogin && i === messages.length - 1 && !loading && (
                    <a href="/login" className="btn btn-md btn-primary campaign-chat-login">
                      Entrar na minha conta
                    </a>
                  )}
                </div>
              </div>
            )
          )}

          {loading && (
            <div className="campaign-chat-row campaign-chat-row-assistant">
              <AvatarIA />
              <div className="campaign-chat-typing" aria-label="Assistente digitando">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}

          {mostrarSugestoes && (
            <>
              <section className="campaign-chat-guide-card" aria-label="Guia MecProAI">
                <img src={ASSISTANT_IMAGE} alt="Personagem guia do MecProAI" />
                <div>
                  <strong>Vamos montar sua campanha do jeito certo.</strong>
                  <span>Me diga o segmento, objetivo, região, orçamento e os materiais que você já tem.</span>
                </div>
              </section>

              <div className="campaign-chat-suggestions">
                {SUGESTOES.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="campaign-chat-suggestion">
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      <div className="campaign-chat-descer-camada">
        {longeDoFim && (
        <button
          type="button"
          className="campaign-chat-descer"
          onClick={irParaUltima}
          aria-label={naoLidas > 0 ? `Ir para a ultima mensagem (${naoLidas} nova(s))` : "Ir para a ultima mensagem"}
          title="Ir para a ultima mensagem"
        >
          <ArrowDown size={18} strokeWidth={2.6} />
          {naoLidas > 0 && <span className="campaign-chat-descer-badge">{naoLidas > 9 ? "9+" : naoLidas}</span>}
        </button>
        )}
      </div>

      <footer
        className="campaign-chat-footer"
        data-arrastando={arrastando ? "true" : undefined}
        onDragEnter={(e) => { if (temArquivos(e)) { e.preventDefault(); setEntradas((n) => n + 1); setArrastando(true); } }}
        onDragOver={(e) => { if (temArquivos(e)) e.preventDefault(); }}
        onDragLeave={(e) => { if (temArquivos(e)) { setEntradas((n) => { const novo = Math.max(0, n - 1); if (novo === 0) setArrastando(false); return novo; }); } }}
        onDrop={(e) => {
          if (!temArquivos(e)) return;
          e.preventDefault(); setEntradas(0); setArrastando(false);
          if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
        }}
        onPaste={(e) => { const f = e.clipboardData?.files; if (f?.length) { e.preventDefault(); void addFiles(f); } }}
      >
        <CortesSugeridos propostas={cortes} decidir={async (id, acao, f) => { await decidirCortes?.(id, acao, f); }} ocupado={loading} />
        {arrastando && <div className="campaign-chat-dropzone" role="status">Solte as fotos e vídeos aqui para anexar</div>}
        <div className="campaign-chat-velocidade" role="radiogroup" aria-label="Velocidade da resposta">
          <button
            type="button"
            role="radio"
            aria-checked={velocidade === "rapida"}
            className={velocidade === "rapida" ? "ativo" : undefined}
            onClick={() => escolherVelocidade("rapida")}
            title="Respostas diretas e imediatas, sem pesquisar a web"
          >
            <Zap size={13} strokeWidth={2.4} /> Rápida
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={velocidade === "media"}
            className={velocidade === "media" ? "ativo" : undefined}
            onClick={() => escolherVelocidade("media")}
            title="Equilíbrio entre velocidade e profundidade (padrão)"
          >
            <Gauge size={13} strokeWidth={2.4} /> Média
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={velocidade === "lenta"}
            className={velocidade === "lenta" ? "ativo" : undefined}
            onClick={() => escolherVelocidade("lenta")}
            title="Respostas mais completas, pode pesquisar a web quando ajudar"
          >
            <Turtle size={13} strokeWidth={2.4} /> Lenta
          </button>
        </div>
        {(!!attachments.length || !!videoAttachments.length) && (
          <div className="campaign-chat-attachment-tray" aria-label="Anexos da conversa">
            {attachments.map((file, index) => (
              <div key={file.id} className="campaign-chat-attachment" data-status={file.status}>
                <img src={file.dataUrl} alt={file.fileName} />
                {file.status === "uploading" && (
                  <div className="campaign-chat-attachment-overlay" title={`Enviando ${file.progresso ?? 0}%`}>
                    <Loader2 size={16} className="campaign-chat-spin" strokeWidth={2.4} />
                    <span className="campaign-chat-attachment-pct">{file.progresso ?? 0}%</span>
                  </div>
                )}
                {file.status === "error" && (
                  <div className="campaign-chat-attachment-overlay campaign-chat-attachment-overlay-error" title={file.erro || "Falha ao enviar"}>
                    <X size={16} strokeWidth={2.6} />
                  </div>
                )}
                {file.status === "uploading" && <i className="campaign-chat-attachment-bar" style={{ width: `${file.progresso ?? 0}%` }} />}
                <span>{index + 1}</span>
                <small className="campaign-chat-attachment-info" title={file.fileName}>{file.fileName} · {fmtTamanho(file.size)}</small>
                {file.status === "error" && tentarNovamente && (
                  <button type="button" className="campaign-chat-attachment-retry" onClick={() => void tentarNovamente(file.id)} aria-label={`Tentar novamente ${file.fileName}`} title="Tentar novamente"><RotateCw size={12} strokeWidth={2.6} /></button>
                )}
                <button type="button" onClick={() => removeAttachment(file.id)} aria-label={`${file.status === "uploading" ? "Cancelar envio de" : "Remover"} ${file.fileName}`}>
                  <X size={13} strokeWidth={2.4} />
                </button>
                <label className="campaign-chat-attachment-swap" title="Substituir por outro arquivo" aria-label={`Substituir ${file.fileName}`}>
                  <input type="file" accept={ACEITA_FOTOS_E_VIDEOS} onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void substituirAnexo(file.id, f); e.currentTarget.value = ""; }} />
                  <RefreshCw size={11} strokeWidth={2.4} />
                </label>
              </div>
            ))}
            {videoAttachments.map((v) => (
              <div key={v.id} className="campaign-chat-attachment campaign-chat-attachment-video" data-status={v.status} title={v.status === "error" ? v.erro : v.fileName}>
                {v.previewUrl ? <video src={`${v.previewUrl}#t=0.1`} muted playsInline preload="metadata" aria-label={v.fileName} /> : <div className="campaign-chat-attachment-novideo"><Video size={20} strokeWidth={2.2} /></div>}
                {v.status === "done" && <span className="campaign-chat-attachment-play"><Play size={12} strokeWidth={2.6} /></span>}
                {v.status === "uploading" && (
                  <div className="campaign-chat-attachment-overlay" title={`Enviando ${v.progresso ?? 0}%`}>
                    <Loader2 size={16} className="campaign-chat-spin" strokeWidth={2.4} />
                    <span className="campaign-chat-attachment-pct">{v.progresso ?? 0}%</span>
                  </div>
                )}
                {v.status === "error" && (
                  <div className="campaign-chat-attachment-overlay campaign-chat-attachment-overlay-error">
                    <X size={16} strokeWidth={2.6} />
                  </div>
                )}
                {v.status === "uploading" && <i className="campaign-chat-attachment-bar" style={{ width: `${v.progresso ?? 0}%` }} />}
                {v.status === "done" && v.duracaoS ? <em className="campaign-chat-attachment-dur">{Math.floor(v.duracaoS / 60)}:{String(Math.round(v.duracaoS % 60)).padStart(2, "0")}</em> : null}
                <small className="campaign-chat-attachment-info" title={v.fileName}>{v.fileName} · {fmtTamanho(v.size)}</small>
                {v.status === "error" && tentarNovamente && (
                  <button type="button" className="campaign-chat-attachment-retry" onClick={() => void tentarNovamente(v.id)} aria-label={`Tentar novamente ${v.fileName}`} title="Tentar novamente"><RotateCw size={12} strokeWidth={2.6} /></button>
                )}
                <button type="button" onClick={() => removeVideoAttachment(v.id)} aria-label={`${v.status === "uploading" ? "Cancelar envio de" : "Remover"} ${v.fileName}`}>
                  <X size={13} strokeWidth={2.4} />
                </button>
                <label className="campaign-chat-attachment-swap" title="Substituir por outro arquivo" aria-label={`Substituir ${v.fileName}`}>
                  <input type="file" accept={ACEITA_FOTOS_E_VIDEOS} onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void substituirAnexo(v.id, f); e.currentTarget.value = ""; }} />
                  <RefreshCw size={11} strokeWidth={2.4} />
                </label>
              </div>
            ))}
          </div>
        )}
        {videoAttachments.some((v) => v.status === "error") && (
          <p className="campaign-chat-error" role="alert">{videoAttachments.filter((v) => v.status === "error").map((v) => `${v.fileName}: ${v.erro || "falha ao enviar"}`).join(" ")}</p>
        )}
        {attachments.some((a) => a.status === "error") && (
          <p className="campaign-chat-error" role="alert">{attachments.filter((a) => a.status === "error").map((a) => `${a.fileName}: ${a.erro || "falha ao enviar"}`).join(" ")}</p>
        )}

        <div className="campaign-chat-composer">
          <div className="campaign-chat-attach-wrap">
            <button type="button" className="campaign-chat-attach" aria-haspopup="menu" aria-expanded={menuAberto} aria-label="Anexar" title="Anexar fotos, vídeos ou arquivos" onClick={() => setMenuAberto((v) => !v)}>
              <Plus size={18} strokeWidth={2.4} />
            </button>
            {menuAberto && (
              <div className="campaign-chat-attach-menu" role="menu">
                <button type="button" role="menuitem" data-anexo="fotos" onClick={() => abrir(refFotos)}><Images size={16} /> Escolher fotos</button>
                <button type="button" role="menuitem" data-anexo="videos" onClick={() => abrir(refVideos)}><Video size={16} /> Escolher vídeos</button>
                <button type="button" role="menuitem" data-anexo="arquivos" onClick={() => abrir(refArquivos)}><FileUp size={16} /> Escolher arquivos</button>
                <button type="button" role="menuitem" data-anexo="camera" className="campaign-chat-attach-menu-camera" onClick={() => abrir(refCamera)}><Camera size={16} /> Tirar foto ou gravar vídeo</button>
              </div>
            )}
            {/* Seletores NATIVOS do sistema (no iPhone: biblioteca, camera e arquivos no mesmo painel nativo). Sem galeria propria. */}
            <input ref={refArquivos} className="campaign-chat-file-input" data-anexo-input="arquivos" type="file" accept={ACEITA_FOTOS_E_VIDEOS} multiple onChange={aoEscolher} />
            <input ref={refFotos} className="campaign-chat-file-input" data-anexo-input="fotos" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple onChange={aoEscolher} />
            <input ref={refVideos} className="campaign-chat-file-input" data-anexo-input="videos" type="file" accept="video/mp4,video/quicktime,video/webm,video/3gpp,video/x-m4v,.mov,.mp4,.webm,.3gp,.m4v" multiple onChange={aoEscolher} />
            <input ref={refCamera} className="campaign-chat-file-input" data-anexo-input="camera" type="file" accept="image/*,video/*" capture="environment" onChange={aoEscolher} />
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={Math.min(5, Math.max(1, input.split("\n").length))}
            placeholder="Descreva seu negócio e o que você quer alcançar..."
            className="campaign-chat-input"
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={loading || algumEnviando || (!input.trim() && attachments.length === 0 && videosProntos === 0)}
            className="campaign-chat-send"
            aria-label="Enviar mensagem"
            title="Enviar"
          >
            <Send size={17} strokeWidth={2.5} />
          </button>
        </div>
        {attachmentError && <p className="campaign-chat-error">{attachmentError}</p>}
        <p className="campaign-chat-hint">O assistente pode gerar a campanha direto no seu projeto. Entre na sua conta para salvar.</p>
      </footer>
    </div>
  );
}
