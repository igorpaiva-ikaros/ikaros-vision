import { describe, expect, it } from "vitest";
import { cardDeadlines, compactDuration } from "@/lib/workspace/card-deadlines";
import type { DeliveryRequest, RecordRow, SlaRow } from "@/lib/workspace/types";

const now = Date.parse("2026-10-19T15:00:00-03:00");
const at = (minutes: number) => new Date(now + minutes * 60000).toISOString();
const base = {
  id: "demand",
  stage: "Em execução",
  scope: "client",
  first_response_at: at(-60),
  first_response_due: at(-30),
  resolution_due: at(180),
  policy_delivery_due: at(1440),
  due_date: at(-90),
} as RecordRow;
const sla = {
  first_response_state: "cumprido",
  resolution_state: "no_prazo",
  delivery_state: "no_prazo",
  promise_state: "atrasado",
} as SlaRow;
const read = (patch: Partial<RecordRow> = {}, state = sla, time = now) =>
  cardDeadlines({ ...base, ...patch }, "demands", state, undefined, 60, time);

describe("Card deadline counters", () => {
  it("keeps an overdue client commitment separate from the company's next SLA", () => {
    const [official, promise] = read();
    expect(official).toMatchObject({
      label: "SLA · solução",
      text: "Falta 3h 0min",
      tone: "ok",
      due: at(180),
    });
    expect(promise).toMatchObject({
      label: "Cliente",
      text: "Atraso 1h 30min",
      tone: "overdue",
      due: at(-90),
    });
  });
  it("selects the oldest pending obligation and removes answered/forwarded obligations", () => {
    expect(read({ first_response_at: null })[0]?.label).toBe("SLA · 1ª resposta");
    expect(read({ forwarded_at: at(-10) })[0]?.label).toBe("SLA · entrega");
    expect(
      read({ forwarded_at: at(-10), policy_delivery_due: null }, { ...sla, delivery_due: null })[0]
        ?.text,
    ).toBe("Etapas atendidas");
  });
  it("uses server business-hours risk even with a weekend before the deadline", () => {
    expect(
      read({ resolution_due: at(3000) }, { ...sla, resolution_state: "em_risco" })[0]?.label,
    ).toBe("SLA · entrega");
    const result = read(
      { resolution_due: at(3000), policy_delivery_due: null },
      { ...sla, resolution_state: "em_risco" },
    )[0];
    expect(result?.tone).toBe("risk");
    expect(result?.text).toBe("Falta 2d 2h");
  });
  it("crosses zero without reloading data and never rounds a small overrun to on-time", () => {
    const patch = { resolution_due: at(0.5) };
    expect(read(patch)[0]?.text).toBe("Falta < 1 min");
    expect(read(patch, sla, now + 30000)[0]?.text).toBe("Vence agora");
    expect(read(patch, sla, now + 31000)[0]).toMatchObject({
      tone: "overdue",
      text: "Atraso < 1 min",
    });
  });
  it("stops closed counters at completion and cancels without an ongoing deadline", () => {
    const done = { stage: "Concluída", completed_at: at(-60) };
    expect(read(done)[1]).toMatchObject({ label: "Cliente", text: "Atraso 30min" });
    expect(read(done, sla, now + 90000000)).toEqual(read(done));
    expect(read({ stage: "Cancelada" })).toHaveLength(1);
    expect(read({ canceled_at: at(-10) })[0]?.tone).toBe("muted");
  });
  it("does not invent client deadlines or a first response for internal demands", () => {
    expect(read({ scope: "system", first_response_at: null })[0]?.label).toBe("SLA · solução");
    expect(read({ scope: "system" })[1]?.label).toBe("Planejado");
    expect(read({ due_date: null })[1]).toMatchObject({
      text: "Sem prazo alinhado",
      tone: "muted",
    });
    expect(
      read({ resolution_due: "bad date", policy_delivery_due: null, first_response_due: null })[0],
    ).toMatchObject({ text: "Sem prazo", tone: "muted" });
  });
  it("retains the original promise in the explanation when a date was changed", () => {
    expect(read({ due_date: at(120), original_promise_due: at(-90) })[1]?.detail).toContain(
      "Prazo original:",
    );
  });
  it("shows onboarding only after complete-data SLA exists and no invented upgrade SLA", () => {
    expect(
      cardDeadlines({} as RecordRow, "onboardings", undefined, undefined, 60, now)[0]?.text,
    ).toBe("Aguardando dados");
    expect(
      cardDeadlines(
        { limit15_due: at(45) } as RecordRow,
        "onboardings",
        undefined,
        undefined,
        60,
        now,
      )[0]?.tone,
    ).toBe("risk");
    expect(cardDeadlines(base, "upgrades", undefined, undefined, 60, now)).toEqual([]);
  });
  it("keeps the technical next update visible and stops it when technical work is ready", () => {
    const request = {
      technical: true,
      technical_stage: "Em execução",
      next_update_at: at(-10),
      delivery_eta: at(50),
    } as DeliveryRequest;
    expect(cardDeadlines(base, "demands", sla, request, 60, now)[2]).toMatchObject({
      label: "Técnico · retorno",
      tone: "overdue",
    });
    expect(
      cardDeadlines(
        base,
        "demands",
        sla,
        { ...request, technical_stage: "Pronta para validação" },
        60,
        now,
      ),
    ).toHaveLength(2);
  });
  it("formats minutes, hours and long durations without negative values", () => {
    expect(compactDuration(-59000)).toBe("< 1 min");
    expect(compactDuration(3660000)).toBe("1h 1min");
    expect(compactDuration(172800000)).toBe("2d 0h");
  });
});
