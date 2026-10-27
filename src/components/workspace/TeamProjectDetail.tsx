import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Circle,
  Download,
  Mic,
  Paperclip,
  Pencil,
  Square,
  Trash2,
} from "lucide-react";
import { useBi } from "@/lib/bi-context";
import { supabase } from "@/integrations/supabase/client";
import { caseFile } from "@/lib/workspace/evidence";
import {
  getTeamProjectDetail,
  postTeamProjectMessage,
  registerTeamProjectFile,
  removeTeamProjectStep,
  reorderTeamProjectSteps,
  saveTeamProjectStep,
  setTeamProjectStepDone,
} from "@/lib/team-projects.functions";
import {
  PROJECT_STATUSES,
  canCompleteStep,
  canManageProject,
  canMoveProject,
  currentStep,
  deadlineSignal,
  formatDay,
  initials,
  isClosedProject,
  memberName,
  progress,
  projectSignal,
  saoPauloToday,
  statusLabel,
  type ProjectStatus,
  type TeamMember,
  type TeamProject,
  type TeamProjectActivity,
  type TeamProjectFile,
  type TeamProjectStep,
} from "@/lib/workspace/team-projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ProjectField,
  ProjectForm,
  SignalPill,
  errorText,
  projectSelectClass,
} from "./TeamProjectForm";

const BUCKET = "team-projects";
const MAX_RECORDING_SECONDS = 600;

