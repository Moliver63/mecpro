import { Redirect } from "wouter";
import { useAuth } from "@/hooks/useAuth";

interface ProtectedRouteProps {
  children: React.ReactNode;
  role?: "admin" | "superadmin";
}

export default function ProtectedRoute({ children, role }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
        <div className="w-8 h-8 border-2 border-[#00ff88] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (role === "admin" && user.role !== "admin" && user.role !== "superadmin") {
    return <Redirect to="/unauthorized" />;
  }

  if (role === "superadmin" && user.role !== "superadmin") {
    return <Redirect to="/unauthorized" />;
  }

  return <>{children}</>;
}
