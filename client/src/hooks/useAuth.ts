import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        const base = import.meta.env.PROD ? "" : (import.meta.env.VITE_API_URL || "http://localhost:5000");
        const res = await fetch(`${base}/api/auth/me`, { credentials: "include" });
        if (!res.ok) return null;
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) return null; // evita parsear HTML
        return res.json();
      } catch {
        return null;
      }
    },
    retry: 1,
    staleTime: 1000 * 60 * 5,        // 5 min cache
    refetchOnMount: true,              // sempre verifica ao montar
    refetchOnWindowFocus: false,
  });

  return { user: user ?? null, isLoading, isAuthenticated: !!user };
}
