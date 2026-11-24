import { test } from "node:test";
import assert from "node:assert/strict";
import { linhasDeMidiaParaBoot, estadoDoBinario } from "../bootMidia";
import { ehSondagemDeProtocoloNovo } from "../mcpProtocolo";

test("boot: ffmpeg real e encontrado e a linha nunca mostra chave", () => {
  const env = { GEMINI_API_KEY: "gem-secreta-123", GROQ_API_KEY: "groq-secreta-456", GOOGLE_API_KEY: "outra-789", PATH: process.env.PATH } as any;
  const linhas = linhasDeMidiaParaBoot(env).join("\n");
  assert.match(linhas, /ffmpeg ✅/);
  assert.match(linhas, /Gemini → Groq/);
  assert.match(linhas, /Groq Whisper ✅/);
  assert.match(linhas, /chaves DIFERENTES/);
  assert.ok(!/secreta|outra-789/.test(linhas), "nenhuma chave no log");
});

test("boot: sem ffmpeg avisa que cortes nao funcionam; sem chaves avisa", () => {
  const linhas = linhasDeMidiaParaBoot({} as any, () => ({ origem: "ausente", versao: null })).join("\n");
  assert.match(linhas, /NAO vai funcionar/);
  assert.match(linhas, /nenhum provedor com chave/);
  assert.match(linhas, /sem GROQ_API_KEY/);
  assert.ok(!/GOOGLE_API_KEY e GEMINI/.test(linhas));
});

test("boot: mesma chave nas duas variaveis do Google aparece como mesma", () => {
  const l = linhasDeMidiaParaBoot({ GOOGLE_API_KEY: "x", GEMINI_API_KEY: "x" } as any, () => ({ origem: "sistema", versao: "7" })).join("\n");
  assert.match(l, /mesma chave ✅/);
});

test("estadoDoBinario diferencia sistema e pacote estatico", () => {
  assert.equal(estadoDoBinario("ffmpeg", process.env, () => "ffmpeg").origem, "sistema");
  assert.equal(estadoDoBinario("ffmpeg", process.env, () => "/nao/existe/ffmpeg").origem, "ausente");
});

test("MCP: 400 para protocolo mais novo e sondagem esperada; outros 4xx continuam alerta", () => {
  assert.equal(ehSondagemDeProtocoloNovo(400, "2026-07-28"), true);
  assert.equal(ehSondagemDeProtocoloNovo(400, "2025-06-18"), false, "versao suportada com 400 e erro de verdade");
  assert.equal(ehSondagemDeProtocoloNovo(400, "1900-01-01"), false, "versao antiga desconhecida continua alerta");
  assert.equal(ehSondagemDeProtocoloNovo(400, ""), false);
  assert.equal(ehSondagemDeProtocoloNovo(401, "2026-07-28"), false);
  assert.equal(ehSondagemDeProtocoloNovo(400, "lixo"), false);
});
