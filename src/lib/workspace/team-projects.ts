/**
 * Projetos da equipe — tipos e regras puras da tela (farol de prazo, progresso e atenção).
 * Quem pode gravar, quem vê e o que cada ação muda é decidido no banco (supabase/migrations/20261027120000_team_projects.sql,
 * 20261028140000_team_projects_technical.sql e 20261028180000_team_project_visibility.sql);
 * aqui só há cálculo de exibição, espelhando as mesmas regras de gerência.
 */
export const PROJECT_STATUSES = [
  {
    key: "ideia",
    label: "Ideias",
    guide: "Pautas e ideias registradas para avaliar e detalhar.",
  },
  {
    key: "planejado",
    label: "Planejado",
    guide: "Contexto, etapas e prazo definidos, aguardando início.",
  },
  {
    key: "em_andamento",
    label: "Em andamento",
    guide: "O time está executando as etapas.",
  },
  {
    key: "em_revisao",
    label: "Em revisão",
    guide: "Entregue para revisão antes de concluir.",
  },
  {
    key: "concluido",
    label: "Concluído",
    guide: "Todas as etapas entregues e revisadas.",
  },
  {
    key: "cancelado",
    label: "Cancelado",
    guide: "Encerrado sem entrega, com motivo registrado.",
  },
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]["key"];
export const OPEN_STATUSES: ProjectStatus[] = ["ideia", "planejado", "em_andamento", "em_revisao"];
export const PROJECT_PRIORITIES = ["Baixa", "Normal", "Alta", "Crítica"] as const;
export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number];
/** Quem vê o projeto: toda a equipe ou só participantes (administradores sempre veem). */
export const PROJECT_VISIBILITIES = [
  {
    key: "team",
    label: "Todo o time",
    guide: "Todo o time vê o projeto: administradores, CS e equipe técnica.",
  },
  {
    key: "participants",
    label: "Só quem eu escolher",
    guide:
      "Só as pessoas marcadas abaixo, quem criou, o responsável e os responsáveis por etapa. Administradores sempre veem.",
  },
] as const;
export type ProjectVisibility = (typeof PROJECT_VISIBILITIES)[number]["key"];
/** Janela de "vence em breve", em dias corridos. */
export const DUE_SOON_DAYS = 3;

export interface TeamProject {
  id: string;
  code: string;
  title: string;
  context: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  owner_id: string;
  created_by: string;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  visibility: ProjectVisibility;
  version: number;
  created_at: string;
  updated_at: string;
}
export interface TeamProjectStep {
  id: string;
  project_id: string;
  position: number;
  title: string;
  description: string | null;
  assignee_id: string | null;
  due_date: string | null;
  done_at: string | null;
  done_by: string | null;
}
export interface TeamProjectFile {
  id: string;
  project_id: string;
  path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
}
export type ActivityKind =
  | "created"
  | "message"
  | "file"
  | "status"
  | "step"
  | "deadline"
  | "owner"
  | "edit";
export interface TeamProjectActivity {
  id: string;
  project_id: string;
  kind: ActivityKind;
  actor_id: string;
  actor_name: string;
  body: string | null;
  file_id: string | null;
  created_at: string;
}
/** Pessoa adicionada como participante do projeto (além de quem criou, responsável e etapas). */
export interface TeamProjectParticipant {
  project_id: string;
  user_id: string;
}
export interface TeamMember {
  id: string;
  full_name: string;
}
export interface TeamProjectsState {
  projects: TeamProject[];
  steps: TeamProjectStep[];
  participants: TeamProjectParticipant[];
  members: TeamMember[];
}
export interface TeamProjectDetail {
  activity: TeamProjectActivity[];
  files: TeamProjectFile[];
}

export const PROJECT_COLUMNS =
  "id,code,title,context,status,priority,owner_id,created_by,start_date,due_date,completed_at,canceled_at,cancel_reason,visibility,version,created_at,updated_at";
export const PARTICIPANT_COLUMNS = "project_id,user_id";
export const STEP_COLUMNS =
  "id,project_id,position,title,description,assignee_id,due_date,done_at,done_by";
export const FILE_COLUMNS =
  "id,project_id,path,filename,mime_type,size_bytes,uploaded_by,created_at";
export const ACTIVITY_COLUMNS = "id,project_id,kind,actor_id,actor_name,body,file_id,created_at";

export function statusLabel(status: string) {
  return PROJECT_STATUSES.find((s) => s.key === status)?.label ?? status;
}
export function isClosedProject(project: Pick<TeamProject, "status">) {
  return project.status === "concluido" || project.status === "cancelado";
}

