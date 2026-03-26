/**
 * logger.ts — Re-export do logger principal (server/logger.ts)
 * Necessário para satisfazer imports "../logger" feitos por arquivos dentro de server/
 *
 * Posição: /opt/render/project/src/logger.ts
 */
export { log, logFile } from "./server/logger";
