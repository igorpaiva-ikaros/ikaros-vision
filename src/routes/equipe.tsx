import { createFileRoute } from "@tanstack/react-router";
import { StateGate } from "@/components/bi/StateGate";
import { PageTitle } from "@/components/bi/primitives";
import { useScoped } from "@/lib/use-scoped";
import { useBi } from "@/lib/bi-context";
import { teamStats } from "@/lib/domain/metrics";
import type { Dataset } from "@/lib/domain/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe — Ikaros BI CS" },
      { name: "description", content: "Volume e backlog por responsável do CS." },
      { property: "og:title", content: "Equipe — Ikaros BI CS" },
      { property: "og:description", content: "Volume e backlog por responsável do CS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <StateGate>{(ds) => <Page ds={ds} />}</StateGate>,
});

function Page({ ds }: { ds: Dataset }) {
  const { period } = useBi();
  const rows = teamStats(useScoped(ds).demands, period);
  return (
    <>
      <PageTitle title="Equipe" subtitle="Carga de trabalho por responsável." />
      <p className="mb-4 rounded-md bg-secondary p-3 text-xs text-muted-foreground">
        Legenda: <b>Entradas</b> e <b>Concluídas</b> usam o período selecionado; <b>Backlog</b> e <b>Bloqueadas</b> são o estado atual.
        Demandas com vários responsáveis contam para cada um. Volume mede carga, não qualidade nem desempenho.
      </p>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Responsável</TableHead><TableHead>Entradas</TableHead><TableHead>Concluídas</TableHead><TableHead>Backlog</TableHead><TableHead>Bloqueadas</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}><TableCell className="font-medium">{r.name}</TableCell><TableCell>{r.entries}</TableCell><TableCell>{r.completed}</TableCell><TableCell>{r.backlog}</TableCell><TableCell>{r.blocked}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
