import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getAdminState, importNotionOperation } from "@/lib/workspace.functions";
import { useBi } from "@/lib/bi-context";
import { PageTitle, Section } from "@/components/bi/primitives";
import { Button } from "@/components/ui/button";
import { dateLabel } from "@/components/workspace/Operation";
export const Route = createFileRoute("/integracao")({
  head: () => ({ meta: [{ title: "Migração — Ikaros Vision" }] }),
  component: Page,
});
function Page() {
  const { profile, session, reload } = useBi();
  const get = useServerFn(getAdminState);
  const migrate = useServerFn(importNotionOperation);
  const query = useQuery({
    queryKey: ["admin-state", session?.user.id],
    queryFn: () => get(),
    enabled: profile?.role === "admin",
    retry: false,
  });
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState("");
  return (
    <>
      <PageTitle
        title="Migração do Notion"
        subtitle="O Ikaros Vision é a origem da operação e do BI."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Operação própria">
          <p className="text-sm">
            Clientes, demandas, onboarding, upgrades, interações e changelog são gravados no Vision.
            O BI consulta esses mesmos registros.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            O Notion fica preservado como histórico. A importação traz apenas registros ainda
            ausentes, sem sobrescrever o trabalho feito no Vision.
          </p>
        </Section>
        <Section title="Importar registros restantes">
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setReport(await migrate());
                reload();
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Não foi possível importar. Nenhuma leitura parcial foi aplicada.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Importando…" : "Importar do Notion"}
          </Button>
          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
          {report && (
            <pre className="mt-3 overflow-auto rounded bg-muted p-3 text-xs">
              {JSON.stringify(report, null, 2)}
            </pre>
          )}
        </Section>
        <Section title="Histórico da migração" className="lg:col-span-2">
          {query.isError ? (
            <Button onClick={() => query.refetch()}>Tentar novamente</Button>
          ) : query.data?.runs.length ? (
            query.data.runs.map((r: any) => (
              <div key={r.id} className="border-b py-3">
                <p className="text-sm">
                  {dateLabel(r.started_at)} · {r.status}
                </p>
                <pre className="mt-2 overflow-auto text-xs">
                  {JSON.stringify(r.report, null, 2)}
                </pre>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Sem importação confirmada.</p>
          )}
          <a className="mt-3 block text-sm underline" href="/administracao">
            Resolver vínculos pendentes na administração
          </a>
        </Section>
      </div>
    </>
  );
}
