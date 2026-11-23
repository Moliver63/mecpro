/**
 * vslSecret.ts — segredo do servico de video (VSL), sem valor padrao.
 *
 * Auditoria 23/11, rodada 3: vslRouter.ts caia em "mecpro-vsl-secret" quando
 * VSL_SECRET_KEY nao existia, e esse valor (e o "mecpro-vsl-2026" dos notebooks)
 * esta no repositorio. Quem soubesse a URL do servico de video listava, baixava
 * e apagava videos de todos os usuarios. Agora: sem segredo proprio, o MecProAI
 * nao chama o servico (falha fechada, erro claro), em vez de falar com ele
 * usando uma senha publica.
 */
export const SEGREDOS_VSL_PUBLICOS = [
  "mecpro-vsl-secret",
  "mecpro-vsl-2026",
  "chave-secreta-para-autenticar-mecproai",
  "TROQUE-ESTA-CHAVE-ANTES-DE-USAR",
];

export const TAMANHO_MINIMO_SEGREDO_VSL = 16;

/** Segredo valido ou null (ausente, curto demais ou um dos valores publicos do repositorio). */
export function segredoVslValido(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const s = valor.trim();
  if (s.length < TAMANHO_MINIMO_SEGREDO_VSL) return null;
  if (SEGREDOS_VSL_PUBLICOS.includes(s)) return null;
  return s;
}
