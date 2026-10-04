import { describe, expect, it } from "vitest";
import { buildDemoDataset } from "@/lib/demo/dataset";
import { applyFilters, computeKpis, dailySeries, EMPTY_FILTERS, excludeTests, indexClients, slaOverdue, sortDemands, teamStats } from "@/lib/domain/metrics";
import { buildPeriod, customPeriod, toDayKey } from "@/lib/domain/period";
import type { Demand } from "@/lib/domain/types";

const ds = buildDemoDataset(new Date("2026-10-03T21:00:00Z"));
const base = ds.demands[0]!;
const demand = (p: Partial<Demand>): Demand => ({ ...base, clientIds: [], isTest: false, ...p });
const period = customPeriod("2026-10-01", "2026-10-03");

describe("Métricas executivas", () => {
  it("separa entradas, conclusões e estoque fora do período", () => {
    const rows = [
      demand({ id: "1", status: "Concluída", createdAt: "2026-09-01", completedAt: "2026-10-02" }),
      demand({ id: "2", status: "Bloqueada", createdAt: "2026-09-01", completedAt: null }),
      demand({ id: "3", status: "Publicada", createdAt: "2026-10-01", completedAt: null }),
      demand({ id: "4", status: "Cancelada", createdAt: "2026-09-01", completedAt: "2026-10-02" }),
      demand({ id: "5", status: null, createdAt: null, completedAt: null }),
    ];
    expect(computeKpis(rows, period)).toMatchObject({ entries: 1, completed: 1, backlog: 2, blocked: 1, unknownStatus: 1 });
    expect(dailySeries(rows, period).find(d => d.day === "2026-10-02")?.conclusoes).toBe(1);
    expect(teamStats(rows, period).reduce((n, r) => n + r.completed, 0)).toBe(1);
  });
  it("exclui teste sinalizado na demanda OU no cliente", () => {
    const clients = indexClients(ds.clients);
    const testClient = ds.clients.find(c => c.isTest)!;
    const rows = [demand({ id: "real" }), demand({ id: "test", isTest: true }), demand({ id: "ctest", clientIds: [testClient.id] })];
    expect(excludeTests(rows, clients, false).map(d => d.id)).toEqual(["real"]);
    expect(excludeTests(rows, clients, true)).toHaveLength(3);
  });
  it("combina filtros e busca pelo cliente e responsável", () => {
    const c = ds.clients[0]!;
    const rows = [demand({ id: "match", title: "Relatório", clientIds: [c.id], status: "Em execução", priority: "Alta", classification: "Bug", responsaveis: [{ id: "u1", name: "Igor" }] }), demand({ id: "other", status: "Nova" })];
    const filters = { ...EMPTY_FILTERS, clientId: c.id, responsavelId: "u1", status: "Em execução", priority: "Alta", classification: "Bug", search: "igor" };
    expect(applyFilters(rows, filters, indexClients(ds.clients)).map(d => d.id)).toEqual(["match"]);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, search: "alfa" }, indexClients(ds.clients))).toHaveLength(1);
    expect(applyFilters(rows, EMPTY_FILTERS, indexClients(ds.clients))).toHaveLength(2);
  });
  it("ordena prioridade e mantém campos ausentes por último", () => {
    const rows = [demand({ id: "empty", priority: null }), demand({ id: "low", priority: "Baixa" }), demand({ id: "critical", priority: "Crítica" })];
    expect(sortDemands(rows, "priority", "asc").map(d => d.id)).toEqual(["critical", "low", "empty"]);
    expect(sortDemands(rows, "priority", "desc").at(-1)?.id).toBe("empty");
  });
  it("não transforma SLA desconhecido em cumprido", () => {
    expect(slaOverdue(demand({ sla: { ...base.sla, vencido: false, statusUtil: "Sem prazo", statusSla: null } }))).toBeNull();
    expect(slaOverdue(demand({ sla: { ...base.sla, vencido: false, statusUtil: "Dentro do prazo", statusSla: null } }))).toBe(false);
    expect(slaOverdue(demand({ sla: { ...base.sla, vencido: true, statusUtil: null, statusSla: null } }))).toBe(true);
  });
  it("prioriza a fórmula atual sobre marcações manuais antigas", () => {
    const oldLate = { ...base.sla, vencido: true, statusSla: "Atrasado" };
    expect(slaOverdue(demand({ sla: { ...oldLate, statusUtil: "Dentro do prazo" } }))).toBe(false);
    expect(slaOverdue(demand({ sla: { ...oldLate, statusUtil: "SLA cumprido" } }))).toBe(false);
    expect(slaOverdue(demand({ sla: { ...oldLate, statusUtil: "Sem registro" } }))).toBeNull();
    expect(slaOverdue(demand({ sla: { ...base.sla, vencido: false, statusSla: "Dentro do prazo", statusUtil: "Atrasado" } }))).toBe(true);
  });
});

describe("Calendário São Paulo", () => {
  it("mantém ocorrência noturna no dia brasileiro", () => {
    expect(toDayKey("2026-10-04T02:30:00Z")).toBe("2026-10-03");
    expect(toDayKey("2026-10-03")).toBe("2026-10-03");
    expect(toDayKey("inválido")).toBeNull();
  });
  it("calcula hoje, mês, sete dias e intervalo invertido", () => {
    const now = new Date("2026-10-04T02:30:00Z");
    expect(buildPeriod("today", now).end).toBe("2026-10-03");
    expect(buildPeriod("7d", now).start).toBe("2026-09-27");
    expect(buildPeriod("month", now).start).toBe("2026-10-01");
    expect(customPeriod("2026-10-03", "2026-10-01")).toMatchObject({ start: "2026-10-01", end: "2026-10-03" });
  });
});
