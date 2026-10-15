import { displayLabel } from "@/lib/workspace/customization";
import { categoryKey } from "@/lib/domain/categories";
import { categoryCounts, categoryLabel } from "@/lib/domain/categories";
import { inPeriod } from "@/lib/domain/period";
import { ExecutiveOperation } from "@/components/workspace/ExecutiveOperation";
import { createFileRoute } from "@tanstack/react-router";
import { StateGate } from "@/components/bi/StateGate";
import { KpiCard, PageTitle, Section } from "@/components/bi/primitives";
import { DailyChart, HBar } from "@/components/bi/charts";
import { useBi } from "@/lib/bi-context";
import { useScoped } from "@/lib/use-scoped";
import { clientName, computeKpis, countBy, dailySeries, isBacklog } from "@/lib/domain/metrics";
import { formatDay } from "@/lib/domain/period";
import type { Dataset } from "@/lib/domain/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Visão geral — Ikaros BI Customer Success" },
      { name: "description", content: "Painel executivo de Customer Success do Ikaros." },
      { property: "og:title", content: "Visão geral — Ikaros BI CS" },
      { property: "og:description", content: "Painel executivo de Customer Success do Ikaros." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <StateGate>{(ds) => <Overview ds={ds} />}</StateGate>,
});

function Overview({ ds }: { ds: Dataset }) {
  const { period, presentation } = useBi();
  const { demands, clientsById } = useScoped(ds);
  const k = computeKpis(demands, period);
  const backlog = demands.filter(isBacklog);
  const entries = demands.filter((d) => inPeriod(d.createdAt, period));
  const categories = categoryCounts(entries, (d) => d.classification).map((c) => ({
    ...c,
    name: displayLabel(presentation, "category", c.key, c.name),
  }));
  return (
    <>
      <PageTitle
        title="Visão geral"
        subtitle={`Período ${formatDay(period.start)} a ${formatDay(period.end)} · backlog e bloqueios refletem o estado atual`}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Entradas no período"
          value={k.entries}
          hint="Por Data de entrada"
          tone="accent"
        />
        <KpiCard label="Concluídas no período" value={k.completed} hint="Por Data de conclusão" />
        <KpiCard
          label="Backlog atual"
          value={k.backlog}
          hint={`Exceto Concluída/Cancelada, independente do período${k.unknownStatus ? ` · ${k.unknownStatus} sem status` : ""}`}
        />
        <KpiCard label="Bloqueadas" value={k.blocked} tone={k.blocked ? "alert" : "default"} />
        <KpiCard
          label="Encaminhadas para desenvolvimento"
          value={k.forwarded}
          hint="Seguem acompanhadas pelo CS"
        />
        <KpiCard
          label="SLA em atraso"
          value={k.slaOverdue}
          tone={k.slaOverdue ? "alert" : "default"}
          hint={`Cobertura: ${k.slaCovered} de ${k.backlog} do backlog com dados de SLA`}
        />
      </div>
      <Section title="Demandas por categoria no período" className="mt-6">
        <p className="mb-4 text-xs text-muted-foreground">
          Entradas pela data de recebimento, incluindo concluídas e canceladas. Respeita o filtro de
          testes. Registros sem data não entram na comparação.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {categories.map((c) => (
            <div key={c.key} className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground">{c.name}</p>
              <p className="mt-1 text-xl font-semibold">
                {c.value}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  · {entries.length ? Math.round((c.value / entries.length) * 100) : 0}%
                </span>
              </p>
            </div>
          ))}
        </div>
        {entries.length ? (
          <HBar data={categories} color="var(--chart-2)" />
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhuma entrada no período selecionado.
          </p>
        )}
      </Section>
      <ExecutiveOperation />
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Section title="Entradas x conclusões por dia" className="lg:col-span-2">
          <DailyChart data={dailySeries(demands, period)} />
        </Section>
        <Section title="Backlog por status">
          <HBar data={countBy(backlog, (d) => d.status)} />
        </Section>
        <Section title="Backlog por classificação">
          <HBar
            data={countBy(backlog, (d) =>
              displayLabel(
                presentation,
                "category",
                categoryKey(d.classification),
                categoryLabel(d.classification),
              ),
            )}
            color="var(--chart-2)"
          />
        </Section>
        <Section title="Backlog por responsável">
          <HBar
            data={countBy(backlog, (d) => d.responsaveis.map((p) => p.name ?? "Sem nome"))}
            color="var(--chart-3)"
          />
        </Section>
        <Section title="Backlog por cliente">
          <HBar
            data={countBy(backlog, (d) => d.clientIds.map((id) => clientName(clientsById.get(id))))}
            color="var(--chart-4)"
          />
        </Section>
      </div>
    </>
  );
}
