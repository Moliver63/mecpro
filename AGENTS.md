# MecProAI - Regras para agentes

Antes de analisar, corrigir, publicar, testar ou otimizar qualquer fluxo do MecProAI, leia a documentacao operacional do projeto.

Leitura minima obrigatoria no inicio da tarefa:

1. `docs/SYSTEM_MEMORY.md`
2. `docs/FRAMEWORK_EXCELENCIA.md`
3. `docs/MEC_PRO_AI_CURRENT_STATE.md`

Use esses documentos para entender bugs ja corrigidos, regras criticas, estado atual do MCP, publicacao Meta, geracao de criativos, upload de midia, ML-first e guard anti-alucinacao.

Para tarefas focadas, depois da leitura minima faca busca direcionada em `docs/` antes de simplificar um fluxo existente:

```bash
rg -n "termo_do_fluxo|nome_da_funcao|campanha|MCP|Meta|criativo|carrossel|learning|upload" docs
```

Regra pratica: exemplos, memoria e padroes vencedores podem orientar estrutura e estrategia, mas nunca devem emprestar fatos especificos de outra campanha, como preco, endereco, metragem, quantidade de suites, vagas, imagens, oferta ou publico.

Nunca publicar ou republicar na Meta sem confirmacao explicita do usuario.
