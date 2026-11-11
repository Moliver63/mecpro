import json, os, subprocess
from playwright.sync_api import sync_playwright

CSS = """
*{margin:0;padding:0;box-sizing:border-box}
body{width:%(w)dpx;height:%(h)dpx;font-family:'Inter',sans-serif;background:#0B1020;color:#F2F4F8;position:relative;overflow:hidden}
.glow{position:absolute;width:900px;height:900px;border-radius:50%%;background:radial-gradient(circle,rgba(59,130,246,.28),transparent 65%%);top:-300px;right:-350px}
.wrap{position:absolute;inset:%(pt)dpx 92px %(pb)dpx 92px;display:flex;flex-direction:column}
.tag{font-size:26px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#7DD3FC}
.num{font-family:'Inter Display','Inter';font-size:200px;font-weight:800;line-height:1;color:#3B82F6;margin-top:40px}
h1{font-family:'Inter Display','Inter';font-size:%(h1)dpx;line-height:1.04;font-weight:800;letter-spacing:-.03em;margin-top:40px}
h2{font-family:'Inter Display','Inter';font-size:72px;line-height:1.06;font-weight:800;letter-spacing:-.025em;margin-top:28px}
p{font-size:38px;line-height:1.42;color:#B8C0D4;margin-top:40px;max-width:860px}
.fix{margin-top:auto;border-left:6px solid #22D3A6;padding:26px 32px;background:rgba(34,211,166,.08);border-radius:0 18px 18px 0}
.fix b{display:block;font-size:24px;letter-spacing:.14em;text-transform:uppercase;color:#22D3A6;margin-bottom:10px}
.fix span{font-size:34px;line-height:1.38;color:#E6EAF2}
.hl{color:#7DD3FC}
.foot{position:absolute;left:92px;right:92px;bottom:%(fb)dpx;display:flex;justify-content:space-between;font-size:24px;color:#6B7590;font-weight:600}
.cta{margin-top:auto;display:inline-block;background:#3B82F6;color:#fff;font-size:36px;font-weight:700;padding:28px 44px;border-radius:999px;align-self:flex-start}
.ghost{background:transparent;border:2px solid #3B82F6;color:#7DD3FC}
.list{margin-top:44px;display:flex;flex-direction:column;gap:30px}
.item{display:flex;gap:28px;align-items:flex-start}
.item i{font-style:normal;font-family:'Inter Display','Inter';font-weight:800;font-size:56px;color:#3B82F6;min-width:70px;line-height:1}
.item span{font-size:40px;line-height:1.36;color:#E6EAF2}
.big{font-family:'Inter Display','Inter';font-size:92px;line-height:1.06;font-weight:800;letter-spacing:-.03em}
.mid{justify-content:center}
"""

def shot(pg, body, path, w, h, pt, pb, fb, h1, count=None):
    foot = f"<div class='foot'><span>@mecproaibrl</span><span>{count or ''}</span></div>"
    css = CSS % dict(w=w,h=h,pt=pt,pb=pb,fb=fb,h1=h1)
    pg.set_content(f"<html><head><style>{css}</style></head><body><div class='glow'></div><div class='wrap'>{body}</div>{foot}</body></html>")
    pg.screenshot(path=path, type="jpeg", quality=92)

def L(items):  # numbered list html
    return "<div class='list'>"+"".join(f"<div class='item'><i>{n}</i><span>{t}</span></div>" for n,t in items)+"</div>"

def FIX(t): return f"<div class='fix'><b>Faça assim</b><span>{t}</span></div>"
def NUM(n,title,txt,fix): return f"<div class='num'>{n}</div><h2>{title}</h2><p>{txt}</p>{FIX(fix)}"

H = "#metaads #trafegopago #marketingdigital #anunciosonline #mecproai"

