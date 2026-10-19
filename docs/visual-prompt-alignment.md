# Visual prompt alignment

Image prompts prioritize the product/service and existing confirmed visual facts
over broad segment defaults. Generated pain/solution copy is no longer used as
evidence for physical details. Property defaults do not assume a furnished luxury
apartment. Transformation and social-proof angles do not request fabricated
before/after scenes or testimonials. Composition does not force people into
product photography.

Image cache identity includes the product context and confirmed visual facts.
Both the first creative and subsequent image batches receive campaign facts.
Commercial property stock searches prioritize the stated property type over a
city mention that previously selected luxury apartment queries.

Limits: these are prompt construction and cache protections, not a guarantee of
visual fidelity. Stock images remain illustrative, not evidence of a real asset.
No reference-conditioned image model, new provider, or publication permission was
added. Live output review and the broader pending media approval issues remain
necessary. Six local prompt/cache/provider-configuration tests passed; no live
image generation was performed.

## 2026-10-07/08 - a proporcao, e o que o prompt faz contra si

### A fidelidade visual tinha um furo maior que o prompt

Este documento tratava construcao de prompt e cache. Enquanto isso, **toda
imagem gerada saia quadrada, nos tres formatos** — o criativo de Stories (9:16)
e o de feed (4:5) recebiam a mesma imagem 1:1 e a Meta cortava por conta
propria, sem saber onde esta o assunto. Nenhum ajuste de prompt compensa isso.

Causa dupla, as duas verificadas: o `flux-1-schnell` nao aceita `width`/`height`
(schema oficial, `additionalProperties: false`) e o upload pro Cloudinary nao
aplicava transformacao, apesar do comentario no codigo afirmar que o tamanho era
normalizado ali. Corrigido por transformacao de entrega (`c_lfill,g_auto`), a
custo zero. Detalhe em [imagens no chat](chat-image-generation.md).

Isso tambem fecha o "Story e Square identicos": nao era cache nem repeticao de
prompt, era a mesma proporcao pedida pros tres.

### A supressao da cena generica continua deliberada

`!hasSpecificSubject && segmentVisual` existe de proposito e ja foi removida por
engano uma vez (02/10), com a justificativa de que parecia descuido. Os defaults
de segmento **inventam cena**: `alimentacao` traz "restaurant warm ambiance,
delivery packaging with steam", e pra quem vende brigadeiro em caixa isso
fabrica restaurante e vapor que nao existem. Quando ha assunto concreto, ele
manda sozinho. Ha teste travando a decisao; se ele quebrar, a pergunta e por que
o assunto concreto desapareceu, nao se a supressao deve sair.

### Os cinco blocos de "NO TEXT" provavelmente causam o texto

Diagnosticado em 07/10, **nao corrigido**. O prompt final contem, nesta ordem:
`noTextPrefix` no inicio, `noTextFix` no meio, "no text area, no reserved
zones", `noTextFix` repetido, e mais um `CF_NO_TEXT_INSTRUCTION` colado pelo
`buildCloudflarePrompt`. Cinco. Com um comentario dizendo "repetido
intencionalmente para reforcar".

O encoder de texto de um modelo de difusao **nao tem negacao**: ele embute os
conceitos presentes nos tokens, e os tokens ali sao "text", "words", "letters",
"typography", "watermark", "logo", "caption", "signs", "numbers". E por isso que
negative prompt existe como entrada separada — e o schnell, destilado de
guidance, nao aceita negative prompt nem CFG, entao nao ha onde colocar isso
corretamente.

Fecha o circulo: o validador reprova em `hasText`. O sistema pode estar gerando
imagem cheia de letra porque o prompt pede letra, e depois reprovando por ter
letra.

**Por que nao foi mexido:** o mecanismo e solido, a magnitude e empirica.
Precisa de 10 geracoes com e 10 sem, contando quantas saem com texto. Trocar o
prompt sem medir e substituir um palpite por outro — e este arquivo existe
justamente porque mexer em prompt de imagem no escuro ja custou caro antes.

### Ainda em portugues

`realBusinessContext` e `visualFacts` — o assunto, a parte que mais importa —
entram crus do briefing em portugues, enquanto o andaime do prompt esta em
ingles. O encoder T5 do FLUX e predominantemente ingles. Traduzir exige chamada
de modelo no caminho de geracao (custo e latencia novos) ou glossario por
segmento (que fabrica termo): decisao de arquitetura, nao ajuste de prompt.

## 19/10 — como o filtro de fatos visuais foi feito pra envelhecer bem

