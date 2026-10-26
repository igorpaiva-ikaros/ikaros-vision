import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRightLeft } from "lucide-react";
import { useBi } from "@/lib/bi-context";
import {
  cancelDemandTransfer,
  claimRecord,
  decideDemandTransfer,
  requestDemandTransfer,
  transferDemand,
} from "@/lib/workspace.functions";
import {
  TRANSFER_DECIDERS_LABEL,
  pendingTransfer,
  transferActions,
  transferQueue,
} from "@/lib/workspace/transfers";
import type { OperationState, RecordRow, TransferRequest } from "@/lib/workspace/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const field = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const nameOf = (ds: OperationState, id: string | null | undefined) =>
  ds.people?.find((p) => p.id === id)?.full_name ?? (id ? "Outro colaborador" : "A assumir");
const when = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));

function useRun() {
  const { reload } = useBi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    try {
      await work();
      toast.success(success);
      reload();
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Não foi possível concluir.";
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, setError };
}

export function TransferDialog({
  row,
  ds,
  mode,
  close,
}: {
  row: RecordRow;
  ds: OperationState;
  mode: "request" | "direct";
  close: () => void;
}) {
  const request = useServerFn(requestDemandTransfer);
  const direct = useServerFn(transferDemand);
  const { busy, error, run, setError } = useRun();
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const targets = (ds.transferTargets ?? []).filter((p) => p.id !== row.owner_id);
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "request" ? "Solicitar transferência" : "Transferir demanda"} · {row.code}
          </DialogTitle>
          <DialogDescription>
            {mode === "request"
              ? `A demanda continua com você até a decisão do ${TRANSFER_DECIDERS_LABEL}.`
              : "O novo responsável assume na hora. Etapa, prazos, validação e anexos não mudam."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!to) return setError("Selecione o novo responsável.");
            if (reason.trim().length < 5)
              return setError("Informe o motivo com pelo menos 5 caracteres.");
            const data = { demand: row.id, version: row.version, to, reason: reason.trim() };
            const ok = await run(
              () => (mode === "request" ? request({ data }) : direct({ data })),
              mode === "request"
                ? "Solicitação enviada para decisão."
                : `Demanda transferida para ${nameOf(ds, to)}.`,
            );
            if (ok) close();
          }}
        >
          <fieldset disabled={busy} className="space-y-4">
            <p className="text-sm">
              Responsável atual: <strong>{nameOf(ds, row.owner_id)}</strong>
            </p>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Novo responsável *</span>
              <select
                aria-label="Novo responsável"
                className={field}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              >
                <option value="">Selecione um colaborador de CS ativo</option>
                {targets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Motivo *</span>
              <Textarea
                aria-label="Motivo da transferência"
                value={reason}
                maxLength={2000}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex.: férias, especialidade do colega, redistribuição da carteira"
              />
            </label>
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={close}>
              Voltar
            </Button>
            <Button type="submit" disabled={busy}>
              {mode === "request" ? "Enviar solicitação" : "Transferir agora"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Aviso de pendência no card e no detalhe da demanda. */
export function TransferNotice({ row, ds }: { row: RecordRow; ds: OperationState }) {
  const { profile } = useBi();
  const cancel = useServerFn(cancelDemandTransfer);
  const { busy, run } = useRun();
  const pending = pendingTransfer(row.id, ds);
  if (!pending) return null;
  const mine = pending.requested_by === profile?.id;
  return (
    <div
      role="status"
      data-transfer-pending={pending.id}
      className="rounded-md border border-warning/60 bg-warning/10 p-2 text-xs"
    >
      <p className="font-medium">
        Transferência pendente: {nameOf(ds, pending.from_owner_id)} →{" "}
        {nameOf(ds, pending.to_owner_id)}
      </p>
      <p className="text-muted-foreground">
        Decide: {TRANSFER_DECIDERS_LABEL}. Solicitada em {when(pending.created_at)}.
      </p>
      <p className="text-muted-foreground">Motivo: {pending.reason}</p>
      {mine && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-1 h-7 px-2 text-xs"
          disabled={busy}
          onClick={() =>
            void run(() => cancel({ data: { request: pending.id } }), "Solicitação cancelada.")
          }
        >
          Cancelar solicitação
        </Button>
      )}
    </div>
  );
}

/** Botões de responsável no card de demanda (assumir, liberar, solicitar, transferir). */
export function DemandOwnerActions({
  row,
  ds,
  locked = false,
}: {
  row: RecordRow;
  ds: OperationState;
  locked?: boolean;
}) {
  const { profile } = useBi();
  const claim = useServerFn(claimRecord);
  const { busy, run } = useRun();
  const [dialog, setDialog] = useState<"request" | "direct" | null>(null);
  const a = transferActions(row, ds, profile, locked);
  return (
    <>
      <TransferNotice row={row} ds={ds} />
      <div className="flex flex-wrap gap-1">
        {a.canClaim && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  claim({
                    data: { kind: "demands", id: row.id, version: row.version, release: false },
                  }),
                "Atendimento assumido.",
              )
            }
          >
            Assumir atendimento
          </Button>
        )}
        {a.canRequest && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setDialog("request")}>
            <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
            Solicitar transferência
          </Button>
        )}
        {a.canTransfer && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setDialog("direct")}>
            <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
            Transferir demanda
          </Button>
        )}
        {a.canRelease && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  claim({
                    data: { kind: "demands", id: row.id, version: row.version, release: true },
                  }),
                "Demanda liberada para a equipe.",
              )
            }
          >
            Liberar para equipe
          </Button>
        )}
      </div>
      {dialog && <TransferDialog row={row} ds={ds} mode={dialog} close={() => setDialog(null)} />}
    </>
  );
}

