export function confirmedChatContact(args: Record<string, unknown>, existingSocialLinks?: string | null): { socialLinks?: string; websiteUrl?: string } {
  const contact: { socialLinks?: string; websiteUrl?: string } = {};
  if (typeof args.whatsapp === "string" && args.whatsapp.trim()) {
    let digits = args.whatsapp.replace(/\D/g, "");
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
    if (!/^[1-9]\d{11,14}$/.test(digits)) throw new Error("Confirme o WhatsApp com codigo do pais e DDD.");
    // Achado real (log de produção, 13/09): "Unexpected token 'h',
    // \"https://ww\"... is not valid JSON" — quebrava gerar_campanha
    // inteiro. Causa: socialLinks nem sempre é JSON de verdade — existe
    // um campo de texto livre em ClientProfile.tsx (placeholder "Ex:
    // Instagram: @suaempresa · Site: https://...") que salva o texto
    // digitado direto nesse campo, sem codificar como JSON. Todo outro
    // ponto do código que lê socialLinks (CampaignResult.tsx,
    // FacebookCampaignCreator.tsx, CompetitorAnalysis.tsx,
    // useCompetitorData.ts) já trata isso com try/catch e cai pra {} —
    // só esta função deixava o erro estourar sem proteção, derrubando a
    // geração de campanha inteira por causa de um campo auxiliar.
    // Correção de 06/10: não estourar continua certo, mas DESCARTAR o texto
    // estava errado. O caminho antigo caía pra `{}` e o `JSON.stringify`
    // abaixo gravava só o whatsapp — apagando do perfil o Instagram e o site
    // que o usuário tinha digitado naquele campo de texto livre. Trocar uma
    // queda de campanha por perda silenciosa de dado do cliente não é
    // conserto.
    //
    // Agora o texto não-JSON é preservado em `textoLivre`. É seguro: nenhum
    // consumidor itera as chaves de socialLinks — todos leem campos nomeados
    // (instagram, facebook, whatsapp) com try/catch próprio, e o
    // PublishValidator faz busca de substring por "wa.me". Uma chave extra
    // não vira link quebrado em nenhuma tela.
    let links: Record<string, unknown> = {};
    if (existingSocialLinks) {
      try {
        const parsed = JSON.parse(existingSocialLinks);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) links = parsed;
        else links = { textoLivre: existingSocialLinks };
      } catch {
        links = { textoLivre: existingSocialLinks };
      }
    }
    contact.socialLinks = JSON.stringify({ ...links, whatsapp: `https://wa.me/${digits}` });
  }
  if (typeof args.destinationUrl === "string" && args.destinationUrl.trim()) {
    const url = new URL(args.destinationUrl.trim());
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Confirme uma URL de destino HTTP ou HTTPS valida.");
    contact.websiteUrl = url.href;
  }
  return contact;
}
