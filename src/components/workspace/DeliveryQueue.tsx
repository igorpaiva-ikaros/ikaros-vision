import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDeliveryQueue } from "@/lib/workspace.functions";
import { useBi } from "@/lib/bi-context";
import { PageTitle, Section } from "@/components/bi/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogDescription,
} from "@/components/ui/dialog";
import { CaseWorkspace } from "./CaseWorkspace";
import { dateLabel } from "./Operation";
import type { DeliveryCase } from "@/lib/workspace/types";
export function DeliveryQueue({ approvals = false }: { approvals?: boolean }) {
  const { session, profile } = useBi();
  const get = useServerFn(getDeliveryQueue);
  const q = useQuery({
    queryKey: ["delivery-queue", session?.user.id],
    queryFn: () => get(),
    refetchInterval: 15000,
    retry: false,
  });
  const [selected, setSelected] = useState<DeliveryCase | null>(null),
    [search, setSearch] = useState("");
  if (approvals && profile?.role !== "admin") return <p>Acesso exclusivo à gestão.</p>;
  if (q.isPending) return <p role="status">Carregando atendimentos…</p>;
  if (q.isError) return <Button onClick={() => q.refetch()}>Tentar carregar fila</Button>;
  const all = q.data ?? [];
  const cases = all.filter(
    (c) =>
      (approvals ? c.request.approval_state !== "não solicitado" : c.request.technical) &&
      !c.demand.completed_at &&
      !c.demand.canceled_at &&
      `${c.client_name} ${c.demand.code} ${c.demand.title}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const stages = approvals
    ? ["aguardando", "aprovada", "publicada", "rejeitada"]
    : ["Recebida", "Em análise", "Em desenvolvimento", "Bloqueada", "Pronta para validação"];
  const labels: Record<string, string> = {
    aguardando: "Aguardando aprovação",
    aprovada: "Aprovadas para o lote",
    publicada: "Publicadas / avisar cliente",
    rejeitada: "Ajustes solicitados",
  };
  const current = selected
    ? (all.find((c) => c.request.id === selected.request.id) ?? selected)
    : null;
  return (
    <>
      <PageTitle
        title={approvals ? "Aprovações e publicações" : "Equipe técnica"}
        subtitle={
          approvals
            ? "Revise contexto, testes e GitHub. Aprovar não publica nem encerra o atendimento."
            : "Somente demandas encaminhadas. Informe a previsão e mantenha o CS atualizado."
        }
        actions={
          <Button variant="outline" onClick={() => q.refetch()}>
            Atualizar
          </Button>
        }
      />
      <Input
        aria-label="Pesquisar atendimento técnico"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Cliente, código ou demanda"
        className="mb-4 max-w-lg"
      />
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const group = cases.filter(
            (c) => (approvals ? c.request.approval_state : c.request.technical_stage) === stage,
          );
          return (
            <Section
              key={stage}
              title={`${labels[stage] ?? stage} · ${group.length}`}
              className="min-w-[260px] w-[300px] shrink-0"
            >
              <div className="space-y-3">
                {group.map((c) => (
                  <button
                    key={c.request.id}
                    onClick={() => setSelected(c)}
                    className="w-full rounded-lg border bg-card p-3 text-left hover:border-primary space-y-2"
                  >
                    <p className="text-xs font-mono">{c.demand.code}</p>
                    <p className="text-sm font-semibold">{c.demand.title}</p>
                    <p className="text-xs">
                      {c.client_name} · CS: {c.demand.cs_name ?? "A assumir"}
                    </p>
                    <p className="text-xs">Retorno: {dateLabel(c.request.next_update_at)}</p>
                    <p className="text-xs">
                      Entrega:{" "}
                      {c.request.delivery_eta ? dateLabel(c.request.delivery_eta) : "A confirmar"}
                    </p>
                    {c.request.next_update_at &&
                      Date.parse(c.request.next_update_at) < Date.now() &&
                      c.request.technical_stage !== "Pronta para validação" && (
                        <p className="text-xs text-destructive">Retorno atrasado</p>
                      )}
                  </button>
                ))}
              </div>
            </Section>
          );
        })}
      </div>
      {current && (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v) setSelected(null);
          }}
        >
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {current.demand.code} · {current.demand.title}
              </DialogTitle>
              <DialogDescription>
                {current.client_name} · {current.client_code}
              </DialogDescription>
            </DialogHeader>
            <p className="whitespace-pre-wrap text-sm">{current.demand.description}</p>
            <CaseWorkspace
              demand={current.demand.id}
              canManage={profile?.role === "admin" || current.demand.owner_id === session?.user.id}
              technical={profile?.role === "technical"}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
