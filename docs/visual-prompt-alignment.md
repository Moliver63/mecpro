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
