import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classificarArquivo, enviarComProgresso, LIMITES_PADRAO, mensagemDeErroDeUpload, separarArquivos, tipoDoArquivo, validarArquivo,
} from "../chatUploads";

const arq = (name: string, type: string, size = 1000, lastModified = 1) => ({ name, type, size, lastModified });

test("classifica fotos e videos pelo tipo, e pela extensao quando o celular entrega type vazio", () => {
  assert.equal(classificarArquivo(arq("a.jpg", "image/jpeg")), "foto");
  assert.equal(classificarArquivo(arq("a.webp", "image/webp")), "foto");
  assert.equal(classificarArquivo(arq("a.mp4", "video/mp4")), "video");
  assert.equal(classificarArquivo(arq("a.mov", "video/quicktime")), "video");
  assert.equal(classificarArquivo(arq("a.webm", "video/webm")), "video");
  assert.equal(classificarArquivo(arq("IMG_0001.MOV", "")), "video", "iPhone/Android com type vazio");
  assert.equal(tipoDoArquivo(arq("x.HEIC", "")), "image/heic");
  assert.equal(classificarArquivo(arq("IMG_1.HEIC", "")), "foto", "HEIC do iPhone e aceito (convertido no servidor)");
  assert.equal(classificarArquivo(arq("doc.pdf", "application/pdf")), null);
  assert.equal(classificarArquivo(arq("foto.gif", "image/gif")), null);
});

test("validacao: tipo, vazio e limites configuraveis, com mensagem clara", () => {
  assert.equal(validarArquivo(arq("a.jpg", "image/jpeg", 5 * 1048576)), null);
  assert.match(validarArquivo(arq("grande.jpg", "image/jpeg", 7 * 1048576))!, /limite é 6MB/);
  assert.match(validarArquivo(arq("v.mp4", "video/mp4", 150 * 1048576))!, /limite é 100MB/);
  assert.equal(validarArquivo(arq("v.mp4", "video/mp4", 150 * 1048576), { ...LIMITES_PADRAO, videoBytes: 200 * 1048576 }), null, "limite do servidor vale");
  assert.match(validarArquivo(arq("a.pdf", "application/pdf"))!, /formato não suportado/);
  assert.match(validarArquivo(arq("a.jpg", "image/jpeg", 0))!, /vazio/);
});

test("selecao mista (fotos + videos): separa, valida, respeita vagas e ignora repetidos", () => {
  const r = separarArquivos([
    arq("a.jpg", "image/jpeg"), arq("b.png", "image/png"), arq("v1.mp4", "video/mp4"), arq("v2.mov", "video/quicktime"),
    arq("a.jpg", "image/jpeg"), // repetido
    arq("nota.pdf", "application/pdf"),
    arq("enorme.mp4", "video/mp4", 500 * 1048576),
  ], { fotos: 10, videos: 3 });
  assert.deepEqual(r.fotos.map((f) => f.name), ["a.jpg", "b.png"]);
  assert.deepEqual(r.videos.map((f) => f.name), ["v1.mp4", "v2.mov"]);
  assert.equal(r.erros.length, 2);
  assert.ok(r.erros.some((e) => /nota\.pdf/.test(e)) && r.erros.some((e) => /enorme\.mp4/.test(e)));
});

test("selecao: corta o excedente de vagas dizendo quantos ficaram de fora; ja anexados nao entram de novo", () => {
  const muitas = Array.from({ length: 5 }, (_, i) => arq(`f${i}.jpg`, "image/jpeg", 100 + i));
  const r = separarArquivos(muitas, { fotos: 2, videos: 1 }, LIMITES_PADRAO, [{ fileName: "f0.jpg", size: 100 }]);
  assert.deepEqual(r.fotos.map((f) => f.name), ["f1.jpg", "f2.jpg"]);
  assert.match(r.erros[0], /2 não foram anexadas/);
  const v = separarArquivos([arq("a.mp4", "video/mp4", 5), arq("b.mp4", "video/mp4", 6)], { fotos: 0, videos: 1 });
  assert.equal(v.videos.length, 1);
  assert.match(v.erros[0], /1 não foi anexado/);
});

function xhrFalso(roteiro: (x: any) => void) {
  const x: any = {
    withCredentials: false, timeout: 0, status: 0, responseText: "", upload: { onprogress: null },
    onload: null, onerror: null, ontimeout: null, onabort: null, abortado: false, aberto: null as any, corpo: null as any,
    open(m: string, u: string) { x.aberto = [m, u]; }, send(b: any) { x.corpo = b; queueMicrotask(() => roteiro(x)); }, abort() { x.abortado = true; x.onabort?.(); },
  };
  return x;
}

test("envio com progresso: reporta porcentagens reais, usa cookies e devolve o JSON do servidor", async () => {
  const pcts: number[] = [];
  const form = new FormData(); form.append("file", new Blob(["x"]), "a.jpg");
  const x = xhrFalso((x) => {
    x.upload.onprogress({ lengthComputable: true, loaded: 25, total: 100 });
    x.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
    x.status = 200; x.responseText = JSON.stringify({ photoUrl: "https://res.cloudinary.com/d/a.jpg" }); x.onload();
  });
  const r = await enviarComProgresso("/api/chat/upload-photo", form, { onProgresso: (p) => pcts.push(p), criarXhr: () => x });
  assert.deepEqual(x.aberto, ["POST", "/api/chat/upload-photo"]);
  assert.equal(x.withCredentials, true);
  assert.equal(x.corpo, form);
  assert.deepEqual(pcts, [25, 99, 100], "99 ate o servidor confirmar, 100 so no sucesso");
  assert.equal(r.status, 200);
  assert.equal(r.data.photoUrl, "https://res.cloudinary.com/d/a.jpg");
});

