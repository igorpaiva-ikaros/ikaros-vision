const client = "00000000-0000-4000-8000-000000000011";
const owner = "00000000-0000-4000-8000-000000000001";
export const ds: any = {
  clients: [
    {
      id: client,
      code: "CLI-00001",
      name: "Corretora Exemplo",
      owner_id: owner,
      contact_name: "Contato Exemplo",
      contact_email: "example@example.test",
      contact_phone: "(11) 99999-0000",
      plan: "Wing",
      is_test: false,
      version: 1,
    },
  ],
  people: [{ id: owner, full_name: "CS Exemplo" }],
  demands: [
    {
      id: "00000000-0000-4000-8000-000000000021",
      code: "DEM-00001",
      client_id: client,
      owner_id: owner,
      title: "Proposta de consórcio não carrega",
      description: "O corretor não consegue abrir a proposta.",
      stage: "Nova",
      priority: "Alta",
      classification: "Bug",
      version: 1,
      is_test: false,
    },
  ],
  onboardings: [
    {
      id: "00000000-0000-4000-8000-000000000022",
      code: "ONB-00001",
      client_id: client,
      owner_id: owner,
      title: "Implantar carteira de seguros",
      stage: "Em andamento",
      current_step: "2. Cadastro",
      version: 1,
      is_test: false,
    },
  ],
  upgrades: [
    {
      id: "00000000-0000-4000-8000-000000000023",
      code: "UPG-00001",
      client_id: client,
      owner_id: owner,
      title: "Ampliar equipe comercial",
      stage: "Oportunidade identificada",
      new_plan: "Sun",
      new_value: 2197,
      version: 1,
      is_test: false,
    },
  ],
  interactions: [],
  changelog: [],
  sla: [],
  commissions: [],
  notifications: [],
  riskMinutes: 60,
};
export const metrics = { reads: 0, moves: 0 };
(window as any).qaMetrics = metrics;
let tasks: any[] = [];
export async function getOperationState() {
  metrics.reads++;
  return structuredClone(ds);
}
export async function transitionRecord({ data }: any) {
  metrics.moves++;
  await new Promise((r) => setTimeout(r, 250));
  const row = ds[data.kind].find((r: any) => r.id === data.id);
  row.stage = data.stage;
  row.version++;
  return structuredClone(row);
}
export async function saveRecord() {
  return { id: "fixture-record" };
}
export async function updateClientContact() {
  return { ok: true };
}
export async function getRecordHistory() {
  return [];
}
export async function getScheduledTasks() {
  return structuredClone(tasks);
}
export async function getNotifications() {
  return [];
}
export async function saveScheduledTask({ data }: any) {
  const task = {
    id: data.id,
    client_id: data.client,
    title: data.title,
    task_type: data.type,
    due_at: data.due,
    notes: data.notes,
    record_kind: data.kind ?? null,
    record_id: data.record ?? null,
    status: data.status ?? "pending",
    version: 1,
    created_by: owner,
  };
  tasks = [...tasks.filter((t) => t.id !== task.id), task];
  return task;
}
export async function getAdminState() {
  return {
    members: [
      {
        id: owner,
        full_name: "CS Exemplo",
        email: "example@example.test",
        active: true,
        role: "cs",
        commission_eligible: false,
        avatar_url: null,
      },
    ],
    clients: ds.clients,
    issues: [],
    jobs: [{ ok: true, ran_at: new Date().toISOString() }],
    settings: [],
    calendar: null,
  };
}
export async function createMember() {
  return { ok: true };
}
export async function updateMember() {
  return { ok: true };
}
export async function assignClient() {
  return { ok: true };
}
export async function resolveImportIssue() {
  return { ok: true };
}
export async function setRiskWindow() {
  return { ok: true };
}
