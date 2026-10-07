const client = "00000000-0000-4000-8000-000000000011";
const owner = "00000000-0000-4000-8000-000000000001";
const products = [
  {
    id: "00000000-0000-4000-8000-000000000090",
    name: "Feather",
    description: "",
    monthly_value: 697,
    annual_monthly_value: 397,
    active: true,
    version: 1,
  },
  {
    id: "00000000-0000-4000-8000-000000000091",
    name: "Wing",
    description: "",
    monthly_value: 1197,
    annual_monthly_value: 897,
    active: true,
    version: 1,
  },
];
const policies = [
  {
    category: "Bug",
    version: 1,
    response_value: 4,
    response_unit: "hours",
    response_basis: "business",
    resolution_value: 1,
    resolution_unit: "days",
    resolution_basis: "business",
    delivery_value: null,
    delivery_unit: "days",
    delivery_basis: "business",
  },
];
export const ds: any = {
  products,
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
      current_step: "3. Cadastro",
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
export async function saveRecord({ data }: any) {
  const row = {
    ...data.values,
    id: data.id ?? crypto.randomUUID(),
    code: "DEM-00002",
    owner_id: owner,
    stage: "Nova",
    version: 1,
    is_test: false,
  };
  ds[data.kind] = [...ds[data.kind].filter((r: any) => r.id !== row.id), row];
  (window as any).qaSavedRecord = structuredClone({ kind: data.kind, ...row });
  return row;
}
export async function updateClientContact({ data }: any) {
  const row = ds.clients.find((c: any) => c.id === data.id);
  Object.assign(row, data, { version: row.version + 1 });
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
    products,
    policies,
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

export async function saveProduct({ data }: any) {
  const old = products.find((p) => p.id === data.id);
  const product = {
    id: data.id,
    name: data.name,
    description: data.description,
    monthly_value: data.monthly,
    annual_monthly_value: data.annual,
    active: data.active,
    version: (old?.version ?? 0) + 1,
  };
  if (old) Object.assign(old, product);
  else products.push(product);
  return product;
}
export async function saveSlaPolicy({ data }: any) {
  (window as any).qaPolicySaves = ((window as any).qaPolicySaves ?? 0) + 1;
  const p = policies.find((p) => p.category === data.category)!;
  Object.assign(p, data.rules, { version: p.version + 1 });
  return { changed: true, recalculated: 1 };
}

export async function claimRecord() {
  return { ok: true };
}
export async function getDeliveryQueue() {
  return deliveries.map((r) => ({
    request: r,
    demand: ds.demands.find((d: any) => d.id === r.demand_id),
    client_name: ds.clients[0].name,
    client_code: ds.clients[0].code,
  }));
}
export async function getCaseWorkspace({ data }: any) {
  return { request: deliveries.find((r) => r.demand_id === data.demand) ?? null, messages, files };
}
export async function runDeliveryAction({ data }: any) {
  let r = deliveries.find((x) => x.demand_id === data.demand);
  if (!r) {
    r = {
      id: crypto.randomUUID(),
      demand_id: data.demand,
      version: 0,
      approval_state: "não solicitado",
      technical: false,
    };
    deliveries.push(r);
  }
  Object.assign(r, data.values, { version: r.version + 1 });
  if (data.action === "forward") {
    r.technical = true;
    r.technical_stage = "Recebida";
  }
  if (data.action === "technical_update") {
    r.technical_stage = data.values.stage;
    r.technical_result = data.values.result;
    r.tests_result = data.values.tests;
  }
  if (data.action === "request_approval") r.approval_state = "aguardando";
  if (data.action === "approve") r.approval_state = "aprovada";
  if (data.action === "published") r.approval_state = "publicada";
  return r;
}
export async function postCaseMessage({ data }: any) {
  messages.push({
    id: crypto.randomUUID(),
    author_name: "CS Exemplo",
    body: data.body,
    created_at: new Date().toISOString(),
  });
  return { ok: true };
}
export async function registerCaseFile({ data }: any) {
  files.push({
    id: crypto.randomUUID(),
    path: data.path,
    filename: data.filename,
    size_bytes: data.size,
  });
  return { ok: true };
}

const deliveries: any[] = [];
const messages: any[] = [];
const files: any[] = [];