POSTS = [
 dict(slug="2026-11-11-antes-do-orcamento", date="2026-11-11", kind="image", slides=[
  "<div class='tag'>Dica rápida</div><h1>Antes de colocar mais dinheiro no anúncio, <span class='hl'>responda 3 perguntas</span></h1>"+L([(1,"O criativo prende a atenção nos primeiros 3 segundos?"),(2,"A página de destino abre rápido no celular?"),(3,"Você sabe de onde veio cada venda?")])+FIX("Se alguma resposta for não, corrija ela antes de aumentar o orçamento.")],
  caption="Aumentar o orçamento de um anúncio que não converte só aumenta o prejuízo.\n\nAntes de colocar mais dinheiro, responda essas 3 perguntas. Se alguma for \"não\", comece por ela.\n\nQual dessas você ainda não confere? Conta aqui nos comentários.\n\nSalva pra lembrar na próxima campanha.\n\n"+H),
 dict(slug="2026-11-12-reels-sinais", date="2026-11-12", kind="reel", scenes=[
  "<div class='tag'>Meta Ads</div><div class='big' style='margin-top:40px'>3 sinais de que seu anúncio está <span class='hl'>queimando dinheiro</span></div>",
  "<div class='num'>1</div><div class='big'>Muito clique e <span class='hl'>nenhuma venda</span></div><p>A página de destino não convence quem chega.</p>",
  "<div class='num'>2</div><div class='big'>O custo por resultado <span class='hl'>sobe toda semana</span></div><p>O criativo cansou e ninguém trocou.</p>",
  "<div class='num'>3</div><div class='big'>Você não sabe <span class='hl'>qual anúncio vendeu</span></div><p>Sem medição, você corta o que funciona.</p>",
  "<div class='big'>Salva este vídeo e <span class='hl'>segue</span> pra mais dicas de Meta Ads</div>"],
  caption="3 sinais de que seu anúncio está queimando dinheiro:\n\n1. Muito clique e nenhuma venda\n2. Custo por resultado subindo toda semana\n3. Nenhuma ideia de qual anúncio trouxe o cliente\n\nTem algum deles na sua conta? Comenta o número.\n\n"+H),
 dict(slug="2026-11-13-checklist-publicar", date="2026-11-13", kind="carousel", slides=[
  "<div class='tag'>Checklist</div><h1>5 itens pra conferir <span class='hl'>antes de publicar</span> sua campanha no Meta</h1><p>Leva 5 minutos e evita semanas de dinheiro jogado fora.</p><div class='cta ghost'>Arrasta pro lado →</div>",
  NUM("01","Objetivo certo","Venda, contato ou mensagem. O Meta entrega para quem tem mais chance de fazer o que você escolheu.","Escolha o objetivo pela ação que você quer receber."),
  NUM("02","Rastreio funcionando","Sem o pixel ou o evento de conversa configurado, o resultado some do relatório.","Faça um teste e confirme que o evento aparece no Gerenciador."),
  NUM("03","Mais de um criativo","Um criativo só não dá comparação. Você descobre o que funciona testando.","Suba de 3 a 5 variações com ganchos diferentes."),
  NUM("04","Uma promessa, um passo","Anúncio que fala de tudo não convence de nada.","Escreva uma promessa clara e um próximo passo (comprar, chamar, preencher)."),
  NUM("05","Destino testado no celular","A maioria dos cliques vem do celular. Link quebrado queima o orçamento em horas.","Abra o anúncio no seu celular e passe pelo caminho inteiro."),
  "<div class='tag'>Fechamento</div><h2>Passou nos 5? Pode publicar.</h2><p>A MecProAI monta a campanha com esse checklist embutido, do briefing até a publicação.</p><div class='cta'>Salva pra usar depois</div>"],
  caption="Antes de apertar em publicar, confira esses 5 itens. Leva 5 minutos e evita semanas de dinheiro jogado fora.\n\nQual deles você costuma esquecer? Comenta o número.\n\nSalva pra usar na próxima campanha.\n\n"+H),
 dict(slug="2026-11-14-ganchos", date="2026-11-14", kind="image", slides=[
  "<div class='tag'>Dica rápida</div><h1>3 ganchos pra <span class='hl'>testar</span> no seu próximo criativo</h1>"+L([(1,"A pergunta que seu cliente já faz: \"Quanto custa...?\""),(2,"O problema e o prazo: \"Cansado de X? Resolva em Y\""),(3,"Antes e depois, só se for real e puder ser comprovado")])+FIX("Teste os três com o mesmo orçamento e veja qual segura mais gente.")],
  caption="O gancho é a primeira coisa que a pessoa vê. Se ele não prende, o resto do anúncio nem é lido.\n\nTeste esses 3 ganchos no mesmo público e com o mesmo orçamento. Em poucos dias os números mostram o vencedor.\n\nQual você vai testar primeiro?\n\nSalva pra não esquecer.\n\n"+H),
 dict(slug="2026-11-15-bastidores", date="2026-11-15", kind="carousel", slides=[
  "<div class='tag'>Bastidores</div><h1>Como a MecProAI <span class='hl'>monta uma campanha</span></h1><p>Do briefing ao anúncio no ar, em 4 passos.</p><div class='cta ghost'>Arrasta pro lado →</div>",
  NUM("01","Você responde o briefing","Conta sobre o negócio, o público e o objetivo da campanha.","Quanto mais claro o briefing, melhor a campanha."),
  NUM("02","A IA monta a base","A plataforma sugere público, textos e criativos a partir do que você informou.","Você vê tudo antes de qualquer coisa ir ao ar."),
  NUM("03","Um checklist barra erros","Antes de publicar, a campanha passa por verificações de qualidade e consistência.","Texto com informação errada ou sem destino não passa."),
  NUM("04","Você revisa e publica","Com tudo certo, a campanha vai para o Meta direto da plataforma.","Depois acompanha os resultados no mesmo lugar."),
  "<div class='tag'>Quer ver por dentro?</div><h2>Conheça a plataforma e monte sua primeira campanha.</h2><div class='cta'>Link na bio</div>"],
  caption="Quer saber como funciona por dentro? Em 4 passos, do briefing ao anúncio publicado no Meta.\n\nSe você já anuncia, qual dessas etapas mais te dá trabalho hoje? Conta nos comentários.\n\nLink na bio pra conhecer.\n\n"+H),
 dict(slug="2026-11-16-reels-mito", date="2026-11-16", kind="reel", scenes=[
  "<div class='tag'>Mito</div><div class='big' style='margin-top:40px'>\"Se o anúncio não vende, é só <span class='hl'>aumentar o orçamento</span>\"</div>",
  "<div class='tag'>Verdade</div><div class='big' style='margin-top:40px'>Orçamento maior <span class='hl'>multiplica o que já existe</span></div>",
  "<div class='big'>Criativo fraco + orçamento alto = <span class='hl'>prejuízo maior</span></div>",
  "<div class='big'>Primeiro acerte a <span class='hl'>mensagem</span> e a <span class='hl'>medição</span></div><p>Depois escale com segurança.</p>",
  "<div class='big'>Segue pra mais dicas de <span class='hl'>Meta Ads</span></div>"],
  caption="Aumentar o orçamento não resolve anúncio que não vende. Só aumenta o tamanho do problema.\n\nPrimeiro acerte a mensagem e a medição. Depois escale.\n\nJá caiu nesse erro? Conta aqui.\n\n"+H),
 dict(slug="2026-11-17-objetivo", date="2026-11-17", kind="carousel", slides=[
  "<div class='tag'>Meta Ads</div><h1>Qual <span class='hl'>objetivo</span> escolher na sua campanha?</h1><p>Cada objetivo faz o Meta buscar um tipo diferente de pessoa.</p><div class='cta ghost'>Arrasta pro lado →</div>",
  NUM("01","Vendas","Quando você tem loja ou checkout e quer compra.","O Meta procura quem tem mais chance de comprar."),
  NUM("02","Leads","Quando o cliente precisa deixar nome e contato antes de falar com você.","Bom pra serviços, cursos e consultas."),
  NUM("03","Mensagens","Quando a venda fecha no WhatsApp ou no direct.","O anúncio abre a conversa direto com o cliente."),
  NUM("04","Tráfego","Só quando o objetivo é visita no site.","Gera clique, não necessariamente venda. Use com cuidado."),
  "<div class='tag'>Sua vez</div><h2>Qual é o seu tipo de negócio?</h2><p>Comenta aqui embaixo que a gente indica o objetivo mais indicado pra você.</p><div class='cta'>Comenta e salva</div>"],
  caption="Escolher o objetivo errado é um dos jeitos mais caros de começar uma campanha.\n\nComenta o seu tipo de negócio que eu te digo qual objetivo faz mais sentido pra você.\n\nSalva pra consultar depois.\n\n"+H),
]

