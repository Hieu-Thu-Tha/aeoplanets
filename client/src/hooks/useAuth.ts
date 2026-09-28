import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
    throwOnError: false,
    refetchOnWindowFocus: false,
  });

  const isUnauthorized = error && /^401:/.test((error as Error).message);
  const isEmailNotVerified = error && /^403:/.test((error as Error).message) &&
    ((error as Error).message.includes("EMAIL_NOT_VERIFIED") ||
     (error as Error).message.includes("Email not verified"));
  
  return {
    user,
    isLoading,
    isAuthenticated: !!user && !isUnauthorized && !isEmailNotVerified,
    isAdmin: user?.role === "admin",
    isManager: user?.role === "manager" || user?.role === "admin",
    error: isUnauthorized || isEmailNotVerified ? undefined : error,
    needsEmailVerification: !!isEmailNotVerified,
  };
}
