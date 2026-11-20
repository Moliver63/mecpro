import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Cada caller.<grupo>.<procedimento>( do servidor MCP precisa existir no router.
// Quando nao existe, o tRPC so falha na hora da chamada ("No procedure found on path"),
// como aconteceu no upload_creative_video, que apontava para campaigns em vez de integrations.

const ROTA = readFileSync(new URL("../_core/router.ts", import.meta.url), "utf8");
const MCP = readFileSync(new URL("../mcpServer.ts", import.meta.url), "utf8");

function procedimentosPorRouter(fonte: string): Record<string, Set<string>> {
  const mapa: Record<string, Set<string>> = {};
  let atual: string | null = null;
  for (const linha of fonte.split("\n")) {
    const abre = linha.match(/^(?:export )?const (\w+) = router\(\{/);
    if (abre) { atual = abre[1]; mapa[atual] = new Set(); continue; }
    if (/^\}\);/.test(linha)) { atual = null; continue; }
    const proc = atual && linha.match(/^  (\w+): \w*[Pp]rocedure\b/);
    if (proc) mapa[atual!].add(proc[1]);
  }
  return mapa;
}

function gruposDoApp(fonte: string): Record<string, string> {
  const grupos: Record<string, string> = {};
  for (const m of fonte.matchAll(/^  (\w+): (\w+Router),?$/gm)) grupos[m[1]] = m[2];
  return grupos;
}

const ROUTERS = procedimentosPorRouter(ROTA);
const GRUPOS = gruposDoApp(ROTA);
const CHAMADAS = [...new Set([...MCP.matchAll(/caller\.(\w+)\.(\w+)\(/g)].map(m => `${m[1]}.${m[2]}`))];

test("o parser enxerga o router e as chamadas do MCP", () => {
  assert.ok(Object.keys(GRUPOS).length > 10, "grupos do appRouter nao encontrados");
  assert.ok(CHAMADAS.length > 10, "chamadas caller.* nao encontradas no mcpServer");
  assert.ok(ROUTERS.integrationsRouter?.has("uploadVideoToMeta"));
});

test("toda chamada caller.<grupo>.<procedimento> do MCP existe no router", () => {
  const faltando = CHAMADAS.filter(c => {
    const [grupo, proc] = c.split(".");
    const nome = GRUPOS[grupo];
    return !nome || !ROUTERS[nome]?.has(proc);
  });
  assert.deepEqual(faltando, [], `rotas inexistentes chamadas pelo MCP: ${faltando.join(", ")}`);
});

test("upload_creative_video usa integrations.uploadVideoToMeta", () => {
  assert.match(MCP, /caller\.integrations\.uploadVideoToMeta\(/);
  assert.doesNotMatch(MCP, /caller\.campaigns\.uploadVideoToMeta\(/);
});
