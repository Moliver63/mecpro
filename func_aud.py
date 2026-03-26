#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════╗
║       🔬 SHADIA PLATFORM - AUDITOR FUNCIONAL v1.0              ║
║   Detecta funcionalidades incompletas, botões quebrados,        ║
║   páginas sem implementação real e fluxos com falha             ║
╚══════════════════════════════════════════════════════════════════╝

USO:
    python func_aud.py               # audita a pasta atual
    python func_aud.py --html        # gera relatório HTML
    python func_aud.py --page Login  # audita só uma página
"""

import os
import re
import sys
import json
import argparse
from pathlib import Path
from datetime import datetime

# ─────────────────────────────────────────────
#  CORES
# ─────────────────────────────────────────────
RED     = "\033[91m"
GREEN   = "\033[92m"
YELLOW  = "\033[93m"
BLUE    = "\033[94m"
CYAN    = "\033[96m"
BOLD    = "\033[1m"
RESET   = "\033[0m"

def col(color, text): return f"{color}{text}{RESET}"
def ok(msg):    print(f"  {col(GREEN,'OK')}  {msg}")
def warn(msg):  print(f"  {col(YELLOW,'AV')}  {msg}")
def err(msg):   print(f"  {col(RED,'XX')}  {msg}")
def info(msg):  print(f"  {col(CYAN,'II')}  {msg}")
def section(title):
    print(f"\n{col(BOLD+BLUE,'='*60)}")
    print(f"{col(BOLD+CYAN,'  '+title)}")
    print(f"{col(BLUE,'='*60)}")

# ─────────────────────────────────────────────
#  LOCALIZAÇÃO DO PROJETO
# ─────────────────────────────────────────────
def find_root(start="."):
    current = Path(start).resolve()
    for _ in range(8):
        if (current / "package.json").exists():
            return current
        current = current.parent
    return Path(start).resolve()

def find_src(root):
    for candidate in [root/"client"/"src", root/"src", root/"frontend"/"src"]:
        if candidate.exists() and (candidate/"pages").exists():
            return candidate
    return None

def read_file(path):
    try:
        return Path(path).read_text(encoding="utf-8", errors="ignore")
    except:
        return ""

# ─────────────────────────────────────────────
#  DEFINIÇÃO DOS CHECKS FUNCIONAIS
#  Cada check define o que uma página/fluxo DEVE ter
# ─────────────────────────────────────────────

PAGE_CHECKS = {

    # ── AUTH ──────────────────────────────────────────────────────
    "Login.tsx": {
        "desc": "Página de Login",
        "must_have": [
            ("trpc|useMutation|fetch|axios",         "Chamada de API para autenticar"),
            ("google|Google|OAuth",                   "Botão de login com Google"),
            ("password|senha",                        "Campo de senha"),
            ("email",                                 "Campo de email"),
            ("onSubmit|handleSubmit|handleLogin",     "Handler de submit do formulário"),
            ("toast|alert|error",                     "Feedback de erro para o usuário"),
        ],
        "nice_to_have": [
            ("forgot|esqueci",    "Link 'Esqueci minha senha'"),
            ("signup|cadastro",   "Link para cadastro"),
        ],
    },

    "Signup.tsx": {
        "desc": "Página de Cadastro",
        "must_have": [
            ("trpc|useMutation|fetch",            "Chamada de API para registrar"),
            ("password|senha",                    "Campo de senha"),
            ("email",                             "Campo de email"),
            ("name|nome",                         "Campo de nome"),
            ("onSubmit|handleSubmit|handleRegister", "Handler de submit"),
            ("toast|alert|error",                 "Feedback de erro"),
        ],
        "nice_to_have": [
            ("confirm.*password|confirmar",       "Confirmação de senha"),
            ("referral|indicacao|referredBy",     "Campo de código de indicação"),
        ],
    },

    "ForgotPassword.tsx": {
        "desc": "Esqueci minha senha",
        "must_have": [
            ("trpc|useMutation|fetch",        "Chamada de API"),
            ("email",                         "Campo de email"),
            ("onSubmit|handleSubmit",         "Handler de submit"),
            ("toast|alert|success",           "Feedback de sucesso/erro"),
        ],
        "nice_to_have": [
            ("voltar|back|login",             "Link para voltar ao login"),
        ],
    },

    "ResetPassword.tsx": {
        "desc": "Redefinir senha",
        "must_have": [
            ("trpc|useMutation|fetch",        "Chamada de API"),
            ("token|useParams|useLocation",   "Lê token da URL"),
            ("password|senha",                "Campo nova senha"),
            ("onSubmit|handleSubmit",         "Handler de submit"),
            ("toast|alert",                   "Feedback"),
        ],
        "nice_to_have": [],
    },

    # ── PERFIL ────────────────────────────────────────────────────
    "Profile.tsx": {
        "desc": "Perfil do usuário",
        "must_have": [
            ("trpc|useQuery|fetch",           "Carrega dados do usuário"),
            (r"user\.|useAuth|getUser",        "Usa dados do usuário logado"),
            ("name|nome",                     "Exibe nome"),
            ("email",                         "Exibe email"),
        ],
        "nice_to_have": [
            ("avatar|foto|photo|image",       "Foto de perfil"),
            ("edit|editar|EditProfile",       "Link para editar perfil"),
            ("subscription|plano|assinatura", "Exibe plano atual"),
        ],
    },

    "EditProfile.tsx": {
        "desc": "Editar perfil",
        "must_have": [
            ("trpc|useMutation|fetch",        "Chamada de API para salvar"),
            ("onSubmit|handleSubmit|handleSave", "Handler de salvar"),
            ("toast|alert",                   "Feedback de sucesso/erro"),
            ("name|nome",                     "Campo de nome editável"),
        ],
        "nice_to_have": [
            ("avatar|foto|upload",            "Upload de foto"),
            ("cancel|cancelar",               "Botão cancelar"),
        ],
    },

    # ── CURSOS ────────────────────────────────────────────────────
    "Courses.tsx": {
        "desc": "Listagem de cursos",
        "must_have": [
            ("trpc|useQuery|fetch",           "Carrega lista de cursos"),
            (r"map\s*\(",                      "Renderiza lista de cursos"),
            ("CourseDetail|/courses/",        "Link para detalhe do curso"),
        ],
        "nice_to_have": [
            ("search|busca|filtro|filter",    "Busca ou filtro de cursos"),
            ("loading|skeleton|spinner",      "Estado de carregamento"),
            ("empty|vazio|nenhum",            "Estado vazio"),
        ],
    },

    "CourseDetail.tsx": {
        "desc": "Detalhe do curso",
        "must_have": [
            ("trpc|useQuery|fetch",           "Carrega dados do curso"),
            ("useParams|slug|id",             "Lê ID/slug da URL"),
            ("enroll|matricular|subscribe|inscrever", "Botão de inscrição"),
            ("lessons|aulas",                 "Lista de aulas"),
        ],
        "nice_to_have": [
            ("description|descricao",         "Descrição do curso"),
            ("progress|progresso",            "Progresso do aluno"),
            ("certificate|certificado",       "Menção a certificado"),
        ],
    },

    "LessonView.tsx": {
        "desc": "Visualização de aula",
        "must_have": [
            ("trpc|useQuery|fetch",           "Carrega dados da aula"),
            ("useParams|id",                  "Lê ID da URL"),
            ("video|Video|player|Player|hls|HLS", "Player de vídeo"),
            ("complete|concluir|markComplete|progress", "Marcar aula como concluída"),
        ],
        "nice_to_have": [
            ("next|proxima|previous|anterior", "Navegação entre aulas"),
            ("notes|anotacoes",               "Anotações"),
            ("vr|VR|immersive",               "Modo VR"),
        ],
    },

    "MyCourses.tsx": {
        "desc": "Meus cursos",
        "must_have": [
            ("trpc|useQuery|fetch",           "Carrega cursos do usuário"),
            (r"map\s*\(",                      "Renderiza lista"),
            ("progress|progresso",            "Exibe progresso"),
        ],
        "nice_to_have": [
            ("certificate|certificado",       "Link para certificado"),
            ("empty|vazio|nenhum curso",      "Estado vazio"),
            ("continue|continuar",            "Botão continuar curso"),
        ],
    },

    # ── ASSINATURA ────────────────────────────────────────────────
    "MySubscription.tsx": {
        "desc": "Minha assinatura",
        "must_have": [
            ("trpc|useQuery|fetch",           "Carrega dados da assinatura"),
            ("plan|plano",                    "Exibe plano atual"),
            ("cancel|cancelar|manage|gerenciar", "Opção de cancelar/gerenciar"),
            ("status",                        "Exibe status da assinatura"),
        ],
        "nice_to_have": [
            ("portal|stripe",                 "Link para portal Stripe"),
            ("upgrade|atualizar",             "Opção de upgrade de plano"),
            ("next.*payment|proxim.*cobran",  "Data próximo pagamento"),
        ],
    },

    "Pricing.tsx": {
        "desc": "Página de planos",
        "must_have": [
            ("trpc|useMutation|createCheckout", "Cria checkout Stripe"),
            ("basic|basico|premium|vip",       "Exibe os planos"),
            ("handleSubscribe|onClick",         "Handler de clique no plano"),
            (r"price|preco|R\$",                "Exibe preços"),
        ],
        "nice_to_have": [
            ("isAuthenticated|useAuth",        "Verifica se está logado"),
            ("popular|destaque",               "Destaca plano popular"),
            ("features|beneficios",            "Lista de benefícios"),
        ],
    },

    "CheckoutSuccess.tsx": {
        "desc": "Sucesso no checkout",
        "must_have": [
            ("session_id|useLocation|useParams|searchParams", "Lê session_id da URL"),
            ("success|sucesso|parabens|obrigado",             "Mensagem de sucesso"),
            ("courses|dashboard",                             "Redirect para cursos/dashboard"),
        ],
        "nice_to_have": [
            ("plan|plano",                    "Exibe plano adquirido"),
            ("email",                         "Menciona confirmação por email"),
        ],
    },

    # ── ADMIN ─────────────────────────────────────────────────────
    "AdminUsers.tsx": {
        "desc": "Admin - Usuários",
        "must_have": [
            ("trpc|useQuery|fetch",           "Carrega lista de usuários"),
            (r"map\s*\(",                      "Renderiza lista"),
            ("delete|excluir|remove|remover", "Botão de excluir usuário"),
            ("search|busca",                  "Busca de usuários"),
        ],
        "nice_to_have": [
            ("role|papel|admin",              "Gerenciar papel do usuário"),
            ("ban|bloquear|block",            "Bloquear usuário"),
            ("pagination|pagina",             "Paginação"),
            ("confirm.*delete|confirmar.*excl", "Confirmação antes de excluir"),
        ],
    },

    "AdminCourses.tsx": {
        "desc": "Admin - Cursos",
        "must_have": [
            ("trpc|useQuery|fetch",           "Carrega lista de cursos"),
            ("create|criar|add|adicionar",    "Botão criar curso"),
            ("delete|excluir",                "Botão excluir curso"),
            ("edit|editar",                   "Botão editar curso"),
        ],
        "nice_to_have": [
            ("publish|publicar|active|ativo", "Publicar/despublicar curso"),
            ("lessons|aulas",                 "Link para gerenciar aulas"),
            ("confirm.*delete",               "Confirmação antes de excluir"),
        ],
    },

    "AdminLessons.tsx": {
        "desc": "Admin - Aulas",
        "must_have": [
            ("trpc|useQuery|fetch",           "Carrega aulas"),
            ("create|criar|add",              "Criar aula"),
            ("delete|excluir",                "Excluir aula"),
            ("video|url",                     "Campo de URL de vídeo"),
        ],
        "nice_to_have": [
            ("order|ordem|reorder",           "Reordenar aulas"),
            ("free|gratis|preview",           "Marcar aula como preview gratuito"),
        ],
    },

    "AdminFinanceiro.tsx": {
        "desc": "Admin - Financeiro",
        "must_have": [
            ("trpc|useQuery|fetch",           "Carrega dados financeiros"),
            ("payment|pagamento|revenue|receita", "Exibe receita/pagamentos"),
            ("subscription|assinatura",       "Dados de assinaturas"),
        ],
        "nice_to_have": [
            ("chart|grafico|recharts",        "Gráfico de receita"),
            ("export|exportar|csv",           "Exportar dados"),
            ("filter|filtro|date|data",       "Filtro por período"),
        ],
    },

    "AdminManageSubscriptions.tsx": {
        "desc": "Admin - Gerenciar assinaturas",
        "must_have": [
            ("trpc|useQuery|fetch",           "Carrega assinaturas"),
            (r"map\s*\(",                      "Renderiza lista"),
            ("cancel|cancelar|status",        "Alterar status da assinatura"),
        ],
        "nice_to_have": [
            ("stripe",                        "Integração Stripe"),
            ("manual|override",               "Assinatura manual"),
        ],
    },

    "AdminSettings.tsx": {
        "desc": "Admin - Configurações",
        "must_have": [
            ("trpc|useMutation|fetch",        "Salva configurações"),
            ("onSubmit|handleSave|handleSubmit", "Handler de salvar"),
            ("toast|alert",                   "Feedback de sucesso"),
        ],
        "nice_to_have": [
            ("email|smtp",                    "Configurações de email"),
            ("maintenance|manutencao",        "Modo manutenção"),
        ],
    },

    "AdminStudents.tsx": {
        "desc": "Admin - Estudantes",
        "must_have": [
            ("trpc|useQuery|fetch",           "Carrega estudantes"),
            (r"map\s*\(",                      "Renderiza lista"),
            ("enrollment|matricula|course",   "Mostra cursos matriculados"),
        ],
        "nice_to_have": [
            ("progress|progresso",            "Progresso nos cursos"),
            ("search|busca",                  "Busca de estudantes"),
        ],
    },

    "AdminDashboard.tsx": {
        "desc": "Painel admin",
        "must_have": [
            ("trpc|useQuery|fetch",           "Carrega dados do dashboard"),
            ("users|usuarios",                "Exibe total de usuários"),
            ("revenue|receita|subscription",  "Exibe métricas financeiras"),
        ],
        "nice_to_have": [
            ("chart|grafico|recharts",        "Gráficos"),
            ("recent|recente",                "Atividade recente"),
            ("alert|warning|atencao",         "Alertas importantes"),
        ],
    },

    # ── COMUNIDADE ────────────────────────────────────────────────
    "CommunityExplore.tsx": {
        "desc": "Explorar comunidade",
        "must_have": [
            ("trpc|useQuery|fetch",           "Carrega posts/membros"),
            (r"map\s*\(",                      "Renderiza lista"),
        ],
        "nice_to_have": [
            ("post|publicacao|create",        "Criar publicação"),
            ("like|curtir",                   "Curtir post"),
            ("comment|comentar",              "Comentar"),
            ("search|busca",                  "Busca na comunidade"),
        ],
    },

    # ── OUTROS ────────────────────────────────────────────────────
    "UserReferrals.tsx": {
        "desc": "Página de indicações",
        "must_have": [
            ("trpc|useQuery|fetch",           "Carrega dados de indicações"),
            ("referral.*code|codigo.*indicacao|referralCode", "Exibe código de indicação"),
            ("copy|copiar|clipboard",         "Botão copiar código"),
            ("points|pontos",                 "Exibe pontos ganhos"),
        ],
        "nice_to_have": [
            ("share|compartilhar",            "Compartilhar link"),
            ("history|historico",             "Histórico de indicações"),
            ("free.*month|mes.*gratis",       "Exibe meses grátis ganhos"),
        ],
    },

    "MyCertificates.tsx": {
        "desc": "Meus certificados",
        "must_have": [
            ("trpc|useQuery|fetch",           "Carrega certificados"),
            (r"map\s*\(",                      "Renderiza lista"),
            ("download|baixar|pdf|PDF",       "Download do certificado"),
        ],
        "nice_to_have": [
            ("empty|vazio|nenhum",            "Estado vazio"),
            ("share|compartilhar",            "Compartilhar certificado"),
            ("course.*name|nome.*curso",      "Nome do curso no certificado"),
        ],
    },

    "Messages.tsx": {
        "desc": "Mensagens",
        "must_have": [
            ("trpc|useQuery|fetch",           "Carrega mensagens"),
            ("send|enviar|submit",            "Enviar mensagem"),
            (r"map\s*\(",                      "Renderiza lista de mensagens"),
        ],
        "nice_to_have": [
            ("real.*time|socket|websocket",   "Mensagens em tempo real"),
            ("read|lida|unread",              "Marcar como lida"),
        ],
    },

    "Ebooks.tsx": {
        "desc": "Listagem de ebooks",
        "must_have": [
            ("trpc|useQuery|fetch",           "Carrega ebooks"),
            (r"map\s*\(",                      "Renderiza lista"),
            ("EbookReader|/ebook/",           "Link para abrir ebook"),
        ],
        "nice_to_have": [
            ("search|busca",                  "Busca de ebooks"),
            ("free|gratis|premium",           "Distingue ebooks gratuitos/pagos"),
        ],
    },

    "EbookReader.tsx": {
        "desc": "Leitor de ebook",
        "must_have": [
            ("trpc|useQuery|fetch",           "Carrega dados do ebook"),
            ("useParams|id",                  "Lê ID da URL"),
            ("pdf|PDF|viewer|iframe|embed",   "Exibe o PDF/ebook"),
        ],
        "nice_to_have": [
            ("download|baixar",               "Botão de download"),
            ("fullscreen|tela.*cheia",        "Modo tela cheia"),
        ],
    },
}

# ─────────────────────────────────────────────
#  CHECKS DE BACKEND (routers tRPC)
# ─────────────────────────────────────────────

BACKEND_CHECKS = {
    "subscriptions": {
        "file_patterns": ["subscriptions.ts", "subscription.ts"],
        "must_have": [
            ("createCheckout",        "Criar checkout Stripe"),
            ("getPortalUrl|portal",   "URL do portal de assinatura"),
            ("getByUserId",           "Buscar assinatura por usuário"),
            ("updateStatus",          "Atualizar status da assinatura"),
        ],
    },
    "auth": {
        "file_patterns": ["routers.ts", "auth.ts"],
        "must_have": [
            ("login",                 "Endpoint de login"),
            ("register|signup",       "Endpoint de cadastro"),
            ("logout",                "Endpoint de logout"),
            ("me|getUser",            "Endpoint de dados do usuário"),
        ],
    },
    "stripe-webhook": {
        "file_patterns": ["stripe-webhook.ts", "webhook.ts"],
        "must_have": [
            ("checkout.session.completed",    "Evento checkout concluído"),
            ("customer.subscription.deleted", "Evento cancelamento"),
            ("invoice.paid",                  "Evento fatura paga"),
            ("constructEvent|webhook",        "Verificação de assinatura"),
        ],
    },
}

# ─────────────────────────────────────────────
#  CHECKS DE FLUXOS COMPLETOS
# ─────────────────────────────────────────────

FLOW_CHECKS = [
    {
        "name": "Fluxo de pagamento",
        "steps": [
            ("client/src/pages/Pricing.tsx",          "createCheckout",     "Pricing chama createCheckout"),
            ("server/routers/subscriptions.ts",        "createCheckoutSession", "Backend cria sessão Stripe"),
            ("server/routes/stripe-webhook.ts",        "checkout.session.completed", "Webhook processa pagamento"),
            ("server/db.ts",                           "upsertSubscription", "Banco atualiza assinatura"),
        ],
    },
    {
        "name": "Fluxo de autenticação Google",
        "steps": [
            ("server/auth/passport.ts",    "GoogleStrategy",           "Passport registra Google"),
            ("server/auth/routes.ts",      "/google/callback",         "Rota de callback existe"),
            ("server/auth/routes.ts",      "COOKIE_NAME",              "Cookie correto é definido"),
            ("server/_core/sdk.ts",        "authenticateRequest",      "SDK autentica requisições"),
        ],
    },
    {
        "name": "Fluxo de indicações",
        "steps": [
            ("client/src/pages/UserReferrals.tsx",     "referralCode",      "Frontend exibe código"),
            ("server/db.ts",                            "createReferral",    "Banco cria indicação"),
            ("server/routes/stripe-webhook.ts",         "processReferral",   "Webhook processa indicação"),
            ("server/db.ts",                            "updateUserPoints",  "Banco atualiza pontos"),
        ],
    },
    {
        "name": "Fluxo de certificados",
        "steps": [
            ("client/src/pages/MyCertificates.tsx",    "fetch|trpc|useQuery", "Frontend carrega certificados"),
            ("server/db.ts",                            "certificate",         "Banco tem tabela de certificados"),
        ],
    },
]

# ─────────────────────────────────────────────
#  ENGINE DE ANÁLISE
# ─────────────────────────────────────────────

def check_page(filepath, checks):
    content = read_file(filepath)
    if not content:
        return {"error": "Arquivo não encontrado ou vazio"}

    results = {"ok": [], "missing": [], "nice_missing": []}

    for pattern, description in checks.get("must_have", []):
        if re.search(pattern, content, re.IGNORECASE):
            results["ok"].append(description)
        else:
            results["missing"].append(description)

    for pattern, description in checks.get("nice_to_have", []):
        if not re.search(pattern, content, re.IGNORECASE):
            results["nice_missing"].append(description)

    return results


def find_file(root, patterns):
    """Encontra arquivo por padrões de nome."""
    for pattern in patterns:
        # Busca direta
        for path in root.rglob(pattern):
            if "node_modules" not in str(path):
                return path
    return None


def audit_pages(root, src, target_page=None):
    if src is None:
        return {}

    pages_dir = src / "pages"
    if not pages_dir.exists():
        return {}

    results = {}
    checks_to_run = PAGE_CHECKS

    if target_page:
        checks_to_run = {k: v for k, v in PAGE_CHECKS.items()
                         if target_page.lower() in k.lower()}

    for filename, checks in checks_to_run.items():
        filepath = pages_dir / filename
        result = check_page(filepath, checks)
        result["desc"] = checks["desc"]
        result["exists"] = filepath.exists()
        results[filename] = result

    return results


def audit_backend(root):
    results = {}

    for name, checks in BACKEND_CHECKS.items():
        filepath = find_file(root, checks["file_patterns"])
        if not filepath:
            results[name] = {"error": f"Arquivo não encontrado ({', '.join(checks['file_patterns'])})"}
            continue

        content = read_file(filepath)
        ok_items = []
        missing_items = []

        for pattern, desc in checks["must_have"]:
            if re.search(pattern, content, re.IGNORECASE):
                ok_items.append(desc)
            else:
                missing_items.append(desc)

        results[name] = {
            "file": str(filepath.relative_to(root)),
            "ok": ok_items,
            "missing": missing_items,
        }

    return results


def audit_flows(root):
    results = []

    for flow in FLOW_CHECKS:
        flow_result = {"name": flow["name"], "steps": []}
        all_ok = True

        for file_pattern, pattern, description in flow["steps"]:
            filepath = root / file_pattern
            if not filepath.exists():
                # Tenta busca por nome
                filename = Path(file_pattern).name
                found = find_file(root, [filename])
                if found:
                    filepath = found
                else:
                    flow_result["steps"].append(("missing_file", description, file_pattern))
                    all_ok = False
                    continue

            content = read_file(filepath)
            if re.search(pattern, content, re.IGNORECASE):
                flow_result["steps"].append(("ok", description, str(filepath.name)))
            else:
                flow_result["steps"].append(("fail", description, str(filepath.name)))
                all_ok = False

        flow_result["all_ok"] = all_ok
        results.append(flow_result)

    return results


def audit_api_connections(src):
    """Verifica se as páginas estão realmente conectadas ao backend via tRPC."""
    if src is None:
        return []

    issues = []
    pages_dir = src / "pages"
    if not pages_dir.exists():
        return []

    for tsx_file in pages_dir.glob("*.tsx"):
        content = read_file(tsx_file)

        # Páginas que têm dados mas não fazem nenhuma chamada de API
        has_data_display = bool(re.search(r'\.map\s*\(|\.length|\.filter\s*\(', content))
        has_api_call = bool(re.search(r'trpc\.|useQuery|useMutation|fetch\(|axios\.', content))
        has_static_only = bool(re.search(r'const\s+\w+\s*=\s*\[', content))  # dados hardcoded

        if has_data_display and not has_api_call:
            if has_static_only:
                issues.append((tsx_file.name, "DADOS HARDCODED", "Usa dados estáticos em vez de API"))
            else:
                issues.append((tsx_file.name, "SEM API", "Renderiza dados sem chamar backend"))

        # Verifica mutações sem feedback
        has_mutation = bool(re.search(r'useMutation|\.mutate|onSubmit|handleSubmit', content))
        has_feedback = bool(re.search(r'toast\.|alert\(|setError|\.error|\.success', content))
        if has_mutation and not has_feedback:
            issues.append((tsx_file.name, "SEM FEEDBACK", "Faz mutações sem feedback visual ao usuário"))

        # Verifica loading states
        has_query = bool(re.search(r'useQuery|trpc\.\w+\.useQuery', content))
        has_loading = bool(re.search(r'isLoading|isPending|loading|skeleton|Skeleton|spinner', content))
        if has_query and not has_loading:
            issues.append((tsx_file.name, "SEM LOADING", "Faz consultas sem estado de carregamento"))

    return issues


def audit_delete_buttons(src):
    """Verifica botões de exclusão sem confirmação."""
    if src is None:
        return []

    issues = []
    if not src.exists():
        return []

    for tsx_file in src.rglob("*.tsx"):
        if "node_modules" in str(tsx_file):
            continue

        content = read_file(tsx_file)

        has_delete = bool(re.search(r'delete|excluir|remover|remove', content, re.IGNORECASE))
        has_confirm = bool(re.search(
            r'confirm\(|Dialog|Modal|AlertDialog|window\.confirm|"tem certeza"|"confirmar"',
            content, re.IGNORECASE
        ))

        if has_delete and not has_confirm:
            # Só reporta se parece ser uma página admin ou com mutações
            has_mutation = bool(re.search(r'useMutation|\.mutate', content))
            if has_mutation:
                rel = tsx_file.relative_to(src.parent.parent) if src.parent.parent.exists() else tsx_file
                issues.append(str(tsx_file.name))

    return issues


# ─────────────────────────────────────────────
#  RELATÓRIO HTML
# ─────────────────────────────────────────────

def generate_html(data, output_path):
    now = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

    rows_pages = ""
    for filename, result in data.get("pages", {}).items():
        if "error" in result:
            status = "🔴 Não encontrado"
            details = result["error"]
            bg = "#fee2e2"
        elif not result.get("exists"):
            status = "🔴 Arquivo ausente"
            details = "Página não existe"
            bg = "#fee2e2"
        elif result.get("missing"):
            status = f"🟡 Incompleta ({len(result['missing'])} itens)"
            details = "<br>".join([f"❌ {m}" for m in result["missing"]])
            if result.get("nice_missing"):
                details += "<br>" + "<br>".join([f"💡 {m}" for m in result["nice_missing"]])
            bg = "#fef9c3"
        else:
            status = "🟢 OK"
            details = "<br>".join([f"✅ {o}" for o in result["ok"]])
            bg = "#dcfce7"

        rows_pages += f"""
        <tr style="background:{bg}">
            <td><b>{filename}</b><br><small>{result.get('desc','')}</small></td>
            <td>{status}</td>
            <td style="font-size:12px">{details}</td>
        </tr>"""

    rows_flows = ""
    for flow in data.get("flows", []):
        icon = "🟢" if flow["all_ok"] else "🔴"
        steps_html = ""
        for step_status, desc, fname in flow["steps"]:
            if step_status == "ok":
                steps_html += f"<div>✅ {desc} <small>({fname})</small></div>"
            elif step_status == "fail":
                steps_html += f"<div>❌ {desc} <small>({fname})</small></div>"
            else:
                steps_html += f"<div>⚠️ {desc} <small>(arquivo não encontrado: {fname})</small></div>"

        rows_flows += f"""
        <tr>
            <td><b>{icon} {flow['name']}</b></td>
            <td>{steps_html}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Auditor Funcional - Shadia Platform</title>
