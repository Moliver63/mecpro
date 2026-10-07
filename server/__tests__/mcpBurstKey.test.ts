import test, { before } from "node:test";
import assert from "node:assert/strict";

// publicApi.ts puxa a cadeia de validacao de env no load do modulo
// (db.ts → _core/env.ts exige DATABASE_URL/JWT_SECRET/SESSION_SECRET).
// Mesma convencao de chatPrecision.test.ts e campaignPublish.test.ts: envs
// minimos num `before` e import dinamico depois. O que se testa aqui e puro
// e nao toca banco nem rede.
let chaveDeRajadaMcp: typeof import("../publicApi").chaveDeRajadaMcp;
before(async () => {
  process.env.DATABASE_URL   ??= "postgres://localhost:5432/mecpro_test";
  process.env.JWT_SECRET     ??= "mcp-burst-key-test-secret-0123456789";
  process.env.SESSION_SECRET ??= "mcp-burst-key-test-secret-0123456789";
  ({ chaveDeRajadaMcp } = await import("../publicApi"));
});

const req = (campos: Record<string, unknown>) => campos as any;

// Achado real (boot de producao, 06/10): ERR_ERL_KEY_GEN_IPV6 — "Custom
// keyGenerator appears to use request IP without calling the ipKeyGenerator
// helper function for IPv6 addresses. This could allow IPv6 users to bypass
// limits."
test("IPv6 e colapsado em prefixo, senao o limite de rajada nao limita nada", () => {
  // Dois enderecos diferentes da MESMA faixa delegada. Com `req.ip` cru,
  // cada um seria uma chave separada e o cliente passaria por cima do
  // limite de 30/min so trocando o ultimo bloco — de graca, porque o
  // prefixo inteiro e dele.
  const a = chaveDeRajadaMcp(req({ ip: "2001:db8:85a3:8d3:1319:8a2e:370:7348" }));
  const b = chaveDeRajadaMcp(req({ ip: "2001:db8:85a3:8d3::ffff" }));
  assert.equal(a, b, "enderecos da mesma faixa precisam cair no MESMO balde");
  assert.notEqual(a, "2001:db8:85a3:8d3:1319:8a2e:370:7348", "nao pode ser o IP cru");
  assert.match(a, /\/\d+$/, "a chave de IPv6 e um prefixo de sub-rede");

  // Faixa diferente continua sendo balde diferente — senao o limiter
  // puniria clientes sem relacao entre si.
  assert.notEqual(a, chaveDeRajadaMcp(req({ ip: "2600:1f14:abc:de00::1" })));
});

test("IPv4 continua sendo chaveado pelo proprio endereco", () => {
  assert.equal(chaveDeRajadaMcp(req({ ip: "203.0.113.42" })), "203.0.113.42");
  assert.notEqual(
    chaveDeRajadaMcp(req({ ip: "203.0.113.42" })),
    chaveDeRajadaMcp(req({ ip: "203.0.113.43" })),
  );
});

// O caminho que de fato roda em producao: o limiter vem DEPOIS do
// authApiKey, que sempre preenche req.apiUser antes do next().
test("usuario autenticado e chaveado por id, nunca por IP", () => {
  const mesmoIp = { ip: "2001:db8:85a3:8d3::1" };
  assert.equal(chaveDeRajadaMcp(req({ ...mesmoIp, apiUser: { id: 7 } })), "mcp_user_7");

  // Dois usuarios atras do MESMO IP (cliente MCP compartilhado, que e
  // exatamente o cenario citado no comentario do limiter) precisam de
  // baldes separados — senao um consome a cota do outro.
  assert.notEqual(
    chaveDeRajadaMcp(req({ ...mesmoIp, apiUser: { id: 7 } })),
    chaveDeRajadaMcp(req({ ...mesmoIp, apiUser: { id: 8 } })),
  );

  // E o mesmo usuario de IPs diferentes compartilha o balde, que e o ponto
  // de chavear por usuario.
  assert.equal(
    chaveDeRajadaMcp(req({ ip: "203.0.113.1", apiUser: { id: 7 } })),
    chaveDeRajadaMcp(req({ ip: "2001:db8::9", apiUser: { id: 7 } })),
  );
});

test("sem id e sem ip cai em chave fixa, sem estourar", () => {
  assert.equal(chaveDeRajadaMcp(req({})), "unknown");
  assert.equal(chaveDeRajadaMcp(req({ ip: undefined, apiUser: {} })), "unknown");
  // apiUser sem id nao vira "mcp_user_undefined".
  assert.equal(chaveDeRajadaMcp(req({ ip: "203.0.113.5", apiUser: { plan: "pro" } })), "203.0.113.5");
});
