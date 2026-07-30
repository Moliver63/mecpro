import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Folder = "inbox" | "archived" | "trash" | "sent";

type Attachment = { id: string; filename: string; size: number; contentType: string };

type InboxMessage = {
  id: number;
  fromAddress: string;
  toAddress: string | null;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  attachments: Attachment[] | null;
  isRead: boolean;
  isReplied: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  createdAt: string;
};

type SentMessage = {
  id: number;
  originMessageId: number | null;
  toAddress: string;
  subject: string | null;
  body: string;
  createdAt: string;
};

const FOLDERS: { value: Folder; label: string; icon: string }[] = [
  { value: "inbox", label: "Entrada", icon: "📥" },
  { value: "sent", label: "Enviados", icon: "📤" },
  { value: "archived", label: "Arquivadas", icon: "🗂️" },
  { value: "trash", label: "Lixeira", icon: "🗑️" },
];

function displayName(fromAddress: string) {
  const semEmail = fromAddress.replace(/<.*>/, "").trim();
  return semEmail || fromAddress;
}

function extractAddress(fromAddress: string) {
  const match = fromAddress.match(/<([^>]+)>/);
  return match ? match[1] : fromAddress.trim();
}

function initials(name: string) {
  const clean = name.replace(/<.*>/, "").trim() || name;
  const parts = clean.split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : clean.slice(0, 2);
  return letters.toUpperCase();
}

