// @vitest-environment node
import { describe, it, expect } from "vitest";
import { taskDay, taskHour, weekDays, addDays, periodProgress } from "@/lib/workspace/calendar";
describe("CS calendar", () => {
  it("uses São Paulo date and Monday weeks across a month boundary", () => {
    expect(taskDay("2026-10-01T01:30:00Z")).toBe("2026-09-30");
    expect(taskHour("2026-10-01T01:30:00Z")).toBe(22);
    expect(weekDays("2026-10-04")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("counts completed tasks by due period and excludes canceled tasks", () => {
    const tasks = ["completed", "pending", "canceled"].map((status) => ({
      status,
      due_at: "2026-10-06T15:00:00Z",
    })) as any;
    expect(periodProgress(tasks, "2026-10-06", "2026-10-06")).toEqual({
      total: 2,
      completed: 1,
      percent: 50,
    });
    expect(periodProgress(tasks, "2026-10-07", "2026-10-07")).toEqual({
      total: 0,
      completed: 0,
      percent: 0,
    });
  });
});
