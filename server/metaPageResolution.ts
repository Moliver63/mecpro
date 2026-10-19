// Resolucao da Pagina Meta — logica pura, sem import de db, env ou router,
// pra poder ser testada sem subir meio servidor.
//
// Achado real (Michel, 30/09): o chat respondeu "preciso do pageId da sua
// pagina Meta (ex: 123456789012345). Voce tem esse ID pronto? Se nao, use
// consultar_paginas_meta para lista-lo."
//
// Dois erros numa frase so. Primeiro, `consultar_paginas_meta` e ferramenta
// DO ASSISTENTE — mandar o usuario "usar" um nome interno e o mesmo vazamento
// de "Fact Guard" e "Consulte os projetos e pergunte qual usar". Segundo, e
// absurdo pedir um numero de 15 digitos a quem ja conectou a conta Meta: o
// sistema tem o token e descobre sozinho.
//
// O prompt ja mandava chamar a ferramenta primeiro. O modelo leu a regra e
// narrou ela em voz alta em vez de executar. Depender de obediencia nao
// resolveu, entao a resolucao virou deterministica.

export type PaginaMeta = { pageId: string; name: string };

// Campos opcionais em vez de uniao discriminada de proposito:
// tsconfig.server.json roda com "strict": false, e sem strictNullChecks o
// TypeScript NAO estreita uniao por discriminante booleano. Escrito como
// uniao, todo acesso a `erro` ou `paginas` depois de `if (!r.ok)` vira erro
// de compilacao. O resto do arquivo nunca bateu nisso porque so constroi
// esses tipos, nunca os estreita.
export type ListaPaginasMeta = { ok: boolean; pages?: PaginaMeta[]; erro?: string };

export type ResolucaoPaginaMeta = {
  ok: boolean;
  pageId?: string;
  pageName?: string;
  resolvidoAutomaticamente?: boolean;
  erro?: string;
  paginas?: PaginaMeta[];
};

/**
 * Uma Pagina conectada: usa, sem perguntar. O usuario ainda ve qual e na
 * pre-confirmacao antes de autorizar, entao nada e publicado as escondidas.
 *
 * Varias Paginas: NAO escolhe. Publicar gasta dinheiro real e e
 * irreversivel — chutar a Pagina errada e pior que perguntar. Devolve a
 * lista com nomes pro assistente perguntar por NOME, nunca por id.
 *
 * Nenhuma: erro acionavel, sem citar nome de ferramenta, porque essa
 * mensagem chega ao usuario.
 */
export async function resolverPaginaMetaComLista(
  pageIdInformado: string | undefined,
  carregarLista: () => Promise<ListaPaginasMeta>,
): Promise<ResolucaoPaginaMeta> {
  const informado = String(pageIdInformado || "").trim();
  if (informado) return { ok: true, pageId: informado, resolvidoAutomaticamente: false };

  const lista = await carregarLista();
  if (!lista.ok) return { ok: false, erro: lista.erro };

  const pages = lista.pages || [];
  if (pages.length === 0) {
    return {
      ok: false,
      erro: "Nenhuma Pagina do Facebook encontrada na conta Meta conectada. Conecte uma Pagina em Configuracoes → Meta Ads antes de publicar.",
    };
  }
  if (pages.length === 1) {
    return { ok: true, pageId: pages[0].pageId, pageName: pages[0].name, resolvidoAutomaticamente: true };
  }

  return {
    ok: false,
    erro: `A conta tem ${pages.length} Paginas conectadas. Pergunte ao usuario em qual publicar, citando os NOMES abaixo — nunca peca o id a ele.`,
    paginas: pages,
  };
}

export function urlHttps(valor: unknown): string | undefined {
  if (typeof valor !== "string" || !valor.trim()) return undefined;
  try {
    const parsed = new URL(valor.trim());
    return parsed.protocol === "https:" && parsed.hostname.includes(".") ? parsed.toString() : undefined;
  } catch { return undefined; }
}

/**
 * Destino do anuncio a partir da Pagina (resposta de `competitors.resolvePageLink`).
 * WhatsApp primeiro, como o caminho da tela. Telefone so vale com 10 a 15
 * digitos (E.164): `wa.me/<qualquer id>` vira link quebrado no anuncio. O campo
 * `website` da Graph pode trazer varios enderecos separados por espaco; usa o
 * primeiro, e sem esquema vira https. Site http:// nao e promovido a https.
 */
export function destinoDaPagina(resolved: any): { url: string; origem: string } | null {
  const wa = typeof resolved?.whatsappUrl === "string" ? resolved.whatsappUrl.match(/^https:\/\/wa\.me\/(\d{10,15})$/) : null;
  if (wa) return { url: `https://wa.me/${wa[1]}`, origem: "WhatsApp da Pagina" };
  const primeiro = typeof resolved?.website === "string" ? resolved.website.trim().split(/[\s,;]+/)[0] : "";
  if (!primeiro) return null;
  const url = urlHttps(/^[a-z][a-z0-9+.-]*:\/\//i.test(primeiro) ? primeiro : `https://${primeiro}`);
  return url ? { url, origem: "site da Pagina" } : null;
}
