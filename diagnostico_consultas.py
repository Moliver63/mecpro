"""
MECPro — Diagnóstico de Integrações de Consulta
Analisa o código e testa cada API usada para CPF/CNPJ
"""

import urllib.request
import urllib.parse
import json
import os
import sys
from datetime import datetime

# ══════════════════════════════════════════════════════
# CREDENCIAIS (lê do .env ou preencha manualmente)
# ══════════════════════════════════════════════════════
def load_env(path=".env"):
    env = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    env[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return env

ENV = load_env()

CNPJ_TESTE     = "33000167000101"   # Petrobras — CNPJ público para teste
CPF_TESTE      = "00000000000"      # placeholder (APIs públicas não retornam dados de CPF por LGPD)

BIGDATA_TOKEN  = ENV.get("BIGDATA_TOKEN",  os.getenv("BIGDATA_TOKEN",  ""))
SERPRO_TOKEN   = ENV.get("SERPRO_TOKEN",   os.getenv("SERPRO_TOKEN",   ""))
RECEITAWS_KEY  = ENV.get("RECEITAWS_KEY",  os.getenv("RECEITAWS_KEY",  ""))
CNJ_API_KEY    = "cDZHYzlZa0JadVREZDJCendFbXNpTU5BZ2syeWVVWHVYRU9IYXZKaTNsRUI="  # chave pública CNJ

# ══════════════════════════════════════════════════════

def fetch(url: str, method="GET", headers=None, body=None, timeout=8) -> tuple[int, dict]:
    req = urllib.request.Request(url, method=method)
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    if body:
        req.data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {"error": str(e)}
    except Exception as e:
        return 0, {"error": str(e)}

def sep(title=""):
    print(f"\n{'─'*60}")
    if title:
        print(f"  {title}")
        print("─"*60)

def ok(msg):   print(f"  ✅  {msg}")
def err(msg):  print(f"  ❌  {msg}")
def warn(msg): print(f"  ⚠️   {msg}")
def info(msg): print(f"  ℹ️   {msg}")
def miss(msg): print(f"  🔑  {msg}")

results = {}   # { api_name: { status, dados, obs } }

# ──────────────────────────────────────────────────────
# 1. BrasilAPI — Receita Federal CNPJ (GRATUITA)
# ──────────────────────────────────────────────────────
def check_brasilapi():
    sep("1. BRASILAPI — Receita Federal CNPJ  [GRATUITA, sem chave]")
    status, data = fetch(f"https://brasilapi.com.br/api/cnpj/v1/{CNPJ_TESTE}")

    if status == 200:
        ok(f"Conectada — CNPJ {CNPJ_TESTE}")
        ok(f"Razão Social: {data.get('razao_social', '—')}")
        ok(f"Situação: {data.get('situacao_cadastral', '—')}")
        ok(f"Retorna: razao_social, situacao, CNAE, endereço, sócios, capital")
        results["BrasilAPI_Receita"] = {"status": "✅ ATIVA", "dados": "CNPJ completo", "obs": "Gratuita, sem chave"}
    elif status == 404:
        warn("CNPJ não encontrado (API ok, CNPJ inválido no teste)")
        results["BrasilAPI_Receita"] = {"status": "⚠️ CNPJ_NOT_FOUND", "dados": "CNPJ completo", "obs": "API ok"}
    elif status == 0:
        err(f"Sem conexão: {data.get('error')}")
        results["BrasilAPI_Receita"] = {"status": "❌ SEM_CONEXÃO", "dados": "CNPJ completo", "obs": "Gratuita"}
    else:
        err(f"Erro {status}: {data}")
        results["BrasilAPI_Receita"] = {"status": f"❌ HTTP_{status}", "dados": "CNPJ completo", "obs": "Gratuita"}

    info("Não retorna: score, restrições, protestos, dados CPF")

# ──────────────────────────────────────────────────────
# 2. ReceitaWS — alternativa BrasilAPI (GRATUITA limitada)
# ──────────────────────────────────────────────────────
def check_receitaws():
    sep("2. RECEITAWS — CNPJ alternativo  [GRATUITA limitada]")
    status, data = fetch(f"https://www.receitaws.com.br/v1/cnpj/{CNPJ_TESTE}")

    if status == 200 and data.get("status") != "ERROR":
        ok(f"Conectada — {data.get('nome', '—')}")
        ok(f"Situação: {data.get('situacao', '—')}")
        results["ReceitaWS"] = {"status": "✅ ATIVA", "dados": "CNPJ básico", "obs": "3 req/min grátis"}
    elif status == 429:
        warn("Rate limit atingido (3 req/min no plano gratuito)")
        results["ReceitaWS"] = {"status": "⚠️ RATE_LIMIT", "dados": "CNPJ básico", "obs": "3 req/min grátis"}
    elif status == 0:
        err(f"Sem conexão: {data.get('error')}")
        results["ReceitaWS"] = {"status": "❌ SEM_CONEXÃO", "dados": "CNPJ básico", "obs": "Gratuita limitada"}
    else:
        err(f"Erro {status}")
        results["ReceitaWS"] = {"status": f"❌ HTTP_{status}", "dados": "CNPJ básico", "obs": "Gratuita limitada"}

    info("Limite: 3 req/min grátis | Plano pago remove limite")
    info("Não retorna: score, CPF, restrições, processos")

# ──────────────────────────────────────────────────────
# 3. CNJ Datajud — Processos Judiciais (GRATUITA)
# ──────────────────────────────────────────────────────
def check_cnj_datajud():
    sep("3. CNJ DATAJUD — Processos Judiciais  [GRATUITA, chave pública]")
    body = {
        "query": {"match": {"numeroProcesso": "0000001-02.2023.8.26.0100"}},
        "size": 1,
    }
    status, data = fetch(
        "https://api-publica.datajud.cnj.jus.br/api_publica_tjsp/_search",
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"ApiKey {CNJ_API_KEY}"},
        body=body,
    )

    if status == 200:
        total = data.get("hits", {}).get("total", {}).get("value", 0)
        ok(f"Conectada — TJSP respondeu ({total} resultados)")
        ok("Retorna: número processo, tribunal, classe, assunto, data, vara")
        results["CNJ_Datajud_TJSP"] = {"status": "✅ ATIVA", "dados": "Processos TJSP", "obs": "Gratuita, chave pública"}
    elif status == 401:
        err("Não autorizado — chave pública pode ter expirado")
        results["CNJ_Datajud_TJSP"] = {"status": "❌ AUTH_ERROR", "dados": "Processos", "obs": "Verificar chave"}
    elif status == 0:
        err(f"Sem conexão: {data.get('error')}")
        results["CNJ_Datajud_TJSP"] = {"status": "❌ SEM_CONEXÃO", "dados": "Processos", "obs": "Gratuita"}
    else:
        err(f"Erro {status}")
        results["CNJ_Datajud_TJSP"] = {"status": f"❌ HTTP_{status}", "dados": "Processos", "obs": "Gratuita"}

    info("Cobre: TJSP | Outros TJs disponíveis com endpoints separados")
    info("Não retorna: score, CPF, restrições financeiras, protestos")

