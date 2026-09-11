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
  assert.throws(() => confirmedChatContact({ whatsapp: "47999465824" }, "not-json"));
  assert.deepEqual(confirmedChatContact({ destinationUrl: null, whatsapp: null }), {});
});