Michel: *"essa alteracao precisa cobrir possiveis situacoes que venham surgir no futuro"*. O pedido apontou uma fraqueza real: eu tinha acabado de trocar uma lista de 4 palavras de imovel (`tipo|caracteristica|mobilia|pavimentos`) por uma lista de 20 palavras de transacao. Lista nova envelhece igual.

### O que decide hoje

Tudo em `server/imageSubjectSafety.ts`, modulo puro com teste de invariante proprio.

**Regra de FORMA — generaliza, nao depende de adivinhar palavra:**
digito, URL, `www.`, dominio, e-mail, @handle e aparte em parenteses. Nunca sao cena, em nenhum segmento, em nenhum briefing futuro.

**Regra de VOCABULARIO — nao generaliza, e so pra prosa transacional:**
dois conjuntos, separados pra manter a historia de cada um. O `comercial` historico, intocado (cada termo tem razao propria, e "materia(l|is) complementar" tem bug documentado atras), e o transacional de 19/10.

**Teto de CARACTERES, nao de contagem.** Seis fatos curtos somam pouco; seis verbosos diluem o assunto inteiro. Briefing futuro tem fato de qualquer tamanho.

**Rotulo sempre sai, sem caso especial.** "tipo: apartamento de dois quartos" vira "apartamento de dois quartos". Eliminou a terceira lista (`VISUAL_EXPLICITO`) e melhorou o prompt.

**Checagem no fato INTEIRO, nao so no rotulo.** "Compre no site oficial", solto, era invisivel pro filtro que olhava so rotulo.

### Tres regras que eu escrevi e descartei no mesmo dia

Registradas porque cada uma teria criado o bug seguinte, e porque a proxima pessoa vai ter as mesmas ideias.

1. **Barrar sigla em CAIXA ALTA** (CNPJ, CPF, PIX). Barraria **"VR"** — o fato que a semana toda tentou fazer chegar na imagem. E CNPJ/CPF morrem de graca: o valor e digito, o rotulo sai, sobra vazio.

2. **Vocabulario largo**: a primeira versao tinha `atendimento`, `suporte`, `canal`, `plataforma`, `valor`, `prazo`, `entrega`, `contato`, `telefone`, `e-mail`, `cnpj`, `cpf`, `inscricao`. O teste de invariante derrubou na hora: **`atendimento` matava "atendimento em VR com acompanhamento"**, cena legitima. "atendimento domiciliar", "plano de aula", "canal de luz": palavra generica em lista de bloqueio bloqueia demais.
   Treze palavras saíram sem perder barreira, por um criterio: **termo cujo VALOR tem forma de identificador nao precisa estar na lista**, porque a regra de forma ja o mata. "Contato: ola@x.com.br" sobra vazio; "Telefone: (11) 99999-0000" sobra vazio.

3. **"Fato de uma palavra nao e cena"**, pra pegar "Plataforma: Hotmart" depois da poda. Derrubada por teste pre-existente: **"Caracteristica: ar-condicionado" e uma palavra e e cena**. Com ela, "churrasqueira", "varanda" e "piscina" morriam tambem. Pelo criterio do proprio pedido ela e PIOR que a palavra que eu tinha tirado — superficie de erro de todo fato visual de um token, contra "plataforma" aparecendo como objeto de cena, que nesse dominio e raro. **Palavra estreita de volta na lista ganha de regra larga.**

### Limite conhecido, declarado

**Marca sem dominio nao e detectavel por forma.** "Plataforma: Hotmart" e barrado por vocabulario; "Diferencial: parceria oficial com a Nike" passa. Marca em prompt de imagem e pedido de logo, e logo em anuncio e problema de compliance.

Nao existe regra determinística pra isso sem lista de marcas, e lista de marcas e exatamente o que envelhece. Fica para o portao visual, que tem `blockers` e reprova logo e material de banco de imagem passado como real. Ha teste afirmando que a Nike passa — se isso mudar, o comentario do modulo muda junto.

### O que faz o teste cobrir o futuro

`imageSubjectSafety.test.ts` nao afirma "a palavra X esta na lista". Afirma **propriedade da saida** sobre um corpus adversarial de 25 briefings de segmentos variados, com rotulos deliberadamente fora do vocabulario:

- nada de digito, URL, dominio, e-mail, @, moeda, `%` ou parentese sai do filtro, qualquer que seja a entrada;
- fato visual de infoproduto, imovel, servico e saude continua chegando.

Um rotulo que ninguem imaginou quebra o teste pela propriedade, nao pela ausencia na lista. Noise inofensivo pode passar (um "ate dias antes" sem numero), e isso e **troca aceita**: a alternativa e lista de palavras uteis, que e o que quebrou pra imovel.