function snippet(m: InboxMessage) {
  const base = m.bodyText?.trim() || m.bodyHtml?.replace(/<[^>]+>/g, " ").trim() || "";
  return base.slice(0, 90);
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AdminEmails() {
  const [folder, setFolder] = useState<Folder>("inbox");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [composing, setComposing] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");

  const utils = trpc.useUtils();

  const { data: messages = [], isLoading } = trpc.admin.emailsList.useQuery(
    { folder: folder === "sent" ? "inbox" : folder },
    { enabled: folder !== "sent" }
  );
  const { data: sentMessages = [] } = trpc.admin.emailsListSent.useQuery(undefined, {
    enabled: folder === "sent",
  });
  const { data: unreadCount = 0 } = trpc.admin.emailsCountUnread.useQuery();

  const invalidate = () => {
    utils.admin.emailsList.invalidate();
    utils.admin.emailsCountUnread.invalidate();
  };

  const markRead    = trpc.admin.emailsMarkRead.useMutation({ onSuccess: invalidate });
  const markUnread  = trpc.admin.emailsMarkUnread.useMutation({ onSuccess: invalidate });
  const archiveMsg  = trpc.admin.emailsArchive.useMutation({ onSuccess: invalidate });
  const deleteMsg   = trpc.admin.emailsDelete.useMutation({ onSuccess: invalidate });
  const deleteHard  = trpc.admin.emailsDeletePermanent.useMutation({
    onSuccess: () => { invalidate(); setSelectedId(null); toast.success("Excluída permanentemente."); },
  });
  const reply = trpc.admin.emailsReply.useMutation({
    onSuccess: () => { invalidate(); setReplyBody(""); toast.success("Resposta enviada!"); },
    onError:   (e) => toast.error(e.message),
  });
  const sendNew = trpc.admin.emailsSendNew.useMutation({
    onSuccess: () => {
      utils.admin.emailsListSent.invalidate();
      setComposing(false); setComposeTo(""); setComposeSubject(""); setComposeBody("");
      toast.success("Email enviado!");
    },
    onError: (e) => toast.error(e.message),
  });

  const list: InboxMessage[] = folder === "sent" ? [] : (messages as InboxMessage[]);
  const selected = list.find((m) => m.id === selectedId) || null;

  function openMessage(m: InboxMessage) {
    setSelectedId(m.id);
    setReplyBody("");
    if (!m.isRead) markRead.mutate({ id: m.id });
  }

  return (
    <Layout>
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>
            Caixa de Email
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            {unreadCount > 0 ? `${unreadCount} mensagem${unreadCount > 1 ? "ns" : "m"} não lida${unreadCount > 1 ? "s" : ""}` : "Tudo lido"}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setComposing(true)}>
          ✏️ Novo email
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "180px 320px 1fr", gap: 16, minHeight: 560 }}>
        {/* Coluna de pastas */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: 8 }}>
          {FOLDERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setFolder(f.value); setSelectedId(null); }}
              style={{
                width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 8, border: "none",
                background: folder === f.value ? "var(--off)" : "transparent",
                fontWeight: folder === f.value ? 700 : 500, fontSize: 14, color: "var(--black)",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 8, marginBottom: 2,
              }}
            >
              <span>{f.icon}</span>
              <span style={{ flex: 1 }}>{f.label}</span>
              {f.value === "inbox" && unreadCount > 0 && (
                <span style={{ background: "#dc2626", color: "white", fontSize: 11, fontWeight: 700, borderRadius: 10, padding: "1px 7px" }}>
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Lista de mensagens */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, overflowY: "auto", maxHeight: 640 }}>
          {isLoading && <div style={{ padding: 20, color: "var(--muted)", fontSize: 13 }}>Carregando...</div>}

          {folder === "sent"
            ? (sentMessages as SentMessage[]).map((m) => (
                <div key={m.id} style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", marginBottom: 2 }}>Para: {m.toAddress}</p>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>{m.subject}</p>
                  <p style={{ fontSize: 11, color: "var(--muted)" }}>{formatDate(m.createdAt)}</p>
                </div>
              ))
            : list.map((m) => (
                <button
                  key={m.id}
                  onClick={() => openMessage(m)}
                  style={{
                    width: "100%", textAlign: "left", padding: "12px 14px", border: "none",
                    borderBottom: "1px solid var(--border)",
                    background: selectedId === m.id ? "var(--off)" : "white",
                    cursor: "pointer", display: "flex", gap: 10,
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", background: "var(--black)", color: "white",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0,
                  }}>
                    {initials(m.fromAddress)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                      <p style={{ fontSize: 13, fontWeight: m.isRead ? 500 : 800, color: "var(--black)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {displayName(m.fromAddress)}
                      </p>
                      <span style={{ fontSize: 11, color: "var(--muted)", flexShrink: 0 }}>{formatDate(m.createdAt)}</span>
                    </div>
                    <p style={{ fontSize: 12, fontWeight: m.isRead ? 400 : 700, color: "var(--black)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {m.subject || "(sem assunto)"}
                    </p>
                    <p style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {snippet(m)}
                    </p>
                  </div>
                  {!m.isRead && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#0071e3", flexShrink: 0, marginTop: 4 }} />}
                </button>
              ))}

          {!isLoading && folder !== "sent" && list.length === 0 && (
            <div style={{ padding: 30, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Nada por aqui.</div>
          )}
        </div>

        {/* Detalhe da mensagem selecionada */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: 24, overflowY: "auto", maxHeight: 640 }}>
          {!selected && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted)", fontSize: 13 }}>
              Selecione uma mensagem pra ler
            </div>
          )}

          {selected && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--black)", marginBottom: 6 }}>
                    {selected.subject || "(sem assunto)"}
                  </h2>
                  <p style={{ fontSize: 13, color: "var(--muted)" }}>
                    De: <strong style={{ color: "var(--black)" }}>{selected.fromAddress}</strong> · {formatDate(selected.createdAt)}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-sm btn-outline" onClick={() => markUnread.mutate({ id: selected.id })} title="Marcar como não lida">
                    ✉️
                  </button>
                  {folder !== "trash" ? (
                    <>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => archiveMsg.mutate({ id: selected.id, archived: folder !== "archived" })}
                        title={folder === "archived" ? "Desarquivar" : "Arquivar"}
                      >
                        🗂️
                      </button>
                      <button className="btn btn-sm btn-outline" onClick={() => { deleteMsg.mutate({ id: selected.id, deleted: true }); setSelectedId(null); }} title="Excluir">
                        🗑️
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-sm btn-outline" onClick={() => deleteMsg.mutate({ id: selected.id, deleted: false })} title="Restaurar">
                        ↩️
                      </button>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => { if (confirm("Excluir permanentemente? Não dá pra desfazer.")) deleteHard.mutate({ id: selected.id }); }}
                        title="Excluir permanentemente"
                      >
                        ❌
                      </button>
                    </>
                  )}
                </div>
              </div>

              {selected.attachments && selected.attachments.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                  {selected.attachments.map((a) => (
                    <AttachmentButton key={a.id} messageId={selected.id} attachment={a} />
                  ))}
                </div>
              )}

              <div
                style={{ fontSize: 14, color: "var(--black)", lineHeight: 1.6, paddingBottom: 20, borderBottom: "1px solid var(--border)", marginBottom: 20, whiteSpace: "pre-wrap" }}
              >
                {selected.bodyText || selected.bodyHtml?.replace(/<[^>]+>/g, " ") || "(sem conteúdo)"}
              </div>

              {folder !== "trash" && (
                <div>
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Escreva sua resposta..."
                    rows={4}
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: 10, fontSize: 14, fontFamily: "inherit", resize: "vertical" }}
                  />
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: 8 }}
                    disabled={!replyBody.trim() || reply.isPending}
                    onClick={() => reply.mutate({ id: selected.id, body: replyBody })}
                  >
                    {reply.isPending ? "Enviando..." : "Responder"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {composing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "white", borderRadius: 16, padding: 24, width: 480, maxWidth: "90vw" }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16, color: "var(--black)" }}>Novo email</h3>
            <input
              type="email" placeholder="Para: cliente@exemplo.com" value={composeTo} onChange={(e) => setComposeTo(e.target.value)}
              style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 10 }}
            />
            <input
              type="text" placeholder="Assunto" value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)}
              style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 10 }}
            />
            <textarea
              placeholder="Mensagem" value={composeBody} onChange={(e) => setComposeBody(e.target.value)} rows={6}
              style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: 10, fontSize: 14, fontFamily: "inherit", resize: "vertical", marginBottom: 14 }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline" onClick={() => setComposing(false)}>Cancelar</button>
              <button
                className="btn btn-primary"
                disabled={!composeTo || !composeSubject || !composeBody || sendNew.isPending}
                onClick={() => sendNew.mutate({ to: composeTo, subject: composeSubject, body: composeBody })}
              >
                {sendNew.isPending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function AttachmentButton({ messageId, attachment }: { messageId: number; attachment: Attachment }) {
  const utils = trpc.useUtils();
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      const { url } = await utils.client.admin.emailsAttachmentLink.query({ messageId, attachmentId: attachment.id });
      window.open(url, "_blank");
    } catch {
      toast.error("Não foi possível baixar o anexo agora.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button
      onClick={download}
      disabled={downloading}
      style={{
        display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--border)", borderRadius: 8,
        padding: "6px 10px", fontSize: 12, color: "var(--black)", background: "white", cursor: "pointer",
      }}
    >
      📎 {attachment.filename} <span style={{ color: "var(--muted)" }}>({formatSize(attachment.size)})</span>
    </button>
  );
}
