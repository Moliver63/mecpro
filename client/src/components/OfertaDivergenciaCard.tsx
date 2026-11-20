import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/**
 * Uma divergencia entre a copy e a oferta confirmada: mostra o campo, o trecho
 * em contexto e o motivo, e deixa o usuario aplicar a sugestao (baseada em fato
 * confirmado) ou editar o texto na mao. As duas acoes so salvam o rascunho: nao
 * aprovam revisao e nao publicam nada.
 */
export type DivergenciaDeOferta = {
  criativo: number | null;
  caminho: string;
  campoRotulo: string;
  trecho: string;
  motivoTexto: string;
  sugestao: { find: string; replaceWith: string; basis: string } | null;
  precisaConfirmarOferta: boolean;
  textoAtual?: string | null;
};

type Props = {
  campaignId: number;
  divergencia: DivergenciaDeOferta;
  /** Recebe a pre-checagem atualizada devolvida pelo servidor depois de salvar. */
  onSalvo: (pendencias: any[]) => void;
};

export default function OfertaDivergenciaCard({ campaignId, divergencia: d, onSalvo }: Props) {
  const resolver = (trpc as any).campaigns?.resolveOfferDivergence?.useMutation?.() ?? { mutateAsync: null, isPending: false };
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(d.textoAtual ?? "");
  const podeSalvar = d.criativo !== null && !!resolver.mutateAsync;

  async function salvar(modo: "sugestao" | "manual") {
    if (d.criativo === null || !resolver.mutateAsync) return;
    try {
      const r = await resolver.mutateAsync({
        campaignId, criativo: d.criativo, caminho: d.caminho, modo,
        ...(modo === "manual" ? { novoTexto: texto } : {}),
      });
      toast.success("Rascunho atualizado. Nada foi publicado.");
      setEditando(false);
      onSalvo(r?.pendencias ?? []);
    } catch (e: any) {
      toast.error(e?.message || "Não consegui salvar a correção.");
    }
  }

  const atual = d.textoAtual ?? "";
  const i = atual ? atual.indexOf(d.trecho) : -1;

  return (
    <div style={{ border: "1px solid #fecaca", background: "white", borderRadius: 12, padding: 14, marginBottom: 10 }}>
      <p style={{ fontSize: 12, fontWeight: 800, color: "var(--black)", margin: "0 0 6px" }}>{d.campoRotulo}</p>
      {atual && (
        <p style={{ fontSize: 13, color: "var(--black)", margin: "0 0 6px", lineHeight: 1.55 }}>
          {i >= 0 ? (
            <>
              {atual.slice(0, i)}
              <mark style={{ background: "#fecaca", color: "#7f1d1d", padding: "0 2px", borderRadius: 3 }}>{d.trecho}</mark>
              {atual.slice(i + d.trecho.length)}
            </>
          ) : atual}
        </p>
      )}
      <p style={{ fontSize: 12, color: "#991b1b", margin: "0 0 8px", lineHeight: 1.5 }}>
        <strong>"{d.trecho}"</strong> {d.motivoTexto}.
      </p>

      {d.precisaConfirmarOferta && (
        <p style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "6px 10px", margin: "0 0 8px", lineHeight: 1.5 }}>
          Essa condição não está confirmada na oferta do briefing. Confirme preço, gratuidade, bônus ou prazo no cliente, ou edite o texto.
        </p>
      )}

      {d.sugestao && (
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 8px", lineHeight: 1.5 }}>
          Sugestão: {d.sugestao.replaceWith ? <>trocar por <strong>"{d.sugestao.replaceWith}"</strong></> : <>remover o trecho</>} ({d.sugestao.basis}).
        </p>
      )}

      {editando && (
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          style={{ width: "100%", boxSizing: "border-box", fontSize: 13, padding: 10, border: "1px solid var(--border)", borderRadius: 8, marginBottom: 8, fontFamily: "inherit" }}
        />
      )}

      {podeSalvar ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {d.sugestao && !editando && (
            <button disabled={resolver.isPending} onClick={() => salvar("sugestao")}
              style={{ background: "#1877f2", color: "white", border: "none", fontWeight: 700, fontSize: 12, padding: "8px 14px", borderRadius: 8, cursor: "pointer" }}>
              {resolver.isPending ? "Salvando..." : "Aplicar sugestão e salvar rascunho"}
            </button>
          )}
          {!editando ? (
            <button onClick={() => setEditando(true)}
              style={{ background: "white", color: "var(--black)", border: "1px solid var(--border)", fontWeight: 700, fontSize: 12, padding: "8px 14px", borderRadius: 8, cursor: "pointer" }}>
              Editar o texto
            </button>
          ) : (
            <>
              <button disabled={resolver.isPending || !texto.trim()} onClick={() => salvar("manual")}
                style={{ background: "#1877f2", color: "white", border: "none", fontWeight: 700, fontSize: 12, padding: "8px 14px", borderRadius: 8, cursor: "pointer" }}>
                {resolver.isPending ? "Salvando..." : "Salvar texto no rascunho"}
              </button>
              <button onClick={() => { setEditando(false); setTexto(d.textoAtual ?? ""); }}
                style={{ background: "white", color: "var(--black)", border: "1px solid var(--border)", fontWeight: 700, fontSize: 12, padding: "8px 14px", borderRadius: 8, cursor: "pointer" }}>
                Cancelar edição
              </button>
            </>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
          Esse texto veio do formulário de publicação: corrija-o no próprio formulário.
        </p>
      )}
    </div>
  );
}
