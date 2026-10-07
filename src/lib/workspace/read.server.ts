import type { AuthContext } from "./access.server";
import { assertAdmin, assertOperator, checkResult } from "./access.server";
import type { OperationState } from "./types";
import { activeSla } from "./types";
import { toDayKey } from "../domain/period";
import type { Dataset } from "../domain/types";
const base =
  "id,code,notion_id,client_id,owner_id,is_test,version,created_at,updated_at,source_date_precision";
export const COLUMNS = {
  clients:
    "id,code,notion_id,name,empresa,erp_id,erp_slug,contact_name,company_email,company_phone,contact_email,contact_phone,whatsapp,whatsapp_group_url,notes,segments,plan,product_id,status,owner_id,is_test,version",
  demands:
    base +
    ",title,description,priority,classification,channel,impact,context,solution,tests_run,test_result,approval_repository_url,technical_type,complexity,client_informed,client_validated,stage,received_at,first_response_due,resolution_due,first_response_at,forwarded_at,published_at,validated_at,completed_at,canceled_at,cancel_reason,due_date,policy_delivery_due",
  onboardings:
    base +
    ",title,stage,current_step,progress,started_at,info_complete_at,milestone5_due,limit15_due,expected_date,completed_at,notes",
  upgrades:
    base +
    ",title,stage,current_plan,new_plan,current_value,new_value,accepted_at,effective_at,lost_at,opportunity_at,notes,need,commission_paid,commission_owner_id",
  interactions: base + ",demand_id,channel,summary,occurred_at,problem,decision,next_action",
  changelog:
    base +
    ",demand_id,title,description,kind,published_at,occurred_at,approved,result,tests_run,files,tool,release_version,notes",
};
export async function allRows(db: any, table: string, columns: string) {
  const out: any[] = [];
  for (let i = 0; i < 100; i++) {
    const r = await db
      .from(table)
      .select(columns)
      .order("id")
      .range(i * 500, (i + 1) * 500 - 1);
    const rows = checkResult(r) ?? [];
    out.push(...rows);
    if (rows.length < 500) return out;
  }
  throw new Error("A consulta excedeu o limite de registros; nenhuma leitura parcial foi exibida.");
}
export async function operationState(context: AuthContext): Promise<OperationState> {
  await assertOperator(context);
  const entriesPromise = Promise.all(
    Object.entries(COLUMNS).map(async ([table, cols]) => [
      table,
      await allRows(context.supabase, table, cols),
    ]),
  );
  const [sla, commissions, notifications, settings, people, products, deliveries] =
    await Promise.all([
      allRows(context.supabase, "demand_sla", "*"),
      allRows(context.supabase, "upgrade_commission", "*"),
      readNotifications(context.supabase),
      context.supabase.from("app_settings").select("value").eq("key", "sla_risk_minutes").single(),
      context.supabase.from("profiles").select("id,full_name"),
      (context.supabase as any).from("products").select("*").order("name"),
      allRows(context.supabase, "delivery_requests", "*"),
    ]);
  const entries = await entriesPromise;
  return {
    ...Object.fromEntries(entries),
    deliveries,
    sla,
    products: checkResult(products) ?? [],
    commissions,
    people: checkResult(people) ?? [],
    notifications,
    riskMinutes: Number(checkResult(settings)?.value ?? 60),
  } as OperationState;
}
export async function nativeDataset(context: AuthContext): Promise<Dataset> {
  await assertAdmin(context);
  const ds = await operationState(context);
  const people = ds.people ?? [];
  const p = (id: string | null) =>
    id ? [{ id, name: people.find((x: any) => x.id === id)?.full_name ?? null }] : [];
  const riskyClients = new Set(
    ds.demands
      .filter((d) => !["Concluída", "Cancelada"].includes(d.stage ?? ""))
      .filter((d) => {
        const s = ds.sla.find((x) => x.id === d.id);
        return ["em_risco", "atrasado"].includes(
          activeSla([s?.first_response_state, s?.resolution_state, s?.delivery_state]),
        );
      })
      .map((d) => d.client_id),
  );
  for (const r of ds.deliveries ?? []) {
    const d = ds.demands.find((d) => d.id === r.demand_id);
    if (
      d &&
      !d.completed_at &&
      !d.canceled_at &&
      r.technical &&
      r.technical_stage !== "Pronta para validação" &&
      [r.next_update_at, r.delivery_eta].some(
        (date) => date && Date.parse(date) - Date.now() <= ds.riskMinutes * 60000,
      )
    )
      riskyClients.add(d.client_id);
  }
  ds.onboardings
    .filter(
      (o) =>
        !o.completed_at &&
        o.limit15_due &&
        new Date(o.limit15_due).getTime() - Date.now() <= ds.riskMinutes * 60000,
    )
    .forEach((o) => riskyClients.add(o.client_id));
  return {
    source: "native",
    fetchedAt: new Date().toISOString(),
    schemaWarnings: [],
    clients: ds.clients.map((c) => ({
      id: c.id,
      clientCode: c.code,
      notionUrl: null,
      name: c.name,
      empresa: c.empresa,
      idErp: c.erp_id,
      slugErp: c.erp_slug,
      contatoPrincipal: c.contact_name,
      emailEmpresa: c.company_email,
      telefoneEmpresa: c.company_phone,
      emailContato: c.contact_email,
      telefoneContato: c.contact_phone,
      whatsappContato: c.whatsapp,
      segmentos: c.segments,
      plano: c.plan,
      status: riskyClients.has(c.id) ? "Em risco" : c.status,
      responsaveis: p(c.owner_id),
      isTest: c.is_test,
    })),
    demands: ds.demands.map((d) => {
      const sla = ds.sla.find((s) => s.id === d.id);
      const current = activeSla([
        sla?.first_response_state,
        sla?.resolution_state,
        sla?.delivery_state,
      ]);
      const closed = d.stage === "Concluída" || d.stage === "Cancelada";
      const state = closed
        ? d.stage
        : current === "atrasado"
          ? "Atrasado"
          : current === "em_risco"
            ? "Próximo do vencimento"
            : current === "no_prazo" || current === "cumprido"
              ? "No prazo"
              : "Sem informação";
      const fact = (key: "completed_at" | "published_at" | "due_date") =>
        d.source_date_precision?.includes(key) ? toDayKey(d[key]) : (d[key] ?? null);
      return {
        id: d.id,
        notionUrl: null,
        title: d.title ?? null,
        demandCode: d.code,
        clientIds: d.client_id ? [d.client_id] : [],
        responsaveis: p(d.owner_id),
        createdAt: (d.received_at ?? d.created_at) as string,
        completedAt: fact("completed_at"),
        publishedAt: fact("published_at"),
        dueDate: fact("due_date") ?? d.policy_delivery_due ?? null,
        priority: d.priority as string | null,
        classification: d.classification as string | null,
        channel: d.channel as string | null,
        technicalType: d.technical_type as string | null,
        complexity: d.complexity as string | null,
        description: d.description ?? null,
        context: d.context as string | null,
        impact: d.impact as string | null,
        solution: d.solution as string | null,
        testsRun: d.tests_run as string | null,
        testResult: d.test_result as string | null,
        clientInformed: d.client_informed as boolean,
        clientValidated: d.client_validated as boolean,
        isTest: d.is_test,
        status: d.stage ?? null,
        sla: {
          statusUtil: state ?? null,
          prazoFinalEfetivo: d.due_date ?? d.policy_delivery_due ?? null,
          prazoPrimeiraResposta: sla?.first_response_due ?? null,
          prazoSolucao: sla?.resolution_due ?? null,
          statusSla: null,
          vencido: closed ? false : current === "atrasado",
        },
      };
    }),
  };
}

export async function readNotifications(db: any) {
  return (checkResult(
    await db
      .from("notifications")
      .select("id,title,link,level,read_at,created_at,entity_id,deadline")
      .is("superseded_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
  ) ?? []) as import("./types").Notification[];
}
