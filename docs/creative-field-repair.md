# Correcao de criativos por campo

Alteracao local Codex, 2026-09-24.

O reparador preserva campos aprovados mesmo quando outro campo da resposta
excede limites ou apresenta alegacao nao confirmada. A tentativa seguinte
prioriza os campos recusados. Midias, capa e ordem nao sao entradas editaveis.
Os limites sao compartilhados pelo schema de reescrita e validador por campo.

A auditoria factual completa continua obrigatoria: validacao isolada nao
autoriza publicacao nem aprova variantes ocultas em bancos de copy.
Uma passada limitada entre cards tenta corrigir headlines e descricoes iguais;
falhas remanescentes nao devem ser apresentadas como campanha pronta.

Este mecanismo nao garante que um provedor esteja disponivel, nao repoe saldo,
nao publica anuncios, nem implementa uma fila persistente de retomada.
Validacao local e deploy devem ser confirmados separadamente.
