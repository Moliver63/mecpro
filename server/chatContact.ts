export function confirmedChatContact(args: Record<string, unknown>, existingSocialLinks?: string | null): { socialLinks?: string; websiteUrl?: string } {
  const contact: { socialLinks?: string; websiteUrl?: string } = {};
  if (typeof args.whatsapp === "string" && args.whatsapp.trim()) {
    let digits = args.whatsapp.replace(/\D/g, "");
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
    if (!/^[1-9]\d{11,14}$/.test(digits)) throw new Error("Confirme o WhatsApp com codigo do pais e DDD.");
    let links: Record<string, unknown> = {};
    if (existingSocialLinks) {
      const parsed = JSON.parse(existingSocialLinks);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Revise os contatos salvos antes de acrescentar o WhatsApp.");
      links = parsed;
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
