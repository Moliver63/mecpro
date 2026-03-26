#!/usr/bin/env python3
"""
Script de Diagnóstico - Shadia Platform
Execute na RAIZ do projeto: python diagnostico.py
"""

import requests
import subprocess
import sys
import os
import json
import socket
from datetime import datetime
import time
import re

# Cores para output
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    END = '\033[0m'
    BOLD = '\033[1m'

def print_header(text):
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'='*60}{Colors.END}")
    print(f"{Colors.HEADER}{Colors.BOLD} {text}{Colors.END}")
    print(f"{Colors.HEADER}{Colors.BOLD}{'='*60}{Colors.END}\n")

def print_success(text):
    print(f"{Colors.GREEN}✅ {text}{Colors.END}")

def print_warning(text):
    print(f"{Colors.YELLOW}⚠️  {text}{Colors.END}")

def print_error(text):
    print(f"{Colors.RED}❌ {text}{Colors.END}")

def print_info(text):
    print(f"{Colors.BLUE}ℹ️  {text}{Colors.END}")

def check_port(port, service_name):
    """Verifica se uma porta está em uso"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('localhost', port))
    sock.close()
    
    if result == 0:
        print_success(f"{service_name} rodando na porta {port}")
        return True
    else:
        print_error(f"{service_name} NÃO está rodando na porta {port}")
        return False

def check_env_file():
    """Verifica se o arquivo .env existe e tem as variáveis necessárias"""
    print_info("Verificando arquivo .env...")
    
    if not os.path.exists('.env'):
        print_error("Arquivo .env não encontrado na raiz!")
        return False
    
    # Tentar diferentes encodings
    encodings_to_try = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
    content = None
    used_encoding = None
    
    for encoding in encodings_to_try:
        try:
            with open('.env', 'r', encoding=encoding) as f:
                content = f.read()
            used_encoding = encoding
            print_info(f"Arquivo .env lido com encoding: {encoding}")
            break
        except UnicodeDecodeError:
            continue
        except Exception as e:
            print_warning(f"Erro com encoding {encoding}: {e}")
            continue
    
    if content is None:
        print_error("Não foi possível ler o arquivo .env (problema de encoding)")
        # Tenta ler em modo binário
        try:
            with open('.env', 'rb') as f:
                binary_content = f.read()
            print_info(f"📄 Arquivo .env lido em modo binário: {len(binary_content)} bytes")
            print_info(f"Primeiros 50 bytes: {binary_content[:50]}")
            print_info(f"Caracteres especiais encontrados: {sum(1 for b in binary_content if b >= 128)}")
        except Exception as e:
            print_error(f"Erro ao ler arquivo em modo binário: {e}")
        return False
    
    required_vars = [
        'DATABASE_URL',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'JWT_SECRET',
        'SITE_URL'
    ]
    
    missing = []
    found_vars = []
    
    for var in required_vars:
        if var in content:
            found_vars.append(var)
        else:
            missing.append(var)
    
    if missing:
        print_warning(f"Variáveis faltando no .env: {', '.join(missing)}")
    else:
        print_success("Todas as variáveis obrigatórias encontradas")
    
    # Mostrar estatísticas
    lines = [line for line in content.split('\n') if line.strip() and not line.strip().startswith('#')]
    print_info(f"Total de linhas não comentadas: {len(lines)}")
    
    # Verificar DATABASE_URL especificamente
    db_match = re.search(r'DATABASE_URL=([^\n]+)', content)
    if db_match:
        db_url = db_match.group(1)
        if 'Shadia%4012345' in db_url:
            print_success("DATABASE_URL formatada corretamente (com %40)")
        else:
            print_warning("DATABASE_URL pode estar com formato incorreto")
    
    return len(missing) == 0

def check_backend():
    """Verifica se o backend está respondendo"""
    print_info("Verificando backend (porta 3001)...")
    
    # Primeiro verifica se a porta está ouvindo
    if not check_port(3001, "Backend"):
        return False
    
    # Tenta diferentes endpoints
    endpoints = [
        '/api/trpc/health',
        '/api/trpc/courses.list',
        '/'
    ]
    
    for endpoint in endpoints:
        try:
            url = f'http://localhost:3001{endpoint}'
            response = requests.get(url, timeout=3)
            if response.status_code == 200:
                print_success(f"Backend respondendo em {url}")
                try:
                    data = response.json()
                    if 'result' in data:
                        print_info("Resposta contém dados do tRPC")
                except:
                    print_info(f"Resposta: {response.text[:100]}")
                return True
            else:
                print_warning(f"Endpoint {endpoint} retornou status {response.status_code}")
        except requests.exceptions.ConnectionError:
            continue
        except Exception as e:
            print_warning(f"Erro ao testar {endpoint}: {e}")
    
    print_error("Backend não está respondendo em nenhum endpoint")
    return False

def check_frontend():
    """Verifica se o frontend está rodando"""
    print_info("Verificando frontend (porta 5173)...")
    
    if not check_port(5173, "Frontend"):
        return False
    
    try:
        response = requests.get('http://localhost:5173', timeout=3)
        if response.status_code == 200:
            print_success("Frontend respondendo em http://localhost:5173")
            # Verificar se é React/Vite
            if 'vite' in response.text.lower():
                print_info("✅ Frontend identificado como Vite/React")
            return True
        else:
            print_error(f"Frontend retornou status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print_error("Não foi possível conectar ao frontend (porta 5173)")
        return False
    except Exception as e:
        print_error(f"Erro ao verificar frontend: {e}")
        return False

def check_database():
    """Verifica conexão com o banco de dados"""
    print_info("Verificando conexão com banco de dados...")
    
    try:
        # Tentar importar mysql.connector
        try:
            import mysql.connector
            from mysql.connector import Error
        except ImportError:
            print_warning("mysql-connector-python não instalado")
            print_info("Instale com: pip install mysql-connector-python")
            
            # Tentar método alternativo
            try:
                # Verificar se o processo MySQL está rodando
                if sys.platform == 'win32':
                    result = subprocess.run(['tasklist'], capture_output=True, text=True)
                    if 'mysqld.exe' in result.stdout.lower():
                        print_success("Processo MySQL encontrado")
                        
                        # Tentar conectar via comando
                        try:
                            result = subprocess.run(
                                ['mysql', '-u', 'shadia', '-pShadia@12345', '-e', 'SELECT 1'],
                                capture_output=True,
                                text=True,
                                timeout=5
                            )
                            if result.returncode == 0:
                                print_success("Conexão com banco OK (via mysql client)")
                                return True
                        except:
                            pass
                    return None
            except:
                pass
            return None
        
        # Tentar conectar diretamente
        try:
            connection = mysql.connector.connect(
                host='localhost',
                user='shadia',
                password='Shadia@12345',
                database='shadia_local',
                port=3306,
                connection_timeout=5
            )
            
            cursor = connection.cursor()
            
            # Verificar cursos
            cursor.execute("SELECT COUNT(*) FROM courses")
            courses_count = cursor.fetchone()[0]
            
            # Verificar usuários
            cursor.execute("SELECT COUNT(*) FROM users")
            users_count = cursor.fetchone()[0]
            
            # Verificar tabelas
            cursor.execute("SHOW TABLES")
            tables = cursor.fetchall()
            
            print_success(f"Conexão com banco OK!")
            print_info(f"📊 Cursos: {courses_count}")
            print_info(f"👥 Usuários: {users_count}")
            print_info(f"📚 Tabelas: {len(tables)}")
            
            cursor.close()
            connection.close()
            return True
            
        except mysql.connector.Error as err:
            if err.errno == 1045:
                print_error("Senha do MySQL incorreta")
            elif err.errno == 1049:
                print_error("Banco de dados 'shadia_local' não existe")
            elif err.errno == 2003:
                print_error("MySQL não está rodando (porta 3306 fechada)")
            else:
                print_error(f"Erro MySQL: {err}")
            return False
            
    except Exception as e:
        print_error(f"Erro ao verificar banco de dados: {e}")
        return False

def check_api_courses():
    """Verifica se a API de cursos está funcionando"""
    print_info("Verificando API de cursos...")
    
    try:
        response = requests.get('http://localhost:3001/api/trpc/courses.list', timeout=5)
        if response.status_code == 200:
            data = response.json()
            courses = data.get('result', {}).get('data', {}).get('json', [])
            print_success(f"API de cursos OK! {len(courses)} cursos encontrados")
            
            if len(courses) > 0:
                print_info(f"📚 Primeiro curso: {courses[0]['title']}")
                # Mostrar faixa de preços
                prices = [c.get('price', 0) for c in courses]
                print_info(f"💰 Preços: {', '.join([str(p) for p in prices[:5]])}")
            return True
        else:
            print_error(f"API de cursos retornou status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print_error("Não foi possível conectar à API (backend offline?)")
        return False
    except Exception as e:
        print_error(f"Erro ao verificar API de cursos: {e}")
        return False

def check_node_modules():
    """Verifica se as dependências estão instaladas"""
    print_info("Verificando dependências...")
    
    if os.path.exists('node_modules'):
        print_success("node_modules encontrado")
        
        # Verifica tamanho aproximado
        try:
            total_size = 0
            for dirpath, dirnames, filenames in os.walk('node_modules'):
                for f in filenames:
                    fp = os.path.join(dirpath, f)
                    if os.path.exists(fp):
                        total_size += os.path.getsize(fp)
            
            size_mb = total_size / (1024 * 1024)
            print_info(f"Tamanho: {size_mb:.1f} MB")
        except:
            pass
    else:
        print_error("node_modules não encontrado! Execute: pnpm install")

def check_package_json():
    """Verifica se package.json existe e tem os scripts necessários"""
    print_info("Verificando package.json...")
    
    if not os.path.exists('package.json'):
        print_error("package.json não encontrado!")
        return False
    
    try:
        with open('package.json', 'r', encoding='utf-8') as f:
            package = json.load(f)
        
        print_success("package.json OK")
        
        scripts = package.get('scripts', {})
        if 'dev' in scripts:
            print_info(f"Script 'dev' encontrado: {scripts['dev']}")
        else:
            print_warning("Script 'dev' não encontrado")
            
        # Verificar dependências
        deps = package.get('dependencies', {})
        dev_deps = package.get('devDependencies', {})
        print_info(f"Dependências: {len(deps)} | DevDependencies: {len(dev_deps)}")
        
    except Exception as e:
        print_error(f"Erro ao ler package.json: {e}")

def check_processes():
    """Verifica processos rodando"""
    print_info("Verificando processos...")
    
    if sys.platform == 'win32':
        # Windows
        result = subprocess.run(['tasklist'], capture_output=True, text=True)
        output = result.stdout.lower()
        
        node_count = output.count('node.exe')
        if node_count > 0:
            print_success(f"Processo Node.js encontrado ({node_count} instância(s))")
        else:
            print_warning("Nenhum processo Node.js encontrado")
            
        if 'mysqld.exe' in output:
            print_success("Processo MySQL encontrado (mysqld.exe)")
        elif 'mysql.exe' in output:
            print_success("Processo MySQL encontrado (mysql.exe)")
        else:
            print_warning("Nenhum processo MySQL encontrado")
    else:
        # Linux/Mac
        result = subprocess.run(['ps', 'aux'], capture_output=True, text=True)
        output = result.stdout.lower()
        
        node_count = output.count('node')
        if node_count > 0:
            print_success(f"Processo Node.js encontrado ({node_count} instância(s))")
        else:
            print_warning("Nenhum processo Node.js encontrado")
            
        if 'mysql' in output:
            print_success("Processo MySQL encontrado")
        else:
            print_warning("Nenhum processo MySQL encontrado")

def check_network():
    """Verifica conectividade de rede"""
    print_info("Verificando conectividade...")
    
    # Tenta pingar localhost
    try:
        if sys.platform == 'win32':
            result = subprocess.run(['ping', '-n', '1', '127.0.0.1'], capture_output=True)
        else:
            result = subprocess.run(['ping', '-c', '1', '127.0.0.1'], capture_output=True)
        
        if result.returncode == 0:
            print_success("Rede local OK")
        else:
            print_warning("Problema com rede local")
    except:
        print_warning("Não foi possível testar rede")

def check_browser_console_instructions():
    """Instruções para verificar console do navegador"""
    print_info("\n📋 INSTRUÇÕES PARA DEBUG NO NAVEGADOR:")
    print("  1. Abra http://localhost:5173/courses")
    print("  2. Pressione F12 para abrir DevTools")
    print("  3. Clique na aba 'Console'")
    print("  4. Procure por mensagens em VERMELHO")
    print("  5. Se houver erro, copie e cole aqui")
    print("\n  🔍 Erros comuns no console:")
    print("     - 'Failed to fetch' → API não está acessível")
    print("     - 'Cannot read properties of undefined' → Dados não carregaram")
    print("     - 'import.meta.env' → Variáveis de ambiente")
    print("     - 'CORS' → Problema de configuração CORS")

def check_system_info():
    """Verifica informações do sistema"""
    print_info("Informações do Sistema:")
    print_info(f"  Python: {sys.version}")
    print_info(f"  Plataforma: {sys.platform}")
    print_info(f"  Arquitetura: {os.environ.get('PROCESSOR_ARCHITECTURE', 'N/A')}")
    
    # Memória disponível (Windows)
    if sys.platform == 'win32':
        try:
            import psutil
            memory = psutil.virtual_memory()
            print_info(f"  Memória Disponível: {memory.available / (1024**3):.1f} GB")
            print_info(f"  Memória Total: {memory.total / (1024**3):.1f} GB")
        except ImportError:
            pass

def fix_common_issues():
    """Sugere correções para problemas comuns"""
    print_header("🔧 CORREÇÕES RÁPIDAS")
    
    print_info("Se o backend não estiver rodando:")
    print("  pnpm dev")
    
    print_info("\nSe o frontend não estiver rodando:")
    print("  cd frontend && pnpm dev  # se frontend em subpasta")
    print("  pnpm dev -- --port 5173   # se frontend na raiz")
    
    print_info("\nSe o banco de dados não conectar:")
    print("  Verifique se o MySQL está rodando:")
    print("  net start MySQL80  # Windows")
    print("  Teste conexão: mysql -u shadia -p")
    
    print_info("\nSe a API retornar 404:")
    print("  Adicione a rota health check no backend")
    print("  Crie server/routers/health.ts com rota 'health.check'")

def main():
    print_header("🔍 DIAGNÓSTICO COMPLETO - SHADIA PLATFORM")
    print(f"📂 Diretório atual: {os.getcwd()}")
    print(f"🕐 Data/Hora: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print(f"🐍 Python: {sys.version.split()[0]}")
    print(f"💻 Sistema: {sys.platform}")
    
    # Informações do sistema
    check_system_info()
    
    # 1. Verificar arquivos do projeto
    print_header("📁 ARQUIVOS DO PROJETO")
    env_ok = check_env_file()
    check_package_json()
    check_node_modules()
    
    # 2. Verificar processos e portas
    print_header("🔌 PROCESSOS E PORTAS")
    check_processes()
    check_network()
    
    # 3. Verificar backend
    print_header("🚀 BACKEND (PORTA 3001)")
    backend_ok = check_backend()
    
    # 4. Verificar frontend
    print_header("🎨 FRONTEND (PORTA 5173)")
    frontend_ok = check_frontend()
    
    # 5. Verificar banco de dados
    print_header("🗄️ BANCO DE DADOS")
    db_ok = check_database()
    
    # 6. Verificar API de cursos
    print_header("📚 API DE CURSOS")
    api_ok = check_api_courses()
    
    # 7. Instruções para console
    print_header("🖥️ DEBUG NO NAVEGADOR")
    check_browser_console_instructions()
    
    # 8. Correções rápidas
    fix_common_issues()
    
    # 9. Resumo final
    print_header("📊 RESUMO DO DIAGNÓSTICO")
    
    issues = []
    
    if backend_ok:
        print_success("Backend: OK")
    else:
        print_error("Backend: FALHA")
        issues.append("Backend não está respondendo")
    
    if frontend_ok:
        print_success("Frontend: OK")
    else:
        print_error("Frontend: FALHA")
        issues.append("Frontend não está respondendo")
    
    if db_ok:
        print_success("Banco de Dados: OK")
    elif db_ok is None:
        print_warning("Banco de Dados: Não foi possível verificar completamente")
        issues.append("Banco de dados não pôde ser verificado")
    else:
        print_error("Banco de Dados: FALHA")
        issues.append("Conexão com banco de dados falhou")
    
    if api_ok:
        print_success("API de Cursos: OK")
    else:
        print_error("API de Cursos: FALHA")
        issues.append("API de cursos não está funcionando")
    
    print()
    if not issues:
        print_success(f"{Colors.BOLD}✨ TUDO FUNCIONANDO! O problema deve estar no console do navegador.{Colors.END}")
        print_info("Siga as instruções acima para verificar erros no console (F12).")
    else:
        print_error(f"{Colors.BOLD}🔴 PROBLEMAS ENCONTRADOS:{Colors.END}")
        for i, issue in enumerate(issues, 1):
            print_error(f"  {i}. {issue}")
    
    print_header("🏁 FIM DO DIAGNÓSTICO")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Diagnóstico interrompido pelo usuário")
        sys.exit(0)
    except Exception as e:
        print_error(f"Erro inesperado: {e}")
        import traceback
        traceback.print_exc()