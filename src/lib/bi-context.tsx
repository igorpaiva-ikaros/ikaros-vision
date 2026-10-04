import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { Session } from "@supabase/supabase-js";
import { supabase, backendConfigured } from "@/integrations/supabase/client";
import { getBiState } from "./bi.functions";
import { buildDemoDataset } from "./demo/dataset";
import { buildPeriod, type Period } from "./domain/period";
import type { ConnectionState, Dataset } from "./domain/types";

type Mode = "real" | "demo";

interface BiCtx {
  mode: Mode;
  setMode: (m: Mode) => void;
  includeTests: boolean;
  setIncludeTests: (v: boolean) => void;
  period: Period;
  setPeriod: (p: Period) => void;
  session: Session | null;
  authReady: boolean;
  state: ConnectionState | null;
  loading: boolean;
  dataset: Dataset | null;
  reload: () => void;
}

const Ctx = createContext<BiCtx | null>(null);
const MODE_KEY = "ikaros-bi-mode"; // only a UI flag, never data

export function BiProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>("real");
  const [includeTests, setIncludeTests] = useState(false);
  const [period, setPeriod] = useState<Period>(() => buildPeriod("7d"));
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const qc = useQueryClient();
  const fetchState = useServerFn(getBiState);

  useEffect(() => {
    if (sessionStorage.getItem(MODE_KEY) === "demo") setModeState("demo");
    if (!backendConfigured) { setAuthReady(true); return; }
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_OUT") qc.removeQueries({ queryKey: ["bi-state"] });
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    }).catch(() => setAuthReady(true));
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  const setMode = (m: Mode) => {
    setModeState(m);
    sessionStorage.setItem(MODE_KEY, m);
  };

  const userId = session?.user.id ?? null;
  const q = useQuery({
    queryKey: ["bi-state", userId],
    queryFn: () => fetchState(),
    enabled: mode === "real" && !!userId,
    staleTime: 60_000,
  });

  const demo = useMemo(() => (mode === "demo" ? buildDemoDataset() : null), [mode]);

  let state: ConnectionState | null;
  if (mode === "demo") state = { status: "demo" };
  else if (!authReady) state = null;
  else if (!backendConfigured) state = { status: "not_configured", missing: ["Configuração do acesso interno pendente"] };
  else if (!userId) state = { status: "signed_out" };
  else if (q.isError) state = { status: "error", message: "Não foi possível consultar os dados. Tente atualizar ou confira seu acesso." };
  else state = q.data ?? null;

  const dataset = mode === "demo" ? demo : state?.status === "ok" ? state.dataset : null;

  return (
    <Ctx.Provider
      value={{
        mode, setMode, includeTests, setIncludeTests, period, setPeriod, session, authReady,
        state, loading: mode === "real" && (!authReady || q.isLoading), dataset,
        reload: () => qc.invalidateQueries({ queryKey: ["bi-state"] }),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useBi() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBi outside BiProvider");
  return c;
}

/** Non-throwing variant for components that may render outside the provider (e.g. error boundaries). */
export function useBiOptional() {
  return useContext(Ctx);
}

