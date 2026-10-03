import { createFileRoute } from "@tanstack/react-router";
import { StateGate } from "@/components/bi/StateGate";
import { PageTitle } from "@/components/bi/primitives";
import { DemandTable } from "@/components/bi/DemandTable";
import { useScoped } from "@/lib/use-scoped";
import type { Dataset } from "@/lib/domain/types";

export const Route = createFileRoute("/demandas")({
  head: () => ({
    meta: [
      { title: "Demandas — Ikaros BI CS" },
      { name: "description", content: "Lista filtrável de demandas de Customer Success." },
      { property: "og:title", content: "Demandas — Ikaros BI CS" },
      { property: "og:description", content: "Lista filtrável de demandas de Customer Success." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <StateGate>{(ds) => <Page ds={ds} />}</StateGate>,
});

function Page({ ds }: { ds: Dataset }) {
  const s = useScoped(ds);
  return (
    <>
      <PageTitle title="Demandas" subtitle="Todas as demandas (o período não filtra esta lista). Clique numa linha para ver o detalhe." />
      <DemandTable demands={s.demands} clients={s.clients} clientsById={s.clientsById} />
    </>
  );
}
