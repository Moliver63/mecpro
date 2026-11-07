import test from "node:test";
import assert from "node:assert/strict";
import { extrairUrlDestino } from "../tiktokDestino";

test("le landing_page_url simples", () => {
  assert.equal(extrairUrlDestino({ landing_page_url: "https://a.com/x" }), "https://a.com/x");
});

test("le lista de URLs (Smart+)", () => {
  assert.equal(
    extrairUrlDestino({ landing_page_urls: [{ landing_page_url: "https://b.com" }] }),
    "https://b.com",
  );
  assert.equal(extrairUrlDestino({ landing_page_url_list: ["https://c.com"] }), "https://c.com");
});

test("acha URL aninhada em criativos", () => {
  assert.equal(
    extrairUrlDestino({ creative_list: [{ creative_info: { landing_page_url: "https://d.com" } }] }),
    "https://d.com",
  );
});

test("usa a primeira fonte que tiver URL", () => {
  assert.equal(extrairUrlDestino({}, { landing_page_url: "https://e.com" }, { landing_page_url: "https://f.com" }), "https://e.com");
});

test("ignora valores que nao sao URL http(s) e nao quebra com null", () => {
  assert.equal(extrairUrlDestino(null, undefined, { landing_page_url: "" }, { landing_page_url: "javascript:alert(1)" }), "");
  assert.equal(extrairUrlDestino({ ad_text: "https://nao-e-campo-de-destino.com" }), "");
});
