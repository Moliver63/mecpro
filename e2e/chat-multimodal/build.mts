import { build } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
const repo = path.resolve(import.meta.dirname, "../..");
await build({
  root: import.meta.dirname,
  configFile: false,
  plugins: [react()],
  resolve: { alias: { "@": path.join(repo, "client/src"), "~shared": path.join(repo, "shared") } },
  css: { postcss: repo },
  build: { outDir: process.env.E2E_OUT || "/tmp/e2e-dist", emptyOutDir: true, minify: false },
  logLevel: "warn",
});
console.log("BUILD_OK");
