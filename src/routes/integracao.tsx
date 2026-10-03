import { createFileRoute } from "@tanstack/react-router";
import { PageTitle, Section } from "@/components/bi/primitives";
import { RefreshButton } from "@/components/bi/RefreshButton";
import { useBi } from "@/lib/bi-context";
import { formatDateTime } from "@/lib/domain/period";
import { NOTION_SOURCES } from "@/lib/notion/config";

export const Route = createFileRoute("/integracao")({
  head: () => ({
    meta: [
      { title: "Integração — Ikaros BI CS" },
      { name: "description", content: "Estado da conexão de leitura com o Notion." },
      { property: "og:title", content: "Integração — Ikaros BI CS" },
      { property: "og:description", content: "Estado da conexão de leitura com o Notion." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const LABEL: Record<string, string> = {
  demo: "Modo demonstração (sem Notion)",
  signed_out: "Entre para ver o estado da conexão",
  forbidden: "Conta sem permissão interna",
  not_configured: "Notion não conectado",
  empty: "Configurado, sem sincronização concluída",
  ok: "Conectado (leitura)",
};

function Page() {
  const { state } = useBi();
  const ok = state?.status === "ok" ? state : null;
  return (
    <>
      <PageTitle title="Integração" subtitle="Leitura somente do Notion. O BI não cria nem edita bases." actions={<RefreshButton />} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Estado">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-muted-foreground">Conexão</dt><dd className="font-medium">{state ? LABEL[state.status] : "Carregando…"}</dd></div>
            {state?.status === "not_configured" && <div><dt className="text-muted-foreground">Pendente</dt><dd>{state.missing.join(", ")}</dd></div>}
            <div><dt className="text-muted-foreground">Última sincronização bem-sucedida</dt><dd>{ok ? formatDateTime(ok.lastSuccessAt) : "Sem informação"}</dd></div>
            <div><dt className="text-muted-foreground">Último erro</dt><dd>{ok?.lastError ?? (state?.status === "empty" ? state.lastError ?? "Nenhum" : "Nenhum")}</dd></div>
            {ok?.stale && <div className="text-warning">Snapshot anterior preservado e marcado como desatualizado.</div>}
            {ok && ok.dataset.schemaWarnings.length > 0 && (
              <div><dt className="text-muted-foreground">Propriedades não encontradas</dt><dd className="text-xs">{ok.dataset.schemaWarnings.join("; ")}</dd></div>
            )}
          </dl>
        </Section>
        <Section title="Fontes lidas">
          <ul className="space-y-2 font-mono text-xs">
            <li>Demandas · data source {NOTION_SOURCES.demandas.dataSourceId}</li>
            <li>Clientes · data source {NOTION_SOURCES.clientes.dataSourceId}</li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Atualização manual apenas. Webhook não implementado: exigiria segredo de assinatura configurado.</p>
        </Section>
      </div>
    </>
  );
}
