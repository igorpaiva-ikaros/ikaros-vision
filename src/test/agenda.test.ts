import { describe, expect, it } from "vitest";
import { agendaEvents, countByDay, eventsOn } from "@/lib/workspace/agenda";
import type { NativeClient, RecordRow } from "@/lib/workspace/types";
import type { TeamProject, TeamProjectStep } from "@/lib/workspace/team-projects";

const today = "2026-10-29";
const client = (over: Partial<NativeClient> = {}) =>
  ({ id: "c1", name: "Corretora Exemplo", is_test: false, ...over }) as NativeClient;
const demand = (over: Partial<RecordRow> = {}) =>
  ({
    id: "d1",
    code: "DEM-00001",
    client_id: "c1",
    owner_id: "u1",
    title: "Cotação com erro",
    scope: "client",
    is_test: false,
    version: 1,
    notion_id: null,
    created_at: "2026-10-01T12:00:00Z",
    updated_at: "2026-10-01T12:00:00Z",
    ...over,
  }) as RecordRow;
const project = (over: Partial<TeamProject> = {}) =>
  ({
    id: "p1",
    code: "PRJ-00001",
    title: "Codex",
    context: null,
    status: "planejado",
    priority: "Alta",
    owner_id: "u1",
    created_by: "u1",
    start_date: "2026-10-30",
    due_date: "2026-11-01",
    completed_at: null,
    canceled_at: null,
    cancel_reason: null,
    version: 1,
    created_at: "2026-10-29T12:00:00Z",
    updated_at: "2026-10-29T12:00:00Z",
    ...over,
  }) as TeamProject;
const step = (over: Partial<TeamProjectStep> = {}): TeamProjectStep => ({
  id: "s1",
  project_id: "p1",
  position: 1,
  title: "Mapear gargalos",
  description: null,
  assignee_id: "u1",
  due_date: "2026-10-28",
  done_at: null,
  done_by: null,
  ...over,
});
const people = [{ id: "u1", full_name: "Igor Paiva" }];

describe("Agenda de prazos", () => {
  it("demanda de cliente entra no dia da entrega combinada (São Paulo) e, sem ela, no prazo SLA", () => {
    const events = agendaEvents({
      demands: [
        // 01:30 UTC de 30/10 ainda é 29/10 em São Paulo
        demand({ id: "d1", due_date: "2026-10-30T01:30:00Z" }),
        demand({ id: "d2", code: "DEM-00002", policy_delivery_due: "2026-10-31T15:00:00Z" }),
        demand({ id: "d3", code: "DEM-00003" }),
      ],
      clients: [client()],
      people,
      today,
    });
    expect(events.map((e) => [e.code, e.day, e.label, e.group])).toEqual([
      ["DEM-00001", "2026-10-29", "Entrega combinada", "clients"],
      ["DEM-00002", "2026-10-31", "Prazo de entrega (SLA)", "clients"],
    ]);
    expect(events[0]).toMatchObject({
      detail: "Corretora Exemplo · Igor Paiva",
      target: { to: "/operacao", search: { tab: "crm", pipeline: "demands", id: "d1" } },
    });
  });

  it("demanda interna vai para o time; cancelada e de teste ficam fora (teste só com includeTests)", () => {
    const base = {
      clients: [client(), client({ id: "c2", name: "Teste", is_test: true })],
      today,
    };
    const demands = [
      demand({
        id: "i1",
        code: "DEM-00010",
        scope: "system",
        client_id: null,
        due_date: "2026-10-29T12:00:00Z",
      }),
      demand({
        id: "x1",
        code: "DEM-00011",
        due_date: "2026-10-29T12:00:00Z",
        canceled_at: "2026-10-20T12:00:00Z",
      }),
      demand({ id: "t1", code: "DEM-00012", due_date: "2026-10-29T12:00:00Z", is_test: true }),
      demand({ id: "t2", code: "DEM-00013", client_id: "c2", due_date: "2026-10-29T12:00:00Z" }),
    ];
    expect(agendaEvents({ ...base, demands }).map((e) => [e.code, e.group, e.label])).toEqual([
      ["DEM-00010", "team", "Entrega planejada"],
    ]);
    expect(agendaEvents({ ...base, demands, includeTests: true }).map((e) => e.code)).toEqual([
      "DEM-00010",
      "DEM-00012",
      "DEM-00013",
    ]);
  });

  it("projeto entra no início e na entrega; etapas no prazo de cada uma; cancelado fica fora", () => {
    const events = agendaEvents({
      demands: [],
      clients: [],
      people,
      projects: [project(), project({ id: "p2", code: "PRJ-00002", status: "cancelado" })],
      steps: [step(), step({ id: "s2", project_id: "p2", due_date: "2026-10-30" })],
      today,
    });
    expect(events.map((e) => [e.day, e.label, e.title, e.late])).toEqual([
      ["2026-10-28", "Prazo de etapa", "Mapear gargalos", true],
      ["2026-10-30", "Início do projeto", "Codex", false],
      ["2026-11-01", "Entrega do projeto", "Codex", false],
    ]);
    expect(events.every((e) => e.group === "team")).toBe(true);
    expect(events[0]).toMatchObject({
      detail: "Codex · Igor Paiva",
      target: { to: "/projetos", search: { id: "p1" } },
    });
  });

  it("concluído não fica atrasado; início passado não conta como atraso", () => {
    const events = agendaEvents({
      demands: [
        demand({ due_date: "2026-10-20T12:00:00Z", completed_at: "2026-10-21T12:00:00Z" }),
        demand({ id: "d2", code: "DEM-00002", due_date: "2026-10-20T12:00:00Z" }),
      ],
      clients: [client()],
      projects: [project({ start_date: "2026-10-01", due_date: null })],
      steps: [step({ done_at: "2026-10-27T12:00:00Z" })],
      today,
    });
    expect(events.map((e) => [e.code, e.label, e.done, e.late])).toEqual([
      ["PRJ-00001", "Início do projeto", false, false],
      ["DEM-00002", "Entrega combinada", false, true],
      ["DEM-00001", "Entrega combinada", true, false],
      ["PRJ-00001", "Prazo de etapa", true, false],
    ]);
  });

  it("separa o dia em clientes e time e conta por dia", () => {
    const events = agendaEvents({
      demands: [demand({ due_date: "2026-11-01T12:00:00Z" })],
      clients: [client()],
      projects: [project()],
      today,
    });
    const day = eventsOn(events, "2026-11-01");
    expect(day.clients.map((e) => e.code)).toEqual(["DEM-00001"]);
    expect(day.team.map((e) => e.label)).toEqual(["Entrega do projeto"]);
    expect(countByDay(events).get("2026-11-01")).toEqual({ clients: 1, team: 1, late: 0 });
    expect(countByDay(events).get("2026-10-30")).toEqual({ clients: 0, team: 1, late: 0 });
  });
});
