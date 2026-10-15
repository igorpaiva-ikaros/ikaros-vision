import { useQuery } from "@tanstack/react-query";
import { getPresentation } from "./functions";
import { useQueryClient } from "@tanstack/react-query";
export function useBi() {
  const qc = useQueryClient();
  const lead = sessionStorage.getItem("qa-leader") === "true";
  const { data: previewConfig = false } = useQuery({
    queryKey: ["qa-preview-config"],
    queryFn: () => false,
    initialData: false,
    staleTime: Infinity,
  });
  const setPreviewConfig = (value: boolean) => qc.setQueryData(["qa-preview-config"], value);
  const q = useQuery({
    queryKey: ["presentation", "00000000-0000-4000-8000-000000000001"],
    queryFn: getPresentation,
  });
  return {
    presentation: (window.location.pathname === "/administracao" && previewConfig
      ? q.data?.draft
      : q.data?.published) ?? { labels: {}, order: {}, views: [] },
    previewConfig,
    setPreviewConfig,
    session: {
      user: { id: "00000000-0000-4000-8000-000000000001", email: "example@example.test" },
    },
    profile: {
      id: "00000000-0000-4000-8000-000000000001",
      full_name: "CS Exemplo",
      access: lead
        ? { is_lead: true, view_team: true, manage_cs: true, promote_cs: true, hidden_areas: [] }
        : undefined,
      role: lead
        ? "cs"
        : window.location.pathname === "/tecnico"
          ? "technical"
          : ["/administracao", "/aprovacoes"].includes(window.location.pathname)
            ? "admin"
            : "cs",
      avatar_url: null,
    },
    includeTests: false,
    setIncludeTests: () => {},
    authReady: true,
    state: { status: "ready" },
    mode: "real",
    reload: () =>
      void qc.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== "qa-preview-config",
      }),
    setMode: () => {},
    period: {},
    setPeriod: () => {},
  };
}
export const useBiOptional = useBi;
