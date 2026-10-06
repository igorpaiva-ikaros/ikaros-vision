import { Calendar } from "@/components/ui/calendar";
import { ptBR } from "react-day-picker/locale";
import {
  taskDay,
  addDays,
  weekDays,
  calendarDate,
  taskHour,
  periodProgress,
} from "@/lib/workspace/calendar";
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
export type TaskDraft = {
  client: string;
  kind?: Entity;
  record?: string;
  task?: ScheduledTask;
  due?: string;
};
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
    due: toLocalTime(
      draft.task?.due_at ?? draft.due ?? new Date(Date.now() + 3600000).toISOString(),
    ),
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
  const [filter, setFilter] = useState("all");
  const [day, setDay] = useState(() => taskDay(new Date()));
  const [view, setView] = useState("week");
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
        (filter === "all" || t.status === filter) &&
        (includeTests || !clients.get(t.client_id)?.is_test) &&
        `${t.title} ${t.task_type} ${clients.get(t.client_id)?.name ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) ?? [];
  const days = weekDays(day);
  const today = taskDay(new Date());
  const all = q.data?.filter((t) => includeTests || !clients.get(t.client_id)?.is_test) ?? [];
  const todayWeek = weekDays(today);
  const monthStart = today.slice(0, 7) + "-01";
  const monthEnd = addDays(
    new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1, 12))
      .toISOString()
      .slice(0, 10),
    -1,
  );
  const stats = [
    ["Hoje", today, today],
    ["Esta semana", todayWeek[0]!, todayWeek[6]!],
    ["Este mês", monthStart, monthEnd],
  ].map(([label, start, end]) => ({ label, ...periodProgress(all, start!, end!) }));
  const weekly = rows.filter((t) => days.includes(taskDay(t.due_at)));
  const minHour = Math.min(7, ...weekly.map((t) => taskHour(t.due_at)));
  const maxHour = Math.max(20, ...weekly.map((t) => taskHour(t.due_at)));
  const event = (t: ScheduledTask) => (
    <button
      key={t.id}
      onClick={() => open({ client: t.client_id, task: t })}
      className={`block w-full rounded-md border p-2 text-left text-xs hover:border-primary ${t.status === "completed" ? "border-success/30 bg-success/10" : t.status === "canceled" ? "bg-muted opacity-60" : new Date(t.due_at).getTime() < Date.now() ? "border-destructive/40 bg-destructive/10" : "border-primary/30 bg-primary/10"}`}
    >
      <span className="font-semibold">
        {toLocalTime(t.due_at).slice(11)} · {t.title}
      </span>
      <span className="mt-1 block text-muted-foreground">
        {clients.get(t.client_id)?.name} · {t.task_type}
        {t.status === "completed" ? " · Concluída" : t.status === "canceled" ? " · Cancelada" : ""}
      </span>
    </button>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="my-2 text-xl font-semibold">
              {s.completed} / {s.total} <span className="text-xs font-normal">concluídas</span>
            </p>
            <div className="h-1.5 overflow-hidden rounded bg-muted">
              <div className="h-full bg-primary" style={{ width: `${s.percent}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => open({ client: "" })} disabled={!ds.clients.some((c) => c.owner_id)}>
          + Agendar tarefa
        </Button>
        <Button
          variant="outline"
          aria-label="Semana anterior"
          onClick={() => setDay(addDays(day, -7))}
        >
          ←
        </Button>
        <Button variant="outline" onClick={() => setDay(today)}>
          Hoje
        </Button>
        <Button
          variant="outline"
          aria-label="Próxima semana"
          onClick={() => setDay(addDays(day, 7))}
        >
          →
        </Button>
        <span className="text-sm font-medium">
          {calendarDate(days[0]!).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} —{" "}
          {calendarDate(days[6]!).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </span>
        <select
          aria-label="Visualização de tarefas"
          className={selectClass + " max-w-36"}
          value={view}
          onChange={(e) => setView(e.target.value)}
        >
          <option value="week">Semana</option>
          <option value="list">Lista</option>
        </select>
        <select
          aria-label="Status das tarefas"
          className={selectClass + " max-w-40"}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Todas</option>
          <option value="pending">Pendentes</option>
          <option value="completed">Concluídas</option>
          <option value="canceled">Canceladas</option>
        </select>
      </div>
      {q.isPending ? (
        <p role="status">Carregando agenda…</p>
      ) : q.isError ? (
        <Button onClick={() => q.refetch()}>Tentar carregar agenda novamente</Button>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="rounded-xl border bg-card">
            <Calendar
              mode="single"
              required
              selected={calendarDate(day)}
              month={calendarDate(day)}
              onMonthChange={(date) => setDay(taskDay(date))}
              onSelect={(date) => {
                if (date) setDay(taskDay(date));
              }}
              locale={ptBR}
              weekStartsOn={1}
            />
            <p className="border-t p-3 text-xs text-muted-foreground">
              Horário de São Paulo. Selecione um horário vazio para agendar; clique em uma tarefa
              para editar ou concluir.
            </p>
          </aside>
          {view === "list" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {rows.length ? (
                rows.map((t) => (
                  <div key={t.id} className="space-y-1">
                    <p className="text-xs text-muted-foreground">{dateLabel(t.due_at)}</p>
                    {event(t)}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma tarefa nesta seleção.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <div
                className="min-w-[840px]"
                role="region"
                aria-label="Calendário semanal de tarefas"
              >
                <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] border-b bg-muted/50">
                  <span className="p-2 text-xs">Hora</span>
                  {days.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDay(d)}
                      className={`border-l p-3 text-center text-xs ${d === today ? "font-bold text-primary" : ""}`}
                    >
                      {calendarDate(d).toLocaleDateString("pt-BR", {
                        weekday: "short",
                        day: "2-digit",
                      })}
                    </button>
                  ))}
                </div>
                {Array.from({ length: maxHour - minHour + 1 }, (_, i) => i + minHour).map(
                  (hour) => (
                    <div
                      key={hour}
                      className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] border-b last:border-0"
                    >
                      <span className="p-2 text-xs text-muted-foreground">
                        {String(hour).padStart(2, "0")}:00
                      </span>
                      {days.map((d) => {
                        const events = weekly.filter(
                          (t) => taskDay(t.due_at) === d && taskHour(t.due_at) === hour,
                        );
                        return (
                          <div key={d} className="min-h-16 space-y-1 border-l p-1">
                            {events.map(event)}
                            <button
                              aria-label={`Agendar ${d} às ${hour}h`}
                              className="min-h-8 w-full rounded text-xs text-muted-foreground opacity-40 hover:bg-muted hover:opacity-100 focus:opacity-100"
                              onClick={() =>
                                open({
                                  client: "",
                                  due: new Date(
                                    `${d}T${String(hour).padStart(2, "0")}:00:00-03:00`,
                                  ).toISOString(),
                                })
                              }
                            >
                              +
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
