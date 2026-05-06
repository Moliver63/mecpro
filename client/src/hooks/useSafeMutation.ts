// hooks/useSafeMutation.ts — MecProAI
// Padrão único para toda mutation do sistema
// Stack: React + wouter (não Next.js) + tRPC + React Query v5

import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type MutationFn<TInput, TOutput> = (input: TInput) => Promise<TOutput>;

type Options<TOutput> = {
  onSuccess?:      (data: TOutput) => void;
  onError?:        (error: any) => void;
  redirectTo?:     (data: TOutput) => string | null;
  invalidateKeys?: (() => void)[];   // array de refetch() functions do tRPC/React Query
  successMessage?: string;
  errorMessage?:   string;
  // v2: retry, timeout, optimistic (futuro)
};

export function useSafeMutation<TInput = any, TOutput = any>(
  mutationFn: MutationFn<TInput, TOutput>,
  options?: Options<TOutput>
) {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);
  const isMounted = useRef(true);

  // Track unmount — evita setState em componente desmontado
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const execute = useCallback(async (input: TInput): Promise<TOutput | null> => {
    if (!isMounted.current) return null;
    let redirected = false;

    try {
      if (isMounted.current) setLoading(true);

      const data = await mutationFn(input);

      if (data === undefined || data === null) {
        throw new Error("Mutation retornou vazio");
      }

      // 1. Invalida cache (refetch das queries dependentes)
      if (options?.invalidateKeys?.length) {
        options.invalidateKeys.forEach(fn => { try { fn(); } catch {} });
      }

      // 2. Callback de sucesso
      options?.onSuccess?.(data);

      // 3. Feedback de sucesso
      if (options?.successMessage) {
        toast.success(options.successMessage);
      }

      // 4. Redirect controlado — setLoading(false) ANTES de desmontar
      if (options?.redirectTo) {
        const path = options.redirectTo(data);
        if (path) {
          if (isMounted.current) setLoading(false);
          redirected = true;
          setLocation(path);
          return data; // sai sem executar finally
        }
      }

      return data;

    } catch (error: any) {
      if (isMounted.current) {
        const msg = options?.errorMessage || error?.message || "Erro inesperado";
        // Não exibe toast para erros de timeout (tratados externamente)
        const isTimeout = msg.includes("TIMEOUT") || msg.includes("demorou")
          || msg.includes("Failed to fetch") || msg.includes("transform response");
        if (!isTimeout) {
          toast.error(msg, { duration: 6000 });
        }
        options?.onError?.(error);
      }
      return null;

    } finally {
      // Só encerra loading se componente ainda montado E não houve redirect
      if (!redirected && isMounted.current) {
        setLoading(false);
      }
    }
  }, [mutationFn, options, setLocation]);

  return { execute, loading };
}
