import { useMemo } from "react";
import { useBi } from "./bi-context";
import { excludeTests, indexClients, visibleClients } from "./domain/metrics";
import type { Dataset } from "./domain/types";

/** Applies the global "Incluir testes" toggle to a dataset. */
export function useScoped(ds: Dataset) {
  const { includeTests } = useBi();
  return useMemo(() => {
    const clientsById = indexClients(ds.clients);
    return {
      clientsById,
      demands: excludeTests(ds.demands, clientsById, includeTests),
      clients: visibleClients(ds.clients, includeTests),
    };
  }, [ds, includeTests]);
}
