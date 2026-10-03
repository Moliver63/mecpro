import test from "node:test";
import assert from "node:assert/strict";
import { validateCampaignImage } from "../campaignImageValidator";

test("visual validator handles unavailable, invalid and approved responses without live API", async () => {
  const previous = process.env.IMAGE_VALIDATION_GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.IMAGE_VALIDATION_GEMINI_API_KEY = "test-only";
  try {
    let apiStatus = 403; let responseText = "{}"; const requests: any[] = [];
    globalThis.fetch = (async (url: any, options: any) => {
      requests.push({ url, options });
      if (String(url).startsWith("https://res.cloudinary.com/")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: responseText }] } }] }), { status: apiStatus });
    }) as typeof fetch;
    const url = "https://res.cloudinary.com/test/image.png";
    assert.equal((await validateCampaignImage(url, { segment: "financeiro" })).score, null);
    apiStatus = 200;
    assert.equal((await validateCampaignImage(url, {})).status, "pending_validation");
    responseText = JSON.stringify({ matchesBrief: true, safe: true, hasText: false, quality: 0.9, evidence: "Calculator and documents", issues: [] });
    assert.equal((await validateCampaignImage(url, { segment: "financeiro" })).status, "approved");
    const body = JSON.parse(requests.at(-1).options.body);
    assert.match(body.contents[0].parts[0].text, /financeiro/);
    assert.ok(body.contents[0].parts[1].inlineData.data);
    assert.equal(requests.at(-1).options.headers["x-goog-api-key"], "test-only");
    const count = requests.length;
    assert.equal((await validateCampaignImage("http://localhost/private", {})).status, "pending_validation");
    assert.equal(requests.length, count);
  } finally {
    globalThis.fetch = oldFetch;
    if (previous === undefined) delete process.env.IMAGE_VALIDATION_GEMINI_API_KEY;
    else process.env.IMAGE_VALIDATION_GEMINI_API_KEY = previous;
  }
});