test("falha de upload simulada: erro do servidor, rede caida, timeout e corpo nao-JSON viram mensagens claras", async () => {
  const f = new FormData();
  const servidor = await enviarComProgresso("/u", f, { criarXhr: () => xhrFalso((x) => { x.status = 400; x.responseText = JSON.stringify({ erro: "O arquivo não parece ser um vídeo válido." }); x.onload(); }) });
  assert.equal(servidor.status, 400);
  assert.equal(mensagemDeErroDeUpload(servidor, "video"), "O arquivo não parece ser um vídeo válido.");

  const rede = await enviarComProgresso("/u", f, { criarXhr: () => xhrFalso((x) => x.onerror()) });
  assert.equal(rede.erroDeRede, true);
  assert.match(mensagemDeErroDeUpload(rede, "foto"), /conexão caiu ao enviar a foto/);

  const tempo = await enviarComProgresso("/u", f, { criarXhr: () => xhrFalso((x) => x.ontimeout()) });
  assert.equal(tempo.erroDeRede, true);

  const proxy = await enviarComProgresso("/u", f, { criarXhr: () => xhrFalso((x) => { x.status = 502; x.responseText = "<html>Bad Gateway</html>"; x.onload(); }) });
  assert.equal(proxy.status, 502);
  assert.match(mensagemDeErroDeUpload(proxy, "video"), /Não foi possível salvar o vídeo agora/);

  assert.match(mensagemDeErroDeUpload({ status: 401, data: {} }, "foto"), /sessão expirou/);
  assert.match(mensagemDeErroDeUpload({ status: 413, data: {} }, "video"), /grande demais/);
  assert.match(mensagemDeErroDeUpload({ status: 429, data: {} }, "foto"), /Muitos envios/);
});

test("envio so resolve uma vez, mesmo com eventos repetidos, e pode ser cancelado (substituir/remover durante o envio)", async () => {
  let cancelar: () => void = () => {};
  const x = xhrFalso(() => {});
  const p = enviarComProgresso("/u", new FormData(), { criarXhr: () => x, sinal: { abortado: false, aoAbortar: (cb) => { cancelar = cb; } } });
  cancelar();
  const r = await p;
  assert.equal(x.abortado, true);
  assert.equal(r.erroDeRede, true);
  x.status = 200; x.responseText = "{}"; x.onload?.();
  assert.equal(r.status, 0, "resultado nao muda depois de resolvido");
});

import { subirAnexo } from "../chatUploads";

test("varias fotos antes de existir conversa: todas caem na MESMA sessao (o servidor cria so a primeira)", async () => {
  let sessao: number | null = null;
  const recebidas: Array<string | null> = [];
  const ctx = {
    sessionId: () => sessao,
    adotarSessao: (id: number) => { sessao = id; },
    criarXhr: () => xhrFalso((x) => {
      const sid = (x.corpo as FormData).get("sessionId");
      recebidas.push(sid === null ? null : String(sid));
      // servidor de mentira com a regra real: sem sessionId valido, cria uma nova (77); com ele, reaproveita
      x.status = 200; x.responseText = JSON.stringify({ photoUrl: `https://res.cloudinary.com/d/${recebidas.length}.jpg`, fileName: "f.jpg", sessionId: sid ? Number(sid) : 77 });
      x.onload();
    }),
  };
  const fotos = [0, 1, 2].map((i) => new File([`img${i}`], `f${i}.jpg`, { type: "image/jpeg" }));
  const resultados = [];
  for (const f of fotos) resultados.push(await subirAnexo("foto", f, ctx));
  assert.deepEqual(recebidas, [null, "77", "77"], "so o primeiro envio vai sem sessao");
  assert.equal(sessao, 77);
  assert.ok(resultados.every((r) => r.ok));
});

test("subirAnexo: falha de servidor/rede devolve erro claro e nao adota sessao; video usa a rota de video", async () => {
  let sessao: number | null = null;
  let rota = "";
  const falha = await subirAnexo("video", new File(["v"], "v.mp4", { type: "video/mp4" }), {
    sessionId: () => sessao, adotarSessao: (i) => { sessao = i; },
    criarXhr: () => { const x = xhrFalso((x) => { x.status = 400; x.responseText = JSON.stringify({ erro: "Vídeo corrompido." }); x.onload(); }); const o = x.open; x.open = (m: string, u: string) => { rota = u; o(m, u); }; return x; },
  });
  assert.deepEqual(falha, { ok: false, erro: "Vídeo corrompido." });
  assert.equal(rota, "/api/chat/upload-video");
  assert.equal(sessao, null);
  const semUrl = await subirAnexo("foto", new File(["f"], "f.jpg", { type: "image/jpeg" }), {
    sessionId: () => null, adotarSessao: () => {}, criarXhr: () => xhrFalso((x) => { x.status = 200; x.responseText = "{}"; x.onload(); }),
  });
  assert.equal(semUrl.ok, false);
  const queda = await subirAnexo("foto", new File(["f"], "f.jpg", { type: "image/jpeg" }), { sessionId: () => null, adotarSessao: () => {}, criarXhr: () => xhrFalso((x) => x.onerror()) });
  assert.equal(queda.ok, false);
  if (!queda.ok) assert.match(queda.erro, /conexão caiu/);
});
