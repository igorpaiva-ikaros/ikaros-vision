export type Role = "admin" | "cs" | "technical";
export type Entity = "demands" | "onboardings" | "upgrades" | "interactions" | "changelog";
export interface Profile {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string | null;
  active: boolean;
  commission_eligible: boolean;
  role: Role;
}
export interface NativeClient {
  id: string;
  code: string;
  notion_id: string | null;
  name: string;
  empresa: string | null;
  owner_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  company_email: string | null;
  company_phone: string | null;
  whatsapp: string | null;
  whatsapp_group_url?: string | null;
  notes: string | null;
  segments: string[];
  plan: string | null;
  product_id?: string | null;
  status: string | null;
  is_test: boolean;
  version: number;
  erp_id: string | null;
  erp_slug: string | null;
}
export interface RecordRow {
  id: string;
  code: string;
  notion_id: string | null;
  client_id: string | null;
  owner_id: string | null;
  title?: string;
  summary?: string;
  description?: string | null;
  stage?: string;
  version: number;
  is_test: boolean;
  created_at: string;
  updated_at: string;
  source_date_precision?: string[];
  priority?: string | null;
  classification?: string | null;
  channel?: string | null;
  context?: string | null;
  impact?: string | null;
  solution?: string | null;
  approval_repository_url?: string | null;
  tests_run?: string | null;
  test_result?: string | null;
  technical_type?: string | null;
  complexity?: string | null;
  current_step?: string | null;
  current_plan?: string | null;
  new_plan?: string | null;
  need?: string | null;
  notes?: string | null;
  problem?: string | null;
  decision?: string | null;
  next_action?: string | null;
  kind?: string | null;
  result?: string | null;
  release_version?: string | null;
  files?: string | null;
  tool?: string | null;
  demand_id?: string | null;
  received_at?: string | null;
  first_response_due?: string | null;
  resolution_due?: string | null;
  first_response_at?: string | null;
  forwarded_at?: string | null;
  published_at?: string | null;
  validated_at?: string | null;
  completed_at?: string | null;
  canceled_at?: string | null;
  cancel_reason?: string | null;
  due_date?: string | null;
  policy_delivery_due?: string | null;
  started_at?: string | null;
  info_complete_at?: string | null;
  milestone5_due?: string | null;
  limit15_due?: string | null;
  expected_date?: string | null;
  opportunity_at?: string | null;
  accepted_at?: string | null;
  effective_at?: string | null;
  lost_at?: string | null;
  occurred_at?: string | null;
  commission_owner_id?: string | null;
  current_value?: number | string | null;
  new_value?: number | string | null;
  progress?: number | null;
  client_informed?: boolean;
  client_validated?: boolean;
  approved?: boolean;
  commission_paid?: boolean;
}
export type SlaStatus =
  | "no_prazo"
  | "em_risco"
  | "atrasado"
  | "cumprido"
  | "cumprido_atrasado"
  | "sem_dados"
  | "sem_registro";
export interface SlaRow {
  id: string;
  first_response_state: SlaStatus;
  resolution_state: SlaStatus;
  delivery_state: SlaStatus;
  first_response_due: string | null;
  resolution_due: string | null;
  delivery_due?: string | null;
}
export interface Notification {
  entity_id?: string;
  deadline?: string;
  id: string;
  title: string;
  link: string;
  read_at: string | null;
  created_at: string;
  level: "risk" | "overdue" | "reminder";
}
export interface OperationState {
  deliveries?: DeliveryRequest[];
  people?: { id: string; full_name: string }[];
  clients: NativeClient[];
  demands: RecordRow[];
  onboardings: RecordRow[];
  upgrades: RecordRow[];
  interactions: RecordRow[];
  changelog: RecordRow[];
  sla: SlaRow[];
  commissions: {
    id: string;
    commission_expected: number;
    commission_due: number;
    payment_expected: string | null;
  }[];
  notifications: Notification[];
  riskMinutes: number;
  products?: Product[];
}
export const ONBOARDING_STEPS = [
  "1. Recepção e apresentação",
  "2. Dados recebidos",
  "3. Cadastro",
  "4. Configuração",
  "5. Migração",
  "6. Conexão WhatsApp",
  "7. Configuração da IA",
  "8. Treinamento",
  "9. Validação",
  "10. Conclusão",
];
export const ONBOARDING_STATUSES = [
  "Não iniciado",
  "Em andamento",
  "Aguardando cliente",
  "Aguardando informação",
  "Em validação",
  "Bloqueado",
  "Concluído",
];
export const UPGRADE_STATUSES = [
  "Oportunidade identificada",
  "Em conversa",
  "Proposta apresentada",
  "Aguardando cliente",
  "Aceito",
  "Efetivado",
  "Perdido",
];
export const ENTITY_LABEL: Record<Entity, string> = {
  demands: "Demandas",
  onboardings: "Onboarding",
  upgrades: "Upgrades",
  interactions: "Conversas e decisões",
  changelog: "Histórico de entregas",
};
export function activeSla(states: (SlaStatus | string | null | undefined)[]): SlaStatus {
  if (states.includes("atrasado")) return "atrasado";
  if (states.includes("em_risco")) return "em_risco";
  if (states.includes("no_prazo")) return "no_prazo";
  if (states.includes("cumprido_atrasado")) return "cumprido_atrasado";
  if (states.includes("cumprido")) return "cumprido";
  return "sem_dados";
}
export const SLA_LABEL: Record<SlaStatus, string> = {
  no_prazo: "No prazo",
  em_risco: "Em risco",
  atrasado: "Atrasado",
  cumprido: "Cumprido",
  cumprido_atrasado: "Cumprido com atraso",
  sem_dados: "Sem dados",
  sem_registro: "Sem registro",
};

export type OperationTab = "clients" | "tasks" | Entity;
export interface ScheduledTask {
  id: string;
  client_id: string;
  record_kind: Entity | null;
  record_id: string | null;
  title: string;
  task_type: string;
  notes: string;
  due_at: string;
  status: "pending" | "completed" | "canceled";
  version: number;
  created_by: string;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  monthly_value: number;
  annual_monthly_value: number;
  active: boolean;
  version: number;
}
export interface SlaPolicy {
  category: string;
  version: number;
  response_value: number;
  response_unit: "minutes" | "hours" | "days";
  response_basis: "business" | "calendar";
  resolution_value: number;
  resolution_unit: "minutes" | "hours" | "days";
  resolution_basis: "business" | "calendar";
  delivery_value: number | null;
  delivery_unit: "minutes" | "hours" | "days";
  delivery_basis: "business" | "calendar";
}

export interface DeliveryRequest {
  id: string;
  demand_id: string;
  technical: boolean;
  technical_stage: string;
  technician_id: string | null;
  context: string;
  next_update_at: string | null;
  delivery_eta: string | null;
  forecast_reason: string | null;
  technical_result: string | null;
  tests_result: string | null;
  approval_state: string;
  change_summary: string | null;
  repository_url: string | null;
  deployment_ref: string | null;
  rejection_reason: string | null;
  published_at: string | null;
  version: number;
}
export interface DeliveryCase {
  request: DeliveryRequest;
  demand: RecordRow & { cs_name?: string | null };
  client_name: string;
  client_code: string;
}
export interface CaseMessage {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
}
export interface CaseAttachment {
  id: string;
  path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}
