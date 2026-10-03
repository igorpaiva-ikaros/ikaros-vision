import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { Client, Demand } from "@/lib/domain/types";
import { CLASSIFICATIONS, PRIORITIES, STATUSES } from "@/lib/domain/types";
import {
  applyFilters, clientName, EMPTY_FILTERS, slaOverdue, sortDemands, uniquePeople,
  type DemandFilters, type SortKey,
} from "@/lib/domain/metrics";
import { formatDateTime } from "@/lib/domain/period";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DemandDetail } from "./DemandDetail";

const ALL = "__all";
function F({ label, value, onChange, options }: {
  label: string; value: string | null; onChange: (v: string | null) => void; options: { v: string; l: string }[];
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : v)}>
      <SelectTrigger className="h-9 w-[170px] text-xs" aria-label={label}><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: todos</SelectItem>
        {options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function DemandTable({ demands, clients, clientsById }: {
  demands: Demand[]; clients: Client[]; clientsById: Map<string, Client>;
}) {
  const [f, setF] = useState<DemandFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<{ k: SortKey; d: "asc" | "desc" }>({ k: "createdAt", d: "desc" });
  const [open, setOpen] = useState<Demand | null>(null);
  const people = useMemo(() => uniquePeople(demands), [demands]);
  const rows = useMemo(
    () => sortDemands(applyFilters(demands, f, clientsById), sort.k, sort.d),
    [demands, f, sort, clientsById],
  );
  const set = (p: Partial<DemandFilters>) => setF((x) => ({ ...x, ...p }));
  const H = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <TableHead>
      <button className="flex items-center gap-1" onClick={() => setSort((s) => ({ k, d: s.k === k && s.d === "desc" ? "asc" : "desc" }))}>
        {children}
        {sort.k === k && (sort.d === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Buscar título, ID, cliente…" className="h-9 w-64" value={f.search} onChange={(e) => set({ search: e.target.value })} />
        <F label="Cliente" value={f.clientId} onChange={(v) => set({ clientId: v })} options={clients.map((c) => ({ v: c.id, l: clientName(c) }))} />
        <F label="Responsável" value={f.responsavelId} onChange={(v) => set({ responsavelId: v })} options={people.map((p) => ({ v: p.id, l: p.name }))} />
        <F label="Classificação" value={f.classification} onChange={(v) => set({ classification: v })} options={CLASSIFICATIONS.map((v) => ({ v, l: v }))} />
        <F label="Status" value={f.status} onChange={(v) => set({ status: v })} options={STATUSES.map((v) => ({ v, l: v }))} />
        <F label="Prioridade" value={f.priority} onChange={(v) => set({ priority: v })} options={PRIORITIES.map((v) => ({ v, l: v }))} />
        <Button variant="ghost" size="sm" onClick={() => setF(EMPTY_FILTERS)}>Limpar filtros</Button>
      </div>
      <div className="text-xs text-muted-foreground">{rows.length} de {demands.length} demandas</div>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <H k="title">Título</H>
              <TableHead>Cliente</TableHead>
              <TableHead>Responsável</TableHead>
              <H k="status">Status</H>
              <H k="priority">Prioridade</H>
              <H k="createdAt">Entrada</H>
              <H k="dueDate">Prazo</H>
              <TableHead>SLA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => {
              const o = slaOverdue(d);
              return (
                <TableRow key={d.id} className="cursor-pointer" onClick={() => setOpen(d)}>
                  <TableCell className="font-mono text-xs">{d.demandCode ?? "—"}</TableCell>
                  <TableCell className="max-w-[280px] truncate font-medium">{d.title ?? "Sem título"}</TableCell>
                  <TableCell className="max-w-[180px] truncate text-sm">{d.clientIds.map((id) => clientName(clientsById.get(id))).join(", ") || "Sem informação"}</TableCell>
                  <TableCell className="text-sm">{d.responsaveis.map((p) => p.name ?? "Sem nome").join(", ") || "Sem informação"}</TableCell>
                  <TableCell><Badge variant="secondary" className="whitespace-nowrap">{d.status ?? "Sem informação"}</Badge></TableCell>
                  <TableCell className="text-sm">{d.priority ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(d.createdAt)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(d.dueDate ?? d.sla.prazoFinalEfetivo)}</TableCell>
                  <TableCell className="text-xs">{o === null ? "—" : o ? <span className="font-medium text-destructive">Atraso</span> : "OK"}</TableCell>
                </TableRow>
              );
            })}
            {!rows.length && (
              <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">Nenhuma demanda com estes filtros.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DemandDetail demand={open} clients={clientsById} onClose={() => setOpen(null)} />
    </div>
  );
}
