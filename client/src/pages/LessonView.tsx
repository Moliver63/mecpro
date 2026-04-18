import { useState, useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";

// ─── CATÁLOGO DE AULAS — mesmos dados do CourseDetail ─────────────────────
const ALL_LESSONS: Record<string, any> = {
  // Campanha do Zero
  "m1-1": { title: "Visão geral da plataforma", duration: "12min", courseSlug: "campanha-do-zero-com-mecpro", courseTitle: "Campanha do Zero com MECPro", videoId: "ksalGChpkRE", next: "m1-2", prev: null, content: "<h3>Bem-vindo ao MECPro</h3><p>Nesta aula você terá uma visão completa da plataforma, entendendo como cada módulo se conecta para gerar campanhas profissionais com IA em minutos.</p><h3>O que você vai ver:</h3><ul><li>Dashboard e navegação principal</li><li>Os 5 módulos da plataforma</li><li>Como o fluxo de criação de campanha funciona</li><li>Dicas para tirar o máximo da plataforma</li></ul>" },
  "m1-2": { title: "Criando seu primeiro projeto", duration: "15min", courseSlug: "campanha-do-zero-com-mecpro", courseTitle: "Campanha do Zero com MECPro", videoId: "ksalGChpkRE", next: "m1-3", prev: "m1-1", content: "<h3>Seu primeiro projeto no MECPro</h3><p>Aprenda a criar e configurar um projeto do zero, definindo nome, nicho e objetivos da campanha.</p><ul><li>Criando um novo projeto</li><li>Configurações iniciais</li><li>Definindo o nicho de atuação</li></ul>" },
  "m1-3": { title: "Navegando pelos módulos", duration: "10min", courseSlug: "campanha-do-zero-com-mecpro", courseTitle: "Campanha do Zero com MECPro", videoId: "ksalGChpkRE", next: "m2-1", prev: "m1-2", content: "<h3>Os 5 Módulos do MECPro</h3><p>Conheça em detalhe cada módulo: Perfil do Cliente, Análise de Concorrentes, Inteligência de Mercado, Campanha e Exportação.</p>" },
  "m2-1": { title: "Preenchendo o perfil com IA", duration: "18min", courseSlug: "campanha-do-zero-com-mecpro", courseTitle: "Campanha do Zero com MECPro", videoId: "ksalGChpkRE", next: "m2-2", prev: "m1-3", content: "<h3>Perfil do Cliente com IA</h3><p>A IA do MECPro preenche automaticamente as dores, desejos e comportamentos do seu cliente ideal com base no nicho informado.</p>" },
  "m2-2": { title: "Dores, desejos e objeções", duration: "20min", courseSlug: "campanha-do-zero-com-mecpro", courseTitle: "Campanha do Zero com MECPro", videoId: "ksalGChpkRE", next: "m2-3", prev: "m2-1", content: "<h3>Mapeando a Psicologia do Cliente</h3><p>Entenda as principais dores, desejos e objeções do público-alvo para criar campanhas que realmente convertem.</p>" },
  "m2-3": { title: "Proposta de valor única", duration: "16min", courseSlug: "campanha-do-zero-com-mecpro", courseTitle: "Campanha do Zero com MECPro", videoId: "ksalGChpkRE", next: "m3-1", prev: "m2-2", content: "<h3>Construindo sua Proposta de Valor</h3><p>Aprenda a diferenciar seu produto/serviço com uma proposta única que ressoa com o cliente ideal.</p>" },
  "m3-1": { title: "Analisando concorrentes", duration: "22min", courseSlug: "campanha-do-zero-com-mecpro", courseTitle: "Campanha do Zero com MECPro", videoId: "ksalGChpkRE", next: "e-U9sg6eYqo", prev: "m2-3", content: "<h3>Análise de Concorrentes Automática</h3><p>O MECPro usa 7 camadas para mapear os anúncios e estratégias da concorrência em segundos.</p>" },
  "m3-2": { title: "Gerando a campanha com IA", duration: "25min", courseSlug: "campanha-do-zero-com-mecpro", courseTitle: "Campanha do Zero com MECPro", videoId: "ksalGChpkRE", next: "m3-3", prev: "m3-1", content: "<h3>Geração Automática de Campanha</h3><p>Com um clique, a IA gera copy, segmentação, criativos e estratégia completa de campanha personalizada para o seu nicho.</p>" },
  "m3-3": { title: "Exportando o relatório PDF", duration: "14min", courseSlug: "campanha-do-zero-com-mecpro", courseTitle: "Campanha do Zero com MECPro", videoId: "ksalGChpkRE", next: "m3-4", prev: "m3-2", content: "<h3>Relatório PDF Profissional</h3><p>Exporte a campanha em PDF formatado para apresentar ao cliente com toda a estratégia, criativos e plano de execução.</p>" },
  "m3-4": { title: "Integrando com Meta Ads", duration: "18min", courseSlug: "campanha-do-zero-com-mecpro", courseTitle: "Campanha do Zero com MECPro", videoId: "ksalGChpkRE", next: null, prev: "m3-3", content: "<h3>Publicando no Meta Ads</h3><p>Conecte o MECPro ao Meta Ads e publique a campanha diretamente na plataforma, sem sair do sistema.</p>" },

  // Análise de Concorrentes
  "ac1-1": { title: "Como funciona a análise do MECPro", duration: "18min", courseSlug: "analise-de-concorrentes-ia", courseTitle: "Análise de Concorrentes com IA", videoId: "e-U9sg6eYqo", next: "ac1-2", prev: null, content: "<h3>A Cascata 7 Camadas</h3><p>Entenda como o MECPro usa múltiplas fontes para captar anúncios da concorrência com alta precisão e velocidade.</p><ul><li>Meta Ads Library oficial</li><li>API Graph do Facebook</li><li>Scrapers de backup</li><li>IA para interpretação dos dados</li></ul>" },
  "ac1-2": { title: "API Meta vs. Ads Library", duration: "14min", courseSlug: "analise-de-concorrentes-ia", courseTitle: "Análise de Concorrentes com IA", videoId: "e-U9sg6eYqo", next: "ac1-3", prev: "ac1-1", content: "<h3>Fontes de Dados para Análise</h3><p>Diferenças técnicas entre a API oficial do Meta e a Ads Library pública — quando usar cada uma.</p>" },
  "ac1-3": { title: "Interpretando o Raio-X dos concorrentes", duration: "22min", courseSlug: "analise-de-concorrentes-ia", courseTitle: "Análise de Concorrentes com IA", videoId: "e-U9sg6eYqo", next: "ac2-1", prev: "ac1-2", content: "<h3>Lendo o Raio-X Competitivo</h3><p>Aprenda a interpretar cada seção do relatório de análise de concorrentes gerado pelo MECPro.</p>" },
  "ac2-1": { title: "Identificando padrões nos anúncios", duration: "24min", courseSlug: "analise-de-concorrentes-ia", courseTitle: "Análise de Concorrentes com IA", videoId: "e-U9sg6eYqo", next: "ac2-2", prev: "ac1-3", content: "<h3>Padrões nos Anúncios da Concorrência</h3><p>Como identificar os formatos, copies e CTAs mais usados pelos concorrentes para criar campanhas superiores.</p>" },
  "ac2-2": { title: "IA para gerar insights competitivos", duration: "30min", courseSlug: "analise-de-concorrentes-ia", courseTitle: "Análise de Concorrentes com IA", videoId: "e-U9sg6eYqo", next: "ac2-3", prev: "ac2-1", content: "<h3>Insights com IA</h3><p>Use a IA do MECPro para transformar dados brutos dos concorrentes em estratégias acionáveis de campanha.</p>" },
  "ac2-3": { title: "Campanhas baseadas na análise", duration: "28min", courseSlug: "analise-de-concorrentes-ia", courseTitle: "Análise de Concorrentes com IA", videoId: "e-U9sg6eYqo", next: null, prev: "ac2-2", content: "<h3>Da Análise à Ação</h3><p>Passo a passo para usar os dados coletados para criar campanhas que superam a concorrência.</p>" },

  // Copy com IA
  "cp1-1": { title: "O que é copywriting de conversão", duration: "14min", courseSlug: "copy-com-ia-guia-pratico", courseTitle: "Copy com IA — Guia Prático", videoId: "fJRYFoYE-r4", next: "cp1-2", prev: null, content: "<h3>Copywriting de Conversão</h3><p>Entenda a diferença entre copy genérico e copy que converte, e por que a IA do MECPro é uma virada de jogo.</p><ul><li>Princípios do copywriting persuasivo</li><li>Gatilhos mentais que funcionam</li><li>Como a IA personaliza o copy por nicho</li></ul>" },
  "cp1-2": { title: "Como a IA do MECPro escreve copy", duration: "16min", courseSlug: "copy-com-ia-guia-pratico", courseTitle: "Copy com IA — Guia Prático", videoId: "fJRYFoYE-r4", next: "cp1-3", prev: "cp1-1", content: "<h3>IA e Copywriting</h3><p>Veja como o MECPro usa dados do perfil do cliente para gerar copy altamente personalizado e eficiente.</p>" },
  "cp1-3": { title: "Estrutura AIDA e PAS na prática", duration: "20min", courseSlug: "copy-com-ia-guia-pratico", courseTitle: "Copy com IA — Guia Prático", videoId: "fJRYFoYE-r4", next: "cp2-1", prev: "cp1-2", content: "<h3>AIDA e PAS com IA</h3><p>Atenção, Interesse, Desejo e Ação — como a IA estrutura cada copy usando as frameworks mais eficazes de copywriting.</p>" },
  "cp2-1": { title: "20 fórmulas de headline que convertem", duration: "25min", courseSlug: "copy-com-ia-guia-pratico", courseTitle: "Copy com IA — Guia Prático", videoId: "fJRYFoYE-r4", next: "cp2-2", prev: "cp1-3", content: "<h3>Headlines de Alta Performance</h3><p>As 20 fórmulas mais testadas de headlines para anúncios, e-mails e landing pages — com exemplos reais gerados pelo MECPro.</p>" },
  "cp2-2": { title: "CTAs irresistíveis com IA", duration: "18min", courseSlug: "copy-com-ia-guia-pratico", courseTitle: "Copy com IA — Guia Prático", videoId: "fJRYFoYE-r4", next: "cp2-3", prev: "cp2-1", content: "<h3>Call-to-Action que Converte</h3><p>Aprenda a criar CTAs que geram urgência, clareza e ação imediata nos anúncios.</p>" },
  "cp2-3": { title: "Copy para Facebook e Instagram Ads", duration: "22min", courseSlug: "copy-com-ia-guia-pratico", courseTitle: "Copy com IA — Guia Prático", videoId: "fJRYFoYE-r4", next: "cp3-1", prev: "cp2-2", content: "<h3>Copy para Social Ads</h3><p>Formatos, tamanhos e estratégias de copy específicos para Feed, Stories e Reels do Facebook e Instagram.</p>" },
  "cp3-1": { title: "Sequência de e-mails com IA", duration: "28min", courseSlug: "copy-com-ia-guia-pratico", courseTitle: "Copy com IA — Guia Prático", videoId: "fJRYFoYE-r4", next: "cp3-2", prev: "cp2-3", content: "<h3>E-mail Marketing com IA</h3><p>Monte sequências de nutrição, boas-vindas e recuperação de carrinho com copy gerado pela IA do MECPro.</p>" },
  "cp3-2": { title: "Landing page de alta conversão", duration: "30min", courseSlug: "copy-com-ia-guia-pratico", courseTitle: "Copy com IA — Guia Prático", videoId: "fJRYFoYE-r4", next: null, prev: "cp3-1", content: "<h3>Landing Pages que Convertem</h3><p>Estrutura completa de uma landing page de alta conversão, do headline ao CTA final, com copy gerado por IA.</p>" },

  // Meta Ads
  "ma1-1": { title: "Estrutura: Campanha → Conjunto → Anúncio", duration: "20min", courseSlug: "meta-ads-com-mecpro", courseTitle: "Meta Ads com MECPro", videoId: "j9ZKgKqk_24", next: "ma1-2", prev: null, content: "<h3>Hierarquia do Meta Ads</h3><p>Entenda os 3 níveis do Meta Ads e como cada um impacta o desempenho das campanhas.</p><ul><li>Campanha: define o objetivo</li><li>Conjunto: define público e orçamento</li><li>Anúncio: define o criativo</li></ul>" },
  "ma1-2": { title: "Pixel do Facebook: instalação e eventos", duration: "18min", courseSlug: "meta-ads-com-mecpro", courseTitle: "Meta Ads com MECPro", videoId: "j9ZKgKqk_24", next: "ma1-3", prev: "ma1-1", content: "<h3>Facebook Pixel</h3><p>Como instalar e configurar o Pixel do Facebook para rastrear conversões e criar públicos personalizados.</p>" },
  "ma1-3": { title: "Objetivos de campanha e quando usar", duration: "22min", courseSlug: "meta-ads-com-mecpro", courseTitle: "Meta Ads com MECPro", videoId: "j9ZKgKqk_24", next: "ma2-1", prev: "ma1-2", content: "<h3>Objetivos de Campanha no Meta</h3><p>Leads, Tráfego, Conversões, Alcance — quando e por que usar cada objetivo e como o MECPro os mapeia automaticamente.</p>" },
  "ma2-1": { title: "Configurando Access Token e Ad Account", duration: "15min", courseSlug: "meta-ads-com-mecpro", courseTitle: "Meta Ads com MECPro", videoId: "j9ZKgKqk_24", next: "ma2-2", prev: "ma1-3", content: "<h3>Credenciais Meta no MECPro</h3><p>Passo a passo para conectar sua conta Meta ao MECPro usando Access Token e Ad Account ID.</p>" },
  "ma2-2": { title: "Publicando campanhas direto do MECPro", duration: "25min", courseSlug: "meta-ads-com-mecpro", courseTitle: "Meta Ads com MECPro", videoId: "j9ZKgKqk_24", next: "ma2-3", prev: "ma2-1", content: "<h3>Publicação Automatizada</h3><p>Do criativo ao anúncio publicado em menos de 5 minutos, usando o fluxo completo do MECPro.</p>" },
  "ma2-3": { title: "Upload de imagens e image_hash", duration: "20min", courseSlug: "meta-ads-com-mecpro", courseTitle: "Meta Ads com MECPro", videoId: "j9ZKgKqk_24", next: "ma2-4", prev: "ma2-2", content: "<h3>Imagens no Meta Ads</h3><p>Por que o Meta exige image_hash (não URL), como o MECPro faz o upload automático e garante que os criativos apareçam corretamente.</p>" },
  "ma2-4": { title: "Lead Forms e geração de leads", duration: "28min", courseSlug: "meta-ads-com-mecpro", courseTitle: "Meta Ads com MECPro", videoId: "j9ZKgKqk_24", next: "ma3-1", prev: "ma2-3", content: "<h3>Campanhas de Lead Generation</h3><p>Configure Lead Forms nativos do Facebook e integre com o MECPro para capturar leads sem sair da plataforma.</p>" },
  "ma3-1": { title: "Testes A/B de criativos com IA", duration: "22min", courseSlug: "meta-ads-com-mecpro", courseTitle: "Meta Ads com MECPro", videoId: "j9ZKgKqk_24", next: "ma3-2", prev: "ma2-4", content: "<h3>A/B Testing com IA</h3><p>Como usar a IA do MECPro para criar variações de criativos e identificar o vencedor rapidamente.</p>" },
  "ma3-2": { title: "Remarketing e públicos lookalike", duration: "26min", courseSlug: "meta-ads-com-mecpro", courseTitle: "Meta Ads com MECPro", videoId: "j9ZKgKqk_24", next: "ma3-3", prev: "ma3-1", content: "<h3>Remarketing Avançado</h3><p>Estratégias de remarketing e como criar públicos lookalike de alta qualidade a partir dos dados do MECPro.</p>" },
  "ma3-3": { title: "Interpretando métricas e otimizando", duration: "24min", courseSlug: "meta-ads-com-mecpro", courseTitle: "Meta Ads com MECPro", videoId: "j9ZKgKqk_24", next: null, prev: "ma3-2", content: "<h3>Otimização de Campanhas</h3><p>Quais métricas acompanhar, quando pausar anúncios e como escalar campanhas lucrativas no Meta Ads.</p>" },

  // Relatórios
  "rp1-1": { title: "CPM, CPC, CTR, CPA — o que realmente importa", duration: "20min", courseSlug: "relatorios-pdf-metricas", courseTitle: "Relatórios PDF & Métricas", videoId: "gNQzAqedUTw", next: "rp1-2", prev: null, content: "<h3>Métricas Essenciais de Campanha</h3><p>Entenda o que cada métrica significa, como calcular e quando cada uma é relevante para tomada de decisão.</p><ul><li>CPM: custo por mil impressões</li><li>CPC: custo por clique</li><li>CTR: taxa de cliques</li><li>CPA: custo por aquisição</li></ul>" },
  "rp1-2": { title: "ROAS vs. ROI: diferenças e quando usar", duration: "16min", courseSlug: "relatorios-pdf-metricas", courseTitle: "Relatórios PDF & Métricas", videoId: "gNQzAqedUTw", next: "rp1-3", prev: "rp1-1", content: "<h3>ROAS e ROI na Prática</h3><p>A diferença fundamental entre retorno sobre gasto em anúncios (ROAS) e retorno sobre investimento total (ROI).</p>" },
  "rp1-3": { title: "Funil de conversão e taxas de cada etapa", duration: "18min", courseSlug: "relatorios-pdf-metricas", courseTitle: "Relatórios PDF & Métricas", videoId: "gNQzAqedUTw", next: "rp2-1", prev: "rp1-2", content: "<h3>Funil de Conversão</h3><p>Como mapear e otimizar cada etapa do funil: impressão → clique → visita → lead → venda.</p>" },
  "rp2-1": { title: "Gerando relatório PDF em 1 clique", duration: "14min", courseSlug: "relatorios-pdf-metricas", courseTitle: "Relatórios PDF & Métricas", videoId: "gNQzAqedUTw", next: "rp2-2", prev: "rp1-3", content: "<h3>Relatório PDF com MECPro</h3><p>Gere relatórios profissionais formatados em PDF com logo, métricas e estratégia pronta para o cliente.</p>" },
  "rp2-2": { title: "Exportando para XLSX e Google Sheets", duration: "16min", courseSlug: "relatorios-pdf-metricas", courseTitle: "Relatórios PDF & Métricas", videoId: "gNQzAqedUTw", next: "rp2-3", prev: "rp2-1", content: "<h3>Exportação para Planilhas</h3><p>Como exportar dados de campanha para Excel e Google Sheets para análise avançada.</p>" },
  "rp2-3": { title: "Apresentando resultados para o cliente", duration: "20min", courseSlug: "relatorios-pdf-metricas", courseTitle: "Relatórios PDF & Métricas", videoId: "gNQzAqedUTw", next: "rp2-4", prev: "rp2-2", content: "<h3>Apresentação para o Cliente</h3><p>Como estruturar e apresentar resultados de campanha de forma clara, profissional e convincente.</p>" },
  "rp2-4": { title: "Dashboard de métricas em tempo real", duration: "22min", courseSlug: "relatorios-pdf-metricas", courseTitle: "Relatórios PDF & Métricas", videoId: "gNQzAqedUTw", next: null, prev: "rp2-3", content: "<h3>Dashboard em Tempo Real</h3><p>Configure o painel de acompanhamento de métricas do MECPro para monitorar campanhas em tempo real.</p>" },

  // Google Ads
  "ga1-1": { title: "Estrutura: Customer → Campaign → AdGroup → Ad", duration: "22min", courseSlug: "google-ads-para-negocios", courseTitle: "Google Ads para Negócios", videoId: "1j4DafkNW0Y", next: "ga1-2", prev: null, content: "<h3>Arquitetura do Google Ads</h3><p>Entenda a hierarquia de 4 níveis do Google Ads e como o MECPro automatiza a criação em cada camada.</p><ul><li>Customer: conta raiz</li><li>Campaign: objetivo e orçamento</li><li>AdGroup: segmentação por tema</li><li>Ad: criativo final</li></ul>" },
  "ga1-2": { title: "Tipos de campanha: Search, Display, YouTube, PMax", duration: "25min", courseSlug: "google-ads-para-negocios", courseTitle: "Google Ads para Negócios", videoId: "1j4DafkNW0Y", next: "ga1-3", prev: "ga1-1", content: "<h3>Tipos de Campanha Google</h3><p>Quando usar Search, Display, YouTube e Performance Max — e como o MECPro suporta cada formato.</p>" },
  "ga1-3": { title: "Estratégias de lance: CPA, ROAS, Maximizar", duration: "20min", courseSlug: "google-ads-para-negocios", courseTitle: "Google Ads para Negócios", videoId: "1j4DafkNW0Y", next: "ga2-1", prev: "ga1-2", content: "<h3>Estratégias de Lance Automático</h3><p>Como configurar CPA alvo, ROAS alvo e Maximizar Conversões no Google Ads via MECPro.</p>" },
  "ga2-1": { title: "Obtendo Developer Token e credenciais OAuth", duration: "18min", courseSlug: "google-ads-para-negocios", courseTitle: "Google Ads para Negócios", videoId: "1j4DafkNW0Y", next: "ga2-2", prev: "ga1-3", content: "<h3>Credenciais Google Ads</h3><p>Passo a passo para solicitar Developer Token, configurar OAuth 2.0 e conectar ao MECPro.</p>" },
  "ga2-2": { title: "Publicando campanha Search com MECPro", duration: "28min", courseSlug: "google-ads-para-negocios", courseTitle: "Google Ads para Negócios", videoId: "1j4DafkNW0Y", next: "ga2-3", prev: "ga2-1", content: "<h3>Campanha Search Automatizada</h3><p>Do briefing ao anúncio publicado no Google Search em minutos, usando a integração MECPro + Google Ads API v16.</p>" },
  "ga2-3": { title: "Keywords e negativas geradas por IA", duration: "24min", courseSlug: "google-ads-para-negocios", courseTitle: "Google Ads para Negócios", videoId: "1j4DafkNW0Y", next: "ga2-4", prev: "ga2-2", content: "<h3>Palavras-chave com IA</h3><p>Como o MECPro gera listas de keywords positivas e negativas otimizadas para o seu nicho.</p>" },
  "ga2-4": { title: "Responsive Search Ads com IA", duration: "22min", courseSlug: "google-ads-para-negocios", courseTitle: "Google Ads para Negócios", videoId: "1j4DafkNW0Y", next: "ga3-1", prev: "ga2-3", content: "<h3>RSA — Responsive Search Ads</h3><p>Crie anúncios responsivos com múltiplos títulos e descrições gerados pela IA do MECPro.</p>" },
  "ga3-1": { title: "Quality Score e como melhorar", duration: "20min", courseSlug: "google-ads-para-negocios", courseTitle: "Google Ads para Negócios", videoId: "1j4DafkNW0Y", next: "ga3-2", prev: "ga2-4", content: "<h3>Quality Score</h3><p>O que é, como é calculado e as estratégias para melhorar o índice de qualidade e reduzir CPC.</p>" },
  "ga3-2": { title: "Análise de termos de pesquisa", duration: "18min", courseSlug: "google-ads-para-negocios", courseTitle: "Google Ads para Negócios", videoId: "1j4DafkNW0Y", next: "ga3-3", prev: "ga3-1", content: "<h3>Search Terms Report</h3><p>Como analisar os termos de pesquisa reais, identificar oportunidades e adicionar negativas estratégicas.</p>" },

  // Estratégia de Social Media com IA
  "sm1-1": { title: "Calendário editorial completo com IA", duration: "18min", courseSlug: "estrategia-social-media-ia", courseTitle: "Estratégia de Social Media com IA", videoId: "6MrtqjK8-iU", next: "sm1-2", prev: null, content: "<h3>Social Media com IA</h3><p>Monte um calendário editorial completo para LinkedIn, Instagram, Facebook e TikTok usando o MECPro.</p>" },
  "sm1-2": { title: "30 dias de conteúdo gerado automaticamente", duration: "17min", courseSlug: "estrategia-social-media-ia", courseTitle: "Estratégia de Social Media com IA", videoId: "6MrtqjK8-iU", next: "sm1-3", prev: "sm1-1", content: "<h3>Calendário de 30 Dias</h3><p>O MECPro gera um calendário editorial completo baseado no perfil do cliente e nas tendências do nicho.</p>" },
  "sm1-3": { title: "Scripts para Reels e TikTok com IA", duration: "16min", courseSlug: "estrategia-social-media-ia", courseTitle: "Estratégia de Social Media com IA", videoId: "6MrtqjK8-iU", next: null, prev: "sm1-2", content: "<h3>Scripts para Vídeos Curtos</h3><p>Gere scripts completos com hook, desenvolvimento e CTA para Reels e TikTok com o MECPro.</p>" },

  // E-commerce com IA
  "ec1-1": { title: "MECPro para e-commerce: visão geral", duration: "18min", courseSlug: "ecommerce-ia", courseTitle: "E-commerce com IA", videoId: "JO-nJoa4it8", next: "ec1-2", prev: null, content: "<h3>E-commerce com IA</h3><p>Aplique o MECPro para e-commerces: análise de sazonalidade, remarketing avançado e aumento de ticket médio.</p>" },
  "ec1-2": { title: "Sazonalidade e calendário de campanhas", duration: "17min", courseSlug: "ecommerce-ia", courseTitle: "E-commerce com IA", videoId: "JO-nJoa4it8", next: "ec1-3", prev: "ec1-1", content: "<h3>Sazonalidade no E-commerce</h3><p>O MECPro analisa os padrões de sazonalidade e cria um calendário de campanhas para os picos de venda.</p>" },
  "ec1-3": { title: "Remarketing e recuperação de vendas perdidas", duration: "17min", courseSlug: "ecommerce-ia", courseTitle: "E-commerce com IA", videoId: "JO-nJoa4it8", next: "ec1-4", prev: "ec1-2", content: "<h3>Remarketing para E-commerce</h3><p>Configure sequências de remarketing para recuperar carrinhos abandonados e visitantes que não compraram.</p>" },
  "ec1-4": { title: "Aumentando o ticket médio com IA", duration: "16min", courseSlug: "ecommerce-ia", courseTitle: "E-commerce com IA", videoId: "JO-nJoa4it8", next: null, prev: "ec1-3", content: "<h3>Ticket Médio com IA</h3><p>Estratégias de upsell e cross-sell geradas pela IA do MECPro para aumentar o valor médio por pedido.</p>" },
  "ga3-3": { title: "Relatórios de conversão e ROAS", duration: "22min", courseSlug: "google-ads-para-negocios", courseTitle: "Google Ads para Negócios", videoId: "1j4DafkNW0Y", next: null, prev: "ga3-2", content: "<h3>Conversões e ROAS no Google Ads</h3><p>Configure rastreamento de conversões, analise o ROAS por campanha e escale os grupos mais lucrativos.</p>" },
};

// ─── PLAYER DE VÍDEO YOUTUBE ─────────────────────────────────────────────
function YoutubePlayer({ videoId, onEnd }: { videoId: string; onEnd?: () => void }) {
  return (
    <div style={{ position: "relative", width: "100%", paddingBottom: "56.25%", borderRadius: 14, overflow: "hidden", background: "#000" }}>
      <iframe
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
        src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&autoplay=1`}
        title="Videoaula"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────
export default function LessonView() {
  const [location, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const lessonId = params?.id ?? "m1-1";

  // Extrair courseSlug da query string
  const courseSlug = new URLSearchParams(location.split("?")[1] ?? "").get("course")
    ?? ALL_LESSONS[lessonId]?.courseSlug
    ?? "";

  const lesson = ALL_LESSONS[lessonId];
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [markedDone, setMarkedDone] = useState(false);
  const [showDoneToast, setShowDoneToast] = useState(false);

  // tRPC — buscar progresso e marcar aula
  const { data: progressData = [], refetch } = (trpc as any).academy?.getCourseProgress?.useQuery?.(
    { courseSlug }, { enabled: !!courseSlug }
  ) ?? { data: [], refetch: () => {} };

  const completeLessonMutation = (trpc as any).academy?.completeLesson?.useMutation?.({
    onSuccess: () => { refetch?.(); setShowDoneToast(true); setTimeout(() => setShowDoneToast(false), 3000); },
  }) ?? { mutate: () => {}, isLoading: false };

  const completedIds = new Set((progressData as any[]).filter(p => p.completed).map((p: any) => p.lessonId));
  const isAlreadyDone = completedIds.has(lessonId);

  // Aulas do curso atual para sidebar
  const courseLessons = Object.values(ALL_LESSONS).filter(l => l.courseSlug === courseSlug);

  // Reset ao trocar de aula
  useEffect(() => { setMarkedDone(false); }, [lessonId]);

  function handleComplete() {
    setMarkedDone(true);
    completeLessonMutation.mutate?.({ courseSlug, lessonId });
  }

  if (!lesson) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "white" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
          <p style={{ fontSize: 16, marginBottom: 20 }}>Aula não encontrada</p>
          <button onClick={() => setLocation("/academy")}
            style={{ background: "#8b5cf6", color: "white", border: "none", borderRadius: 10, padding: "10px 24px", cursor: "pointer", fontWeight: 700 }}>
            ← Voltar ao Academy
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", flexDirection: "column" }}>

      {/* ── TOAST ── */}
      {showDoneToast && (
        <div style={{ position: "fixed", top: 20, right: 20, background: "#16a34a", color: "white", borderRadius: 12, padding: "14px 20px", fontWeight: 700, fontSize: 14, zIndex: 999, boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
          ◎ Aula marcada como concluída!
        </div>
      )}

      {/* ── TOP BAR ── */}
      <div style={{ background: "#1e293b", borderBottom: "1px solid #334155", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={() => setLocation(`/courses/${courseSlug}`)}
            style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            ← {lesson.courseTitle}
          </button>
          <div style={{ width: 1, height: 20, background: "#334155" }} />
          <div>
            <p style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 2 }}>{lesson.courseTitle}</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: "white" }}>{lesson.title}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Progresso do curso */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 120, height: 6, background: "#334155", borderRadius: 3 }}>
              <div style={{ height: "100%", width: `${courseLessons.length > 0 ? Math.round((completedIds.size / courseLessons.length) * 100) : 0}%`, background: "#10b981", borderRadius: 3, transition: "width .3s" }} />
            </div>
            <span style={{ fontSize: 11, color: "#64748b" }}>{completedIds.size}/{courseLessons.length}</span>
          </div>
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ background: "#334155", border: "none", color: "#94a3b8", cursor: "pointer", padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
            {sidebarOpen ? "Ocultar grade" : "Ver grade"}
          </button>
        </div>
      </div>

      {/* ── CONTEÚDO ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Player + texto */}
        <div style={{ flex: 1, overflowY: "auto", padding: "36px 48px" }}>

          {/* Player de vídeo */}
          {lesson.videoId ? (
            <div style={{ marginBottom: 28 }}>
              <YoutubePlayer videoId={lesson.videoId} />
            </div>
          ) : (
            <div style={{
              background: "#1e293b", borderRadius: 16, aspectRatio: "16/9",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 28, border: "1px solid #334155",
            }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
                <p style={{ color: "#64748b", fontSize: 14, fontWeight: 600 }}>Vídeo disponível apenas no plano PRO</p>
                <button onClick={() => setLocation("/pricing")}
                  style={{ marginTop: 12, background: "#7c3aed", color: "white", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                  Ver planos →
                </button>
              </div>
            </div>
          )}

          {/* Info da aula */}
          <div style={{ maxWidth: 780 }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ background: "#1e293b", color: "#94a3b8", fontSize: 12, padding: "4px 12px", borderRadius: 8 }}>🕐 {lesson.duration}</span>
              {(isAlreadyDone || markedDone) && (
                <span style={{ background: "#16a34a", color: "white", fontSize: 11, padding: "4px 10px", borderRadius: 8, fontWeight: 700 }}>◎ Concluída</span>
              )}
            </div>

            <h1 style={{ fontFamily: "var(--font-display, sans-serif)", fontSize: 24, fontWeight: 800, color: "white", marginBottom: 24 }}>
              {lesson.title}
            </h1>

            {/* Conteúdo da aula */}
            <div style={{ background: "#1e293b", borderRadius: 14, padding: "24px 28px", border: "1px solid #334155", color: "#e2e8f0", fontSize: 14, lineHeight: 1.9, marginBottom: 28 }}
              dangerouslySetInnerHTML={{ __html: lesson.content }}
            />

            {/* Ações */}
            <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 10 }}>
                {lesson.prev && (
                  <button onClick={() => setLocation(`/lesson/${lesson.prev}?course=${courseSlug}`)}
                    style={{ background: "#1e293b", border: "1px solid #334155", color: "#94a3b8", borderRadius: 10, padding: "10px 20px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                    ← Anterior
                  </button>
                )}
                {lesson.next && (
                  <button onClick={() => setLocation(`/lesson/${lesson.next}?course=${courseSlug}`)}
                    style={{ background: "#7c3aed", border: "none", color: "white", borderRadius: 10, padding: "10px 20px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                    Próxima aula →
                  </button>
                )}
                {!lesson.next && (
                  <button onClick={() => setLocation(`/courses/${courseSlug}`)}
                    style={{ background: "#10b981", border: "none", color: "white", borderRadius: 10, padding: "10px 20px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                    🏆 Concluir curso →
                  </button>
                )}
              </div>

              {/* Botão marcar como concluída */}
              {!isAlreadyDone && !markedDone ? (
                <button onClick={handleComplete}
                  disabled={completeLessonMutation.isLoading}
                  style={{ background: "#16a34a", border: "none", color: "white", borderRadius: 10, padding: "10px 20px", cursor: "pointer", fontSize: 13, fontWeight: 700, opacity: completeLessonMutation.isLoading ? 0.7 : 1 }}>
                  {completeLessonMutation.isLoading ? "Salvando..." : "◎ Marcar como concluída"}
                </button>
              ) : (
                <span style={{ color: "#10b981", fontSize: 13, fontWeight: 700 }}>◎ Aula concluída</span>
              )}
            </div>
          </div>
        </div>

        {/* ── SIDEBAR ── */}
        {sidebarOpen && (
          <div style={{ width: 300, background: "#1e293b", borderLeft: "1px solid #334155", overflowY: "auto", flexShrink: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 20px", borderBottom: "1px solid #334155" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 4 }}>Conteúdo do curso</p>
              <p style={{ fontSize: 11, color: "#64748b" }}>{completedIds.size} de {courseLessons.length} aulas concluídas</p>
              {/* Mini barra de progresso */}
              <div style={{ marginTop: 8, height: 4, background: "#334155", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${courseLessons.length > 0 ? Math.round((completedIds.size / courseLessons.length) * 100) : 0}%`, background: "#10b981", borderRadius: 2, transition: "width .3s" }} />
              </div>
            </div>
            {courseLessons.map((item, idx) => {
              const isCurrent = item.id === lessonId || Object.keys(ALL_LESSONS).find(k => ALL_LESSONS[k] === item) === lessonId;
              const itemId = Object.keys(ALL_LESSONS).find(k => ALL_LESSONS[k] === item) ?? "";
              const isDone = completedIds.has(itemId);
              return (
                <div key={itemId}
                  onClick={() => setLocation(`/lesson/${itemId}?course=${courseSlug}`)}
                  style={{
                    padding: "12px 16px", borderBottom: "1px solid #2d3748", cursor: "pointer",
                    display: "flex", gap: 10, alignItems: "flex-start",
                    background: itemId === lessonId ? "#0f172a" : "transparent",
                    borderLeft: itemId === lessonId ? "3px solid #8b5cf6" : "3px solid transparent",
                  }}
                  onMouseEnter={e => { if (itemId !== lessonId) e.currentTarget.style.background = "#0f172a"; }}
                  onMouseLeave={e => { if (itemId !== lessonId) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }}>
                    {isDone ? "◎" : itemId === lessonId ? "▶️" : "⭕"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, color: itemId === lessonId ? "white" : "#94a3b8", fontWeight: itemId === lessonId ? 700 : 400, lineHeight: 1.4, marginBottom: 3 }}>
                      {idx + 1}. {item.title}
                    </p>
                    <p style={{ fontSize: 11, color: "#4b5563" }}>{item.duration}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}