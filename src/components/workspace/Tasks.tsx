import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useBi } from "@/lib/bi-context";
import { getScheduledTasks, saveScheduledTask } from "@/lib/workspace.functions";
import type { OperationState, ScheduledTask, Entity } from "@/lib/workspace/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Field, dateLabel, selectClass } from "./Operation";
export function toLocalTime(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(value))
    .replace(" ", "T");
}
export function toUtc(value: string) {
  return new Date(`${value}:00-03:00`).toISOString();
}
export type TaskDraft = { client: string; kind?: Entity; record?: string; task?: ScheduledTask };
export function TaskDialog({
  draft,
  ds,
  close,
}: {
  draft: TaskDraft;
  ds: OperationState;
  close: () => void;
}) {
  const { reload } = useBi();
  const save = useServerFn(saveScheduledTask);
  const [id] = useState(() => draft.task?.id ?? crypto.randomUUID());
  const [values, setValues] = useState({
    client: draft.client,
    title: draft.task?.title ?? "",
    type: draft.task?.task_type ?? "Retorno",
    due: toLocalTime(draft.task?.due_at ?? new Date(Date.now() + 3600000).toISOString()),
    notes: draft.task?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const closed = draft.task && draft.task.status !== "pending";
  async function persist(status: "pending" | "completed" | "canceled") {
    if (busy || closed) return;
    setBusy(true);
    setError("");
    try {
      if (status === "pending" && new Date(toUtc(values.due)).getTime() <= Date.now())
        throw new Error("Escolha uma data e horário futuros.");
      await save({
        data: {
          id,
          ...values,
          type: values.type as "Retorno",
          due: toUtc(values.due),
          kind: draft.task?.record_kind ?? draft.kind,
          record: draft.task?.record_id ?? draft.record,
          version: draft.task?.version,
          status,
        },
      });
      reload();
      close();
      toast.success(
        status === "completed"
          ? "Tarefa concluída."
          : status === "canceled"
            ? "Tarefa cancelada."
            : "Tarefa agendada.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) close();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.task ? "Tarefa agendada" : "Agendar tarefa"}</DialogTitle>
          <DialogDescription>
            Horário de São Paulo · lembrete interno para o responsável da carteira
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void persist("pending");
          }}
        >
          <fieldset disabled={busy || !!closed} className="space-y-4">
            <Field label="Cliente *">
              <select
                className={selectClass}
                required
                disabled={!!draft.client}
                value={values.client}
                onChange={(e) => setValues((v) => ({ ...v, client: e.target.value }))}
              >
                <option value="">Selecione o cliente</option>
                {ds.clients
                  .filter((c) => c.owner_id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Tarefa *">
              <Input
                required
                minLength={2}
                maxLength={300}
                value={values.title}
                onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tipo">
                <select
                  className={selectClass}
                  value={values.type}
                  onChange={(e) => setValues((v) => ({ ...v, type: e.target.value }))}
                >
                  {["Retorno", "Ligação", "Reunião", "Treinamento", "Validação", "Outro"].map(
                    (t) => (
                      <option key={t}>{t}</option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Data e horário *">
                <Input
                  required
                  type="datetime-local"
                  value={values.due}
                  onChange={(e) => setValues((v) => ({ ...v, due: e.target.value }))}
                />
              </Field>
            </div>
            <Field label="Observações">
              <Textarea
                maxLength={2000}
                value={values.notes}
                onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
              />
            </Field>
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={close}>
              Fechar
            </Button>
            {!closed && (
              <Button disabled={busy}>
                {busy ? "Salvando…" : draft.task ? "Salvar tarefa" : "Agendar"}
              </Button>
            )}
          </div>
          {draft.task && !closed && (
            <div className="flex gap-2 border-t pt-3">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void persist("completed")}
              >
                Concluir tarefa
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void persist("canceled")}
              >
                Cancelar tarefa
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function Tasks({
  ds,
  id,
  search = "",
  open,
}: {
  ds: OperationState;
  id?: string | undefined;
  search?: string;
  open: (d: TaskDraft) => void;
}) {
  const { session, includeTests } = useBi();
  const get = useServerFn(getScheduledTasks);
  const [filter, setFilter] = useState("pending");
  const q = useQuery({
    queryKey: ["scheduled-tasks", session?.user.id],
    queryFn: () => get(),
    staleTime: 30000,
    refetchInterval: 30000,
    retry: false,
  });
  const opened = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!id || opened.current === id) return;
    const task = q.data?.find((t) => t.id === id);
    if (task) {
      opened.current = id;
      open({ client: task.client_id, task });
    }
  }, [id, q.data]);
  const clients = new Map(ds.clients.map((c) => [c.id, c]));
  const rows =
    q.data?.filter(
      (t) =>
        t.status === filter &&
        (includeTests || !clients.get(t.client_id)?.is_test) &&
        `${t.title} ${t.task_type} ${clients.get(t.client_id)?.name ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => open({ client: "" })} disabled={!ds.clients.some((c) => c.owner_id)}>
          + Agendar tarefa
        </Button>
        {[
          ["pending", "Pendentes"],
          ["completed", "Concluídas"],
          ["canceled", "Canceladas"],
        ].map(([value, label]) => (
          <Button
            key={value}
            variant={filter === value ? "secondary" : "ghost"}
            onClick={() => setFilter(value!)}
          >
            {label}
          </Button>
        ))}
      </div>
      {q.isPending ? (
        <p role="status">Carregando agenda…</p>
      ) : q.isError ? (
        <Button onClick={() => q.refetch()}>Tentar carregar agenda novamente</Button>
      ) : !rows.length ? (
        <p className="text-sm text-muted-foreground">Nenhuma tarefa nesta seleção.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((t) => (
            <button
              key={t.id}
              onClick={() => open({ client: t.client_id, task: t })}
              className={`rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary ${t.status === "pending" && new Date(t.due_at).getTime() <= Date.now() ? "border-destructive/60" : ""}`}
            >
              <p className="text-xs text-muted-foreground">
                {clients.get(t.client_id)?.name} · {t.task_type}
              </p>
              <p className="mt-1 font-semibold">{t.title}</p>
              <p className="mt-2 text-sm">
                {dateLabel(t.due_at)}
                {t.status === "pending" && new Date(t.due_at).getTime() <= Date.now()
                  ? " · Pendente de execução"
                  : ""}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
