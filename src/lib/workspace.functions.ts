import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  recordInput,
  entityForms,
  transitionInput,
  createUserInput,
  memberInput,
} from "./workspace/validation";
import { clientRegistrationSchema } from "./domain/client-registration";
export const getAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readProfile } = await import("./workspace/access.server");
    return readProfile(context);
  });
export const getOperationState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { operationState } = await import("./workspace/read.server");
    return operationState(context);
  });
export const saveRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => recordInput.parse(d))
  .handler(async ({ context, data }) => {
    const { assertOperator, checkResult } = await import("./workspace/access.server");
    await assertOperator(context);
    const values = entityForms[data.kind].parse(data.values);
    const db = context.supabase as any;
    const client = checkResult(
      await db.from("clients").select("owner_id,is_test").eq("id", values.client_id).maybeSingle(),
    );
    if (!client?.owner_id) throw new Error("Cliente não encontrado ou sem responsável.");
    const { data: admin } = await db.rpc("is_admin", { _uid: context.userId });
    if (!admin && client.owner_id !== context.userId) throw new Error("Acesso não autorizado.");
    const input: any = { ...values };
    if (!admin) delete input.is_test;
    if (data.id) {
      if (!data.version) throw new Error("Recarregue o registro antes de editar.");
      delete input.client_id;
      const r = checkResult(
        await db
          .from(data.kind)
          .update(input)
          .eq("id", data.id)
          .eq("version", data.version)
          .select("id")
          .maybeSingle(),
      );
      if (!r) throw new Error("Outra pessoa alterou este registro. Recarregue e tente novamente.");
      return r;
    }
    input.owner_id = client.owner_id;
    input.is_test = client.is_test || !!values.is_test;
    if (data.kind === "demands") {
      input.stage = "Nova";
      input.received_at = new Date().toISOString();
    }
    if (data.kind === "onboardings") {
      input.stage = "Não iniciado";
      input.current_step = "1. Dados recebidos";
    }
    if (data.kind === "upgrades") input.stage = "Oportunidade identificada";
    if (data.kind === "interactions" || data.kind === "changelog")
      input.occurred_at = new Date().toISOString();
    return checkResult(await db.from(data.kind).insert(input).select("id").single());
  });
export const transitionRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => transitionInput.parse(d))
  .handler(async ({ context, data }) => {
    const { assertOperator, checkResult } = await import("./workspace/access.server");
    await assertOperator(context);
    const params: any = { _id: data.id, _action: data.action, _version: data.version };
    if (data.kind === "demands") {
      params._stage = data.stage ?? null;
      params._reason = data.reason ?? null;
    }
    if (data.kind === "onboardings" || data.kind === "upgrades") params._stage = data.stage ?? null;
    const names = {
      demands: "transition_demand",
      onboardings: "transition_onboarding",
      upgrades: "transition_upgrade",
    };
    return checkResult(await (context.supabase as any).rpc(names[data.kind], params));
  });
export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { assertOperator, checkResult } = await import("./workspace/access.server");
    await assertOperator(context);
    checkResult(
      await (context.supabase as any)
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", data.id)
        .eq("recipient_id", context.userId),
    );
    return { ok: true };
  });
export const getAdminState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin, checkResult } = await import("./workspace/access.server");
    await assertAdmin(context);
    const db = context.supabase as any;
    const [profiles, roles, issues, runs, jobs, clients, settings] = await Promise.all([
      db
        .from("profiles")
        .select("id,full_name,email,active,commission_eligible")
        .order("full_name"),
      db.from("user_roles").select("user_id,role"),
      db.from("import_issues").select("*").is("resolved_at", null).order("created_at").limit(500),
      db.from("import_runs").select("*").order("started_at", { ascending: false }).limit(5),
      db
        .from("job_runs")
        .select("*")
        .eq("job", "sla_tick")
        .order("ran_at", { ascending: false })
        .limit(5),
      db.from("clients").select("id,name,owner_id,version,is_test").order("name"),
      db.from("app_settings").select("key,value"),
    ]);
    const pending = checkResult(issues) ?? [];
    const names: Record<string, string> = {};
    await Promise.all(
      ["demands", "onboardings", "upgrades", "interactions", "changelog"].map(async (table) => {
        const ids = pending.filter((i: any) => i.source === table).map((i: any) => i.notion_id);
        if (!ids.length) return;
        const rows =
          checkResult(
            await db
              .from(table)
              .select(table === "interactions" ? "notion_id,summary" : "notion_id,title")
              .in("notion_id", ids),
          ) ?? [];
        for (const row of rows) names[row.notion_id] = row.title ?? row.summary;
      }),
    );
    const calendar = checkResult(await db.rpc("contract_calendar"));
    const rr = checkResult(roles) ?? [];
    return {
      calendar,
      members: (checkResult(profiles) ?? []).map((p: any) => ({
        ...p,
        role: rr.some((r: any) => r.user_id === p.id && r.role === "admin") ? "admin" : "cs",
      })),
      issues: pending.map((i: any) => ({ ...i, title: names[i.notion_id] ?? i.notion_id })),
      runs: checkResult(runs) ?? [],
      jobs: checkResult(jobs) ?? [],
      clients: checkResult(clients) ?? [],
      settings: checkResult(settings) ?? [],
    };
  });