os.makedirs("out", exist_ok=True)
manifest=[]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for post in POSTS:
        d=f"out/{post['slug']}"; os.makedirs(d, exist_ok=True)
        if post["kind"] in ("image","carousel"):
            pg=b.new_page(viewport={"width":1080,"height":1350}); n=len(post["slides"])
            for i,s in enumerate(post["slides"],1):
                shot(pg,s,f"{d}/{i:02d}.jpg",1080,1350,96,110,56,96,count=(f"{i}/{n}" if n>1 else ""))
            pg.close(); files=sorted(f for f in os.listdir(d) if f.endswith(".jpg"))
        else:
            pg=b.new_page(viewport={"width":1080,"height":1920})
            for i,s in enumerate(post["scenes"],1):
                shot(pg,"<div class='mid' style='display:flex;flex-direction:column;height:100%'>"+s+"</div>",f"{d}/s{i:02d}.jpg",1080,1920,200,260,150,110)
            pg.close()
            clips=[]
            for i in range(1,len(post["scenes"])+1):
                dur=3.0 if i<len(post["scenes"]) else 3.5
                subprocess.run(["ffmpeg","-y","-loglevel","error","-loop","1","-t",str(dur),"-i",f"{d}/s{i:02d}.jpg","-vf","scale=1080:1920,zoompan=z='min(zoom+0.0006,1.06)':d=1:s=1080x1920:fps=30,fade=t=in:st=0:d=0.3,fade=t=out:st=%s:d=0.3,format=yuv420p"%(dur-0.3),"-r","30","-c:v","libx264","-preset","veryfast","-crf","22",f"{d}/c{i}.mp4"],check=True)
                clips.append(f"{d}/c{i}.mp4")
            open(f"{d}/list.txt","w").write("".join(f"file 'c{i}.mp4'\n" for i in range(1,len(clips)+1)))
            subprocess.run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0","-i",f"{d}/list.txt","-f","lavfi","-i","anullsrc=r=44100:cl=stereo","-shortest","-c:v","copy","-c:a","aac","-b:a","96k","-movflags","+faststart",f"{d}/video.mp4"],check=True)
            files=["video.mp4"]
        manifest.append(dict(slug=post["slug"],date=post["date"],kind=post["kind"],files=files,caption=post["caption"]))
    b.close()
json.dump(manifest,open("out/manifest.json","w"),ensure_ascii=False,indent=1)
print("ok")
