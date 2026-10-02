# Imagens no chat - 2026-10-02

- gerar_imagem_campanha registrada em Gemini, DeepSeek e no dispatcher
  OpenAI-compativel (Groq, Cloudflare e OpenRouter).
- Reutiliza campaigns.regenerateCreativeImage, um criativo/formato por chamada.
  Verifica propriedade, preserva fotos reais e imagens existentes. Substituicao
  continua na tela da campanha. Nao publica nem muda a capa.
- Endpoint verifica propriedade e usa fatos/segmento salvos na campanha,
  nao o nome da campanha como segmento. Sem snapshot, exige briefing atualizado.
- O resultado nao promete origem IA: o motor pode usar banco de imagens.
- No caminho Pixabay, imagens rejeitadas/em revisao e falhas de validacao
  nao entram no cache nem na biblioteca de aprovadas. Outros fallbacks ainda
  precisam revisao propria; nao se afirma validacao uniforme do motor inteiro.
- Cloud Vision aceita GOOGLE_VISION_API_KEY separado, com fallback para
  GOOGLE_API_KEY, e detecta responses[0].error. Habilitacao/permissoes da API
  dependem da conta Google; nao foram modificadas nem testadas aqui.
- Testes simulados do chat; sem geracao paga ou publicacao real.
