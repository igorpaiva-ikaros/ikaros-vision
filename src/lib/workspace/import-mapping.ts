import type { Entity } from "./types";
export const SOURCES = {
  clients: "19835596-775d-48a6-9939-c8235bd82e84",
  demands: "dec12f4c-bcf8-493f-b3ad-c5485dd251e7",
  onboardings: "70e6e4ec-b3d6-49ed-bf4a-1756f32de443",
  upgrades: "6b5b6d6e-0c0f-4660-a7e9-64e130a76c1c",
  interactions: "28c33b6f-12c5-4b85-9581-5e543f93f87f",
  changelog: "bd630703-e5f2-4bb6-89e6-f664d0f872e4",
} as const;
const PEOPLE: Record<string, string> = {
  "3edd872b-594c-8177-85dc-00022369482c": "041b0196-008a-4edc-ae60-cbb8aac105ca",
  "3edd872b-594c-81a9-bafa-0002ad0bb855": "2d31f8a5-afeb-4e12-9a64-a91432bdab61",
};
export function uuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})(?:\?|$)/i,
  );
  if (!m) return null;
  const n = m[1]!.replace(/-/g, "").toLowerCase();
  return [n.slice(0, 8), n.slice(8, 12), n.slice(12, 16), n.slice(16, 20), n.slice(20)].join("-");
}
function firstId(value: unknown): string | null {
  if (Array.isArray(value)) return uuid(value[0]?.id ?? value[0]);
  if (typeof value === "string") {
    try {
      return firstId(JSON.parse(value));
    } catch {
      return uuid(value);
    }
  }
  return null;
}
export function flattened(page: any): Record<string, any> {
  if (!page.properties) return page;
  const out: Record<string, any> = {};
  for (const [n, p] of Object.entries(page.properties) as [string, any][]) {
    if (["title", "rich_text"].includes(p.type))
      out[n] = (p[p.type] ?? []).map((x: any) => x.plain_text ?? x.text?.content ?? "").join("");
    else if (p.type === "date") out["date:" + n + ":start"] = p.date?.start ?? null;
    else if (p.type === "people") out[n] = p.people;
    else if (p.type === "relation") out[n] = p.relation;
    else if (p.type === "select" || p.type === "status") out[n] = p[p.type]?.name ?? null;
    else if (p.type === "unique_id") out[n] = p.unique_id?.number;
    else if (p.type === "formula") out[n] = p.formula?.[p.formula.type];
    else if (p.type === "multi_select") out[n] = (p.multi_select ?? []).map((x: any) => x.name);
    else out[n] = p[p.type] ?? null;
  }
  return out;
}
export function mapImportPage(kind: keyof typeof SOURCES, page: any) {
  const p = flattened(page);
  const id = uuid(page.id ?? page.url);
  if (!id) throw new Error("Registro da origem sem identificador válido.");
  const get = (k: string) => p[k] ?? null;
  const s = (k: string) => (typeof get(k) === "string" ? get(k) : null);
  const b = (k: string) => get(k) === true || get(k) === "__YES__";
  const precision: string[] = [];
  const fields: Record<string, string> = {
    "Recebido em": "received_at",
    "Primeira resposta em": "first_response_at",
    "Encaminhado em": "forwarded_at",
    "Data de publicação": "published_at",
    "Data de conclusão": "completed_at",
    "Prazo final": "due_date",
    "Data de início": "started_at",
    "Informações completas em": "info_complete_at",
    "Concluído em": "completed_at",
    "Data de aceite": "accepted_at",
    "Data de efetivação": "effective_at",
    "Data de fechamento": "lost_at",
    "Data da oportunidade": "opportunity_at",
    Data: "occurred_at",
  };
  const date = (k: string) => {
    const v = get("date:" + k + ":start");
    if (typeof v === "string" && v.length === 10 && fields[k]) precision.push(fields[k]!);
    return typeof v === "string" ? (v.length === 10 ? v + "T00:00:00-03:00" : v) : null;
  };
  const owner =
    PEOPLE[firstId(get(kind === "clients" ? "Responsável principal" : "Responsável")) ?? ""] ??
    null;
  const titles = {
    clients: "Nome do cliente",
    demands: "Título",
    onboardings: "Onboarding",
    upgrades: "Upgrade",
    interactions: "Resumo",
    changelog: "Alteração",
  };
  const title = s(titles[kind]) ?? s("Empresa") ?? "Sem título";
  const prefixes = {
    clients: "CLI",
    demands: "DEM",
    onboardings: "ONB",
    upgrades: "UPG",
    interactions: "INT",
    changelog: "CHG",
  };
  const number =
    get(
      kind === "demands" ? "ID da demanda" : kind === "interactions" ? "ID da interação" : "ID",
    ) ?? get("userDefined:ID");
  const code =
    s("Código") && !s("Código")?.startsWith("formulaResult:")
      ? s("Código")
      : number != null
        ? prefixes[kind] + "-" + String(number).padStart(4, "0")
        : undefined;
  const row: any = {
    id,
    notion_id: id,
    notion_raw: page,
    owner_id: owner,
    is_test: b("Registro de teste") || /^TESTE\b/.test(title),
  };
  if (code) {
    row.code = code;
    row.notion_code = code;
    if (kind === "interactions" || kind === "changelog") delete row.notion_code;
  }
  if (page.created_time) row.created_at = page.created_time;
  if (kind === "clients")
    return {
      ...row,
      name: title,
      empresa: s("Empresa"),
      erp_id: s("ID ERP"),
      erp_slug: s("Slug ERP"),
      contact_name: s("Contato principal"),
      contact_email: s("E-mail do contato"),
      company_email: s("E-mail da empresa"),
      contact_phone: s("Telefone do contato"),
      company_phone: s("Telefone da empresa"),
      whatsapp: s("WhatsApp do contato"),
      segments: Array.isArray(get("Segmentos ERP"))
        ? get("Segmentos ERP")
        : s("Segmentos ERP")
          ? [s("Segmentos ERP")]
          : [],
      notes: s("Observações"),
      plan: s("Plano contratado"),
      status: s("Status do cliente") ?? "Ativo",
    };
  row.source_date_precision = precision;
  row.client_id = firstId(get("Cliente"));
  if (kind === "demands")
    return {
      ...row,
      title,
      description: s("Descrição do problema"),
      stage: s("Status") ?? "Nova",
      priority: s("Prioridade") ?? "Normal",
      classification: s("Classificação"),
      channel: s("Canal de origem"),
      context: s("Contexto"),
      impact: s("Impacto"),
      technical_type: s("Tipo técnico"),
      complexity: s("Complexidade"),
      received_at: date("Recebido em"),
      first_response_at: date("Primeira resposta em"),
      forwarded_at: date("Encaminhado em"),
      published_at: date("Data de publicação"),
      completed_at: date("Data de conclusão"),
      due_date: date("Prazo final"),
      solution: s("Solução aplicada"),
      tests_run: s("Testes executados"),
      test_result: s("Resultado dos testes"),
      client_informed: b("Cliente informado?"),
      client_validated: b("Cliente validou?"),
      ...(s("Data de entrada") ? { created_at: s("Data de entrada") } : {}),
    };
  if (kind === "onboardings")
    return {
      ...row,
      title,
      stage: s("Status") ?? "Não iniciado",
      current_step: s("Etapa atual") ?? "1. Dados recebidos",
      started_at: date("Data de início"),
      info_complete_at: date("Informações completas em"),
      completed_at: date("Concluído em"),
      expected_date: get("date:Data prevista:start")?.slice(0, 10) ?? null,
      progress: get("Progresso"),
      notes: s("Observações"),
    };
  if (kind === "upgrades")
    return {
      ...row,
      title,
      stage: s("Status") ?? "Oportunidade identificada",
      current_plan: s("Plano atual"),
      new_plan: s("Novo plano"),
      current_value: get("Valor atual"),
      new_value: get("Novo valor"),
      accepted_at: date("Data de aceite"),
      effective_at: date("Data de efetivação"),
      lost_at: s("Status") === "Perdido" ? date("Data de fechamento") : null,
      opportunity_at: date("Data da oportunidade"),
      need: s("Necessidade identificada"),
      notes: s("Observações"),
      commission_paid: b("Comissão paga?"),
    };
  row.demand_id = firstId(get("Demanda relacionada"));
  if (kind === "interactions")
    return {
      ...row,
      summary: title,
      channel: s("Canal"),
      occurred_at: date("Data"),
      problem: s("Problema identificado"),
      decision: s("Decisão tomada"),
      next_action: s("Próxima ação"),
    };
  return {
    ...row,
    title,
    description: s("Descrição da alteração"),
    kind: s("Tipo de alteração"),
    occurred_at: date("Data"),
    published_at: date("Data de publicação"),
    approved: b("Aprovação"),
    tests_run: s("Testes realizados"),
    result: s("Resultado"),
    files: s("Arquivos/componentes envolvidos"),
    tool: s("Ferramenta utilizada"),
    release_version: s("Versão"),
    notes: s("Observações"),
  };
}
