import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { NO_INFO } from "@/lib/domain/metrics";

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="bi-page-title">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function KpiCard({
  label, value, hint, tone = "default",
}: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "alert" | "accent" }) {
  return (
    <div className={cn("bi-card rounded-lg border bg-card p-5", tone === "accent" && "border-t-4 border-t-accent", tone === "alert" && "border-t-4 border-t-destructive")}>
      <div className="bi-eyebrow leading-relaxed text-muted-foreground">{label}</div>
      <div className="kpi-number mt-4 text-5xl">{value}</div>
      {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Section({ title, children, note, className }: { title: string; children: ReactNode; note?: string; className?: string }) {
  return (
    <section className={cn("bi-card rounded-lg border bg-card p-5", className)}>
      <h2 className="bi-section-title">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Val({ v }: { v: ReactNode | null | undefined }) {
  if (v === null || v === undefined || v === "") return <span className="italic text-muted-foreground">{NO_INFO}</span>;
  return <>{v}</>;
}

export function Bool({ v }: { v: boolean | null }) {
  if (v === null) return <Val v={null} />;
  return <>{v ? "Sim" : "Não"}</>;
}