# ──────────────────────────────────────────────────────
# 4. BigDataCorp — Score, CPF, SPC, Protestos (PAGA)
# ──────────────────────────────────────────────────────
def check_bigdatacorp():
    sep("4. BIGDATACORP — Score, CPF, SPC, Protestos  [PAGA ~R$0,10-2,00/req]")

    if not BIGDATA_TOKEN:
        miss("BIGDATA_TOKEN não configurado no .env")
        miss("Para obter: https://bigdatacorp.com.br → criar conta → API Keys")
        results["BigDataCorp"] = {"status": "🔑 SEM_CHAVE", "dados": "CPF+CNPJ+Score+Protestos+SPC", "obs": "Paga ~R$0,10-2,00/req"}
        info("Retornaria: score crédito, negativações, protestos, dados CPF completos")
        return

    status, data = fetch(
        f"https://plataforma.bigdatacorp.com.br/pessoas?doc={CPF_TESTE}&datasets=basic_data",
        headers={"AccessToken": BIGDATA_TOKEN, "TokenId": "api"},
    )

    if status == 200:
        ok("Conectada — BigDataCorp respondeu")
        ok("Retorna: CPF completo, score, negativações SPC/Serasa, protestos")
        results["BigDataCorp"] = {"status": "✅ ATIVA", "dados": "CPF+Score+SPC+Protestos", "obs": "Paga"}
    elif status == 401:
        err("Token inválido ou expirado")
        results["BigDataCorp"] = {"status": "❌ AUTH_ERROR", "dados": "CPF+Score+SPC+Protestos", "obs": "Paga"}
    elif status == 0:
        err(f"Sem conexão: {data.get('error')}")
        results["BigDataCorp"] = {"status": "❌ SEM_CONEXÃO", "dados": "CPF+Score+SPC+Protestos", "obs": "Paga"}
    else:
        err(f"Erro {status}: {data.get('message', data)}")
        results["BigDataCorp"] = {"status": f"❌ HTTP_{status}", "dados": "CPF+Score+SPC+Protestos", "obs": "Paga"}

