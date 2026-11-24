import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";

/**
 * Pela especificacao MCP 2026-07-28, um cliente "dual-era" faz um pedido no protocolo novo e, se recebe 400 sem um
 * erro moderno reconhecido, volta para o initialize. O SDK 1.x responde exatamente assim a uma versao que nao conhece.
 * Esse 400 e o comportamento correto (mudar a resposta poderia impedir o cliente de voltar), entao so nao e alarme.
 */
export function ehSondagemDeProtocoloNovo(status: number, versao: string, suportadas: readonly string[] = SUPPORTED_PROTOCOL_VERSIONS): boolean {
  return status === 400 && /^\d{4}-\d{2}-\d{2}$/.test(versao) && !suportadas.includes(versao) && versao > (suportadas[0] ?? "");
}
