import test from "node:test";
import assert from "node:assert/strict";
import { classificarComentario, decidir, montarResposta, semFraseRepetida, primeiroNome, atrasoSugerido } from "../comentariosAutoResposta";

const cfg = { link: "https://shadiahasan.com/autoavaliacao", preco: "R$ 19,90" };

test("classifica os casos principais", () => {
  assert.equal(classificarComentario("Amém gratidão a Deus por tudo"), "elogio");
  assert.equal(classificarComentario("Amem"), "elogio");
  assert.equal(classificarComentario("Quanto custa a aula?"), "preco");
  assert.equal(classificarComentario("Quero participar, como faço?"), "interesse");
  assert.equal(classificarComentario("Tem certificado?"), "duvida");
  assert.equal(classificarComentario("😍😍"), "curto");
  assert.equal(classificarComentario("Isso é golpe"), "critica");
  assert.equal(classificarComentario("Estou com depressão e não aguento mais"), "sensivel");
  assert.equal(classificarComentario("ganhe dinheiro em casa www.site.com"), "spam");
});

test("sensivel e critica escalam e nunca geram resposta automatica", () => {
  for (const texto of ["Perdi meu marido, estou sofrendo muito", "isso é propaganda enganosa"]) {
    const d = decidir({ texto, nomeAutor: "Ana", commentId: "c1", config: cfg });
    assert.equal(d.acao, "escalar");
    assert.equal(d.resposta, undefined);
  }
});

test("elogio nao recebe o link (o caso da Maura)", () => {
  const d = decidir({ texto: "Amém gratidão a Deus por tudo", nomeAutor: "Maura Soares", commentId: "c2", config: cfg });
  assert.equal(d.acao, "responder");
  assert.ok(!d.resposta!.includes("http"));
  assert.ok(d.resposta!.includes("Maura"));
});

test("interesse usa o link configurado; sem link escala", () => {
  const ok = decidir({ texto: "Quero fazer, onde acesso?", nomeAutor: "Neide Sposito", commentId: "c3", config: cfg });
  assert.equal(ok.acao, "responder");
  assert.ok(ok.resposta!.includes(cfg.link));
  const sem = decidir({ texto: "Quero fazer, onde acesso?", nomeAutor: "Neide", commentId: "c3", config: {} });
  assert.equal(sem.acao, "escalar");
});

test("preco so responde com preco configurado, sem inventar", () => {
  const ok = decidir({ texto: "Qual o valor?", nomeAutor: "Rui", commentId: "c4", config: cfg });
  assert.equal(ok.acao, "responder");
  assert.ok(ok.resposta!.includes("R$ 19,90"));
  const sem = decidir({ texto: "Qual o valor?", nomeAutor: "Rui", commentId: "c4", config: { link: cfg.link } });
  assert.equal(sem.acao, "escalar");
});

test("nunca devolve placeholder nem frase repetida", () => {
  for (let i = 0; i < 200; i++) {
    for (const texto of ["Amém", "Como faço para participar?", "Quanto custa?", "Tem vaga?"]) {
      for (const nome of ["Maura Soares", "", "💙"]) {
        const d = decidir({ texto, nomeAutor: nome, commentId: `id${i}`, config: cfg });
        if (d.resposta) {
          assert.ok(!/[{}]/.test(d.resposta), d.resposta);
          assert.ok(semFraseRepetida(d.resposta), d.resposta);
        }
      }
    }
  }
});

test("semFraseRepetida pega o texto duplicado do exemplo real", () => {
  assert.equal(semFraseRepetida("Oi Maura Soares faça sua autoavaliação no link Oi Maura Soares faça sua autoavaliação"), false);
  assert.equal(semFraseRepetida("Faça sua autoavaliação agora. Faça sua autoavaliação agora."), false);
});

test("nao responde a si mesmo nem duas vezes a mesma pessoa", () => {
  assert.equal(decidir({ texto: "Amém", commentId: "x", config: cfg, ehDaPagina: true }).acao, "ignorar");
  assert.equal(decidir({ texto: "Amém", commentId: "x", config: cfg, jaRespondeuPessoa: true }).acao, "ignorar");
});

test("variacao estavel por comentario e atraso entre 2 e 10 minutos", () => {
  const a = montarResposta("elogio", { nome: "Ana" }, "abc");
  assert.equal(a, montarResposta("elogio", { nome: "Ana" }, "abc"));
  const respostas = new Set(Array.from({ length: 50 }, (_, i) => montarResposta("elogio", { nome: "Ana" }, `k${i}`)));
  assert.ok(respostas.size > 1);
  for (let i = 0; i < 50; i++) {
    const s = atrasoSugerido(`k${i}`);
    assert.ok(s >= 120 && s <= 600);
  }
});

test("primeiroNome", () => {
  assert.equal(primeiroNome("MAURA soares"), "Maura");
  assert.equal(primeiroNome("💙"), "");
  assert.equal(primeiroNome(undefined), "");
});
