
import urllib.request
import json

CHAVE_ATUAL = "APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="

body = json.dumps({
    "query": {"match_all": {}},
    "size": 1
}).encode()

endpoints = [
    ("TJSP", "https://api-publica.datajud.cnj.jus.br/api_publica_tjsp/_search"),
    ("TJRJ", "https://api-publica.datajud.cnj.jus.br/api_publica_tjrj/_search"),
    ("TJMG", "https://api-publica.datajud.cnj.jus.br/api_publica_tjmg/_search"),
    ("TJRS", "https://api-publica.datajud.cnj.jus.br/api_publica_tjrs/_search"),
    ("TJPR", "https://api-publica.datajud.cnj.jus.br/api_publica_tjpr/_search"),
    ("TJSC", "https://api-publica.datajud.cnj.jus.br/api_publica_tjsc/_search"),
    ("TRF1", "https://api-publica.datajud.cnj.jus.br/api_publica_trf1/_search"),
    ("TRF2", "https://api-publica.datajud.cnj.jus.br/api_publica_trf2/_search"),
    ("TRF3", "https://api-publica.datajud.cnj.jus.br/api_publica_trf3/_search"),
    ("STJ",  "https://api-publica.datajud.cnj.jus.br/api_publica_stj/_search"),
    ("STF",  "https://api-publica.datajud.cnj.jus.br/api_publica_stf/_search"),
]

print("=" * 55)
print("  MECPro — Teste CNJ Datajud")
print("=" * 55)

funcionando = []
for nome, url in endpoints:
    try:
        req = urllib.request.Request(url, data=body, headers={
            "Content-Type": "application/json",
            "Authorization": CHAVE_ATUAL,
        })
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read())
            if "error" in data:
                print(f"  AUTH ❌  {nome}: {data['error'].get('reason','auth error')[:60]}")
            else:
                hits = data.get("hits", {}).get("total", {}).get("value", "?")
                print(f"  OK    ✅  {nome}: {hits} processos indexados")
                funcionando.append(nome)
    except urllib.error.HTTPError as e:
        code = e.code
        msg = e.read().decode()[:80]
        print(f"  HTTP  ❌  {nome}: {code} — {msg}")
    except Exception as e:
        print(f"  ERR   ❌  {nome}: {str(e)[:70]}")

print()
print(f"Funcionando: {funcionando if funcionando else 'NENHUM — chave expirada'}")
print()
if not funcionando:
    print("SOLUÇÃO: Acesse https://datajud-wiki.cnj.jus.br/api-publica/acesso")
    print("         Cadastre-se e obtenha uma chave pessoal gratuita.")
    print("         Adicione no .env como: CNJ_API_KEY=ApiKey sua_chave_aqui")
