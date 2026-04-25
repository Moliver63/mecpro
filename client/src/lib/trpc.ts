import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/_core/router";

export const trpc = createTRPCReact<AppRouter>();

const getBaseUrl = () => {
  // Em produção: mesma origem
  if (typeof window === "undefined") return "";
  if (import.meta.env.PROD) return "";
  // Em dev: aponta direto para o backend
  return import.meta.env.VITE_API_URL || "http://localhost:5000";
};

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
      fetch(url, options) {
        // Timeout de 90s para mutations longas como generateCampaign
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 90000);
        return fetch(url, {
          ...options,
          credentials: "include",
          signal: options?.signal ?? controller.signal,
        }).finally(() => clearTimeout(timer));
      },
    }),
  ],
});
