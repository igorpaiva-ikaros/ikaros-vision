import { createFileRoute } from "@tanstack/react-router";
import { StateGate } from "@/components/bi/StateGate";
import { PageTitle, Val } from "@/components/bi/primitives";
import { ContactLinks } from "@/components/bi/DemandDetail";
import { useScoped } from "@/lib/use-scoped";
import { clientName, isBacklog } from "@/lib/domain/metrics";
import type { Dataset } from "@/lib/domain/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — Ikaros BI CS" },
      { name: "description", content: "Carteira de empresas assinantes do ERP Ikaros." },
      { property: "og:title", content: "Clientes — Ikaros BI CS" },
      { property: "og:description", content: "Carteira de empresas assinantes do ERP Ikaros." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <><PageTitle title="Clientes" subtitle="Carteira de clientes e contatos do CS." /><StateGate>{(ds) => <Page ds={ds} />}</StateGate></>,
});

function Page({ ds }: { ds: Dataset }) {
  const { clients, demands } = useScoped(ds);
  return (
    <>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Cliente</TableHead><TableHead>Código</TableHead><TableHead>ID ERP</TableHead><TableHead>Plano</TableHead><TableHead>Status</TableHead>
            <TableHead>Segmentos</TableHead><TableHead>Responsável</TableHead><TableHead>Backlog</TableHead><TableHead>Contato</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {clients.map((c) => {
              const mine = demands.filter((d) => d.clientIds.includes(c.id));
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{clientName(c)} {c.isTest && <Badge variant="outline">teste</Badge>}</TableCell>
                  <TableCell className="font-mono text-xs"><Val v={c.clientCode} /></TableCell>
                  <TableCell className="font-mono text-xs"><Val v={c.idErp} /></TableCell>
                  <TableCell><Val v={c.plano} /></TableCell>
                  <TableCell><Val v={c.status} /></TableCell>
                  <TableCell className="text-xs"><Val v={c.segmentos.join(", ")} /></TableCell>
                  <TableCell className="text-sm"><Val v={c.responsaveis.map((p) => p.name).filter(Boolean).join(", ")} /></TableCell>
                  <TableCell>{mine.filter(isBacklog).length} <span className="text-xs text-muted-foreground">/ {mine.length}</span></TableCell>
                  <TableCell><div className="text-xs"><Val v={c.contatoPrincipal} /></div><ContactLinks c={c} /></TableCell>
                </TableRow>
              );
            })}
            {!clients.length && <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">Nenhum cliente.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
