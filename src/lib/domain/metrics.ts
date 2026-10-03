import { CLOSED_STATUSES, type Client, type Demand } from "./types";
import { daysOf, inPeriod, toDayKey, type Period } from "./period";

export const NO_INFO = "Sem informação";

export interface DemandFilters {
  clientId: string | null;
  responsavelId: string | null;
  classification: string | null;
  status: string | null;
  priority: string | null;
  search: string;
}
export const EMPTY_FILTERS: DemandFilters = {
  clientId: null,
  responsavelId: null,
  classification: null,
  status: null,
  priority: null,
  search: "",
};

export function indexClients(clients: Client[]): Map<string, Client> {
  return new Map(clients.map((c) => [c.id, c]));
}

/** A demand is a test record if flagged itself OR linked to a test client. */
export function isTestDemand(d: Demand, clients: Map<string, Client>): boolean {
  return d.isTest || d.clientIds.some((id) => clients.get(id)?.isTest === true);
}

export function excludeTests(
  demands: Demand[],
  clients: Map<string, Client>,
  includeTests: boolean,
): Demand[] {
  return includeTests ? demands : demands.filter((d) => !isTestDemand(d, clients));
}

export function visibleClients(clients: Client[], includeTests: boolean): Client[] {
  return includeTests ? clients : clients.filter((c) => !c.isTest);
}

export function isClosed(d: Demand): boolean {
  return d.status !== null && (CLOSED_STATUSES as readonly string[]).includes(d.status);
}

/** Backlog: every demand whose status is known and not Concluída/Cancelada. Ignores the period. */
export function isBacklog(d: Demand): boolean {
  return d.status !== null && !isClosed(d);
}

export function clientName(c: Client | undefined): string {
  return c?.name ?? c?.empresa ?? NO_INFO;
}

export function applyFilters(
  demands: Demand[],
  f: DemandFilters,
  clients: Map<string, Client>,
): Demand[] {
  const q = f.search.trim().toLocaleLowerCase("pt-BR");
  return demands.filter((d) => {
    if (f.clientId && !d.clientIds.includes(f.clientId)) return false;
    if (f.responsavelId && !d.responsaveis.some((p) => p.id === f.responsavelId)) return false;
    if (f.classification && d.classification !== f.classification) return false;
    if (f.status && d.status !== f.status) return false;
    if (f.priority && d.priority !== f.priority) return false;
    if (q) {
      const hay = [
        d.title,
        d.demandCode,
        d.description,
        ...d.clientIds.map((id) => clientName(clients.get(id))),
        ...d.responsaveis.map((p) => p.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR");
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export type SortKey = "createdAt" | "dueDate" | "priority" | "status" | "title";
const PRIORITY_RANK: Record<string, number> = { Crítica: 0, Alta: 1, Normal: 2, Baixa: 3 };

export function sortDemands(demands: Demand[], key: SortKey, dir: "asc" | "desc"): Demand[] {
  const val = (d: Demand): string | number | null => {
    if (key === "priority") return d.priority ? (PRIORITY_RANK[d.priority] ?? 9) : null;
    if (key === "createdAt") return d.createdAt;
    if (key === "dueDate") return d.dueDate ?? d.sla.prazoFinalEfetivo;
    if (key === "status") return d.status;
    return d.title;
  };
  return [...demands].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1; // missing values always last
    if (vb === null) return -1;
    const c = va < vb ? -1 : va > vb ? 1 : 0;
    return dir === "asc" ? c : -c;
  });
}

export function slaOverdue(d: Demand): boolean | null {
  if (d.sla.vencido === true) return true;
  const s = `${d.sla.statusUtil ?? ""} ${d.sla.statusSla ?? ""}`.toLocaleLowerCase("pt-BR");
  if (/vencid|atras|estourad/.test(s)) return true;
  if (/dentro|no prazo|próximo|proximo|em dia/.test(s)) return false;
  return null; // no SLA information
}

export interface Kpis {
  entries: number;
  completed: number;
  backlog: number;
  unknownStatus: number;
  blocked: number;
  forwarded: number;
  slaOverdue: number;
  slaCovered: number;
}

export function computeKpis(demands: Demand[], period: Period): Kpis {
  const backlog = demands.filter(isBacklog);
  let slaOver = 0;
  let slaCovered = 0;
  for (const d of backlog) {
    const s = slaOverdue(d);
    if (s !== null) slaCovered++;
    if (s === true) slaOver++;
  }
  return {
    entries: demands.filter((d) => inPeriod(d.createdAt, period)).length,
    completed: demands.filter((d) => d.status === "Concluída" && inPeriod(d.completedAt, period)).length,
    backlog: backlog.length,
    unknownStatus: demands.filter((d) => d.status === null).length,
    blocked: demands.filter((d) => d.status === "Bloqueada").length,
    forwarded: demands.filter((d) => d.status === "Encaminhada para desenvolvimento").length,
    slaOverdue: slaOver,
    slaCovered,
  };
}

export function dailySeries(demands: Demand[], period: Period) {
  const days = daysOf(period);
  const map = new Map(days.map((k) => [k, { day: k, entradas: 0, conclusoes: 0 }]));
  for (const d of demands) {
    const c = toDayKey(d.createdAt);
    if (c && map.has(c)) map.get(c)!.entradas++;
    const f = toDayKey(d.completedAt);
    if (d.status === "Concluída" && f && map.has(f)) map.get(f)!.conclusoes++;
  }
  return [...map.values()];
}

export function countBy(items: Demand[], key: (d: Demand) => string[] | string | null) {
  const m = new Map<string, number>();
  for (const d of items) {
    const raw = key(d);
    const keys = Array.isArray(raw) ? (raw.length ? raw : [NO_INFO]) : [raw ?? NO_INFO];
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export interface TeamRow {
  id: string;
  name: string;
  entries: number;
  completed: number;
  backlog: number;
  blocked: number;
}

export function teamStats(demands: Demand[], period: Period): TeamRow[] {
  const m = new Map<string, TeamRow>();
  for (const d of demands) {
    const people = d.responsaveis.length ? d.responsaveis : [{ id: "__none", name: "Sem responsável" }];
    for (const p of people) {
      const r = m.get(p.id) ?? { id: p.id, name: p.name ?? NO_INFO, entries: 0, completed: 0, backlog: 0, blocked: 0 };
      if (inPeriod(d.createdAt, period)) r.entries++;
      if (d.status === "Concluída" && inPeriod(d.completedAt, period)) r.completed++;
      if (isBacklog(d)) r.backlog++;
      if (d.status === "Bloqueada") r.blocked++;
      m.set(p.id, r);
    }
  }
  return [...m.values()].sort((a, b) => b.backlog - a.backlog);
}

export function uniquePeople(demands: Demand[]) {
  const m = new Map<string, string>();
  for (const d of demands) for (const p of d.responsaveis) m.set(p.id, p.name ?? NO_INFO);
  return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

