import json, os
src = open(os.path.join(os.path.dirname(__file__), "build.py")).read().split("POSTS = [")[0]
exec(src)
def FX(l,t): return f"<div class='fix'><b>{l}</b><span>{t}</span></div>"
H2 = "#metaads #trafegopago #marketingdigital #parceria #mecproai"
slides = [
 "<div class='tag'>Programa de parceiros</div><h1>Quem pode <span class='hl'>indicar a MecProAI</span> e receber comissão?</h1><p>Se você fala com dono de negócio, já pode participar.</p><div class='cta ghost'>Arrasta pro lado →</div>",
 "<div class='num'>01</div><h2>Gestor de tráfego</h2><p>Você já atende clientes que anunciam no Meta.</p>"+FX("Na prática","Indique a plataforma para quem você já conhece."),
 "<div class='num'>02</div><h2>Profissional de marketing</h2><p>Agência, consultor ou freelancer que conversa com donos de negócio todo dia.</p>"+FX("Na prática","Indicar é parte da conversa que você já tem."),
 "<div class='num'>03</div><h2>Criador de conteúdo</h2><p>Quem ensina ou fala sobre anúncios e marketing para um público de empreendedores.</p>"+FX("Na prática","Mostre a plataforma para a sua audiência."),
 "<div class='tag'>Como a comissão funciona</div><h2>10% da mensalidade nos 3 primeiros meses</h2><p>Contados após o prazo de 7 dias de arrependimento do cliente.</p>"+FX("Importante","Seu papel é só indicar."),
 "<div class='tag'>Quer entrar?</div><h2>Manda <span class='hl'>PARCERIA</span> no direct.</h2><p>A gente explica como funciona, sem enrolação.</p><div class='cta'>Manda no direct</div>",
]
slug="2026-11-18-parceria-quem-pode"
d=f"out/{slug}"; os.makedirs(d,exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome")
    pg=b.new_page(viewport={"width":1080,"height":1350}); n=len(slides)
    for i,s in enumerate(slides,1): shot(pg,s,f"{d}/{i:02d}.jpg",1080,1350,96,110,56,96,count=f"{i}/{n}")
    b.close()
