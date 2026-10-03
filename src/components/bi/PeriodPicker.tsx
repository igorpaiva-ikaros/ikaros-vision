import { useBi } from "@/lib/bi-context";
import { buildPeriod, customPeriod, TIMEZONE, type PeriodPreset } from "@/lib/domain/period";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";

const OPTIONS: { v: PeriodPreset; label: string }[] = [
  { v: "today", label: "Hoje" },
  { v: "7d", label: "7 dias" },
  { v: "month", label: "Mês" },
  { v: "custom", label: "Personalizado" },
];

export function PeriodPicker() {
  const { period, setPeriod } = useBi();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={period.preset}
        onValueChange={(v) => {
          if (!v) return;
          if (v === "custom") setPeriod({ ...period, preset: "custom" });
          else setPeriod(buildPeriod(v as Exclude<PeriodPreset, "custom">));
        }}
      >
        {OPTIONS.map((o) => (
          <ToggleGroupItem key={o.v} value={o.v} className="px-3 text-xs">
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {period.preset === "custom" && (
        <div className="flex items-center gap-1">
          <Input type="date" className="h-8 w-36 text-xs" value={period.start}
            onChange={(e) => e.target.value && setPeriod(customPeriod(e.target.value, period.end))} aria-label="Início" />
          <span className="text-xs text-muted-foreground">até</span>
          <Input type="date" className="h-8 w-36 text-xs" value={period.end}
            onChange={(e) => e.target.value && setPeriod(customPeriod(period.start, e.target.value))} aria-label="Fim" />
        </div>
      )}
      <span className="text-[11px] text-muted-foreground" title={TIMEZONE}>Fuso: São Paulo</span>
    </div>
  );
}
