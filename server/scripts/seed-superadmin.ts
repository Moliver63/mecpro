import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { users } from "../schema";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";

dotenv.config();

const EMAIL = "admin@mecpro.com.br";
const PASSWORD = "Admin@123";
const NAME = "Super Admin";

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: false });
  const db = drizzle(pool);

  const existing = await db.select().from(users).where(eq(users.role, "superadmin")).limit(1);
  if (existing.length > 0) {
    console.log("✅ Superadmin já existe:", existing[0].email);
    await pool.end(); return;
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  await db.insert(users).values({ email: EMAIL, name: NAME, passwordHash, role: "superadmin", emailVerified: 1, loginMethod: "email" });

  console.log("✅ Superadmin criado!");
  console.log("   Email:", EMAIL);
  console.log("   Senha:", PASSWORD);
  console.log("⚠️  Troque a senha após o primeiro login!");
  await pool.end();
}

seed().catch(e => { console.error(e); process.exit(1); });


