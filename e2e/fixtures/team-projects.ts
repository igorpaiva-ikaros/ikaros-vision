// Fixture em memória dos Projetos da equipe para os testes de navegador (sem banco real).
const me = "00000000-0000-4000-8000-000000000001";
const state: any = {
  members: [
    { id: me, full_name: "CS Exemplo" },
    { id: "00000000-0000-4000-8000-000000000002", full_name: "CS Colega" },
  ],
  projects: [] as any[],
  steps: [] as any[],
  activity: [] as any[],
  files: [] as any[],
};
let seq = 0;
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
function log(project: string, kind: string, body: string | null, file_id: string | null = null) {
  state.activity.push({
    id: id(),
    project_id: project,
    kind,
    actor_id: me,
    actor_name: "CS Exemplo",
    body,
    file_id,
    created_at: now(),
  });
}
function lock(projectId: string, version: number) {
  const p = state.projects.find((x: any) => x.id === projectId);
  if (!p) throw new Error("Não foi possível executar a ação. Confira seu acesso e os campos.");
  if (p.version !== version)
    throw new Error("Outra pessoa alterou este registro. Recarregue e tente novamente.");
  p.version += 1;
  p.updated_at = now();
  return p;
}
export async function getTeamProjects() {
  return structuredClone({
    projects: state.projects,
    steps: state.steps,
    members: state.members,
  });
}
export async function getTeamProjectDetail({ data }: any) {
  return structuredClone({
    activity: state.activity.filter((a: any) => a.project_id === data.project),
    files: state.files.filter((f: any) => f.project_id === data.project),
  });
}
export async function saveTeamProject({ data }: any) {
  const v = data.values;
  if (!data.id) {
    seq += 1;
    const p = {
      id: id(),
      code: `PRJ-${String(seq).padStart(5, "0")}`,
      title: v.title,
      context: v.context ?? null,
      status: "ideia",
      priority: v.priority ?? "Normal",
      owner_id: v.owner_id ?? me,
      created_by: me,
      start_date: v.start_date ?? null,
      due_date: v.due_date ?? null,
      completed_at: null,
      canceled_at: null,
      cancel_reason: null,
      version: 1,
      created_at: now(),
      updated_at: now(),
    };
    state.projects.push(p);
    log(p.id, "created", "Projeto criado");
    (v.steps ?? []).forEach((s: any, i: number) =>
      state.steps.push({
        id: id(),
        project_id: p.id,
        position: i + 1,
        title: s.title,
        description: null,
        assignee_id: s.assignee_id ?? null,
        due_date: s.due_date ?? null,
        done_at: null,
        done_by: null,
      }),
    );
    if (v.steps?.length) log(p.id, "step", `${v.steps.length} etapas definidas`);
    (window as any).qaSavedProject = structuredClone(v);
    return structuredClone(p);
  }
  const p = lock(data.id, data.version);
  Object.assign(p, v);
  log(p.id, "edit", "Dados do projeto atualizados");
  return structuredClone(p);
}
export async function moveTeamProject({ data }: any) {
  const p = lock(data.id, data.version);
  p.status = data.status;
  log(p.id, "status", `Situação: ${data.status}`);
  return structuredClone(p);
}
export async function saveTeamProjectStep({ data }: any) {
  const p = lock(data.project, data.version);
  const mine = state.steps.filter((s: any) => s.project_id === p.id);
  if (!data.step)
    state.steps.push({
      id: id(),
      project_id: p.id,
      position: mine.length + 1,
      description: null,
      done_at: null,
      done_by: null,
      assignee_id: null,
      due_date: null,
      ...data.values,
    });
  else
    Object.assign(
      state.steps.find((s: any) => s.id === data.step),
      data.values,
    );
  log(p.id, "step", `Etapa: ${data.values.title}`);
  return structuredClone(p);
}
export async function removeTeamProjectStep({ data }: any) {
  const p = lock(data.project, data.version);
  state.steps = state.steps.filter((s: any) => s.id !== data.step);
  return structuredClone(p);
}
export async function reorderTeamProjectSteps({ data }: any) {
  const p = lock(data.project, data.version);
  data.order.forEach((sid: string, i: number) => {
    const s = state.steps.find((x: any) => x.id === sid);
    if (s) s.position = i + 1;
  });
  return structuredClone(p);
}
export async function setTeamProjectStepDone({ data }: any) {
  const p = lock(data.project, data.version);
  const s = state.steps.find((x: any) => x.id === data.step);
  s.done_at = data.done ? now() : null;
  s.done_by = data.done ? me : null;
  log(p.id, "step", `${data.done ? "Etapa concluída" : "Etapa reaberta"}: ${s.title}`);
  return structuredClone(p);
}
export async function postTeamProjectMessage({ data }: any) {
  log(data.project, "message", data.body);
  return structuredClone(state.activity.at(-1));
}
export async function registerTeamProjectFile({ data }: any) {
  const f = {
    id: id(),
    project_id: data.project,
    path: data.path,
    filename: data.filename,
    mime_type: data.mime,
    size_bytes: data.size,
    uploaded_by: me,
    created_at: now(),
  };
  state.files.push(f);
  log(data.project, "file", data.note ?? null, f.id);
  return structuredClone(f);
}