# ──────────────────────────────────────────────────────
# 5. SERPRO — CPF oficial (PAGA, governo federal)
# ──────────────────────────────────────────────────────
def check_serpro():
    sep("5. SERPRO — CPF Oficial Receita Federal  [PAGA, governo]")

    if not SERPRO_TOKEN:
        miss("SERPRO_TOKEN não configurado no .env")
        miss("Para obter: https://dadosabertos.estaleiro.serpro.gov.br")
        results["SERPRO_CPF"] = {"status": "🔑 SEM_CHAVE", "dados": "CPF situação+nome", "obs": "Paga, oficial Receita Federal"}
        info("Retornaria: nome, situação CPF, data nascimento — fonte 100% oficial")
        return

    status, data = fetch(
        f"https://gateway.apiserpro.serpro.gov.br/consulta-cpf/v1/cpf/{CPF_TESTE}",
        headers={"Authorization": f"Bearer {SERPRO_TOKEN}"},
    )

    if status == 200:
        ok("Conectada — SERPRO respondeu")
        results["SERPRO_CPF"] = {"status": "✅ ATIVA", "dados": "CPF situação+nome", "obs": "Oficial Receita Federal"}
    else:
        err(f"Erro {status}")
        results["SERPRO_CPF"] = {"status": f"❌ HTTP_{status}", "dados": "CPF situação+nome", "obs": "Paga"}

# ──────────────────────────────────────────────────────
# 6. IEPTB — Protestos em Cartório (PAGA)
# ──────────────────────────────────────────────────────
def check_ieptb():
    sep("6. IEPTB — Protestos em Cartório  [PAGA]")
    miss("IEPTB_TOKEN não configurado")
    miss("Para obter: https://www.ieptb.com.br/api")
    results["IEPTB_Protestos"] = {"status": "🔑 SEM_CHAVE", "dados": "Protestos cartório", "obs": "Paga, nacional"}
    info("Cobre todos os cartórios do Brasil — CPF e CNPJ")
    info("Retornaria: valor protestado, data, apresentante, cartório")

# ──────────────────────────────────────────────────────
# 7. Verifica .env do MECPro para chaves relacionadas
# ──────────────────────────────────────────────────────
def check_env_keys():
    sep("7. VARIÁVEIS DE AMBIENTE — O que está configurado no MECPro")

    keys_consulta = {
        "BIGDATA_TOKEN":    "BigDataCorp (CPF, Score, SPC, Protestos)",
        "BIGDATA_API_KEY":  "BigDataCorp (alternativo)",
        "SERPRO_TOKEN":     "SERPRO CPF (oficial Receita Federal)",
        "SERPRO_API_KEY":   "SERPRO (alternativo)",
        "SERASA_TOKEN":     "Serasa Experian API",
        "SPC_TOKEN":        "SPC Brasil API",
        "IEPTB_TOKEN":      "IEPTB Protestos",
        "RECEITAWS_KEY":    "ReceitaWS (CNPJ sem limite)",
        "CNJ_API_KEY":      "CNJ Datajud (chave personalizada)",
    }

    found = []
    missing = []
    for key, desc in keys_consulta.items():
        if ENV.get(key) or os.getenv(key):
            found.append((key, desc))
        else:
            missing.append((key, desc))

    if found:
        for k, d in found:
            ok(f"{k} — {d}")
    else:
        warn("Nenhuma chave de consulta configurada no .env")

    print()
    for k, d in missing:
        miss(f"{k} — {d}")

