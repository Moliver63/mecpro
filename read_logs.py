#!/usr/bin/env python3
"""
MECPro Log Reader
Uso:
  python read_logs.py              # ultimas 50 linhas
  python read_logs.py -n 100       # ultimas 100 linhas
  python read_logs.py -f OAUTH     # filtrar OAuth
  python read_logs.py -f ERROR     # so erros
  python read_logs.py -f AUTH      # so auth
  python read_logs.py --tail       # modo live
"""
import sys, time
from pathlib import Path
from datetime import date

ROOT = Path(__file__).parent
LOG_DIR = ROOT / "logs"

def get_log_file():
    today = date.today().isoformat()
    f = LOG_DIR / ("app-" + today + ".log")
    if f.exists():
        return f
    files = sorted(LOG_DIR.glob("app-*.log")) if LOG_DIR.exists() else []
    return files[-1] if files else None

def colorize(line):
    if "[ERROR]" in line:
        return "\x1b[31m" + line + "\x1b[0m"
    if "[WARN ]" in line:
        return "\x1b[33m" + line + "\x1b[0m"
    if "[OAUTH]" in line:
        return "\x1b[95m" + line + "\x1b[0m"
    if "[AUTH ]" in line:
        return "\x1b[35m" + line + "\x1b[0m"
    if "[EMAIL]" in line:
        return "\x1b[32m" + line + "\x1b[0m"
    if "[DB   ]" in line:
        return "\x1b[34m" + line + "\x1b[0m"
    if "[DEBUG]" in line:
        return "\x1b[90m" + line + "\x1b[0m"
    return "\x1b[36m" + line + "\x1b[0m"

args = sys.argv[1:]
n = 50
filter_level = None
tail_mode = False

i = 0
while i < len(args):
    if args[i] == "-n" and i + 1 < len(args):
        n = int(args[i + 1])
        i += 2
    elif args[i] == "-f" and i + 1 < len(args):
        filter_level = args[i + 1].upper()
        i += 2
    elif args[i] == "--tail":
        tail_mode = True
        i += 1
    else:
        i += 1

log_file = get_log_file()
if not log_file:
    print("Nenhum log encontrado. Inicie o servidor primeiro.")
    sys.exit(1)

print("Log: " + str(log_file))
if filter_level:
    print("Filtro: " + filter_level)
print("-" * 70)

if tail_mode:
    print("Modo live (Ctrl+C para sair)...\n")
    with open(log_file, encoding="utf-8") as f:
        f.seek(0, 2)
        while True:
            line = f.readline()
            if line:
                line = line.rstrip()
                if not filter_level or filter_level in line:
                    print(colorize(line))
            else:
                time.sleep(0.3)
else:
    with open(log_file, encoding="utf-8") as f:
        lines = f.readlines()
    if filter_level:
        lines = [l for l in lines if filter_level in l]
    for line in lines[-n:]:
        print(colorize(line.rstrip()))
    print("-" * 70)
    print("Total exibido: " + str(min(n, len(lines))) + " linhas")
