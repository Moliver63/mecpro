// Cadastro novo pelo Google: o callback marca ?cadastro=google no destino
// padrao quando a conta acabou de ser criada (findOrCreateUserByProvider,
// caminho 3). Conta antiga (login repetido ou e-mail antigo vinculando o
// Google) nao marca. Banco em UTC (confirmado em producao, 15/11).
// Ver docs/specs/2026-11-15-ga4-sign-up.md.
export const JANELA_CONTA_NOVA_MS = 2 * 60 * 1000;

export function contaCriadaAgora(createdAt: unknown, agora: number = Date.now()): boolean {
  if (createdAt === null || createdAt === undefined || createdAt === "") return false;
  const t = new Date(createdAt as any).getTime();
  return Number.isFinite(t) && t > 0 && t <= agora + 5000 && agora - t < JANELA_CONTA_NOVA_MS;
}