# ──────────────────────────────────────────────────────
# RELATÓRIO FINAL
# ──────────────────────────────────────────────────────
def print_report():
    sep("RELATÓRIO FINAL — STATUS DAS INTEGRAÇÕES")

    print(f"\n  {'API':<25} {'STATUS':<20} {'DADOS':<30} {'CUSTO'}")
    print(f"  {'─'*25} {'─'*20} {'─'*30} {'─'*20}")

    for api, r in results.items():
        print(f"  {api:<25} {r['status']:<20} {r['dados']:<30} {r['obs']}")

    # Matriz de cobertura
    sep("COBERTURA ATUAL vs NECESSÁRIA")

    necessidades = [
        ("Dados cadastrais CNPJ",    "BrasilAPI_Receita" in results and "✅" in results["BrasilAPI_Receita"]["status"]),
        ("Dados cadastrais CPF",      "SERPRO_CPF" in results and "✅" in results.get("SERPRO_CPF",{}).get("status","")),
        ("Score de crédito",          "BigDataCorp" in results and "✅" in results.get("BigDataCorp",{}).get("status","")),
        ("Restrições SPC / Serasa",   "BigDataCorp" in results and "✅" in results.get("BigDataCorp",{}).get("status","")),
        ("Protestos em cartório",     "IEPTB_Protestos" in results and "✅" in results.get("IEPTB_Protestos",{}).get("status","")),
        ("Processos judiciais",       "CNJ_Datajud_TJSP" in results and "✅" in results.get("CNJ_Datajud_TJSP",{}).get("status","")),
    ]

    print()
    for necessidade, coberta in necessidades:
        icone = "✅" if coberta else "❌"
        print(f"  {icone}  {necessidade}")

    sep("PRÓXIMOS PASSOS RECOMENDADOS")

    ativas = [k for k, v in results.items() if "✅" in v["status"]]
    faltando = [k for k, v in results.items() if "🔑" in v["status"]]

    if ativas:
        print(f"\n  APIs ativas ({len(ativas)}): {', '.join(ativas)}")

    if faltando:
        print(f"\n  Para ativar cobertura completa:\n")
        prioridade = [
            ("BigDataCorp", "R$ 0,10–2,00/req", "CPF + Score + SPC + Protestos — tudo em um", "https://bigdatacorp.com.br"),
            ("SERPRO_CPF",  "R$ 0,05/req",      "CPF oficial — Receita Federal",               "https://dadosabertos.estaleiro.serpro.gov.br"),
            ("IEPTB_Protestos", "R$ 0,50/req",  "Protestos em cartório — nacional",            "https://www.ieptb.com.br/api"),
        ]
        for nome, custo, desc, url in prioridade:
            if any(nome.startswith(f) for f in faltando):
                print(f"  1. {nome}")
                print(f"     Custo: {custo} | {desc}")
                print(f"     URL:   {url}\n")

    print(f"\n  Gerado em: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print()

# ── MAIN ──────────────────────────────────────────────
def main():
    print("\n" + "═"*60)
    print("  MECPro — Diagnóstico de Integrações de Consulta")
    print("  " + datetime.now().strftime("%d/%m/%Y %H:%M:%S"))
    print("═"*60)
    print("  Testando cada API disponível...\n")

    check_brasilapi()
    check_receitaws()
    check_cnj_datajud()
    check_bigdatacorp()
    check_serpro()
    check_ieptb()
    check_env_keys()
    print_report()

if __name__ == "__main__":
    main()
