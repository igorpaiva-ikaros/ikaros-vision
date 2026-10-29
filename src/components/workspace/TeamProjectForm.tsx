import { useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { saveTeamProject } from "@/lib/team-projects.functions";
import {
  PROJECT_PRIORITIES,
  PROJECT_VISIBILITIES,
  type DeadlineSignal,
  type ProjectPriority,
  type ProjectVisibility,
  type TeamMember,
  type TeamProject,
} from "@/lib/workspace/team-projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const projectSelectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const toneClass: Record<DeadlineSignal["tone"], string> = {
  ok: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
  warn: "border-warning/40 bg-warning/10 text-warning",
  bad: "border-destructive/40 bg-destructive/10 text-destructive",
  neutral: "border-border bg-muted/40 text-muted-foreground",
};
export function SignalPill({ signal }: { signal: DeadlineSignal }) {
  return (
    <span
      data-tone={signal.tone}
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${toneClass[signal.tone]}`}
    >
      {signal.label}
    </span>
  );
}
export function ProjectField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
export function errorText(e: unknown) {
  return e instanceof Error ? e.message : "Não foi possível executar a ação.";
}

type StepDraft = { key: string; title: string; assignee_id: string; due_date: string };
const emptyStep = (): StepDraft => ({
  key: crypto.randomUUID(),
  title: "",
  assignee_id: "",
  due_date: "",
});

/** Criação (com etapas) ou edição dos dados do projeto, inclusive quem vê e os participantes. */
export function ProjectForm({
  members,
  defaultOwner,
  project,
  participants = [],
  close,
  saved,
}: {
  members: TeamMember[];
  defaultOwner: string;
  project?: TeamProject;
  /** Participantes já adicionados ao projeto em edição. */
  participants?: string[];
  close: () => void;
  saved: (project: TeamProject) => void;
}) {
  const save = useServerFn(saveTeamProject);
  const [title, setTitle] = useState(project?.title ?? "");
  const [context, setContext] = useState(project?.context ?? "");
  const [owner, setOwner] = useState(project?.owner_id ?? defaultOwner);
  const [priority, setPriority] = useState<ProjectPriority>(project?.priority ?? "Normal");
  const [start, setStart] = useState(project?.start_date ?? "");
  const [due, setDue] = useState(project?.due_date ?? "");
  const [steps, setSteps] = useState<StepDraft[]>(project ? [] : [emptyStep()]);
  const [visibility, setVisibility] = useState<ProjectVisibility>(project?.visibility ?? "team");
  const [chosen, setChosen] = useState<string[]>(participants);
  const toggle = (id: string, on: boolean) =>
    setChosen((list) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = (key: string, patch: Partial<StepDraft>) =>
    setSteps((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const shift = (index: number, delta: number) =>
    setSteps((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      if (item) next.splice(index + delta, 0, item);
      return next;
    });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (title.trim().length < 3)
      return setError("Informe o título do projeto (mínimo de 3 caracteres).");
    if (!owner) return setError("Escolha o responsável pelo projeto.");
    if (start && due && due < start)
      return setError("O prazo de entrega precisa ser igual ou posterior ao início.");
    const filled = steps.filter((s) => s.title.trim());
    if (filled.some((s) => s.title.trim().length < 2))
      return setError("Cada etapa precisa de um nome com pelo menos 2 caracteres.");
    setBusy(true);
    setError("");
    try {
      const values = {
        title: title.trim(),
        context: context.trim() || null,
        priority,
        owner_id: owner,
        start_date: start || null,
        due_date: due || null,
        visibility,
        participants: chosen.filter((id) => members.some((m) => m.id === id)),
        ...(project
          ? {}
          : {
              steps: filled.map((s) => ({
                title: s.title.trim(),
                assignee_id: s.assignee_id || null,
                due_date: s.due_date || null,
              })),
            }),
      };
      const result = await save({
        data: { id: project?.id ?? null, version: project?.version ?? 0, values },
      });
      toast.success(project ? "Projeto atualizado" : `Projeto ${result.code} criado`);
      saved(result);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{project ? `Editar ${project.code}` : "Novo projeto"}</DialogTitle>
          <DialogDescription>
            {project
              ? "Ajuste título, contexto, responsável, prioridade, prazos, quem vê e os participantes. Etapas são editadas no projeto."
              : "Descreva a pauta, defina quem conduz, o prazo de entrega e desenhe as etapas que o time vai percorrer."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <ProjectField label="Título *">
            <Input
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Integração do CRM do ERP com o onboarding"
            />
          </ProjectField>
          <ProjectField label="Contexto">
            <Textarea
              value={context}
              rows={5}
              maxLength={20000}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Objetivo, problema que resolve, referências e o que já foi combinado."
            />
          </ProjectField>
          <div className="grid gap-3 sm:grid-cols-2">
            <ProjectField label="Responsável *">
              <select
                className={projectSelectClass}
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              >
                <option value="">Selecione</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </ProjectField>
            <ProjectField label="Prioridade">
              <select
                className={projectSelectClass}
                value={priority}
                onChange={(e) => setPriority(e.target.value as ProjectPriority)}
              >
                {PROJECT_PRIORITIES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </ProjectField>
            <ProjectField label="Início">
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </ProjectField>
            <ProjectField label="Prazo de entrega">
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </ProjectField>
          </div>
          <fieldset className="space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">Quem vê e participa</legend>
            <div role="radiogroup" aria-label="Quem vê o projeto" className="flex flex-wrap gap-2">
              {PROJECT_VISIBILITIES.map((v) => (
                <label
                  key={v.key}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${visibility === v.key ? "border-primary bg-primary/10 font-medium" : ""}`}
                >
                  <input
                    type="radio"
                    name="project-visibility"
                    value={v.key}
                    checked={visibility === v.key}
                    onChange={() => setVisibility(v.key as ProjectVisibility)}
                  />
                  {v.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {PROJECT_VISIBILITIES.find((v) => v.key === visibility)?.guide}
            </p>
            <div role="group" aria-label="Participantes do projeto" className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {visibility === "participants" ? "Quem pode ver" : "Participantes"}
                </p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setChosen(members.map((m) => m.id))}
                  >
                    Marcar todos
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setChosen([])}>
                    Limpar
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Todos os usuários ativos do Vision. Quem criou, o responsável e os responsáveis por
                etapa já participam. Participantes recebem os avisos do projeto.
              </p>
              <div className="grid gap-1 sm:grid-cols-2">
                {members.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={chosen.includes(m.id)}
                      onChange={(e) => toggle(m.id, e.target.checked)}
                    />
                    {m.full_name}
                  </label>
                ))}
              </div>
            </div>
          </fieldset>
          {!project && (
            <fieldset className="space-y-2 rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium">Etapas do projeto</legend>
              <p className="text-xs text-muted-foreground">
                Na ordem em que o time vai passar. Cada etapa pode ter responsável e prazo próprios.
              </p>
              {steps.map((s, i) => (
                <div
                  key={s.key}
                  className="grid gap-2 rounded-md border bg-muted/30 p-2 sm:grid-cols-[1fr_12rem_9.5rem_auto]"
                >
                  <Input
                    aria-label={`Nome da etapa ${i + 1}`}
                    placeholder={`Etapa ${i + 1}`}
                    value={s.title}
                    maxLength={200}
                    onChange={(e) => update(s.key, { title: e.target.value })}
                  />
                  <select
                    aria-label={`Responsável pela etapa ${i + 1}`}
                    className={projectSelectClass}
                    value={s.assignee_id}
                    onChange={(e) => update(s.key, { assignee_id: e.target.value })}
                  >
                    <option value="">Sem responsável</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="date"
                    aria-label={`Prazo da etapa ${i + 1}`}
                    value={s.due_date}
                    onChange={(e) => update(s.key, { due_date: e.target.value })}
                  />
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Subir etapa ${i + 1}`}
                      disabled={i === 0}
                      onClick={() => shift(i, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Descer etapa ${i + 1}`}
                      disabled={i === steps.length - 1}
                      onClick={() => shift(i, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Remover etapa ${i + 1}`}
                      onClick={() => setSteps((list) => list.filter((x) => x.key !== s.key))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={steps.length >= 50}
                onClick={() => setSteps((list) => [...list, emptyStep()])}
              >
                <Plus className="mr-1 h-4 w-4" /> Adicionar etapa
              </Button>
            </fieldset>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Salvando…" : project ? "Salvar alterações" : "Criar projeto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CancelProjectDialog({
  project,
  busy,
  close,
  confirm,
}: {
  project: TeamProject;
  busy: boolean;
  close: () => void;
  confirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar {project.code}</DialogTitle>
          <DialogDescription>
            O projeto sai do quadro e fica no histórico. Informe o motivo para o time.
          </DialogDescription>
        </DialogHeader>
        <ProjectField label="Motivo do cancelamento *">
          <Textarea value={reason} rows={3} onChange={(e) => setReason(e.target.value)} />
        </ProjectField>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={close}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            disabled={busy || reason.trim().length < 3}
            onClick={() => confirm(reason.trim())}
          >
            Cancelar projeto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
