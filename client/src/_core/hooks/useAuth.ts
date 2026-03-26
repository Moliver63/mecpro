import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) return null;
        return res.json();
      } catch { return null; }
    },
    retry: false,
    staleTime: 1000 * 60 * 5,
  });
  return { user: user ?? null, isLoading, isAuthenticated: !!user };
}
