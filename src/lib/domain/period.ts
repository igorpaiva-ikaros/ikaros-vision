// Period handling in America/Sao_Paulo. Dates are compared as "YYYY-MM-DD"
// day keys in São Paulo local time, so a demand created 23:30 in SP never
// leaks into the next UTC day.

export const TIMEZONE = "America/Sao_Paulo";

export type PeriodPreset = "today" | "7d" | "month" | "custom";
export interface Period {
  preset: PeriodPreset;
  start: string; // inclusive day key
  end: string; // inclusive day key
}

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Converts a Notion date/datetime string to a São Paulo day key. */
export function toDayKey(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const day = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value ? value : null;
  } // date-only: already local
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return fmt.format(d);
}

export function todayKey(now: Date = new Date()): string {
  return fmt.format(now);
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function buildPeriod(preset: Exclude<PeriodPreset, "custom">, now: Date = new Date()): Period {
  const today = todayKey(now);
  if (preset === "today") return { preset, start: today, end: today };
  if (preset === "7d") return { preset, start: addDays(today, -6), end: today };
  return { preset, start: `${today.slice(0, 8)}01`, end: today };
}

export function customPeriod(start: string, end: string): Period {
  return start <= end ? { preset: "custom", start, end } : { preset: "custom", start: end, end: start };
}

export function inPeriod(value: string | null | undefined, period: Period): boolean {
  const key = toDayKey(value);
  return key !== null && key >= period.start && key <= period.end;
}

export function daysOf(period: Period): string[] {
  const out: string[] = [];
  if (!toDayKey(period.start) || !toDayKey(period.end)) return out;
  for (let k = period.start; k <= period.end; k = addDays(k, 1)) out.push(k);
  return out;
}

export function formatDay(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Sem informação";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDay(value);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

