import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "client/src") } },
  root: "client",
  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vendor: React core
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
            return "vendor-react";
          }
          // Vendor: tRPC + React Query
          if (id.includes("node_modules/@trpc/") || id.includes("node_modules/@tanstack/")) {
            return "vendor-trpc";
          }
          // Vendor: UI libs
          if (id.includes("node_modules/sonner") || id.includes("node_modules/recharts")) {
            return "vendor-ui";
          }
          // Páginas Admin — raramente acessadas
          if (id.includes("/pages/Admin")) {
            return "pages-admin";
          }
          // Módulos pesados do Mecpro (Módulo 2, 3, 4)
          if (
            id.includes("/pages/CompetitorAnalysis") ||
            id.includes("/pages/MarketIntelligence") ||
            id.includes("/pages/CampaignResult") ||
            id.includes("/pages/CampaignBuilder") ||
            id.includes("/pages/GoogleCampaignCreator") ||
            id.includes("/pages/FacebookCampaignCreator") ||
            id.includes("/pages/MetaIntegration") ||
            id.includes("/pages/Consultas")
          ) {
            return "pages-modules";
          }
          // Páginas de configurações e perfil
          if (
            id.includes("/pages/Settings") ||
            id.includes("/pages/Profile") ||
            id.includes("/pages/Billing") ||
            id.includes("/pages/AlertsSettings") ||
            id.includes("/pages/Messages") ||
            id.includes("/pages/ClientProfile") ||
            id.includes("/pages/ProjectDetail")
          ) {
            return "pages-settings";
          }
          // Páginas de conteúdo (cursos, ebooks)
          if (
            id.includes("/pages/Courses") ||
            id.includes("/pages/CourseDetail") ||
            id.includes("/pages/Ebooks") ||
            id.includes("/pages/EbookReader") ||
            id.includes("/pages/LessonView") ||
            id.includes("/pages/MyCertificates")
          ) {
            return "pages-content";
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
});
