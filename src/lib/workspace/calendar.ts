import type { ScheduledTask } from "./types";
export function taskDay(value: string | Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function addDays(day: string, count: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
export function weekDays(day: string) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const start = addDays(day, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
export function calendarDate(day: string) {
  return new Date(`${day}T12:00:00-03:00`);
}
export function taskHour(value: string) {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value)),
  );
}
export function periodProgress(tasks: ScheduledTask[], start: string, end: string) {
  const rows = tasks.filter(
    (t) => t.status !== "canceled" && taskDay(t.due_at) >= start && taskDay(t.due_at) <= end,
  );
  const completed = rows.filter((t) => t.status === "completed").length;
  return {
    total: rows.length,
    completed,
    percent: rows.length ? Math.round((completed / rows.length) * 100) : 0,
  };
}
