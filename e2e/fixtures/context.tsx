import { useQueryClient } from "@tanstack/react-query";
export function useBi() {
  const qc = useQueryClient();
  return {
    session: {
      user: { id: "00000000-0000-4000-8000-000000000001", email: "example@example.test" },
    },
    profile: {
      id: "00000000-0000-4000-8000-000000000001",
      full_name: "CS Exemplo",
      role: window.location.pathname === "/administracao" ? "admin" : "cs",
      avatar_url: null,
    },
    includeTests: false,
    setIncludeTests: () => {},
    authReady: true,
    state: { status: "ready" },
    mode: "real",
    reload: () => void qc.invalidateQueries(),
    setMode: () => {},
    period: {},
    setPeriod: () => {},
  };
}
export const useBiOptional = useBi;
