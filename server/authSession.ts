import type { Request, Response } from "express";

/**
 * POST /api/auth/logout. O menu do usuario (client/UserMenu.tsx) chama esta rota REST, mas ela nao
 * existia: so havia a mutation tRPC `auth.logout`. Resultado em producao (log de 23/11, iPhone):
 * 404 no logout, o cookie `token` continuava valido e o login do Google (prompt=none) devolvia
 * o mesmo usuario ao /dashboard na hora, ou seja, sair nao saia.
 * As opcoes do cookie precisam ser as mesmas do login (path, secure, sameSite) para o navegador
 * aceitar a remocao.
 */
export function encerrarSessao(_req: Request, res: Response): void {
  const opcoes = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };
  res.clearCookie("token", opcoes);
  // Variante sem `secure`, usada pelo login por senha fora de producao.
  res.clearCookie("token", { ...opcoes, secure: false });
  res.status(200).json({ success: true });
}
