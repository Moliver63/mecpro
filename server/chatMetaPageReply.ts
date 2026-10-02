type PagesResult = { ok: true; pages: Array<{ pageId: string; name: string }> } | { ok: false; erro: string };

// Repair provider replies without executing paid actions.
export async function repairMetaPageReply(text: string, listPages: () => Promise<PagesResult>): Promise<string> {
  if (!/(?:informe|forne[cç]a|envie|preciso|necess[aá]rio|voc[eê] tem|use\b|execute)/i.test(text)) return text;
  if (!/page[_\s-]?id|consultar_paginas_meta|(?:id|identificador|numero)\s+(?:da\s+)?p[aá]gina/i.test(text)) return text;
  try {
    const result = await listPages();
    if (!result.ok) return "Nao consegui consultar as paginas Meta agora. Confira a conexao em Configuracoes > Meta Ads e tente novamente. Esta consulta nao publica campanhas.";
    if (!result.pages.length) return "Nao encontrei paginas disponiveis na conexao Meta. Confira as permissoes em Configuracoes > Meta Ads. Nao precisa procurar o numero da pagina.";
    const names = result.pages.map(p => p.name.replace(/[\r\n]/g, " "));
    if (names.length > 1) return `Encontrei estas paginas Meta:\n${names.map(name => `- ${name}`).join("\n")}\nQual delas deseja usar? Depois apresentarei os dados para confirmacao. Esta consulta nao publica a campanha.`;
    return `Encontrei a pagina Meta "${names[0]}". Deseja preparar a publicacao nela? Antes de publicar, precisamos validar a campanha e confirmar orcamento e destino. Esta consulta nao publica a campanha.`;
  } catch {
    return "A consulta das paginas Meta falhou. Tente novamente; nao precisa informar identificadores tecnicos. Esta consulta nao publica campanhas.";
  }
}
