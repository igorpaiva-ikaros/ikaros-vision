import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AlertTriangle, Lock, PlugZap, ShieldAlert } from "lucide-react";
import { useBi } from "@/lib/bi-context";
import { formatDateTime } from "@/lib/domain/period";
import type { Dataset } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshButton } from "./RefreshButton";

function Panel({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto mt-10 max-w-xl rounded-lg border bg-card p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
        {icon}
      </div>
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-3 space-y-4 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

/** Renders children only with a dataset; otherwise shows an honest connection state. */
export function StateGate({ children }: { children: (ds: Dataset) => ReactNode }) {
  const { state, loading, dataset, setMode } = useBi();
  const demoBtn = (
    <Button variant="outline" onClick={() => setMode("demo")}>Explorar demonstração</Button>
  );

  if (loading || !state)
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
    );

  if (state.status === "signed_out")
    return (
      <Panel icon={<Lock className="h-5 w-5" />} title="Acesso restrito">
        <p>Os dados reais do Notion só aparecem para contas internas autorizadas.</p>
        <div className="flex justify-center gap-2">
          <Button asChild><Link to="/auth">Entrar</Link></Button>
          {demoBtn}
        </div>
      </Panel>
    );
  if (state.status === "forbidden")
    return (
      <Panel icon={<ShieldAlert className="h-5 w-5" />} title="Conta sem permissão interna">
        <p>Você entrou, mas sua conta ainda não foi liberada. Um administrador precisa conceder o papel de acesso (veja a página Ajuda).</p>
        <div className="flex justify-center">{demoBtn}</div>
      </Panel>
    );
  if (state.status === "not_configured")
    return (
      <Panel icon={<PlugZap className="h-5 w-5" />} title="Notion não conectado">
        <p>Nenhuma credencial do Notion está configurada no servidor. Nenhum número é exibido até a conexão existir.</p>
        <p className="text-xs">Pendente: {state.missing.join(", ")}</p>
        <div className="flex justify-center gap-2">
          <Button asChild variant="secondary"><Link to="/integracao">Ver integração</Link></Button>
          {demoBtn}
        </div>
      </Panel>
    );
  if (state.status === "empty")
    return (
      <Panel icon={<PlugZap className="h-5 w-5" />} title="Nenhuma sincronização concluída">
        <p>O Notion está configurado, mas ainda não houve leitura bem-sucedida.</p>
        {state.lastError && <p className="text-destructive">Último erro: {state.lastError}</p>}
        <div className="flex justify-center"><RefreshButton /></div>
      </Panel>
    );

  if (!dataset) return null;
  return (
    <>
      {state.status === "ok" && state.stale && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
          <div>
            <strong>Dados possivelmente desatualizados.</strong> Exibindo a última leitura bem-sucedida
            ({formatDateTime(state.lastSuccessAt)}).
            {state.lastError && <> Último erro: {state.lastError}</>}
          </div>
        </div>
      )}
      {children(dataset)}
    </>
  );
}
