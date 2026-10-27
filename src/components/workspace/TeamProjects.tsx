import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { FolderKanban, GripVertical, Plus } from "lucide-react";
import { useBi } from "@/lib/bi-context";
import { getTeamProjects, moveTeamProject } from "@/lib/team-projects.functions";
import {
  PROJECT_STATUSES,
  attentionList,
  canMoveProject,
  currentStep,
  formatDay,
  memberName,
  progress,
  projectSignal,
  saoPauloToday,
  stepsOf,
  type ProjectStatus,
  type TeamMember,
  type TeamProject,
  type TeamProjectStep,
} from "@/lib/workspace/team-projects";
import { PageTitle } from "@/components/bi/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KanbanBoard } from "./KanbanBoard";
import {
  CancelProjectDialog,
  ProjectForm,
  SignalPill,
  errorText,
  projectSelectClass,
} from "./TeamProjectForm";
import { TeamProjectDetail } from "./TeamProjectDetail";

/** Aba Equipe → Projetos: quadro de projetos internos do time. */
export function TeamProjects({ selected }: { selected?: string | undefined }) {
  const { session, profile } = useBi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const get = useServerFn(getTeamProjects);
  const move = useServerFn(moveTeamProject);
  const q = useQuery({
    queryKey: ["team-projects", session?.user.id],
    queryFn: () => get(),
    refetchInterval: 30000,
    retry: false,
  });
  const [search, setSearch] = useState("");
  const [person, setPerson] = useState("all");
  const [showCanceled, setShowCanceled] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropStatus, setDropStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canceling, setCanceling] = useState<TeamProject | null>(null);
  const today = saoPauloToday();
  const user = profile ? { id: profile.id, role: profile.role } : null;
  const data = q.data;
  const projects = data?.projects ?? [];
  const steps = data?.steps ?? [];
  const members = data?.members ?? [];
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return projects.filter((p) => {
      if (
        term &&
        ![p.code, p.title, p.context ?? ""].some((v) => v.toLocaleLowerCase("pt-BR").includes(term))
      )
        return false;
      if (person === "all") return true;
      const who = person === "mine" ? (profile?.id ?? "") : person;
      return (
        p.owner_id === who ||
        p.created_by === who ||
        steps.some((s) => s.project_id === p.id && s.assignee_id === who)
      );
    });
  }, [projects, steps, search, person, profile?.id]);
  const attention = attentionList(visible, steps, today);
  const columns = PROJECT_STATUSES.filter((s) => showCanceled || s.key !== "cancelado");
  const open = projects.find((p) => p.id === selected) ?? null;
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["team-projects"] }),
      queryClient.invalidateQueries({ queryKey: ["team-project"] }),
    ]);
  function select(id: string | null) {
    void navigate({ to: "/projetos", search: id ? { id } : {} });
  }
  async function changeStatus(project: TeamProject, status: ProjectStatus, reason?: string) {
    if (status === project.status) return;
    if (status === "cancelado" && !reason) {
      setCanceling(project);
      return;
    }
    setBusy(true);
    try {
      await move({
        data: {
          id: project.id,
          version: project.version,
          status,
          ...(reason ? { reason } : {}),
        },
      });
      toast.success(`${project.code} em ${PROJECT_STATUSES.find((s) => s.key === status)?.label}`);
      setCanceling(null);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
      await refresh();
    }
  }
  if (q.isPending) return <p role="status">Carregando projetos da equipe…</p>;
  if (q.isError)
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive">
          {errorText(q.error)}
        </p>
        <Button variant="outline" onClick={() => q.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  return (
    <>
      <PageTitle
        title="Projetos da equipe"
        subtitle="Pautas, implementações e ideias do time, com etapas, prazo e conversa no mesmo lugar."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" /> Novo projeto
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <Input
            aria-label="Buscar projeto"
            placeholder="Buscar por código, título ou contexto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filtrar por pessoa"
          className={`${projectSelectClass} w-auto`}
          value={person}
          onChange={(e) => setPerson(e.target.value)}
        >
          <option value="all">Todos os projetos</option>
          <option value="mine">Meus projetos</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showCanceled}
            onChange={(e) => setShowCanceled(e.target.checked)}
          />
          Mostrar cancelados
        </label>
      </div>
      {attention.length > 0 && (
        <section
          aria-label="Projetos que pedem atenção"
          className="mb-4 rounded-xl border border-warning/40 bg-warning/5 p-3"
        >
          <h2 className="text-sm font-semibold">Pedem atenção ({attention.length})</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {attention.map(({ project, signal }) => (
              <button
                key={project.id}
                type="button"
                onClick={() => select(project.id)}
                className="inline-flex items-center gap-2 rounded-lg border bg-card px-2 py-1 text-left text-xs hover:bg-muted"
              >
                <span className="font-mono text-muted-foreground">{project.code}</span>
                <span className="max-w-56 truncate font-medium">{project.title}</span>
                <SignalPill signal={signal} />
              </button>
            ))}
          </div>
        </section>
      )}
      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <FolderKanban className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-2 font-medium">Nenhum projeto ainda</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Registre a primeira pauta do time com título, contexto, etapas e prazo.
          </p>
          <Button className="mt-4" onClick={() => setCreating(true)}>
            Criar projeto
          </Button>
        </div>
      ) : (
        <KanbanBoard label="Quadro de projetos da equipe">
          {columns.map((column) => {
            const group = visible.filter((p) => p.status === column.key);
            return (
              <section
                key={column.key}
                data-status={column.key}
                aria-label={column.label}
                onDragOver={(e) => {
                  if (dragged && !busy) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropStatus(column.key);
                  }
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropStatus(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropStatus(null);
                  const id = e.dataTransfer.getData("application/x-ikaros-project");
                  const project = projects.find((p) => p.id === id);
                  if (!project) return;
                  if (!canMoveProject(project, steps, user, column.key)) {
                    toast.error("Você não pode mover este projeto para esta situação.");
                    return;
                  }
                  void changeStatus(project, column.key);
                }}
                className={`min-h-64 w-72 shrink-0 snap-start rounded-xl border p-3 transition-colors ${dropStatus === column.key ? "border-primary bg-primary/10" : "bg-muted/40"}`}
              >
                <h2 className="flex items-start justify-between gap-2 font-sans text-sm font-semibold">
                  <span>{column.label}</span>
                  <span className="rounded-full bg-background px-2 text-xs text-muted-foreground">
                    {group.length}
                  </span>
                </h2>
                <p className="mb-3 mt-2 min-h-10 text-xs leading-relaxed text-muted-foreground">
                  {column.guide}
                </p>
                <div className="space-y-3">
                  {group.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      steps={stepsOf(steps, project.id)}
                      allSteps={steps}
                      members={members}
                      today={today}
                      user={user}
                      busy={busy}
                      dragged={dragged === project.id}
                      onOpen={() => select(project.id)}
                      onDrag={setDragged}
                      onMove={(status) => void changeStatus(project, status)}
                    />
                  ))}
                </div>
                {!group.length && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Nenhum projeto nesta situação
                  </div>
                )}
              </section>
            );
          })}
        </KanbanBoard>
      )}
      {creating && (
        <ProjectForm
          members={members}
          defaultOwner={profile?.id ?? ""}
          close={() => setCreating(false)}
          saved={(project) => {
            setCreating(false);
            void refresh();
            select(project.id);
          }}
        />
      )}
      {canceling && (
        <CancelProjectDialog
          project={canceling}
          busy={busy}
          close={() => setCanceling(null)}
          confirm={(reason) => void changeStatus(canceling, "cancelado", reason)}
        />
      )}
      {selected && open && (
        <TeamProjectDetail
          project={open}
          steps={stepsOf(steps, open.id)}
          allSteps={steps}
          members={members}
          today={today}
          close={() => select(null)}
          refresh={refresh}
          changeStatus={(status) => changeStatus(open, status)}
        />
      )}
      {selected && !open && (
        <Dialog open onOpenChange={(v) => !v && select(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Projeto não encontrado</DialogTitle>
              <DialogDescription>
                O link pode estar desatualizado ou o projeto não está disponível para você.
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function ProjectCard({
  project,
  steps,
  allSteps,
  members,
  today,
  user,
  busy,
  dragged,
  onOpen,
  onDrag,
  onMove,
}: {
  project: TeamProject;
  steps: TeamProjectStep[];
  allSteps: TeamProjectStep[];
  members: TeamMember[];
  today: string;
  user: { id: string; role: string } | null;
  busy: boolean;
  dragged: boolean;
  onOpen: () => void;
  onDrag: (id: string | null) => void;
  onMove: (status: ProjectStatus) => void;
}) {
  const signal = projectSignal(project, steps, today);
  const done = progress(steps);
  const next = currentStep(steps);
  const targets = PROJECT_STATUSES.filter(
    (s) => s.key === project.status || canMoveProject(project, allSteps, user, s.key),
  );
  const movable = targets.length > 1;
  return (
    <article
      data-project-id={project.id}
      draggable={movable && !busy}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-ikaros-project", project.id);
        e.dataTransfer.effectAllowed = "move";
        onDrag(project.id);
      }}
      onDragEnd={() => onDrag(null)}
      className={`space-y-2 rounded-xl border border-l-4 bg-card p-3 shadow-sm transition-shadow hover:shadow-md ${dragged ? "opacity-40" : ""} ${signal.tone === "bad" ? "border-l-destructive" : signal.tone === "warn" ? "border-l-warning" : "border-l-primary/60"} ${movable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">
          {project.code} · {project.priority}
        </span>
        {movable && (
          <GripVertical
            aria-label="Arraste o projeto para outra situação"
            className="h-4 w-4 shrink-0 text-muted-foreground"
          />
        )}
      </div>
      <button type="button" className="w-full text-left" onClick={onOpen}>
        <span className="block break-words text-sm font-semibold">{project.title}</span>
        <span className="mt-1 block text-xs text-muted-foreground">
          Responsável: {memberName(members, project.owner_id)}
        </span>
      </button>
      {done.total > 0 && (
        <div>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>
              {done.done}/{done.total} etapas
            </span>
            <span>{done.percent}%</span>
          </div>
          <div
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={`Progresso de ${project.code}`}
            aria-valuenow={done.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full bg-primary" style={{ width: `${done.percent}%` }} />
          </div>
          {next && (
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              Agora: {next.title} · {memberName(members, next.assignee_id)}
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <SignalPill signal={signal} />
        {project.due_date && (
          <span className="text-[11px] text-muted-foreground">
            Entrega {formatDay(project.due_date)}
          </span>
        )}
      </div>
      {movable && (
        <select
          aria-label={`Mover ${project.code}`}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          value={project.status}
          disabled={busy}
          onChange={(e) => onMove(e.target.value as ProjectStatus)}
        >
          {targets.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      )}
    </article>
  );
}
