import test from "node:test";
import assert from "node:assert/strict";
import { confirmedChatContact } from "../chatContact";
import { evaluateCampaignBriefingReadiness } from "../../shared/campaignBriefingReadiness";

test("confirmed WhatsApp survives storage format and satisfies lead readiness", () => {
  const contact = confirmedChatContact({ whatsapp: "(47) 99946-5824", destinationUrl: null }, '{"instagram":"https://instagram.com/example"}');
  const links = JSON.parse(contact.socialLinks!);
  assert.equal(links.whatsapp, "https://wa.me/5547999465824");
  assert.equal(links.instagram, "https://instagram.com/example");
  assert.equal("websiteUrl" in contact, false);
  const report = evaluateCampaignBriefingReadiness({ objective: "leads", budget: 1500, duration: 30 }, {
    companyName: "Example", productService: "Doces", targetAudience: "Clientes locais", ...contact,
  });
  assert.equal(report.requiredMissing.some(issue => issue.field === "lead_destination"), false);
});

test("invalid destination and corrupt stored contacts do not overwrite data", () => {
  assert.throws(() => confirmedChatContact({ destinationUrl: "javascript:alert(1)" }));
  assert.throws(() => confirmedChatContact({ whatsapp: "123" }));
  assert.deepEqual(confirmedChatContact({ destinationUrl: null, whatsapp: null }), {});
});

// Esta asserção ERA `assert.throws(() => confirmedChatContact({ whatsapp:
// "47999465824" }, "not-json"))` e foi trocada de propósito. O título do
// teste — "do not overwrite data" — descreve a preocupação certa, mas
// estourar era a resposta errada pra ela, por um motivo documentado em
// produção:
//
//   Log de 13/09: "Unexpected token 'h', \"https://ww\"... is not valid
//   JSON" derrubava o gerar_campanha INTEIRO. Causa: existe um campo de
//   texto livre em ClientProfile.tsx (placeholder "Ex: Instagram:
//   @suaempresa · Site: https://...") que grava o texto digitado direto em
//   socialLinks, sem codificar como JSON.
//
// Perfil com texto livre é dado legítimo do usuário, não corrupção. Fazer a
// função estourar devolveria a queda de campanha de 13/09.
//
// Só que o caminho antigo também não resolvia o que o título pede: caía pra
// {} e gravava apenas o whatsapp, APAGANDO o Instagram e o site que o
// usuário tinha digitado. Era perda silenciosa de dado do cliente.
//
// A saída que atende os dois lados: não estoura E não perde — preserva o
// texto original em `textoLivre`.
test("socialLinks em texto livre e preservado, nem estoura nem apaga", () => {
  const textoLivre = "Instagram: @exemplo · Site: https://exemplo.com.br";
  const contact = confirmedChatContact({ whatsapp: "47999465824" }, textoLivre);
  const links = JSON.parse(contact.socialLinks!);
  assert.equal(links.whatsapp, "https://wa.me/5547999465824", "o whatsapp confirmado entra");
  assert.equal(links.textoLivre, textoLivre, "e o que o usuario tinha digitado NAO e descartado");

  // JSON valido que nao e objeto (escalar ou array) também preserva, em vez
  // de cair pra {} e apagar.
  for (const armazenado of ["123", '"so-uma-string"', '["a","b"]']) {
    const r = JSON.parse(confirmedChatContact({ whatsapp: "47999465824" }, armazenado).socialLinks!);
    assert.equal(r.textoLivre, armazenado, `${armazenado} precisa ser preservado`);
    assert.equal(r.whatsapp, "https://wa.me/5547999465824");
  }

  // JSON de objeto de verdade continua mesclando normalmente, sem textoLivre.
  const normal = JSON.parse(confirmedChatContact({ whatsapp: "47999465824" }, '{"instagram":"https://instagram.com/x"}').socialLinks!);
  assert.equal(normal.instagram, "https://instagram.com/x");
  assert.equal("textoLivre" in normal, false, "objeto valido nao ganha chave extra");
});