<style>
  body {{ font-family: Arial, sans-serif; margin: 20px; background: #f8fafc; color: #1e293b; }}
  h1 {{ color: #7c3aed; }}
  h2 {{ color: #4338ca; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }}
  table {{ width: 100%; border-collapse: collapse; margin-bottom: 30px; }}
  th {{ background: #7c3aed; color: white; padding: 10px; text-align: left; }}
  td {{ padding: 10px; border: 1px solid #e2e8f0; vertical-align: top; }}
  .badge-ok {{ background: #16a34a; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; }}
  .badge-warn {{ background: #d97706; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; }}
  .badge-err {{ background: #dc2626; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; }}
  .summary {{ display: flex; gap: 20px; margin-bottom: 30px; flex-wrap: wrap; }}
  .card {{ background: white; border-radius: 8px; padding: 20px; min-width: 150px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
  .card h3 {{ margin: 0 0 8px 0; font-size: 14px; color: #64748b; }}
  .card .num {{ font-size: 32px; font-weight: bold; }}
  .green {{ color: #16a34a; }} .yellow {{ color: #d97706; }} .red {{ color: #dc2626; }}
</style>
</head>
<body>
<h1>🔬 Auditor Funcional — Shadia Platform</h1>
<p>Gerado em: {now}</p>

<div class="summary">
  <div class="card"><h3>Páginas OK</h3><div class="num green">{data['summary']['pages_ok']}</div></div>
  <div class="card"><h3>Páginas c/ problemas</h3><div class="num yellow">{data['summary']['pages_warn']}</div></div>
  <div class="card"><h3>Páginas ausentes</h3><div class="num red">{data['summary']['pages_missing']}</div></div>
  <div class="card"><h3>Fluxos OK</h3><div class="num green">{data['summary']['flows_ok']}</div></div>
  <div class="card"><h3>Fluxos com falha</h3><div class="num red">{data['summary']['flows_fail']}</div></div>
</div>

<h2>📄 Análise de Páginas</h2>
<table>
  <tr><th>Página</th><th>Status</th><th>Detalhes</th></tr>
  {rows_pages}
</table>

<h2>🔄 Fluxos Completos</h2>
<table>
  <tr><th>Fluxo</th><th>Etapas</th></tr>
  {rows_flows}
</table>

</body>
</html>"""

    Path(output_path).write_text(html, encoding="utf-8")


# ─────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Auditor Funcional Shadia Platform")
    parser.add_argument("--path", default=".", help="Caminho do projeto")
    parser.add_argument("--html", action="store_true", help="Gera relatório HTML")
    parser.add_argument("--page", default=None, help="Audita apenas uma página (ex: --page Login)")
    args = parser.parse_args()

    root = find_root(args.path)
    src  = find_src(root)

    # Cabeçalho
    print(f"\n{'='*60}")
    print(f"  SHADIA PLATFORM - AUDITOR FUNCIONAL v1.0")
    print(f"{'='*60}")
    print(f"  Raiz : {root}")
    print(f"  src/ : {src or 'NAO ENCONTRADO'}")
    print(f"  Hora : {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print(f"{'='*60}")

    # ── PÁGINAS ───────────────────────────────────────────────────
    section("ANÁLISE FUNCIONAL DE PÁGINAS")
    pages_results = audit_pages(root, src, args.page)

    pages_ok = pages_warn = pages_missing = 0

    for filename, result in sorted(pages_results.items()):
        if not result.get("exists") or "error" in result:
            err(f"{filename} — {result.get('desc','')} [ARQUIVO AUSENTE]")
            pages_missing += 1
        elif result.get("missing"):
            warn(f"{filename} — {result.get('desc','')} ({len(result['missing'])} itens faltando)")
            for m in result["missing"]:
                print(f"         {col(RED,'✗')} {m}")
            if result.get("nice_missing"):
                for m in result["nice_missing"]:
                    print(f"         {col(CYAN,'💡')} {m} (recomendado)")
            pages_warn += 1
        else:
            ok(f"{filename} — {result.get('desc','')}")
            pages_ok += 1

    # ── BACKEND ───────────────────────────────────────────────────
    section("ANÁLISE DO BACKEND (tRPC Routers)")
    backend_results = audit_backend(root)

    for name, result in backend_results.items():
        if "error" in result:
            err(f"{name}: {result['error']}")
        else:
            if result["missing"]:
                warn(f"{name} ({result['file']}) — {len(result['missing'])} endpoint(s) faltando:")
                for m in result["missing"]:
                    print(f"         {col(RED,'✗')} {m}")
            else:
                ok(f"{name} ({result['file']}) — completo")

    # ── FLUXOS COMPLETOS ──────────────────────────────────────────
    section("FLUXOS END-TO-END")
    flow_results = audit_flows(root)
    flows_ok = flows_fail = 0

    for flow in flow_results:
        if flow["all_ok"]:
            ok(f"{flow['name']}")
            flows_ok += 1
        else:
            err(f"{flow['name']} — fluxo incompleto:")
            for step_status, desc, fname in flow["steps"]:
                if step_status == "ok":
                    print(f"         {col(GREEN,'✓')} {desc}")
                elif step_status == "fail":
                    print(f"         {col(RED,'✗')} {desc} ({fname})")
                else:
                    print(f"         {col(YELLOW,'?')} {desc} — arquivo não encontrado: {fname}")
            flows_fail += 1

    # ── CONEXÕES API ──────────────────────────────────────────────
    section("PÁGINAS SEM CONEXÃO COM API")
    api_issues = audit_api_connections(src)
    if not api_issues:
        ok("Todas as páginas estão conectadas ao backend")
    else:
        for filename, issue_type, desc in api_issues:
            warn(f"{filename} [{issue_type}] — {desc}")

    # ── BOTÕES SEM CONFIRMAÇÃO ────────────────────────────────────
    section("BOTÕES DE EXCLUSÃO SEM CONFIRMAÇÃO")
    delete_issues = audit_delete_buttons(src)
    if not delete_issues:
        ok("Todos os botões de exclusão têm confirmação")
    else:
        for filename in delete_issues:
            warn(f"{filename} — botão de excluir sem diálogo de confirmação")

    # ── SCORE FINAL ───────────────────────────────────────────────
    section("SCORE FINAL")
    total_pages = pages_ok + pages_warn + pages_missing
    print(f"\n  Páginas completas:   {pages_ok}/{total_pages}")
    print(f"  Páginas incompletas: {pages_warn}/{total_pages}")
    print(f"  Páginas ausentes:    {pages_missing}/{total_pages}")
    print(f"  Fluxos OK:           {flows_ok}/{flows_ok+flows_fail}")
    print(f"  Problemas de API:    {len(api_issues)}")
    print(f"  Botões sem confirm:  {len(delete_issues)}")

    total_issues = pages_warn + pages_missing + flows_fail + len(api_issues) + len(delete_issues)
    if total_issues == 0:
        print(f"\n  {col(GREEN+BOLD,'✅ PLATAFORMA FUNCIONALMENTE COMPLETA!')}\n")
    elif total_issues <= 5:
        print(f"\n  {col(YELLOW+BOLD, f'⚠️  QUASE COMPLETA — {total_issues} problema(s) menor(es)')}\n")
    else:
        print(f"\n  {col(RED+BOLD, f'❌ {total_issues} PROBLEMA(S) FUNCIONAL(IS) ENCONTRADO(S)')}\n")

    # ── HTML ──────────────────────────────────────────────────────
    if args.html:
        summary = {
            "pages_ok": pages_ok,
            "pages_warn": pages_warn,
            "pages_missing": pages_missing,
            "flows_ok": flows_ok,
            "flows_fail": flows_fail,
        }
        output = root / "audit_funcional.html"
        generate_html({"pages": pages_results, "flows": flow_results, "summary": summary}, output)
        print(f"  {col(GREEN,'Relatório HTML gerado:')} {output}\n")


if __name__ == "__main__":
    main()
