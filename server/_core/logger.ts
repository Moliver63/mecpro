/**
 * Logger proxy — re-exporta server/logger.ts
 * Garante que imports "./logger" de dentro de server/_core/ funcionem
 * independente de qual versão do código está em execução.
 */
export { log, logFile } from "../logger";
export { log as default } from "../logger";
