/**
 * asaasOwnership.ts — a assinatura do Asaas e do usuario logado?
 *
 * Auditoria 23/11 (rodada 2): `subscriptions.getCheckoutPix` recebia o id da
 * assinatura pela URL do checkout e devolvia o Pix (valor, QR e codigo) de
 * qualquer assinatura. A posse vem do `externalReference` que o proprio
 * MecProAI grava ao criar a cobranca/assinatura:
 *   - `user_<id>_<plano>` e `user_<id>` (server/paymentService.ts)
 *   - `mecpro_uid_<id>` e `mecpro_annual_uid_<id>_<plano>` (router.ts)
 *   - `<id>` puro (cliente Asaas, router.ts)
 * Referencia ausente ou de outro formato = nao confirmado = nada volta.
 */
export function assinaturaAsaasDoUsuario(externalReference: unknown, userId: number): boolean {
  if (typeof externalReference !== "string" || !Number.isSafeInteger(userId) || userId <= 0) return false;
  const ref = externalReference.trim();
  const id = String(userId);
  return ref === id
    || ref === `user_${id}`
    || ref.startsWith(`user_${id}_`)
    || ref === `mecpro_uid_${id}`
    || ref.startsWith(`mecpro_annual_uid_${id}_`);
}
