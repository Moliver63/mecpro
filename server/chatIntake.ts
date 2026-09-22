export const CAMPAIGN_INTAKE_POLICY = `Fluxo de campanha:
- Ao iniciar, consulte consultar_projetos_campanhas e apresente os nomes reais dos projetos em lista curta, mais "Criar projeto do zero". Nao peca IDs ao usuario. Se ja escolheu um projeto explicitamente, valide pela consulta e avance sem repetir a escolha. Se nao houver projetos, peca nome e descricao do novo negocio. Use paginacao para oferecer mais projetos.
- No projeto escolhido, apresente as campanhas existentes e as opcoes: "Nova campanha do zero", "Usar uma existente como modelo" e "Editar uma existente". Se a intencao ja estiver clara, nao pergunte novamente. Sem campanhas, ofereca a nova, nao invente modelos.
- Modelo significa criar OUTRO rascunho, mantendo a original intacta. Consulte a campanha escolhida e apresente configuracoes como sugestoes para confirmar junto com o briefing. Nao importe automaticamente fatos da oferta, precos, fotos, verba ou autorizacao de publicacao. Se desejar reutilizar fotos antigas, explique que este fluxo nao duplica anexos automaticamente; solicite os arquivos atuais.
- Edicao significa manter a campanha escolhida: consulte seus dados e pergunte numa unica pergunta todas as mudancas desejadas. Use apenas ferramentas de edicao disponiveis; para outras alteracoes, entregue o link da campanha. Nao chame gerar_campanha para fingir uma edicao.
- Para nova campanha, peca TODOS os dados essenciais ainda ausentes num unico bloco organizado, que pode ultrapassar 3 frases/60 palavras: oferta e diferenciais confirmados; objetivo e plataforma; regiao e publico; orcamento total OU diario e duracao; destino/WhatsApp; fotos e numero da capa. Campos opcionais podem ficar em branco. Reutilize os dados confirmados, nao reapresente formulario completo a cada turno. Se responder parcialmente, agrupe somente o que ainda falta. Nunca invente valores para encurtar a conversa.
- Se ja autorizou criar rascunho e ha dados suficientes, gere sem pedir nova confirmacao. Publicacao e gastos continuam exigindo autorizacao separada.`;

export function missingCampaignIntake(briefing: Record<string, unknown>): string[] {
  const missing: string[] = [];
  const has = (key: string) => briefing[key] != null && String(briefing[key]).trim() !== "";
  if (!has("productService")) missing.push("Produto/servico ou oferta e diferenciais confirmados");
  if (!has("objective")) missing.push("Objetivo: contatos, vendas, trafego, reconhecimento ou engajamento");
  if (!has("platform")) missing.push("Plataforma: Meta, Google ou TikTok");
  if (!has("city")) missing.push("Cidade/regiao de atendimento");
  if (!has("targetAudience")) missing.push("Publico que deseja atingir");
  if (!(Number(briefing.budget) > 0)) missing.push("Orcamento em reais, indicando se diario ou total");
  if (!(Number(briefing.durationDays) > 0)) missing.push("Duracao em dias");
  if (!has("whatsapp") && !has("destinationUrl")) missing.push("Destino dos contatos: WhatsApp, site ou formulario");
  if (!has("mediaFormat")) missing.push("Formato e fotos/videos disponiveis; numero da capa se houver varias fotos");
  return missing;
}
