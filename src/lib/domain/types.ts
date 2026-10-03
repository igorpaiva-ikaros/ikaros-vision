// Domain types shared by the Notion mapper, the demo generator and the UI.
// Every field coming from Notion is nullable: missing data is shown as
// "Sem informação" and never replaced with invented values.

export const STATUSES = [
  "Nova",
  "Em triagem",
  "Aguardando informação",
  "Em execução",
  "Aguardando validação",
  "Encaminhada para desenvolvimento",
  "Publicada",
  "Aguardando cliente",
  "Bloqueada",
  "Concluída",
  "Cancelada",
] as const;
export const CLOSED_STATUSES = ["Concluída", "Cancelada"] as const;
export const PRIORITIES = ["Baixa", "Normal", "Alta", "Crítica"] as const;
export const CLASSIFICATIONS = [
  "Dúvida",
  "Suporte",
  "Bug",
  "Pequena melhoria",
  "Demanda complexa",
  "Configuração",
  "Onboarding",
  "Upgrade",
] as const;

export interface Person {
  id: string;
  name: string | null;
}

export interface DemandSla {
  /** Notion formula "Status SLA útil (auto)" */
  statusUtil: string | null;
  /** Notion formula "Prazo final efetivo (útil)" */
  prazoFinalEfetivo: string | null;
  /** Notion formula "Prazo 1ª resposta útil (auto)" */
  prazoPrimeiraResposta: string | null;
  /** Notion formula "Prazo solução útil (auto)" */
  prazoSolucao: string | null;
  /** Notion select "Status do SLA" */
  statusSla: string | null;
  /** Notion checkbox "SLA vencido?" (null when property absent) */
  vencido: boolean | null;
}

export interface Demand {
  id: string;
  notionUrl: string | null;
  title: string | null;
  demandCode: string | null;
  clientIds: string[];
  responsaveis: Person[];
  createdAt: string | null;
  completedAt: string | null;
  publishedAt: string | null;
  dueDate: string | null;
  priority: string | null;
  classification: string | null;
  channel: string | null;
  technicalType: string | null;
  complexity: string | null;
  description: string | null;
  context: string | null;
  impact: string | null;
  solution: string | null;
  testsRun: string | null;
  testResult: string | null;
  clientInformed: boolean | null;
  clientValidated: boolean | null;
  isTest: boolean;
  status: string | null;
  sla: DemandSla;
}

export interface Client {
  id: string;
  notionUrl: string | null;
  name: string | null;
  empresa: string | null;
  idErp: string | null;
  slugErp: string | null;
  contatoPrincipal: string | null;
  emailEmpresa: string | null;
  telefoneEmpresa: string | null;
  emailContato: string | null;
  telefoneContato: string | null;
  whatsappContato: string | null;
  segmentos: string[];
  plano: string | null;
  status: string | null;
  responsaveis: Person[];
  isTest: boolean;
}

export interface Dataset {
  source: "notion" | "demo";
  fetchedAt: string;
  demands: Demand[];
  clients: Client[];
  /** Properties expected but not found in the Notion schema. */
  schemaWarnings: string[];
}

export type ConnectionState =
  | { status: "demo" }
  | { status: "signed_out" }
  | { status: "forbidden" }
  | { status: "error"; message: string }
  | { status: "not_configured"; missing: string[] }
  | { status: "empty"; lastError: string | null; lastAttemptAt: string | null }
  | {
      status: "ok";
      dataset: Dataset;
      lastSuccessAt: string | null;
      lastAttemptAt: string | null;
      lastError: string | null;
      stale: boolean;
    };

