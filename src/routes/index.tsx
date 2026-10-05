import {ExecutiveOperation} from "@/components/workspace/ExecutiveOperation";
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
  const { period } = useBi();
  const { demands, clientsById } = useScoped(ds);
  const k = computeKpis(demands, period);
  const backlog = demands.filter(isBacklog);
  return (
    <>
      <PageTitle title="Visão geral" subtitle={`Período ${formatDay(period.start)} a ${formatDay(period.end)} · backlog e bloqueios refletem o estado atual`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Entradas no período" value={k.entries} hint="Por Data de entrada" tone="accent" />
        <KpiCard label="Concluídas no período" value={k.completed} hint="Por Data de conclusão" />
        <KpiCard label="Backlog atual" value={k.backlog} hint={`Exceto Concluída/Cancelada, independente do período${k.unknownStatus ? ` · ${k.unknownStatus} sem status` : ""}`} />
        <KpiCard label="Bloqueadas" value={k.blocked} tone={k.blocked ? "alert" : "default"} />
        <KpiCard label="Encaminhadas para desenvolvimento" value={k.forwarded} hint="Seguem acompanhadas pelo CS" />
        <KpiCard label="SLA em atraso" value={k.slaOverdue} tone={k.slaOverdue ? "alert" : "default"} hint={`Cobertura: ${k.slaCovered} de ${k.backlog} do backlog com dados de SLA`} />
      </div>
      <ExecutiveOperation/>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Section title="Entradas x conclusões por dia" className="lg:col-span-2"><DailyChart data={dailySeries(demands, period)} /></Section>
        <Section title="Backlog por status"><HBar data={countBy(backlog, (d) => d.status)} /></Section>
        <Section title="Backlog por classificação"><HBar data={countBy(backlog, (d) => d.classification)} color="var(--chart-2)" /></Section>
        <Section title="Backlog por responsável"><HBar data={countBy(backlog, (d) => d.responsaveis.map((p) => p.name ?? "Sem nome"))} color="var(--chart-3)" /></Section>
        <Section title="Backlog por cliente"><HBar data={countBy(backlog, (d) => d.clientIds.map((id) => clientName(clientsById.get(id))))} color="var(--chart-4)" /></Section>
      </div>
    </>
  );
}
