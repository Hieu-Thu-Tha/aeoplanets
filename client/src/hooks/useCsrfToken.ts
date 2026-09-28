import { useQuery } from "@tanstack/react-query";

interface CsrfTokenResponse {
  csrfToken: string;
}

export function useCsrfToken() {
  const { data, isLoading, error, refetch } = useQuery<CsrfTokenResponse>({
    queryKey: ["/api/auth/csrf-token"],
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  return {
    csrfToken: data?.csrfToken,
    isLoading,
    error,
    // The CSRF secret lives on req.session (csurf with cookie: false), so a
    // cached token is only valid for the session that issued it. Callers that
    // destroy/replace the session (e.g. logout right before signup) must
    // refetch to get a token bound to the new session before submitting.
    refetchCsrfToken: refetch,
  };
}
