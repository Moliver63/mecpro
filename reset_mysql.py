import subprocess
import os
import time

print("🔧 Reiniciando MySQL em modo seguro...")

# Parar serviço
subprocess.run(["net", "stop", "MySQL80"], capture_output=True)

# Caminho do MySQL
mysql_path = "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin"

# Arquivo temporário com comandos SQL
with open("reset.sql", "w") as f:
    f.write("""
FLUSH PRIVILEGES;
ALTER USER 'root'@'localhost' IDENTIFIED BY 'Shadia@12345';
ALTER USER 'shadia'@'localhost' IDENTIFIED BY 'Shadia@12345';
exit;
""")

print("✅ Arquivo reset.sql criado")
print("Agora execute em um NOVO terminal como Administrador:")
print(f'cd "{mysql_path}"')
print('mysqld.exe --skip-grant-tables')
print("\nEm outro terminal, execute:")
print(f'cd "{mysql_path}"')
print('mysql.exe -u root --skip-password < C:\\caminho\\para\\reset.sql')