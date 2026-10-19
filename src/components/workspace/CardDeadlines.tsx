import { Clock3 } from "lucide-react";
import type { CardDeadline, DeadlineTone } from "@/lib/workspace/card-deadlines";

const colors: Record<DeadlineTone, string> = {
  ok: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
  risk: "border-warning/40 bg-warning/10 text-warning",
  overdue: "border-destructive/40 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted/40 text-muted-foreground",
};
export function CardDeadlines({ indicators }: { indicators: CardDeadline[] }) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-1" aria-label="Prazos da demanda">
      {indicators.map((item) => (
        <span
          key={item.key}
          tabIndex={0}
          title={item.detail}
          aria-label={`${item.label}: ${item.text}. ${item.detail}`}
          data-deadline={item.key}
          data-tone={item.tone}
          className={`inline-flex flex-col rounded-md border px-1.5 py-1 text-right leading-tight ${colors[item.tone]}`}
        >
          <span className="flex items-center justify-end gap-1 text-[9px] font-medium">
            <Clock3 className="h-2.5 w-2.5" aria-hidden="true" />
            {item.label}
          </span>
          <span className="mt-0.5 font-mono text-[10px] font-semibold tabular-nums">
            {item.text}
          </span>
        </span>
      ))}
    </div>
  );
}
