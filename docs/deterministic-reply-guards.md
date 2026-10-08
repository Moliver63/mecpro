# Travas deterministicas na resposta do chat

## Por que existem

Tres incidentes independentes, em dez dias, com o mesmo formato: **a instrucao
existia** — no system prompt ou no proprio retorno da ferramenta — **e nao foi
seguida**. O modelo narrou a regra, ou resumiu o dado, em vez de usar.

| Data | O que o usuario recebeu | Onde a instrucao estava |
|---|---|---|
| 30/09 | "preciso do pageId da sua pagina Meta (ex: 123456789012345). Se nao, use `consultar_paginas_meta` para lista-lo." | prompt: chamar a ferramenta primeiro, nunca pedir id, nunca citar nome de ferramenta |
| 05-06/10 | "status: `queued`. O processo e automatico e leva 10-15 minutos. Aguarde." | retorno da ferramenta: `estado.filaVaiAgir: false` e `estado.destravar` com a acao |
| 08/10 | "os projetos disponiveis incluem opcoes de imoveis, como 'Morebem Imoveis — Sala Comercial Rua 902' e outros" | retorno da ferramenta: `projects:[{id,name,url}]` + "Apresente os nomes reais retornados, nunca peca IDs" |

O caso de 06/10 e o decisivo. Em 05/10 a correcao foi **de contrato**: dar ao
modelo o dado que faltava (`estado`, com `filaVaiAgir` deterministico), porque
o teto de tentativas era regra invisivel do SELECT do worker. Era necessaria.
Em 06/10, **com essa correcao em producao**, o chat afirmou o contrario do
`estado` que tinha recebido — verificado que `chat.ts` serializa o resultado
inteiro com `JSON.stringify`, sem filtrar campo nenhum.

Conclusao, agora com tres pontos e nao um: **instrucao no prompt nao e
garantia.** Dar o dado certo e necessario e nao e suficiente. O que chega ao
usuario precisa de trava.

## As tres camadas, e por que nao sao redundantes

Elas parecem fazer a mesma coisa e nao fazem. Antes de "simplificar" qualquer
uma, leia o que ela cobre.

| Modulo | Cobre | Como obtem a verdade |
|---|---|---|
| `metaPageResolution.ts` | **resolucao**: decide a Pagina sozinho em vez de pedir id | logica pura, sem prompt no caminho |
| `chatMetaPageReply.ts` | **texto**: conserta a resposta quando o modelo pede o id mesmo assim | re-consulta a Meta |
| `chatImageReply.ts` | **texto**: conserta afirmacao falsa sobre o estado das imagens | `AsyncLocalStorage` do turno |
| `chatProjectReply.ts` | **texto**: conserta lista de projetos escamoteada | `AsyncLocalStorage` do turno |

A primeira e de resolucao, as outras de texto. E `4ca3c98` mostra as duas
cooperando: `chatAdsTools.ts` **importa** `resolverPaginaMetaComLista` e amarra
confirmacao e execucao ao mesmo destino resolvido — nao duplica a logica.

## O desenho, se precisar de uma quarta

1. **A verdade vem do turno, nao de uma nova consulta.** `chatImageReply` e
   `chatProjectReply` recebem o que a ferramenta devolveu **naquele turno**, via
   `AsyncLocalStorage` aberto junto do `adsTurn`. Sem round-trip extra, e o
   texto e comparado com exatamente o que o modelo viu. (`chatMetaPageReply` e
   mais antigo e re-consulta; funciona, mas e o padrao menos bom.)

2. **`AsyncLocalStorage`, nunca variavel de modulo.** O servidor atende varios
   usuarios ao mesmo tempo; um objeto compartilhado vazaria a campanha ou a
   lista de projetos de um usuario pro turno de outro. Os dois modulos novos tem
   teste com dois turnos em paralelo garantindo isso.

3. **Registrar num ponto unico.** Os tres sitios de despacho de ferramenta (laco
   do Gemini e os dois dos outros provedores) passam pela mesma funcao —
   `consultarOuAtualizar` no caso dos projetos. Registrar ali cobre os tres e
   nao da pra divergir quando alguem mexer num deles.

4. **Gatilho estreito: so intervir quando a afirmacao e FALSA.** Nao quando e
   suspeita. `chatImageReply` com `filaVaiAgir: true` deixa "aguarde" passar
   intacto, porque ali aguardar esta certo. `chatProjectReply` so morde com
   marcador de vagueza ("e outros", "alguns projetos", "etc") E 2+ projetos na
   lista. **Uma trava que reescreve texto correto e pior que a ausencia dela** —
   os dois modulos tem teste dedicado pra essa metade.

5. **Encaixar no mesmo seam.** Todas correm na funcao `finish` do router de
   chat, em sequencia, logo antes de persistir e responder.

6. **Fixture verbatim.** O texto real que o chat produziu entra no teste como
   constante, com a data. Nao parafraseado: a regressao e reconhecida pelo que
   de fato apareceu na tela do usuario.

## Limites

Isto conserta o que chega ao usuario, nao o raciocinio do modelo. A trava nao
sabe se a resposta esta boa — sabe se ela contradiz um dado que o sistema tem
na mao. Afirmacao errada sobre algo que nenhuma ferramenta devolveu naquele
turno passa, e vai continuar passando.

O custo e substituir o texto do modelo, perdendo nuance que ele poderia ter
acertado no resto da resposta. Por isso o gatilho estreito: na duvida, nao
intervir.
