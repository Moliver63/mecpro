import os
from urllib.parse import urlparse
import sys

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("❌ DATABASE_URL não encontrada.")
    sys.exit(1)

print("\n======================================")
print("  SHADIA DATABASE DETECTOR")
print("======================================")

parsed = urlparse(DATABASE_URL)

scheme = parsed.scheme.lower()
host = parsed.hostname
database = parsed.path.replace("/", "")

print(f"\n🔎 URL detectada:")
print(f"   Host: {host}")
print(f"   Database: {database}")

if "postgres" in scheme:
    print("\n🟢 Banco detectado: POSTGRESQL")

    try:
        import psycopg

        with psycopg.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT tablename
                    FROM pg_catalog.pg_tables
                    WHERE schemaname = 'public'
                    ORDER BY tablename
                """)
                tables = cur.fetchall()

        print(f"\n📦 Total de tabelas: {len(tables)}")
        for t in tables:
            print("   -", t[0])

    except Exception as e:
        print("❌ Erro ao conectar no PostgreSQL:", e)

elif "mysql" in scheme:
    print("\n🟡 Banco detectado: MYSQL")

    try:
        import pymysql

        conn = pymysql.connect(
            host=parsed.hostname,
            user=parsed.username,
            password=parsed.password,
            database=database,
            port=parsed.port or 3306
        )

        with conn.cursor() as cur:
            cur.execute("SHOW TABLES;")
            tables = cur.fetchall()

        print(f"\n📦 Total de tabelas: {len(tables)}")
        for t in tables:
            print("   -", t[0])

        conn.close()

    except Exception as e:
        print("❌ Erro ao conectar no MySQL:", e)

else:
    print("⚠️ Tipo de banco não reconhecido:", scheme)

print("\n======================================\n")