import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOperationState } from "@/lib/workspace.functions";
import { useBi } from "@/lib/bi-context";
import { inPeriod } from "@/lib/domain/period";
import { KpiCard, Section } from "@/components/bi/primitives";
import { riskFor, dateLabel } from "./Operation";
export function ExecutiveOperation() {
  const { profile, session, includeTests, period } = useBi();
  const get = useServerFn(getOperationState);
  const q = useQuery({
    queryKey: ["operation-state", session?.user.id],
    queryFn: () => get(),
    enabled: profile?.role === "admin",
    refetchInterval: 30_000,
    retry: false,
  });
  if (q.isError)
    return (
      <p role="alert" className="mt-4 text-sm text-destructive">
        Não foi possível conferir onboarding, upgrades e risco. Atualize o painel.
      </p>
    );
  if (!q.data)
    return (
      <p role="status" className="mt-4 text-sm">
        Conferindo a operação…
      </p>
    );
  const ds = q.data;
  const testClient = new Set(ds.clients.filter((c) => c.is_test).map((c) => c.id));
  const visible = (r: { is_test: boolean; client_id: string | null }) =>
    includeTests || (!r.is_test && !testClient.has(r.client_id ?? ""));
  const onb = ds.onboardings.filter(visible);
  const upgrades = ds.upgrades.filter(visible);
  const risks = ds.demands
    .concat(onb)
    .filter(visible)
    .filter((r) => ["atrasado", "em_risco"].includes(riskFor(r, ds)));
  const riskyClients = new Set(risks.map((r) => r.client_id).filter(Boolean));
  const effective = upgrades.filter((r) => inPeriod(r.effective_at, period));
  const due = effective.reduce(
    (sum, r) => sum + Number(ds.commissions.find((c) => c.id === r.id)?.commission_due ?? 0),
    0,
  );
  return (
    <div className="mt-6 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Onboarding em andamento"
          value={onb.filter((r) => r.stage !== "Concluído").length}
        />
        <KpiCard label="Upgrades efetivados no período" value={effective.length} />
        <KpiCard
          label="Clientes em risco por SLA"
          value={riskyClients.size}
          tone={riskyClients.size ? "alert" : "default"}
        />
        <KpiCard
          label="Comissões devidas no período"
          value={due.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          hint="Efetivações elegíveis · previsão, sem transferência"
        />
      </div>
      <Section title="Acompanhamento urgente">
        {risks.length ? (
          <div className="space-y-3">
            {risks.slice(0, 20).map((r) => (
              <a
                key={r.id}
                href={`/operacao?tab=${ds.demands.some((d) => d.id === r.id) ? "demands" : "onboardings"}&id=${r.id}`}
                className="block rounded border p-3"
              >
                <div className="text-sm font-medium">
                  {r.code} · {r.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {ds.clients.find((c) => c.id === r.client_id)?.name ?? "Vínculo pendente"} ·{" "}
                  {riskFor(r, ds) === "atrasado" ? "Atrasado" : "Em risco"} ·{" "}
                  {dateLabel(r.limit15_due ?? r.first_response_due)}
                </div>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum cliente com SLA pendente em risco nesta seleção.
          </p>
        )}
      </Section>
    </div>
  );
}
