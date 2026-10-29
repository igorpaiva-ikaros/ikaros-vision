import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { calendarDate } from "@/lib/workspace/calendar";
import type { AgendaEvent } from "@/lib/workspace/agenda";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Agenda de um dia: prazos das demandas de clientes e do time (projetos, etapas e demandas internas),
 * em abas separadas. Cada item abre o registro de origem.
 */
export function AgendaDay({
  day,
  events,
  tasks = 0,
  close,
}: {
  day: string;
  events: { clients: AgendaEvent[]; team: AgendaEvent[] };
  /** Tarefas agendadas no dia (mostradas na grade da semana). */
  tasks?: number;
  close: () => void;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"clients" | "team">(
    events.clients.length || !events.team.length ? "clients" : "team",
  );
  const tabs = [
    { key: "clients" as const, label: "Demandas de clientes", list: events.clients },
    { key: "team" as const, label: "Time e projetos", list: events.team },
  ];
  const current = tabs.find((t) => t.key === tab)!;
  const title = calendarDate(day).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return (
    <Dialog open onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="first-letter:uppercase">Agenda de {title}</DialogTitle>
          <DialogDescription>
            Prazos do dia. Clique em um item para abrir a demanda ou o projeto.
            {tasks > 0 &&
              ` ${tasks} ${tasks === 1 ? "tarefa agendada" : "tarefas agendadas"} na grade da semana.`}
          </DialogDescription>
        </DialogHeader>
        <div role="tablist" aria-label="Tipo de prazo" className="flex gap-1 border-b">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`agenda-tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls={`agenda-panel-${t.key}`}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-primary font-semibold" : "border-transparent text-muted-foreground"}`}
            >
              {t.label} ({t.list.length})
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`agenda-panel-${tab}`}
          aria-labelledby={`agenda-tab-${tab}`}
          className="space-y-2"
        >
          {current.list.length ? (
            current.list.map((e) => (
              <button
                key={e.key}
                type="button"
                onClick={() => {
                  close();
                  if (e.target.to === "/projetos")
                    void navigate({ to: "/projetos", search: e.target.search });
                  else void navigate({ to: "/operacao", search: e.target.search });
                }}
                className={`block w-full rounded-md border p-3 text-left text-sm hover:border-primary ${e.late ? "border-destructive/40 bg-destructive/10" : e.done ? "border-success/30 bg-success/10" : "bg-card"}`}
              >
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded border px-1.5 py-0.5">{e.label}</span>
                  <span className="font-mono">{e.code}</span>
                  {e.late && <span className="font-medium text-destructive">Atrasado</span>}
                  {e.done && <span className="font-medium text-success">Concluído</span>}
                </span>
                <span className="mt-1 block font-semibold">{e.title}</span>
                <span className="block text-xs text-muted-foreground">{e.detail}</span>
              </button>
            ))
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {tab === "clients"
                ? "Nenhum prazo de demanda de cliente neste dia."
                : "Nenhum prazo de projeto, etapa ou demanda interna neste dia."}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
