/**
 * ownership.ts — dono de projeto/campanha conferido num lugar só.
 *
 * Achado real (auditoria de 23/11): rotas tRPC da tela liam e gravavam dado
 * de outro cliente pelo número (`campaigns.get`, `campaigns.list`,
 * `campaigns.updateAdSet`, `projects.delete`, `clientProfile.*` e outras).
 * O MCP e o chat ja conferiam `project.userId !== userId` em cada ferramenta;
 * a tela nao. Em vez de repetir a checagem em dezenas de rotas (e esquecer a
 * proxima), o `protectedProcedure` chama `assertInputOwnership` com a
 * entrada crua: `campaignId`/`projectId` numericos precisam ser do usuario.
 *
 * Regras:
 * - So numero inteiro positivo conta. `campaignId` string e id da Meta, Google
 *   ou TikTok (outro espaco de ids) e nao e conferido aqui; 0 e "nenhum".
 * - "Nao existe" e "e de outro" dao o mesmo NOT_FOUND, para nao revelar
 *   existencia.
 * - Com os dois na entrada, a campanha tem de ser daquele projeto (evita usar
 *   a propria campanha com o perfil de cliente de outro projeto).
 * - Papel admin/superadmin passa: o acesso administrativo a dado de cliente
 *   ja existe e nao muda nesta correcao.
 */
import { TRPCError } from "@trpc/server";

export interface OwnershipStore {
  getProjectById(id: number): Promise<{ id: number; userId: number } | null | undefined>;
  getCampaignById(id: number): Promise<{ id: number; projectId: number } | null | undefined>;
}

export const PAPEIS_COM_ACESSO_ADMIN = ["admin", "superadmin"];

function idNumerico(valor: unknown): number | null {
  return typeof valor === "number" && Number.isSafeInteger(valor) && valor > 0 ? valor : null;
}

function naoEncontrado(oque: "Campanha" | "Projeto"): TRPCError {
  return new TRPCError({ code: "NOT_FOUND", message: `${oque} não encontrad${oque === "Campanha" ? "a" : "o"}.` });
}

export function ehAdmin(user: { role?: string | null } | null | undefined): boolean {
  return !!user && PAPEIS_COM_ACESSO_ADMIN.includes(String(user.role || ""));
}

/** Projeto do usuario ou NOT_FOUND. */
export async function assertProjectOwner(store: OwnershipStore, user: { id: number; role?: string | null }, projectId: number) {
  const projeto = await store.getProjectById(projectId);
  if (!projeto) throw naoEncontrado("Projeto");
  if (!ehAdmin(user) && projeto.userId !== user.id) throw naoEncontrado("Projeto");
  return projeto;
}

/** Campanha de um projeto do usuario ou NOT_FOUND. */
export async function assertCampaignOwner(store: OwnershipStore, user: { id: number; role?: string | null }, campaignId: number) {
  const campanha = await store.getCampaignById(campaignId);
  if (!campanha) throw naoEncontrado("Campanha");
  if (ehAdmin(user)) return campanha;
  const projeto = await store.getProjectById(campanha.projectId);
  if (!projeto || projeto.userId !== user.id) throw naoEncontrado("Campanha");
  return campanha;
}

/**
 * Confere `campaignId` e `projectId` da entrada crua de uma rota protegida.
 * Entrada que nao e objeto, ou sem esses campos, passa sem consulta.
 */
export async function assertInputOwnership(store: OwnershipStore, user: { id: number; role?: string | null }, rawInput: unknown): Promise<void> {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) return;
  const entrada = rawInput as Record<string, unknown>;
  const campaignId = idNumerico(entrada.campaignId);
  const projectId = idNumerico(entrada.projectId);
  if (!campaignId && !projectId) return;
  if (ehAdmin(user)) return;
  if (projectId) await assertProjectOwner(store, user, projectId);
  if (campaignId) {
    const campanha = await assertCampaignOwner(store, user, campaignId);
    if (projectId && campanha.projectId !== projectId) throw naoEncontrado("Campanha");
  }
}
