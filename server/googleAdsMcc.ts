/**
 * googleAdsMcc.ts — convite de vínculo da conta do cliente com a MCC do MecPro.
 *
 * A MCC age com credenciais DA PLATAFORMA (variáveis de ambiente), nunca por
 * usuário. Por isso a posse da conta precisa ser registrada: sem isso, um usuário
 * poderia digitar o ID de outra pessoa já vinculada e operar a conta dela.
 * Este módulo só monta pedidos e interpreta respostas; a chamada HTTP e o banco
 * ficam no router, para os testes não dependerem de rede.
 */
import { urlDoCliente } from "./googleAdsApi";

export type StatusVinculo = "NENHUM" | "PENDENTE" | "ATIVO" | "RECUSADO" | "CANCELADO" | "OUTRO";

export type ConfigMcc = { customerId: string; refreshToken: string };

/** ID de 10 dígitos sem traços, ou null. */
export function normalizarCustomerId(entrada: string): string | null {
  const d = String(entrada ?? "").replace(/\D/g, "");
  return d.length === 10 ? d : null;
}

/** Lê a MCC da plataforma do ambiente; o motivo vem em `erro` quando falta algo. */
export function lerConfigMcc(env: Record<string, string | undefined> = process.env): { config: ConfigMcc } | { erro: string } {
  const customerId = normalizarCustomerId(env.GOOGLE_MCC_CUSTOMER_ID || "");
  const refreshToken = String(env.GOOGLE_MCC_REFRESH_TOKEN || "").trim();
  if (!customerId) return { erro: "MCC da plataforma não configurada (GOOGLE_MCC_CUSTOMER_ID)." };
  if (!refreshToken) return { erro: "Login da MCC não autorizado (GOOGLE_MCC_REFRESH_TOKEN)." };
  return { config: { customerId, refreshToken } };
}

/** Corpo de customerClientLinks:mutate que cria o convite. */
export function operacaoConvite(clienteId: string) {
  return { operation: { create: { clientCustomer: `customers/${clienteId}`, status: "PENDING" } } };
}

export function urlConvite(mccId: string): string {
  return urlDoCliente(mccId, "customerClientLinks:mutate");
}

/** Consulta o vínculo de um cliente com a MCC. */
export function gaqlVinculo(clienteId: string): string {
  return `SELECT customer_client_link.client_customer, customer_client_link.status, customer_client_link.resource_name FROM customer_client_link WHERE customer_client_link.client_customer = 'customers/${clienteId}'`;
}

const MAPA: Record<string, StatusVinculo> = { PENDING: "PENDENTE", ACTIVE: "ATIVO", REJECTED: "RECUSADO", CANCELED: "CANCELADO", CANCELLED: "CANCELADO" };

/** Status do vínculo a partir das linhas da consulta (prefere ATIVO, depois PENDENTE). */
export function interpretarVinculo(linhas: any[]): StatusVinculo {
  if (!linhas?.length) return "NENHUM";
  const todos = linhas.map((l) => MAPA[String(l?.customerClientLink?.status ?? l?.customer_client_link?.status ?? "")] ?? "OUTRO");
  for (const prioridade of ["ATIVO", "PENDENTE", "RECUSADO", "CANCELADO"] as StatusVinculo[]) {
    if (todos.includes(prioridade)) return prioridade;
  }
  return "OUTRO";
}

/** Decide o que fazer com o pedido do usuário, dado quem já é dono do ID. */
export function decidirPosse(donoAtualUserId: number | null, userId: number): "criar" | "ja_meu" | "de_outro" {
  if (donoAtualUserId === null) return "criar";
  return donoAtualUserId === userId ? "ja_meu" : "de_outro";
}
