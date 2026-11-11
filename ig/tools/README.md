# Ferramentas de conteudo do Instagram @mecproaibrl
- build.py: renderiza posts (imagem/carrossel 1080x1350, Reels 1080x1920 com ffmpeg) a partir da lista POSTS. Estilo: fundo #0B1020, azul #3B82F6, ciano #7DD3FC, fonte Inter. Requer Playwright + /usr/bin/google-chrome + ffmpeg.
- ../schedule.json: calendario. Campos: slug, date, kind (image|carousel|reel), files, urls, caption, status (aguardando_aprovacao | aprovado | publicado).
