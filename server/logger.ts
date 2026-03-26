import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, "../logs");
const LOG_FILE = path.join(LOG_DIR, `app-${new Date().toISOString().slice(0,10)}.log`);

// Garantir que a pasta logs existe
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

type Level = "INFO" | "WARN" | "ERROR" | "DEBUG" | "AUTH" | "DB" | "EMAIL" | "OAUTH";

function write(level: Level, context: string, message: string, data?: any) {
  const ts = new Date().toISOString();
  const dataStr = data ? " " + JSON.stringify(data, null, 0) : "";
  const line = `[${ts}] [${level.padEnd(5)}] [${context}] ${message}${dataStr}`;

  // Console colorido
  const colors: Record<Level, string> = {
    INFO:  "\x1b[36m",  // cyan
    WARN:  "\x1b[33m",  // yellow
    ERROR: "\x1b[31m",  // red
    DEBUG: "\x1b[90m",  // gray
    AUTH:  "\x1b[35m",  // magenta
    DB:    "\x1b[34m",  // blue
    EMAIL: "\x1b[32m",  // green
    OAUTH: "\x1b[95m",  // bright magenta
  };
  console.log(`${colors[level]}${line}\x1b[0m`);

  // Arquivo de log
  try {
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch {}
}

export const log = {
  info:  (ctx: string, msg: string, data?: any) => write("INFO",  ctx, msg, data),
  warn:  (ctx: string, msg: string, data?: any) => write("WARN",  ctx, msg, data),
  error: (ctx: string, msg: string, data?: any) => write("ERROR", ctx, msg, data),
  debug: (ctx: string, msg: string, data?: any) => write("DEBUG", ctx, msg, data),
  auth:  (ctx: string, msg: string, data?: any) => write("AUTH",  ctx, msg, data),
  db:    (ctx: string, msg: string, data?: any) => write("DB",    ctx, msg, data),
  email: (ctx: string, msg: string, data?: any) => write("EMAIL", ctx, msg, data),
  oauth: (ctx: string, msg: string, data?: any) => write("OAUTH", ctx, msg, data),
};

export const logFile = LOG_FILE;