function QueueItem({ t, ds }: { t: TransferRequest; ds: OperationState }) {
  const { profile } = useBi();
  const decide = useServerFn(decideDemandTransfer);
  const cancel = useServerFn(cancelDemandTransfer);
  const { busy, error, run, setError } = useRun();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const demand = ds.demands.find((d) => d.id === t.demand_id);
  const a = demand ? transferActions(demand, ds, profile) : null;
  const client = ds.clients.find((c) => c.id === demand?.client_id);
  return (
    <li data-transfer-request={t.id} className="space-y-2 rounded-lg border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">
          {demand?.code ?? "Demanda"} ·{" "}
          {demand?.scope === "system" ? "Sistema geral · Ikaros" : (client?.name ?? "—")}
        </span>
        <span className="text-xs text-muted-foreground">{when(t.created_at)}</span>
      </div>
      <p className="font-medium">{demand?.title ?? "Demanda fora da sua visão"}</p>
      <p>
        {nameOf(ds, t.from_owner_id)} → <strong>{nameOf(ds, t.to_owner_id)}</strong> · solicitada
        por {nameOf(ds, t.requested_by)}
      </p>
      <p className="text-muted-foreground">Motivo: {t.reason}</p>
      {a?.canDecide && demand && !rejecting && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  decide({ data: { request: t.id, approve: true, version: demand.version } }),
                `Transferência aprovada para ${nameOf(ds, t.to_owner_id)}.`,
              )
            }
          >
            Aprovar
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(true)}>
            Recusar
          </Button>
        </div>
      )}
      {a?.canDecide && demand && rejecting && (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (reason.trim().length < 5)
              return setError("Informe o motivo da recusa com pelo menos 5 caracteres.");
            await run(
              () =>
                decide({
                  data: {
                    request: t.id,
                    approve: false,
                    version: demand.version,
                    reason: reason.trim(),
                  },
                }),
              "Solicitação recusada.",
            );
          }}
        >
          <Textarea
            aria-label="Motivo da recusa"
            value={reason}
            maxLength={2000}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" type="submit" variant="destructive" disabled={busy}>
              Confirmar recusa
            </Button>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setRejecting(false)}
            >
              Voltar
            </Button>
          </div>
        </form>
      )}
      {!a?.canDecide && t.requested_by === profile?.id && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Aguardando decisão do {TRANSFER_DECIDERS_LABEL}.
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={() =>
              void run(() => cancel({ data: { request: t.id } }), "Solicitação cancelada.")
            }
          >
            Cancelar solicitação
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}

/** Fila de decisões para gestores e lista das próprias solicitações para o colaborador. */
export function TransferQueue({ ds }: { ds: OperationState }) {
  const { profile } = useBi();
  const items = transferQueue(ds, profile?.id);
  if (!items.length && !ds.canManageTransfers) return null;
  return (
    <section
      aria-label="Solicitações de transferência"
      className="mb-5 rounded-xl border bg-muted/30 p-4"
    >
      <h2 className="mb-2 flex items-center gap-2 font-sans text-sm font-semibold">
        <ArrowRightLeft className="h-4 w-4" />
        {ds.canManageTransfers ? "Solicitações de transferência" : "Minhas solicitações de transferência"}
        <span className="rounded-full bg-background px-2 text-xs text-muted-foreground">
          {items.length}
        </span>
      </h2>
      {items.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((t) => (
            <QueueItem key={t.id} t={t} ds={ds} />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Nenhuma solicitação pendente.</p>
      )}
    </section>
  );
}
