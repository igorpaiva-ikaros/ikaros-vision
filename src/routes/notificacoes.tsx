import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getNotifications, markNotificationRead } from "@/lib/workspace.functions";
import { useBi } from "@/lib/bi-context";
import { PageTitle, Section } from "@/components/bi/primitives";
import { Button } from "@/components/ui/button";
import { dateLabel } from "@/components/workspace/Operation";
export const Route = createFileRoute("/notificacoes")({
  head: () => ({ meta: [{ title: "Notificações — Ikaros Vision" }] }),
  component: Page,
});
function Page() {
  const { profile, session, reload } = useBi();
  const get = useServerFn(getNotifications);
  const read = useServerFn(markNotificationRead);
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["notifications", session?.user.id],
    queryFn: () => get(),
    enabled: !!profile,
    refetchInterval: 30_000,
    retry: false,
  });
  return (
    <>
      <PageTitle title="Notificações" subtitle="Alertas de risco e atraso da sua operação" />
      {query.isError ? (
        <Section title="Não foi possível consultar">
          <Button onClick={() => query.refetch()}>Tentar novamente</Button>
        </Section>
      ) : query.isPending ? (
        <p role="status">Carregando…</p>
      ) : (
        <Section title={`${query.data.filter((n: any) => !n.read_at).length} não lida(s)`}>
          {query.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum alerta por enquanto.</p>
          ) : (
            <div className="space-y-3">
              {query.data.map((n: any) => (
                <article
                  key={n.id}
                  className={`flex flex-wrap justify-between gap-3 rounded border p-3 ${n.read_at ? "opacity-70" : ""}`}
                >
                  <div>
                    <p className="text-sm font-semibold">{n.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {dateLabel(n.created_at)} · {n.level === "overdue" ? "Atraso" : "Risco"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={
                          /^\/operacao\?tab=(demands|onboardings)&id=[a-f\d-]+$/.test(n.link)
                            ? n.link
                            : "/operacao"
                        }
                      >
                        Abrir registro
                      </a>
                    </Button>
                    {!n.read_at && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await read({ data: { id: n.id } });
                            reload();
                          } catch {
                            toast.error("Não foi possível marcar como lida.");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Marcar como lida
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </Section>
      )}
    </>
  );
}
