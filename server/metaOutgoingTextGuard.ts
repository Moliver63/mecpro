// Revalida, contra os fatos confirmados do rascunho, o texto EXATO que vai para
// a Meta. A integridade dos criativos salvos nao basta: titulo, texto e
// descricao ainda sao reescritos (dedupe, persona, auditoria, fallbacks) antes
// do envio. Uma tela, o chat e o MCP chamam a mesma rota, entao a regra vale
// para as tres portas.
import { TRPCError } from "@trpc/server";
import { validateCampaignFactIntegrity, type CampaignFacts } from "./campaignFactGuard";
import { descreverConflito } from "./campaignPublishIntegrity";

export type TextoDeSaida = { path: string; text: string };

// Chaves que carregam texto visivel ao publico no corpo de criativo da Meta.
const CHAVES_DE_TEXTO = new Set(["message", "name", "description", "link_description", "text", "title", "body"]);
// Nunca percorridas: credenciais, destinos e identificadores.
const CHAVES_IGNORADAS = new Set([
  "access_token", "link", "picture", "image_url", "image_hash", "video_id", "url", "page_id", "instagram_actor_id",
  "tracking_specs", "call_to_action_types", "ad_formats", "url_tags", "object_story_id", "thumbnail_url", "caption",
]);

export function collectOutgoingCreativeTexts(body: unknown): TextoDeSaida[] {
  const out: TextoDeSaida[] = [];
  const visitar = (valor: unknown, caminho: string, chave: string, profundidade: number) => {
    if (profundidade > 8 || valor === null || valor === undefined) return;
    if (typeof valor === "string") {
      if (CHAVES_DE_TEXTO.has(chave) && valor.trim()) out.push({ path: caminho, text: valor });
      return;
    }
    if (Array.isArray(valor)) {
      valor.forEach((item, i) => visitar(item, `${caminho}[${i}]`, chave, profundidade + 1));
      return;
    }
    if (typeof valor === "object") {
      for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
        if (CHAVES_IGNORADAS.has(k)) continue;
        // `name` na raiz do corpo e o nome interno do criativo, nao copy.
        if (profundidade === 0 && k === "name") continue;
        visitar(v, caminho ? `${caminho}.${k}` : k, k, profundidade + 1);
      }
    }
  };
  visitar(body, "", "", 0);
  return out;
}

export type ResultadoTextoDeSaida = { ok: boolean; erros: string[] };

export function verificarTextosDeSaida(campaign: any, textos: TextoDeSaida[], opcoes: { somenteOferta?: boolean } = {}): ResultadoTextoDeSaida {
  let facts: CampaignFacts | undefined;
  try { facts = JSON.parse(campaign?.aiResponse || "{}")?.campaignFacts; } catch { facts = undefined; }
  if (!facts || typeof facts.confirmedClaimsRaw !== "string") {
    return { ok: false, erros: ["campanha sem briefing validado completo; regenere para validar os textos antes de publicar"] };
  }
  const erros: string[] = [];
  for (const { path, text } of textos) {
    if (!text || !text.trim()) continue;
    // `somenteOferta`: na ultima linha (apos a campanha existir na Meta) so
    // promessas comerciais bloqueiam. Textos gerados pelo proprio sistema para
    // cartoes de carrossel ("Ultimas unidades", "Lazer exclusivo") nao estao no
    // rascunho, o usuario nao consegue corrigi-los e o bloqueio deixaria
    // campanha e conjunto orfaos na Meta.
    const conflitos = validateCampaignFactIntegrity([{ text }], facts).conflicts.filter((c) => !opcoes.somenteOferta || !!c.kind);
    for (const c of conflitos) {
      const descricao = descreverConflito({ ...c, field: `creatives[999999].${path}` }, 0);
      erros.push(`texto enviado à Meta (${path}): ${descricao.replace(/^[^:]*:\s*/, "")}`);
    }
  }
  return { ok: erros.length === 0, erros };
}

/** Lanca com o prefixo CAMPAIGN_INTEGRITY, que a tela ja trata como bloqueio de revisao. */
export function assertOutgoingMetaTexts(campaign: any, textos: TextoDeSaida[], opcoes: { somenteOferta?: boolean } = {}): void {
  const r = verificarTextosDeSaida(campaign, textos, opcoes);
  if (!r.ok) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `CAMPAIGN_INTEGRITY: ${r.erros.slice(0, 5).join("; ")}. Nada foi enviado à Meta.`,
    });
  }
}
