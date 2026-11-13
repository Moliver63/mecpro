/**
 * googleContas.ts
 *
 * Escolha da conta cliente quando o Customer ID configurado e um MCC (gerente).
 * Regra: nunca operar uma conta que o usuario nao escolheu.
 *  - MCC com UMA conta filha: usa essa conta (nao ha ambiguidade).
 *  - MCC com VARIAS filhas: exige escolha explicita (childCustomerId na integracao);
 *    sem ela, erro claro listando as contas, em vez de assumir a primeira.
 *  - Escolha explicita que nao esta na lista: erro (conta saiu do MCC ou id errado).
 */

export type ContaFilha = { id: string; nome?: string };

export type EscolhaConta =
  | { ok: true; id: string; automatica: boolean }
  | { ok: false; mensagem: string };

export function escolherContaFilha(filhas: ContaFilha[], explicitaBruta?: string | null): EscolhaConta {
  const explicita = String(explicitaBruta ?? "").replace(/\D/g, "");
  const validas = (filhas || []).filter(f => f && String(f.id || "").replace(/\D/g, "").length > 0)
    .map(f => ({ id: String(f.id).replace(/\D/g, ""), nome: f.nome }));

  if (explicita) {
    const achada = validas.find(f => f.id === explicita);
    if (achada) return { ok: true, id: achada.id, automatica: false };
    return {
      ok: false,
      mensagem: `A conta cliente configurada (${explicita}) nao esta entre as contas deste MCC. ` +
        `Confira o Customer ID ou atualize a integracao. Contas disponiveis: ${resumo(validas)}`,
    };
  }

  if (validas.length === 1) return { ok: true, id: validas[0].id, automatica: true };

  if (validas.length === 0) {
    return { ok: false, mensagem: "Este MCC nao tem nenhuma conta cliente vinculada. Vincule uma conta de anunciante no Google Ads ou informe um Customer ID de anunciante." };
  }

  return {
    ok: false,
    mensagem: `Este MCC tem ${validas.length} contas cliente e nenhuma foi escolhida. ` +
      `Informe na integracao qual conta usar (childCustomerId). Contas: ${resumo(validas)}`,
  };
}

function resumo(filhas: ContaFilha[]): string {
  const itens = filhas.slice(0, 10).map(f => (f.nome ? `${f.id} (${f.nome})` : f.id));
  const resto = filhas.length > 10 ? ` e mais ${filhas.length - 10}` : "";
  return itens.join(", ") + resto;
}
