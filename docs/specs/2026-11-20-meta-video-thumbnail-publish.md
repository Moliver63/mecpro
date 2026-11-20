# Spec: thumbnail obrigatória em criativo de vídeo Meta

## Problema

`publishToMeta` obtém uma URL de thumbnail do criativo ou da API da Meta e tenta convertê-la em `image_hash`. Se essa conversão falha, a URL continua disponível, mas o `video_data` é enviado sem `image_hash` nem `image_url`. A Graph API recusa o criativo com a mensagem de que um desses campos é obrigatório.

## Mudança

- Preservar a preferência por `image_hash` quando disponível.
- Enviar `image_url` como fallback quando houver URL e não houver hash.
- Se não houver hash nem URL depois das tentativas de resolução existentes, bloquear a montagem do criativo com mensagem clara, em vez de enviar payload inválido à Meta.
- Aplicar no caminho compartilhado `campaigns.publishToMeta`, usado pela tela e pelas orquestrações de chat/MCP.
- Não alterar orçamento, estado ativo/pausado, identidade, idempotência ou outros campos do anúncio.
- Cobrir com teste unitário a prioridade do hash, o fallback de URL e a ausência de ambas.

## Limites

- Nenhuma chamada real à Meta, publicação, deploy ou commit nesta tarefa.
- O resultado esperado é uma mudança local revisável, com teste automatizado.
