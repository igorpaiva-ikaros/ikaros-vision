// Public identifiers of the Notion sources (not secrets). Reading only.
export const NOTION_SOURCES = {
  demandas: {
    dataSourceId: "dec12f4c-bcf8-493f-b3ad-c5485dd251e7",
    databaseId: "cb4d461d78c74db2a53db7f8d4442a0a",
  },
  clientes: {
    dataSourceId: "19835596-775d-48a6-9939-c8235bd82e84",
    databaseId: "a25ea8bb5d3d49219fda5abc5ec2f86f",
  },
} as const;

export const NOTION_VERSION = "2025-09-03";

/** Exact property names in the "Demandas" base. */
export const DEMAND_PROPS = {
  title: "Título",
  code: "ID da demanda",
  client: "Cliente",
  responsavel: "Responsável",
  createdAt: "Data de entrada",
  completedAt: "Data de conclusão",
  publishedAt: "Data de publicação",
  dueDate: "Prazo final",
  priority: "Prioridade",
  classification: "Classificação",
  channel: "Canal de origem",
  technicalType: "Tipo técnico",
  complexity: "Complexidade",
  description: "Descrição do problema",
  context: "Contexto",
  impact: "Impacto",
  solution: "Solução aplicada",
  testsRun: "Testes executados",
  testResult: "Resultado dos testes",
  clientInformed: "Cliente informado?",
  clientValidated: "Cliente validou?",
  isTest: "Registro de teste",
  status: "Status",
  slaStatusUtil: "Status SLA útil (auto)",
  slaPrazoFinal: "Prazo final efetivo (útil)",
  slaPrimeiraResposta: "Prazo 1ª resposta útil (auto)",
  slaSolucao: "Prazo solução útil (auto)",
  slaStatus: "Status do SLA",
  slaVencido: "SLA vencido?",
} as const;

export const CLIENT_PROPS = {
  empresa: "Empresa",
  idErp: "ID ERP",
  slugErp: "Slug ERP",
  contatoPrincipal: "Contato principal",
  emailEmpresa: "E-mail da empresa",
  telefoneEmpresa: "Telefone da empresa",
  emailContato: "E-mail do contato",
  telefoneContato: "Telefone do contato",
  whatsappContato: "WhatsApp do contato",
  segmentos: "Segmentos ERP",
  plano: "Plano contratado",
  status: "Status do cliente",
  responsavel: "Responsável principal",
  isTest: "Registro de teste",
} as const;
