// competitorVerifiers.tsx — Verificadores de TikTok, Google, Instagram
import { useState } from "react";
import { trpc } from "@/lib/trpc";

export function TikTokVerifier({ handle, onConfirm, onClear }: {
  handle:    string;
  onConfirm: (handle: string) => void;
  onClear:   () => void;
}) {
  const [status, setStatus] = useState<"idle"|"checking"|"done">("idle");
  const raw = handle.replace(/^@/, "").replace(/.*tiktok\.com\/@?/, "").replace(/\/$/, "").trim();
  if (!raw) return null;

  const profileUrl = `https://www.tiktok.com/@${raw}`;
  const adsUrl     = `https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en?region=BR&keyword=${encodeURIComponent(raw)}`;

  return (
    <div style={{ marginTop: 5 }}>
      {status === "idle" && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <a href={profileUrl} target="_blank" rel="noreferrer"
            onClick={() => setStatus("checking")}
            style={{ fontSize: 11, fontWeight: 700, color: "#010101", background: "#f0f0f0", border: "1px solid #d1d5db", borderRadius: 8, padding: "4px 10px", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
            🎵 Ver perfil @{raw} ↗
          </a>
          <a href={adsUrl} target="_blank" rel="noreferrer"
            style={{ fontSize: 11, color: "#7c3aed", background: "#f5f3ff", border: "1px solid #c4b5fd", borderRadius: 8, padding: "4px 10px", textDecoration: "none" }}>
            🔍 Ver anúncios no Creative Center ↗
          </a>
        </div>
      )}
      {status === "checking" && (
        <div style={{ background: "#f0f0f0", border: "1px solid #d1d5db", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>🎵</span>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#111" }}>@{raw}</p>
              <p style={{ margin: 0, fontSize: 10, color: "#64748b" }}>Você verificou o perfil no TikTok?</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <button onClick={() => { onConfirm(`@${raw}`); setStatus("done"); }}
              style={{ fontSize: 11, fontWeight: 700, background: "#dcfce7", color: "#16a34a", border: "1px solid #86efac", borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}>
              ◎ É esse!
            </button>
            <button onClick={() => { setStatus("idle"); onClear(); }}
              style={{ fontSize: 11, color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}>
              ✗ Não é
            </button>
          </div>
        </div>
      )}
      {status === "done" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#16a34a", fontWeight: 700 }}>
          <span>◎</span> @{raw} confirmado
          <button onClick={() => setStatus("idle")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#64748b", textDecoration: "underline", marginLeft: 4 }}>alterar</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: VERIFICADOR DE GOOGLE ADS
// Abre Google Ads Transparency e pede confirmação ao usuário
// ─────────────────────────────────────────────────────────────────────────────
export function GoogleVerifier({ query, onConfirm, onClear }: {
  query:     string;
  onConfirm: (q: string) => void;
  onClear:   () => void;
}) {
  const [status, setStatus] = useState<"idle"|"checking"|"done">("idle");
  const q = query.trim();
  if (!q) return null;

  const transparencyUrl = `https://adstransparency.google.com/?region=BR&query=${encodeURIComponent(q)}`;

  return (
    <div style={{ marginTop: 5 }}>
      {status === "idle" && (
        <a href={transparencyUrl} target="_blank" rel="noreferrer"
          onClick={() => setStatus("checking")}
          style={{ fontSize: 11, fontWeight: 700, color: "#ea4335", background: "#fde8e8", border: "1px solid #fca5a5", borderRadius: 8, padding: "4px 10px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
          🔍 Buscar "{q}" no Google Ads Transparency ↗
        </a>
      )}
      {status === "checking" && (
        <div style={{ background: "#fde8e8", border: "1px solid #fca5a5", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>🔍</span>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#111" }}>"{q}"</p>
              <p style={{ margin: 0, fontSize: 10, color: "#64748b" }}>Encontrou anúncios desta empresa?</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <button onClick={() => { onConfirm(q); setStatus("done"); }}
              style={{ fontSize: 11, fontWeight: 700, background: "#dcfce7", color: "#16a34a", border: "1px solid #86efac", borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}>
              ◎ Confirmado
            </button>
            <button onClick={() => { setStatus("idle"); onClear(); }}
              style={{ fontSize: 11, color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}>
              ✗ Não encontrei
            </button>
          </div>
        </div>
      )}
      {status === "done" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#16a34a", fontWeight: 700 }}>
          <span>◎</span> "{q}" confirmado no Google Ads
          <button onClick={() => setStatus("idle")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#64748b", textDecoration: "underline", marginLeft: 4 }}>alterar</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: VERIFICADOR DE INSTAGRAM
// Confirma se o @handle existe e mostra foto/nome/bio para o usuário confirmar
// ─────────────────────────────────────────────────────────────────────────────
export function InstagramVerifier({ handle, onConfirm, onClear }: {
  handle:    string;
  onConfirm: (handle: string) => void;
  onClear:   () => void;
}) {
  const [status, setStatus]   = useState<"idle"|"loading"|"found"|"not_found"|"exists"|"unverified"|"error">("idle");
  const [profile, setProfile] = useState<any>(null);
  const verifyMut = (trpc as any).competitors?.verifyInstagram?.useMutation?.({
    onSuccess: (data: any) => {
      if (data?.found === true)  setStatus(data.source === "exists" ? "exists" : "found");
      else if (data?.found === false) setStatus("not_found");
      else setStatus("unverified");
      setProfile(data);
    },
    onError: () => setStatus("error"),
  }) ?? { mutate: () => {}, isPending: false };

  const rawHandle = handle.replace(/^@/, "").trim();

  function verify() {
    if (!rawHandle) return;
    setStatus("loading");
    setProfile(null);
    verifyMut.mutate({ handle: rawHandle });
  }

  if (!rawHandle) return null;

  return (
    <div style={{ marginTop: 6 }}>
      {status === "idle" && (
        <button
          onClick={verify}
          style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", background: "#f5f3ff", border: "1px solid #c4b5fd", borderRadius: 8, padding: "4px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
          <span>📸</span> Verificar @{rawHandle}
        </button>
      )}

      {status === "loading" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#7c3aed" }}>
          <div style={{ width: 12, height: 12, border: "2px solid #c4b5fd", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
          Verificando @{rawHandle}...
        </div>
      )}

      {/* Perfil encontrado com detalhes */}
      {status === "found" && profile && (
        <div style={{ background: "white", border: "1px solid #c4b5fd", borderRadius: 12, padding: 12, display: "flex", alignItems: "flex-start", gap: 10 }}>
          {profile.avatar ? (
            <img src={profile.avatar} alt="" width={44} height={44} style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} onError={e => { (e.target as any).style.display = "none"; }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>📸</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#111" }}>{profile.name}</span>
              {profile.verified && <span style={{ fontSize: 12, color: "#3b82f6" }}>✓</span>}
              <span style={{ fontSize: 11, color: "#7c3aed", fontWeight: 600 }}>@{rawHandle}</span>
            </div>
            {profile.bio && <p style={{ margin: 0, fontSize: 11, color: "#64748b", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>{profile.bio}</p>}
            {profile.followers && <p style={{ margin: "3px 0 0", fontSize: 10, color: "#94a3b8" }}>{profile.followers} seguidores {profile.posts ? `· ${profile.posts} posts` : ""}</p>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
            <button onClick={() => { onConfirm(`@${rawHandle}`); setStatus("idle"); }}
              style={{ fontSize: 11, fontWeight: 700, background: "#dcfce7", color: "#16a34a", border: "1px solid #86efac", borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}>
              ◎ É essa!
            </button>
            <button onClick={() => { setStatus("idle"); setProfile(null); onClear(); }}
              style={{ fontSize: 11, color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}>
              ✗ Não é
            </button>
          </div>
        </div>
      )}

      {/* Existe mas sem detalhes */}
      {status === "exists" && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 16 }}>◎</span>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#15803d" }}>Perfil encontrado: @{rawHandle}</p>
              <p style={{ margin: 0, fontSize: 10, color: "#16a34a" }}>Perfil existe no Instagram</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <a href={`https://www.instagram.com/${rawHandle}/`} target="_blank" rel="noreferrer"
              style={{ fontSize: 11, color: "#7c3aed", textDecoration: "none", background: "#f5f3ff", border: "1px solid #c4b5fd", borderRadius: 7, padding: "4px 8px" }}>
              Ver perfil ↗
            </a>
            <button onClick={() => { onConfirm(`@${rawHandle}`); setStatus("idle"); }}
              style={{ fontSize: 11, fontWeight: 700, background: "#dcfce7", color: "#16a34a", border: "1px solid #86efac", borderRadius: 7, padding: "4px 8px", cursor: "pointer" }}>
              Confirmar
            </button>
          </div>
        </div>
      )}

      {/* Não encontrado */}
      {status === "not_found" && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>✕</span>
            <p style={{ margin: 0, fontSize: 12, color: "#dc2626" }}>@{rawHandle} não encontrado no Instagram</p>
          </div>
          <button onClick={() => { setStatus("idle"); onClear(); }}
            style={{ fontSize: 11, color: "#dc2626", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
            Corrigir
          </button>
        </div>
      )}

      {/* Incerto */}
      {status === "unverified" && (
        <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>◬</span>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#92400e" }}>Não foi possível verificar automaticamente</p>
              <p style={{ margin: 0, fontSize: 10, color: "#a16207" }}>O Instagram pode estar com acesso restrito</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <a href={`https://www.instagram.com/${rawHandle}/`} target="_blank" rel="noreferrer"
              style={{ fontSize: 11, color: "#7c3aed", textDecoration: "none", background: "#f5f3ff", border: "1px solid #c4b5fd", borderRadius: 7, padding: "4px 8px" }}>
              Abrir manualmente ↗
            </a>
            <button onClick={() => { onConfirm(`@${rawHandle}`); setStatus("idle"); }}
              style={{ fontSize: 11, background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d", borderRadius: 7, padding: "4px 8px", cursor: "pointer" }}>
              Usar assim mesmo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