export function TeamProjectDetail({
  project,
  steps,
  allSteps,
  members,
  today,
  close,
  refresh,
  changeStatus,
}: {
  project: TeamProject;
  steps: TeamProjectStep[];
  allSteps: TeamProjectStep[];
  members: TeamMember[];
  today: string;
  close: () => void;
  refresh: () => Promise<unknown>;
  changeStatus: (status: ProjectStatus) => Promise<void>;
}) {
  const { profile } = useBi();
  const user = profile ? { id: profile.id, role: profile.role } : null;
  const manager = canManageProject(project, user);
  const closed = isClosedProject(project);
  const [editing, setEditing] = useState(false);
  const signal = projectSignal(project, steps, today);
  const done = progress(steps);
  const targets = PROJECT_STATUSES.filter(
    (s) => s.key === project.status || canMoveProject(project, allSteps, user, s.key),
  );
  return (
    <Dialog open onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <p className="font-mono text-xs text-muted-foreground">
            {project.code} · {statusLabel(project.status)} · Prioridade {project.priority}
          </p>
          <DialogTitle className="break-words text-xl">{project.title}</DialogTitle>
          <DialogDescription>
            Responsável: {memberName(members, project.owner_id)} · Criado por{" "}
            {memberName(members, project.created_by)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <SignalPill signal={signal} />
          <span className="text-xs text-muted-foreground">
            Início {formatDay(project.start_date)} · Entrega {formatDay(project.due_date)}
          </span>
          {targets.length > 1 && (
            <select
              aria-label="Situação do projeto"
              className={`${projectSelectClass} h-8 w-auto text-xs`}
              value={project.status}
              onChange={(e) => void changeStatus(e.target.value as ProjectStatus)}
            >
              {targets.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
          {manager && !closed && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Editar dados
            </Button>
          )}
        </div>
        {project.status === "cancelado" && project.cancel_reason && (
          <p className="rounded-md border border-border bg-muted/40 p-2 text-sm">
            Motivo do cancelamento: {project.cancel_reason}
          </p>
        )}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-5">
            <section aria-label="Contexto do projeto">
              <h3 className="text-sm font-semibold">Contexto</h3>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {project.context ||
                  "Sem contexto registrado. Use Editar dados para descrever o objetivo."}
              </p>
            </section>
            <StepsSection
              project={project}
              steps={steps}
              members={members}
              today={today}
              user={user}
              manager={manager}
              done={done}
              refresh={refresh}
            />
          </div>
          <Timeline project={project} members={members} />
        </div>
        {editing && (
          <ProjectForm
            members={members}
            defaultOwner={project.owner_id}
            project={project}
            close={() => setEditing(false)}
            saved={() => {
              setEditing(false);
              void refresh();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepsSection({
  project,
  steps,
  members,
  today,
  user,
  manager,
  done,
  refresh,
}: {
  project: TeamProject;
  steps: TeamProjectStep[];
  members: TeamMember[];
  today: string;
  user: { id: string; role: string } | null;
  manager: boolean;
  done: { done: number; total: number; percent: number };
  refresh: () => Promise<unknown>;
}) {
  const setDone = useServerFn(setTeamProjectStepDone);
  const saveStep = useServerFn(saveTeamProjectStep);
  const removeStep = useServerFn(removeTeamProjectStep);
  const reorder = useServerFn(reorderTeamProjectSteps);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TeamProjectStep | null>(null);
  const closed = isClosedProject(project);
  const now = currentStep(steps);
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      toast.success(success);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      await refresh();
    }
  }
  function moveStep(index: number, delta: number) {
    const order = steps.map((s) => s.id);
    const [item] = order.splice(index, 1);
    if (!item) return;
    order.splice(index + delta, 0, item);
    void run(
      () => reorder({ data: { project: project.id, version: project.version, order } }),
      "Ordem das etapas atualizada",
    );
  }
  return (
    <section aria-label="Etapas do projeto" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Etapas · {done.done}/{done.total}
        </h3>
        {manager && !closed && !adding && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setAdding(true)}>
            Adicionar etapa
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {steps.length > 0 && (
        <ol aria-label="Pipeline do projeto" className="flex flex-wrap gap-1.5">
          {steps.map((s) => (
            <li
              key={s.id}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${s.done_at ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : now?.id === s.id ? "border-primary bg-primary/15 font-semibold" : "text-muted-foreground"}`}
            >
              {s.position}. {s.title}
            </li>
          ))}
        </ol>
      )}
      {steps.length === 0 && (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Nenhuma etapa definida.{" "}
          {manager
            ? "Desenhe o caminho que o time vai percorrer."
            : "Quem gerencia o projeto define as etapas."}
        </p>
      )}
      <ul className="space-y-2">
        {steps.map((s, i) =>
          editingStep === s.id ? (
            <li key={s.id}>
              <StepForm
                members={members}
                step={s}
                busy={busy}
                cancel={() => setEditingStep(null)}
                submit={(values) =>
                  void run(async () => {
                    await saveStep({
                      data: { project: project.id, version: project.version, step: s.id, values },
                    });
                    setEditingStep(null);
                  }, "Etapa atualizada")
                }
              />
            </li>
          ) : (
            <li
              key={s.id}
              data-step-id={s.id}
              className={`rounded-lg border p-3 ${now?.id === s.id ? "border-primary/60" : ""}`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  className="mt-0.5 shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`${s.done_at ? "Reabrir" : "Concluir"} etapa ${s.title}`}
                  aria-pressed={!!s.done_at}
                  disabled={busy || !canCompleteStep(project, s, user)}
                  onClick={() =>
                    void run(
                      () =>
                        setDone({
                          data: {
                            project: project.id,
                            version: project.version,
                            step: s.id,
                            done: !s.done_at,
                          },
                        }),
                      s.done_at ? "Etapa reaberta" : "Etapa concluída",
                    )
                  }
                >
                  {s.done_at ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={`break-words text-sm font-medium ${s.done_at ? "text-muted-foreground line-through" : ""}`}
                  >
                    {s.position}. {s.title}
                  </p>
                  {s.description && (
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {s.description}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{memberName(members, s.assignee_id)}</span>
                    {s.due_date && <span>· até {formatDay(s.due_date)}</span>}
                    <SignalPill signal={deadlineSignal(s.due_date, !!s.done_at, today)} />
                  </div>
                </div>
                {manager && !closed && (
                  <div className="flex shrink-0 gap-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label={`Subir etapa ${s.title}`}
                      disabled={busy || i === 0}
                      onClick={() => moveStep(i, -1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label={`Descer etapa ${s.title}`}
                      disabled={busy || i === steps.length - 1}
                      onClick={() => moveStep(i, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label={`Editar etapa ${s.title}`}
                      disabled={busy}
                      onClick={() => setEditingStep(s.id)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      aria-label={`Remover etapa ${s.title}`}
                      disabled={busy}
                      onClick={() => setRemoving(s)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ),
        )}
      </ul>
      {adding && (
        <StepForm
          members={members}
          busy={busy}
          cancel={() => setAdding(false)}
          submit={(values) =>
            void run(async () => {
              await saveStep({
                data: { project: project.id, version: project.version, step: null, values },
              });
              setAdding(false);
            }, "Etapa adicionada")
          }
        />
      )}
      <AlertDialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover etapa?</AlertDialogTitle>
            <AlertDialogDescription>
              A etapa “{removing?.title}” sai do pipeline. A remoção fica registrada na linha do
              tempo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const step = removing;
                setRemoving(null);
                if (step)
                  void run(
                    () =>
                      removeStep({
                        data: { project: project.id, version: project.version, step: step.id },
                      }),
                    "Etapa removida",
                  );
              }}
            >
              Remover etapa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function StepForm({
  members,
  step,
  busy,
  cancel,
  submit,
}: {
  members: TeamMember[];
  step?: TeamProjectStep;
  busy: boolean;
  cancel: () => void;
  submit: (values: {
    title: string;
    description: string | null;
    assignee_id: string | null;
    due_date: string | null;
  }) => void;
}) {
  const [title, setTitle] = useState(step?.title ?? "");
  const [description, setDescription] = useState(step?.description ?? "");
  const [assignee, setAssignee] = useState(step?.assignee_id ?? "");
  const [due, setDue] = useState(step?.due_date ?? "");
  const [error, setError] = useState("");
  return (
    <form
      aria-label={step ? `Editar etapa ${step.title}` : "Nova etapa"}
      className="space-y-2 rounded-lg border bg-muted/30 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim().length < 2) return setError("Informe o nome da etapa.");
        setError("");
        submit({
          title: title.trim(),
          description: description.trim() || null,
          assignee_id: assignee || null,
          due_date: due || null,
        });
      }}
    >
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <ProjectField label="Nome da etapa *">
        <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </ProjectField>
      <ProjectField label="Descrição">
        <Textarea
          value={description}
          rows={2}
          maxLength={5000}
          onChange={(e) => setDescription(e.target.value)}
        />
      </ProjectField>
      <div className="grid gap-2 sm:grid-cols-2">
        <ProjectField label="Responsável pela etapa">
          <select
            className={projectSelectClass}
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">Sem responsável</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </ProjectField>
        <ProjectField label="Prazo da etapa">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </ProjectField>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={cancel}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {step ? "Salvar etapa" : "Adicionar"}
        </Button>
      </div>
    </form>
  );
}

function dayKey(value: string) {
  return saoPauloToday(new Date(value));
}
function timeLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function Timeline({ project, members }: { project: TeamProject; members: TeamMember[] }) {
  const { session } = useBi();
  const queryClient = useQueryClient();
  const get = useServerFn(getTeamProjectDetail);
  const post = useServerFn(postTeamProjectMessage);
  const register = useServerFn(registerTeamProjectFile);
  const key = ["team-project", session?.user.id, project.id];
  const q = useQuery({
    queryKey: key,
    queryFn: () => get({ data: { project: project.id } }),
    refetchInterval: 15000,
    retry: false,
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const count = q.data?.activity.length ?? 0;
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "nearest" });
  }, [count]);
  async function work(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
      await queryClient.invalidateQueries({ queryKey: ["team-project"] });
    }
  }
  function upload(file: File, note?: string) {
    return work(async () => {
      const info = caseFile(file);
      const path = `${project.id}/${crypto.randomUUID()}/${info.safeName}`;
      const sent = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: info.mime, upsert: false });
      if (sent.error) throw new Error("Não foi possível enviar o arquivo.");
      try {
        await register({
          data: {
            project: project.id,
            path,
            filename: info.name,
            mime: info.mime,
            size: file.size,
            ...(note ? { note } : {}),
          },
        });
      } catch (e) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw e;
      }
    });
  }
  async function send() {
    const body = message.trim();
    if (!body || busy) return;
    if (await work(() => post({ data: { project: project.id, body } }))) setMessage("");
  }
  const files = new Map((q.data?.files ?? []).map((f) => [f.id, f]));
  let lastDay = "";
  return (
    <section
      aria-label="Linha do tempo do projeto"
      className="flex min-w-0 flex-col rounded-xl border"
    >
      <h3 className="border-b px-3 py-2 text-sm font-semibold">Conversa e linha do tempo</h3>
      <div className="max-h-[55dvh] min-h-48 space-y-2 overflow-y-auto p-3">
        {q.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Carregando conversa…
          </p>
        ) : q.isError ? (
          <Button type="button" variant="outline" size="sm" onClick={() => q.refetch()}>
            Tentar carregar a conversa
          </Button>
        ) : (
          (q.data?.activity ?? []).map((a) => {
            const day = dayKey(a.created_at);
            const header =
              day !== lastDay ? (
                <p className="pt-2 text-center text-[11px] font-medium text-muted-foreground">
                  {formatDay(day)}
                </p>
              ) : null;
            lastDay = day;
            return (
              <div key={a.id}>
                {header}
                <ActivityItem
                  item={a}
                  file={a.file_id ? (files.get(a.file_id) ?? null) : null}
                  mine={a.actor_id === session?.user.id}
                />
              </div>
            );
          })
        )}
        <div ref={end} />
      </div>
      <div className="space-y-2 border-t p-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Textarea
          aria-label="Mensagem para o time"
          placeholder="Escreva uma atualização, decisão ou dúvida para o time"
          rows={3}
          value={message}
          maxLength={10000}
          disabled={busy}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy || !message.trim()}
            onClick={() => void send()}
          >
            Enviar mensagem
          </Button>
          <label
            className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm ${busy ? "pointer-events-none opacity-50" : "hover:bg-muted"}`}
          >
            <Paperclip className="h-4 w-4" aria-hidden />
            Anexar arquivo
            <input
              type="file"
              className="sr-only"
              aria-label="Anexar arquivo ao projeto"
              disabled={busy}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.mp4,.webm,.mov,.mp3,.ogg,.wav,.m4a,.docx,.xlsx,.txt,.csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file)
                  void upload(file, message.trim() || undefined).then((ok) => {
                    if (ok) setMessage("");
                  });
              }}
            />
          </label>
          <VoiceRecorder disabled={busy} onRecorded={(file) => void upload(file)} />
        </div>
        <p className="text-xs text-muted-foreground">
          Imagens, PDF, Word, Excel, vídeo e áudio de até 50 MB. Acesso restrito ao time. Texto
          escrito antes de anexar vira a legenda do arquivo.
        </p>
      </div>
    </section>
  );
}

function ActivityItem({
  item,
  file,
  mine,
}: {
  item: TeamProjectActivity;
  file: TeamProjectFile | null;
  mine: boolean;
}) {
  if (item.kind !== "message" && item.kind !== "file")
    return (
      <p className="text-xs text-muted-foreground" data-activity={item.kind}>
        <span className="font-medium">{item.actor_name}</span> · {timeLabel(item.created_at)} —{" "}
        {item.body}
      </p>
    );
  return (
    <div className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`} data-activity={item.kind}>
      <span
        aria-hidden
        className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold"
      >
        {initials(item.actor_name)}
      </span>
      <div
        className={`min-w-0 max-w-[85%] rounded-xl border px-3 py-2 ${mine ? "bg-primary/10" : "bg-card"}`}
      >
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{item.actor_name}</span> ·{" "}
          {timeLabel(item.created_at)}
        </p>
        {item.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{item.body}</p>}
        {item.kind === "file" &&
          (file ? (
            <FileView file={file} />
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Anexo indisponível.</p>
          ))}
      </div>
    </div>
  );
}

function FileView({ file }: { file: TeamProjectFile }) {
  const kind = file.mime_type.split("/")[0];
  const inline = kind === "image" || kind === "audio" || kind === "video";
  const url = useQuery({
    queryKey: ["team-project-file", file.path],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(file.path, 3600);
      if (error || !data) throw new Error("Não foi possível abrir o anexo.");
      return data.signedUrl;
    },
    enabled: inline,
    staleTime: 50 * 60 * 1000,
    retry: false,
  });
  async function download() {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(file.path, 60, { download: file.filename });
    if (error || !data) {
      toast.error("Não foi possível abrir o anexo.");
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }
  const size = `${(file.size_bytes / 1024 / 1024).toFixed(1)} MB`;
  return (
    <div className="mt-2 space-y-1">
      {inline && url.data && kind === "image" && (
        <a href={url.data} target="_blank" rel="noopener noreferrer">
          <img
            src={url.data}
            alt={file.filename}
            className="max-h-64 rounded-md border object-contain"
          />
        </a>
      )}
      {inline && url.data && kind === "audio" && (
        <audio controls preload="metadata" src={url.data} className="w-full max-w-xs">
          <track kind="captions" />
        </audio>
      )}
      {inline && url.data && kind === "video" && (
        <video controls preload="metadata" src={url.data} className="max-h-64 w-full rounded-md">
          <track kind="captions" />
        </video>
      )}
      <Button type="button" size="sm" variant="outline" className="h-7" onClick={download}>
        <Download className="mr-1 h-3.5 w-3.5" />
        {file.filename} · {size}
      </Button>
    </div>
  );
}

/** Grava áudio pelo microfone do navegador (WebM, ou MP4 no Safari) e entrega como arquivo. */
function VoiceRecorder({
  disabled,
  onRecorded,
}: {
  disabled: boolean;
  onRecorded: (file: File) => void;
}) {
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState(false);
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  useEffect(() => {
    if (recording && seconds >= MAX_RECORDING_SECONDS) stop();
  }, [recording, seconds]);
  const supported =
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;
  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    setRecording(false);
  }
  async function start() {
    const mime = MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
    if (!mime) {
      toast.error("Este navegador não grava áudio em um formato aceito.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Permita o uso do microfone para gravar o áudio.");
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, { mimeType: mime });
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: mime });
      if (!blob.size) return;
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      onRecorded(
        new File([blob], `audio-${stamp}.${mime === "audio/webm" ? "webm" : "m4a"}`, {
          type: mime,
        }),
      );
    };
    recorder.current = rec;
    rec.start();
    setSeconds(0);
    setRecording(true);
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }
  if (!supported) return null;
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return recording ? (
    <Button type="button" size="sm" variant="destructive" onClick={stop}>
      <Square className="mr-1 h-3.5 w-3.5" /> Parar e enviar · {clock}
    </Button>
  ) : (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={disabled}
      onClick={() => void start()}
    >
      <Mic className="mr-1 h-4 w-4" /> Gravar áudio
    </Button>
  );
}