export const createMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createUserInput.parse(d))
  .handler(async ({ context, data }) => {
    const { assertAdmin, checkResult } = await import("./workspace/access.server");
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: result, error } = await db.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error || !result.user)
      throw new Error(
        "Não foi possível criar a conta. Confira o e-mail ou se já existe um cadastro.",
      );
    try {
      checkResult(
        await db.rpc("provision_member", {
          _id: result.user.id,
          _name: data.name,
          _email: data.email,
          _role: data.role,
          _actor: context.userId,
        }),
      );
    } catch (e) {
      await db.auth.admin.deleteUser(result.user.id);
      throw e;
    }
    return { ok: true };
  });
export const updateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => memberInput.parse(d))
  .handler(async ({ context, data }) => {
    const { assertAdmin, checkResult } = await import("./workspace/access.server");
    await assertAdmin(context);
    checkResult(
      await (context.supabase as any).rpc("admin_update_member", {
        _id: data.id,
        _role: data.role,
        _active: data.active,
        _commission: data.commission,
      }),
    );
    return { ok: true };
  });
export const assignClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        owner: z.string().uuid(),
        version: z.number().int().positive(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { assertAdmin, checkResult } = await import("./workspace/access.server");
    await assertAdmin(context);
    checkResult(
      await (context.supabase as any).rpc("assign_client", {
        _id: data.id,
        _owner: data.owner,
        _version: data.version,
      }),
    );
    return { ok: true };
  });
export const resolveImportIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ issue: z.string().uuid(), client: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { assertAdmin, checkResult } = await import("./workspace/access.server");
    await assertAdmin(context);
    checkResult(
      await (context.supabase as any).rpc("resolve_import_issue", {
        _issue: data.issue,
        _client: data.client,
      }),
    );
    return { ok: true };
  });
export const setRiskWindow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ minutes: z.number().int().min(5).max(240) }).parse(d))
  .handler(async ({ context, data }) => {
    const { assertAdmin, checkResult } = await import("./workspace/access.server");
    await assertAdmin(context);
    checkResult(
      await (context.supabase as any).rpc("set_sla_risk_window", { _minutes: data.minutes }),
    );
    return { ok: true };
  });
export const importNotionOperation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin, checkResult } = await import("./workspace/access.server");
    await assertAdmin(context);
    const { fetchImportBundle } = await import("./workspace/import.server");
    const bundle = await fetchImportBundle();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return checkResult(
      await (supabaseAdmin as any).rpc("import_notion_bundle", {
        _bundle: bundle,
        _actor: context.userId,
      }),
    );
  });
// Client edits preserve assignment; reassignment has its own audited admin action.
export const updateClientContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        version: z.number().int().positive(),
        name: z.string().trim().min(2).max(200),
        contact_name: z.string().max(200),
        contact_email: z.union([z.literal(""), z.string().email()]),
        contact_phone: z.string().max(40),
        whatsapp: z.string().max(300),
        plan: z.string().max(100),
        notes: z.string().max(2000),
        status: z.enum(["Ativo", "Atenção", "Em risco", "Encerrado"]),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { assertOperator, checkResult } = await import("./workspace/access.server");
    await assertOperator(context);
    const { id, version, ...values } = data;
    const r = checkResult(
      await (context.supabase as any)
        .from("clients")
        .update(values)
        .eq("id", id)
        .eq("version", version)
        .select("id")
        .maybeSingle(),
    );
    if (!r) throw new Error("Outra pessoa alterou o cliente. Recarregue.");
    return { ok: true };
  });
export const getNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertOperator, checkResult } = await import("./workspace/access.server");
    await assertOperator(context);
    return (
      checkResult(
        await (context.supabase as any)
          .from("notifications")
          .select("id,title,link,level,read_at,created_at")
          .order("created_at", { ascending: false })
          .limit(200),
      ) ?? []
    );
  });
export const getRecordHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        kind: z.enum([
          "clients",
          "demands",
          "onboardings",
          "upgrades",
          "interactions",
          "changelog",
        ]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { assertOperator, checkResult } = await import("./workspace/access.server");
    await assertOperator(context);
    const db = context.supabase as any;
    const singular = {
      clients: "client",
      demands: "demand",
      onboardings: "onboarding",
      upgrades: "upgrade",
      interactions: "interaction",
      changelog: "changelog",
    };
    const rows =
      checkResult(
        await db
          .from("workflow_history")
          .select("id,action,from_value,to_value,actor_id,details,at")
          .eq("entity_id", data.id)
          .in("entity_type", [data.kind, singular[data.kind]])
          .order("at", { ascending: false })
          .limit(50),
      ) ?? [];
    const ids = Array.from(new Set(rows.map((r: any) => r.actor_id).filter(Boolean)));
    const people = ids.length
      ? (checkResult(await db.from("profiles").select("id,full_name").in("id", ids)) ?? [])
      : [];
    return rows.map((r: any) => ({
      ...r,
      actor:
        people.find((p: any) => p.id === r.actor_id)?.full_name ??
        (r.actor_id ? "Outro responsável" : "Migração"),
    }));
  });
