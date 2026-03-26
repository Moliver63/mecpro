import os
import sys
from urllib.parse import urlparse, parse_qs

import psycopg


EXPECTED_TABLES = [
    "activitylogs",
    "admin_audit_logs",
    "admininvites",
    "admin_permissions",
    "appointments",
    "cashbackrequests",
    "certificates",
    "connection_requests",
    "connections",
    "conversations",
    "course_modules",
    "course_purchases",
    "course_reviews",
    "courses",
    "ebooks",
    "email_verification_tokens",
    "enrollments",
    "lessons",
    "messages",
    "moderation_logs",
    "notifications",
    "password_reset_tokens",
    "payment_history",
    "pointstransactions",
    "referrals",
    "refresh_tokens",
    "reports",
    "subscription_plans",
    "subscriptions",
    "user_badges",
    "user_profiles",
    "usersettings",
    "user_subscriptions",
    "users",
]

# ENUMs mínimos “sinalizadores” (pode adicionar outros depois)
EXPECTED_ENUMS_AT_LEAST = [
    "admin_action",
]


def has_sslmode_require(conn_str: str) -> bool:
    try:
        q = parse_qs(urlparse(conn_str).query)
        return q.get("sslmode", [""])[0] in {"require", "verify-full", "verify-ca", "prefer"}
    except Exception:
        return False


def main() -> int:
    conn_str = os.getenv("DATABASE_URL")
    if not conn_str:
        print("❌ DATABASE_URL não está definido.")
        print('   Exemplo PowerShell: $env:DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"')
        return 1

    # Render normalmente exige SSL. Se não tiver sslmode, avisamos (mas ainda tentamos).
    if not has_sslmode_require(conn_str):
        print("⚠️ Aviso: sua DATABASE_URL não tem sslmode. O Render normalmente exige SSL.")
        print("   Sugestão: adicione ?sslmode=require")

    try:
        print("🔌 Conectando no PostgreSQL (Render)...")
        with psycopg.connect(conn_str) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    select
                        version(),
                        current_database(),
                        current_schema()
                """)
                version, db, schema = cur.fetchone()

                print("\n✅ Conexão OK")
                print(f"   DB: {db}")
                print(f"   Schema atual: {schema}")
                print(f"   Version: {version}")

                # Tabelas em public
                cur.execute("""
                    select lower(tablename)
                    from pg_catalog.pg_tables
                    where schemaname = 'public'
                    order by tablename
                """)
                actual_tables = [r[0] for r in cur.fetchall()]

                expected_set = set(EXPECTED_TABLES)
                actual_set = set(actual_tables)

                missing = [t for t in EXPECTED_TABLES if t not in actual_set]
                extra = [t for t in actual_tables if t not in expected_set]

                print("\n📦 Tabelas no schema public:", len(actual_tables))
                print("🎯 Tabelas esperadas:", len(EXPECTED_TABLES))

                if not missing:
                    print("✅ Nenhuma tabela esperada está faltando.")
                else:
                    print("❌ Tabelas faltando:")
                    for t in missing:
                        print("   -", t)

                if not extra:
                    print("✅ Nenhuma tabela extra (fora do esperado).")
                else:
                    print("⚠️ Tabelas extras (podem ser antigas ou de outro deploy):")
                    for t in extra:
                        print("   -", t)

                # ENUMs em public
                cur.execute("""
                    select lower(t.typname)
                    from pg_type t
                    join pg_namespace n on n.oid = t.typnamespace
                    where t.typtype = 'e'
                      and n.nspname = 'public'
                    order by t.typname
                """)
                actual_enums = [r[0] for r in cur.fetchall()]

                missing_enums = [e for e in EXPECTED_ENUMS_AT_LEAST if e not in actual_enums]

                print("\n🏷️ ENUMs no public:", len(actual_enums))
                if not missing_enums:
                    print("✅ ENUMs mínimos encontrados:", ", ".join(EXPECTED_ENUMS_AT_LEAST))
                else:
                    print("❌ ENUMs mínimos faltando:")
                    for e in missing_enums:
                        print("   -", e)

                ok = (len(missing) == 0) and (len(missing_enums) == 0)

                print("\n================ RESULTADO ================")
                if ok:
                    print("✅ OK: Render/PostgreSQL está compatível (schema base presente).")
                    return 0
                else:
                    print("❌ NÃO OK: ainda falta ajustar migrations/schema no Render.")
                    return 2

    except Exception as e:
        print("\n❌ Falhou ao conectar/consultar:", str(e))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())