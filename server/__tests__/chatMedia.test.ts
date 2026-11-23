import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  adaptarVideoArquivo, comArquivoTemporario, conferirEspecificacaoMeta, detectarContainerDeVideo, escolherModo, extrairAudio,
  extrairQuadros, ffmpegDisponivel, filtroDeAdaptacao, formatosQueJaServem, interpretarSonda, limitesDeMidia, rotuloDeProporcao,
  sondarBuffer, validarVideoEnviado,
} from "../chatMedia";

const temFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
const opcao = temFfmpeg ? {} : { skip: "ffmpeg/ffprobe indisponivel neste ambiente" };

// Videos de verdade, gerados pelo proprio ffmpeg (nada simulado): padrao de teste + tom de audio.
const dir = mkdtempSync(path.join(os.tmpdir(), "chatmedia-fixtures-"));
function gerar(nome: string, w: number, h: number, seg: number, audio: boolean, extra: string[] = [], ext = "mp4"): Buffer {
  const saida = path.join(dir, `${nome}.${ext}`);
  const args = ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=size=${w}x${h}:rate=25:duration=${seg}`,
    ...(audio ? ["-f", "lavfi", "-i", `sine=frequency=440:duration=${seg}`] : []),
    ...extra, ...(ext === "webm" ? ["-c:v", "libvpx", "-b:v", "500k"] : ["-c:v", "libx264", "-pix_fmt", "yuv420p"]),
    ...(audio ? (ext === "webm" ? ["-c:a", "libopus"] : ["-c:a", "aac"]) : []), "-shortest", saida];
  const r = spawnSync("ffmpeg", args);
  if (r.status !== 0) throw new Error(`fixture ${nome}: ${r.stderr?.toString()}`);
  return readFileSync(saida);
}
test.after(() => rmSync(dir, { recursive: true, force: true }));

test("assinatura do arquivo: reconhece containers e recusa lixo com mime de video", () => {
  assert.equal(detectarContainerDeVideo(Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0])), "mp4");
  assert.equal(detectarContainerDeVideo(Buffer.from([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20, 0, 0, 0, 0])), "mov");
  assert.equal(detectarContainerDeVideo(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from("....B\u0082webm")])), "webm");
  assert.equal(detectarContainerDeVideo(Buffer.from("MZ executavel disfarcado de video.mp4 ........")), null);
  assert.equal(detectarContainerDeVideo(Buffer.alloc(3)), null);
});

test("proporcoes conhecidas e interpretacao da rotacao de video de celular", () => {
  assert.equal(rotuloDeProporcao(1080, 1920), "9:16");
  assert.equal(rotuloDeProporcao(1080, 1350), "4:5");
  assert.equal(rotuloDeProporcao(1000, 1000), "1:1");
  assert.equal(rotuloDeProporcao(1920, 1080), "16:9");
  assert.equal(rotuloDeProporcao(0, 10), "desconhecida");
  const s = interpretarSonda({ streams: [{ codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "30/1", side_data_list: [{ rotation: -90 }] }], format: { duration: "5.0" } });
  assert.deepEqual([s?.largura, s?.altura, s?.rotuloProporcao], [1080, 1920, "9:16"]);
  assert.equal(interpretarSonda({ streams: [{ codec_type: "audio" }] })?.temVideo, false);
});

test("limites sao configuraveis por ambiente e ignoram valores absurdos", () => {
  assert.equal(limitesDeMidia({}).videoBytes, 100 * 1048576);
  assert.equal(limitesDeMidia({ CHAT_MAX_VIDEO_MB: "250" } as any).videoBytes, 250 * 1048576);
  assert.equal(limitesDeMidia({ CHAT_MAX_VIDEO_MB: "999999" } as any).videoBytes, 100 * 1048576);
  assert.equal(limitesDeMidia({ CHAT_MAX_VIDEOS: "abc" } as any).videosPorMensagem, 3);
});

test("modo de adaptacao: corta quando a perda e pequena, preserva quando cortaria muito", () => {
  assert.equal(escolherModo({ proporcao: 1080 / 1350 }, "feed", "auto"), "cortar");
  assert.equal(escolherModo({ proporcao: 16 / 9 }, "stories", "auto"), "preservar");
  assert.equal(escolherModo({ proporcao: 16 / 9 }, "stories", "cortar"), "cortar");
  assert.equal(escolherModo({ proporcao: 1 }, "square", "preservar"), "preservar");
  assert.ok(filtroDeAdaptacao("stories", "preservar").includes("scale=1080:1920:force_original_aspect_ratio=decrease"), "primeiro plano nunca estica: encaixa mantendo a proporcao");
  assert.ok(filtroDeAdaptacao("stories", "cortar").includes("force_original_aspect_ratio=increase"));
  assert.deepEqual(formatosQueJaServem({ proporcao: 9 / 16 }), ["stories"]);
  assert.deepEqual(formatosQueJaServem({ proporcao: 16 / 9 }), []);
});

test("especificacao Meta: aponta proporcao, resolucao e duracao fora do pedido", () => {
  const base = { duracaoS: 20, largura: 1080, altura: 1920, fps: 30, temAudio: true, codecVideo: "h264", codecAudio: "aac", proporcao: 9 / 16, rotuloProporcao: "9:16", temVideo: true };
  assert.equal(conferirEspecificacaoMeta(base, "stories", 5_000_000).ok, true);
  assert.ok(conferirEspecificacaoMeta(base, "stories", 5_000_000).avisos.some((a) => /15s/.test(a)));
  const errado = conferirEspecificacaoMeta({ ...base, largura: 1920, altura: 1080, proporcao: 16 / 9, rotuloProporcao: "16:9" }, "stories", 1000);
  assert.equal(errado.ok, false);
  assert.ok(errado.problemas.some((p) => /Proporção 16:9/.test(p)));
  assert.equal(conferirEspecificacaoMeta({ ...base, duracaoS: 90 }, "stories", 1000).ok, false);
  assert.equal(conferirEspecificacaoMeta({ ...base, largura: 300, altura: 533 }, "stories", 1000).ok, false);
});

test("video real: sonda, quadros e validacao de conteudo", opcao, async () => {
  const mp4 = gerar("paisagem", 1280, 720, 4, true);
  assert.equal(detectarContainerDeVideo(mp4), "mp4");
  const v = await validarVideoEnviado(mp4);
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal(v.sondado, true);
    assert.deepEqual([v.sonda?.largura, v.sonda?.altura, v.sonda?.rotuloProporcao, v.sonda?.temAudio], [1280, 720, "16:9", true]);
    assert.ok((v.sonda?.duracaoS ?? 0) >= 3.8 && (v.sonda?.duracaoS ?? 0) <= 4.3);
  }
  await comArquivoTemporario(mp4, "mp4", async (caminho) => {
    const quadros = await extrairQuadros(caminho, 4, 4);
    assert.equal(quadros.length, 4);
    assert.ok(quadros.every((q) => q.jpeg[0] === 0xff && q.jpeg[1] === 0xd8 && q.jpeg.length > 1000), "quadros JPEG reais");
    assert.equal(new Set(quadros.map((q) => q.jpeg.length)).size > 1, true, "quadros de instantes diferentes");
    const audio = await extrairAudio(caminho);
    assert.ok(audio && audio.length > 1000, "audio extraido");
  });
});

test("arquivo corrompido ou com assinatura falsa e recusado antes de qualquer upload", opcao, async () => {
  const truncado = gerar("trunc", 640, 360, 2, false).subarray(0, 40);
  const r1 = await validarVideoEnviado(truncado);
  assert.equal(r1.ok, false);
  const ftypFalso = Buffer.concat([Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]), Buffer.alloc(500, 7)]);
  const r2 = await validarVideoEnviado(ftypFalso);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.match(r2.erro, /corrompido|não consegui/i);
  const longo = await validarVideoEnviado(gerar("longo", 320, 240, 8, false), { ...limitesDeMidia({}), videoDuracaoMaxS: 5 });
  assert.equal(longo.ok, false);
  const grande = await validarVideoEnviado(gerar("grande", 320, 240, 2, false), { ...limitesDeMidia({}), videoBytes: 1000 });
  assert.equal(grande.ok, false);
});

test("webm tambem e lido pelo conteudo", opcao, async () => {
  const webm = gerar("clip", 640, 360, 2, true, [], "webm");
  assert.equal(detectarContainerDeVideo(webm), "webm");
  const s = await sondarBuffer(webm, "webm");
  assert.equal(s?.temVideo, true);
  assert.equal(s?.temAudio, true);
});

test("adaptacao real: 16:9 vira 9:16, 4:5 e 1:1 sem distorcer e dentro da especificacao", opcao, async () => {
  const origem = gerar("origem169", 1280, 720, 3, true);
  await comArquivoTemporario(origem, "mp4", async (caminho) => {
    const sonda = (await import("../chatMedia")).sondarArquivo;
    const so = await sonda(caminho);
    assert.ok(so);
    for (const formato of ["stories", "feed", "square"] as const) {
      const r = await adaptarVideoArquivo(caminho, so!, formato, "auto");
      assert.ok(!("erro" in r), "erro" in r ? r.erro : "");
      if ("erro" in r) continue;
      assert.equal(r.modoUsado, "preservar", "16:9 para vertical preserva a cena inteira");
      const saida = await sondarBuffer(r.buffer, "mp4");
      const alvo = { stories: [1080, 1920], feed: [1080, 1350], square: [1080, 1080] }[formato];
      assert.deepEqual([saida?.largura, saida?.altura], alvo);
      assert.equal(saida?.temAudio, true, "audio preservado");
      assert.ok(Math.abs((saida?.duracaoS ?? 0) - 3) < 0.5, "duracao preservada");
      assert.equal(saida?.codecVideo, "h264");
      const conf = conferirEspecificacaoMeta(saida!, formato, r.buffer.length);
      assert.equal(conf.ok, true, conf.problemas.join("; "));
    }
    // corte explicito produz o mesmo tamanho final (e nao estica: modo informado vence)
    const cortado = await adaptarVideoArquivo(caminho, so!, "stories", "cortar");
    assert.ok(!("erro" in cortado));
    if (!("erro" in cortado)) assert.equal(cortado.modoUsado, "cortar");
  });
});

test("adaptacao em modo preservar gera quadro vertical valido", opcao, async () => {
  const origem = gerar("origem169b", 1280, 720, 2, false);
  await comArquivoTemporario(origem, "mp4", async (caminho) => {
    const so = await (await import("../chatMedia")).sondarArquivo(caminho);
    const r = await adaptarVideoArquivo(caminho, so!, "stories", "preservar");
    assert.ok(!("erro" in r));
    if ("erro" in r) return;
    const quadros = await comArquivoTemporario(r.buffer, "mp4", (c) => extrairQuadros(c, 2, 1));
    assert.equal(quadros.length, 1);
    // O quadro vertical tem de ser um JPEG valido; a razao 9:16 foi conferida acima pela sonda.
    assert.ok(quadros[0].jpeg.length > 2000);
  });
});

test("video com metadado de rotacao e sondado sem erro", opcao, async () => {
  // 1920x1080 gravado com metadado de rotacao 90 = 1080x1920 na tela.
  const saida = path.join(dir, "rot.mp4");
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=25:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-display_rotation", "90", saida]);
  if (r.status !== 0) { return; }
  const s = await sondarBuffer(readFileSync(saida), "mp4");
  assert.ok(s);
  assert.ok(["9:16", "16:9"].includes(s!.rotuloProporcao));
});

test("ffmpeg disponivel e consistente com o ambiente", async () => {
  assert.equal(await ffmpegDisponivel(), temFfmpeg);
});
