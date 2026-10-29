/**
 * Agenda de prazos: junta, por dia (São Paulo), os prazos das demandas e dos projetos do time para a
 * agenda de Operação → Tarefas. Os eventos são derivados dos próprios registros a cada leitura, sem
 * cópia: mudou a data na demanda ou no projeto, mudou na agenda. Projetos chegam já filtrados pela
 * leitura do usuário (RLS), então a agenda nunca mostra o que a pessoa não pode ver.
 */
import { taskDay } from "./calendar";
import type { NativeClient, RecordRow } from "./types";
import type { TeamProject, TeamProjectStep } from "./team-projects";

export type AgendaGroup = "clients" | "team";
export type AgendaKind =
  | "demand"
  | "internal-demand"
  | "project-start"
  | "project-due"
  | "step-due";
export type AgendaTarget =
  | { to: "/operacao"; search: { tab: "crm"; pipeline: "demands"; id: string } }
  | { to: "/projetos"; search: { id: string } };
export interface AgendaEvent {
  key: string;
  /** Dia no fuso de São Paulo (AAAA-MM-DD). */
  day: string;
  group: AgendaGroup;
  kind: AgendaKind;
  /** Tipo de prazo, ex.: "Entrega combinada", "Início do projeto". */
  label: string;
  code: string;
  title: string;
  /** Cliente ou projeto e responsável. */
  detail: string;
  done: boolean;
  late: boolean;
  target: AgendaTarget;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Data pura (AAAA-MM-DD) fica como está; data com hora vira o dia de São Paulo. */
function dayOf(value: string | null | undefined) {
  if (!value) return null;
  if (DAY.test(value)) return value;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : taskDay(value);
}

export function agendaEvents({
  demands,
  clients,
  people = [],
  projects = [],
  steps = [],
  includeTests = false,
  today,
}: {
  demands: RecordRow[];
  clients: NativeClient[];
  people?: { id: string; full_name: string }[];
  projects?: TeamProject[];
  steps?: TeamProjectStep[];
  includeTests?: boolean;
  today: string;
}): AgendaEvent[] {
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const person = (id: string | null | undefined) =>
    (id && people.find((p) => p.id === id)?.full_name) || "Sem responsável";
  const events: AgendaEvent[] = [];
  const push = (e: Omit<AgendaEvent, "late"> & { dueKind: boolean }) => {
    const { dueKind, ...rest } = e;
    events.push({ ...rest, late: dueKind && !rest.done && rest.day < today });
  };

  for (const d of demands) {
    if (d.canceled_at) continue;
    const client = d.client_id ? clientById.get(d.client_id) : undefined;
    if (!includeTests && (d.is_test || client?.is_test)) continue;
    const internal = d.scope === "system" || !d.client_id;
    const promised = dayOf(d.due_date);
    const sla = dayOf(d.policy_delivery_due);
    const day = promised ?? sla;
    if (!day) continue;
    push({
      key: `demand:${d.id}`,
      day,
      group: internal ? "team" : "clients",
      kind: internal ? "internal-demand" : "demand",
      label: promised
        ? internal
          ? "Entrega planejada"
          : "Entrega combinada"
        : "Prazo de entrega (SLA)",
      code: d.code,
      title: d.title ?? d.code,
      detail: `${internal ? "Sistema geral · Ikaros" : (client?.name ?? "Cliente")} · ${person(d.owner_id)}`,
      done: !!d.completed_at,
      dueKind: true,
      target: { to: "/operacao", search: { tab: "crm", pipeline: "demands", id: d.id } },
    });
  }

  const projectById = new Map(projects.map((p) => [p.id, p]));
  for (const p of projects) {
    if (p.status === "cancelado") continue;
    const done = p.status === "concluido";
    const target = { to: "/projetos" as const, search: { id: p.id } };
    const owner = person(p.owner_id);
    const start = dayOf(p.start_date);
    if (start)
      push({
        key: `project-start:${p.id}`,
        day: start,
        group: "team",
        kind: "project-start",
        label: "Início do projeto",
        code: p.code,
        title: p.title,
        detail: `Projeto · ${owner}`,
        done,
        dueKind: false,
        target,
      });
    const due = dayOf(p.due_date);
    if (due)
      push({
        key: `project-due:${p.id}`,
        day: due,
        group: "team",
        kind: "project-due",
        label: "Entrega do projeto",
        code: p.code,
        title: p.title,
        detail: `Projeto · ${owner}`,
        done,
        dueKind: true,
        target,
      });
  }
  for (const s of steps) {
    const p = projectById.get(s.project_id);
    const day = dayOf(s.due_date);
    if (!p || p.status === "cancelado" || !day) continue;
    push({
      key: `step:${s.id}`,
      day,
      group: "team",
      kind: "step-due",
      label: "Prazo de etapa",
      code: p.code,
      title: s.title,
      detail: `${p.title} · ${s.assignee_id ? person(s.assignee_id) : "Sem responsável"}`,
      done: !!s.done_at || p.status === "concluido",
      dueKind: true,
      target: { to: "/projetos", search: { id: p.id } },
    });
  }
  return events.sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      Number(b.late) - Number(a.late) ||
      Number(a.done) - Number(b.done) ||
      a.code.localeCompare(b.code) ||
      a.key.localeCompare(b.key),
  );
}

export function eventsOn(events: AgendaEvent[], day: string) {
  const list = events.filter((e) => e.day === day);
  return {
    clients: list.filter((e) => e.group === "clients"),
    team: list.filter((e) => e.group === "team"),
  };
}

/** Contagem por dia, para marcar o calendário e a faixa de prazos da semana. */
export function countByDay(events: AgendaEvent[]) {
  const map = new Map<string, { clients: number; team: number; late: number }>();
  for (const e of events) {
    const c = map.get(e.day) ?? { clients: 0, team: 0, late: 0 };
    c[e.group] += 1;
    if (e.late) c.late += 1;
    map.set(e.day, c);
  }
  return map;
}