/** Data de hoje (AAAA-MM-DD) no fuso de São Paulo, nunca pelo UTC do navegador. */
export function saoPauloToday(now: Date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
function dayNumber(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86400000;
}
/** Dias corridos de `today` até `date` (negativo quando já passou). */
export function daysUntil(date: string, today: string) {
  return Math.round(dayNumber(date) - dayNumber(today));
}
export function formatDay(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "—";
  return value.split("-").reverse().join("/");
}
const dias = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

export type SignalTone = "ok" | "warn" | "bad" | "neutral";
export interface DeadlineSignal {
  tone: SignalTone;
  label: string;
  /** Peso para ordenar a lista de atenção (maior = mais urgente). */
  weight: number;
}

/** Farol de um prazo isolado (etapa ou projeto aberto). */
export function deadlineSignal(
  due: string | null,
  done: boolean,
  today: string,
  doneLabel = "Concluída",
): DeadlineSignal {
  if (done) return { tone: "ok", label: doneLabel, weight: 0 };
  if (!due) return { tone: "neutral", label: "Sem prazo", weight: 0 };
  const left = daysUntil(due, today);
  if (left < 0) return { tone: "bad", label: `Atrasado há ${dias(-left)}`, weight: 100 - left };
  if (left === 0) return { tone: "warn", label: "Vence hoje", weight: 50 };
  if (left <= DUE_SOON_DAYS)
    return { tone: "warn", label: `Vence em ${dias(left)}`, weight: 50 - left };
  return { tone: "ok", label: `No prazo · até ${formatDay(due).slice(0, 5)}`, weight: 0 };
}

export function stepsOf(steps: TeamProjectStep[], project: string) {
  return steps.filter((s) => s.project_id === project).sort((a, b) => a.position - b.position);
}
export function progress(steps: TeamProjectStep[]) {
  const total = steps.length;
  const done = steps.filter((s) => s.done_at).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}
/** Etapa atual: a primeira (pela ordem) ainda não concluída. */
export function currentStep(steps: TeamProjectStep[]) {
  return [...steps].sort((a, b) => a.position - b.position).find((s) => !s.done_at) ?? null;
}
export function overdueSteps(steps: TeamProjectStep[], today: string) {
  return steps.filter((s) => !s.done_at && s.due_date && daysUntil(s.due_date, today) < 0);
}

/** Farol do projeto: prazo do projeto atrasado pesa mais; depois etapas atrasadas; depois vencimento próximo. */
export function projectSignal(
  project: Pick<TeamProject, "status" | "due_date">,
  steps: TeamProjectStep[],
  today: string,
): DeadlineSignal {
  if (project.status === "concluido") return { tone: "ok", label: "Concluído", weight: 0 };
  if (project.status === "cancelado") return { tone: "neutral", label: "Cancelado", weight: 0 };
  const own = deadlineSignal(project.due_date, false, today);
  if (own.tone === "bad") return own;
  const late = overdueSteps(steps, today).length;
  if (late)
    return {
      tone: "bad",
      label: `${late} ${late === 1 ? "etapa atrasada" : "etapas atrasadas"}`,
      weight: 90,
    };
  return own;
}

/** O que pede atenção: projetos abertos atrasados, com etapa atrasada ou vencendo em breve. */
export function attentionList(projects: TeamProject[], steps: TeamProjectStep[], today: string) {
  return projects
    .filter((p) => !isClosedProject(p))
    .map((p) => ({ project: p, signal: projectSignal(p, stepsOf(steps, p.id), today) }))
    .filter((x) => x.signal.tone === "bad" || x.signal.tone === "warn")
    .sort(
      (a, b) => b.signal.weight - a.signal.weight || a.project.code.localeCompare(b.project.code),
    );
}

/** Mesma régua do banco (team_project_can_manage): administrador, quem criou ou o responsável. */
export function canManageProject(
  project: Pick<TeamProject, "created_by" | "owner_id">,
  user: { id: string; role: string | null | undefined } | null | undefined,
) {
  if (!user) return false;
  return user.role === "admin" || project.created_by === user.id || project.owner_id === user.id;
}
/** Concluir/reabrir etapa: quem gerencia, o responsável pela etapa ou qualquer pessoa se a etapa não tem responsável. */
export function canCompleteStep(
  project: Pick<TeamProject, "created_by" | "owner_id" | "status">,
  step: Pick<TeamProjectStep, "assignee_id">,
  user: { id: string; role: string | null | undefined } | null | undefined,
) {
  if (!user || isClosedProject(project)) return false;
  return canManageProject(project, user) || !step.assignee_id || step.assignee_id === user.id;
}
/** Mover no quadro: quem gerencia, ou quem tem etapa no projeto (só entre situações abertas). */
export function canMoveProject(
  project: Pick<TeamProject, "id" | "created_by" | "owner_id" | "status">,
  steps: TeamProjectStep[],
  user: { id: string; role: string | null | undefined } | null | undefined,
  to: ProjectStatus,
) {
  if (!user) return false;
  if (canManageProject(project, user)) return true;
  return (
    !isClosedProject(project) &&
    OPEN_STATUSES.includes(to) &&
    steps.some((s) => s.project_id === project.id && s.assignee_id === user.id)
  );
}
export function visibilityLabel(visibility: string) {
  return PROJECT_VISIBILITIES.find((v) => v.key === visibility)?.label ?? visibility;
}
/** Participantes adicionados ao projeto (lista editável). */
export function participantsOf(participants: TeamProjectParticipant[], project: string) {
  return participants.filter((p) => p.project_id === project).map((p) => p.user_id);
}
/**
 * Todos que participam do projeto, na mesma régua do banco (team_project_can_view, sem contar
 * administradores): quem criou, o responsável, os responsáveis por etapa e os participantes adicionados.
 */
export function projectPeople(
  project: Pick<TeamProject, "id" | "created_by" | "owner_id">,
  steps: TeamProjectStep[],
  participants: TeamProjectParticipant[],
) {
  const ids = [
    project.created_by,
    project.owner_id,
    ...steps.filter((s) => s.project_id === project.id).map((s) => s.assignee_id),
    ...participantsOf(participants, project.id),
  ];
  return [...new Set(ids.filter((id): id is string => !!id))];
}
export function memberName(members: TeamMember[], id: string | null | undefined) {
  if (!id) return "Sem responsável";
  return members.find((m) => m.id === id)?.full_name ?? "Ex-integrante";
}
export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
