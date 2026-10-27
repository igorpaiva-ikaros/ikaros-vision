// @vitest-environment node
// Conclusão pelo CS com confirmação do cliente: identidades fictícias em banco em memória (PGlite).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import {
  TRANSFER_GRANTS_MIGRATION,
  TRANSFER_MIGRATION,
  TRANSFER_SLA_MIGRATION,
} from "./transfer-migration-path";

const admin = "2d31f8a5-afeb-4e12-9a64-a91432bdab61",
  seededCs = "041b0196-008a-4edc-ae60-cbb8aac105ca",
  eduardo = "00000000-0000-4000-8000-0000000000e1",
  colleague = "00000000-0000-4000-8000-0000000000e2",
  tech = "00000000-0000-4000-8000-0000000000e3",
  client = "00000000-0000-4000-8000-0000000000c1";
let db: PGlite;

async function as<T = any>(id: string, sql: string): Promise<T[]> {
  await db.exec(
    `begin;set local role authenticated;select set_config('request.jwt.claim.sub','${id}',true);`,
  );
  try {
    const rows = (await db.query<any>(sql)).rows as T[];
    await db.exec("commit");
    return rows;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
const one = async (id: string, sql: string) => (await as(id, sql))[0];
const fails = (id: string, sql: string, pattern: RegExp) =>
  expect(as(id, sql)).rejects.toThrow(pattern);
const raw = async (sql: string) => (await db.query<any>(sql)).rows[0];
async function demand(owner: string, stage: string, approval: string | null, technical = false) {
  const d = await raw(
    `insert into demands(client_id,owner_id,title,description,classification,stage) values('${client}','${owner}','Demanda ${stage}','Contexto','Bug','${stage}') returning id,version,code`,
  );
  if (approval)
    await db.exec(
      `insert into delivery_requests(demand_id,approval_state,technical) values('${d.id}','${approval}',${technical})`,
    );
  return d as { id: string; version: number; code: string };
}
const confirmed = (id: string, version: number, solution: string, confirmation: string) =>
  `select stage,client_validated,client_informed,completed_at is not null fechado,solution from complete_demand_confirmed('${id}',${version},'${solution}','${confirmation}')`;

beforeAll(async () => {
  db = new PGlite();
  const ids = [admin, seededCs, eduardo, colleague, tech];
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;insert into auth.users values ${ids.map((id, i) => `('${id}','user${i}@example.test')`).join(",")};grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`,
  );
  await db.exec(await readFile("drizzle/migrations/0000_ikaros_access_and_snapshot.sql", "utf8"));
  await db.exec(
    `alter type public.app_role add value 'cs';insert into user_roles(user_id,role) values('${admin}','admin'),('${seededCs}','admin');`,
  );
  for (const file of [
    "20261005214500_native_operation",
    "20261006113000_operation_productivity",
    "20261006120000_crm_catalog_sla",
    "20261006130000_client_group_and_minimal_registration",
    "20261007080000_technical_role",
    "20261007080100_shared_portfolio",
    "20261007080200_delivery_workspace",
    "20261007080300_private_case_files",
    "20261007080400_sales_intake",
    "20261007080500_delivery_jobs_and_realtime",
    "20261007093000_clickable_validation_pipeline",
    "20261015180000_restore_sla_policy_and_first_response_deadline",
    "20261015193000_independent_client_promise",
    "20261015210000_admin_controls",
    "20261016143000_general_system_demands",
  ])
    await db.exec(await readFile(`supabase/migrations/${file}.sql`, "utf8"));
  await db.exec(await readFile(TRANSFER_MIGRATION, "utf8"));
  await db.exec(await readFile(TRANSFER_GRANTS_MIGRATION, "utf8"));
  await db.exec(await readFile(TRANSFER_SLA_MIGRATION, "utf8"));
  await db.exec(
    await readFile("supabase/migrations/20261027150000_client_confirmed_completion.sql", "utf8"),
  );
  await db.exec(
    `insert into profiles(id,full_name,email,active) values
      ('${eduardo}','Eduardo CS','e@example.test',true),('${colleague}','Colega CS','c@example.test',true),
      ('${tech}','Técnico','t@example.test',true);
     insert into user_roles(user_id,role) values('${eduardo}','cs'),('${colleague}','cs'),('${tech}','technical');
     insert into clients(id,name) values('${client}','Corretora fictícia');`,
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});

describe("Conclusão com confirmação do cliente", () => {
  it("o caminho normal continua exigindo validação e publicação do administrador", async () => {
    const waiting = await demand(eduardo, "Aguardando validação", "aguardando");
    await fails(
      eduardo,
      `select transition_demand('${waiting.id}','complete',${waiting.version})`,
      /validation_locked/,
    );
    const forwarded = await demand(
      eduardo,
      "Encaminhada para desenvolvimento",
      "não solicitado",
      true,
    );
    await db.exec(`select set_config('app.transition','on',false)`);
    await db.exec(
      `update demands set solution='Ajuste',client_informed=true where id='${forwarded.id}'`,
    );
    await db.exec(`select set_config('app.transition','off',false)`);
    const v = (await raw(`select version from demands where id='${forwarded.id}'`)).version;
    await fails(
      eduardo,
      `select transition_demand('${forwarded.id}','complete',${v})`,
      /confirme publicação/,
    );
  });

  it("responsável conclui com solução e confirmação, em validação, no técnico ou com ajustes pedidos", async () => {
    for (const [stage, approval, technical] of [
      ["Aguardando validação", "aguardando", false],
      ["Encaminhada para desenvolvimento", "não solicitado", true],
      ["Em execução", "rejeitada", false],
    ] as const) {
      const d = await demand(eduardo, stage, approval, technical);
      expect(
        await one(
          eduardo,
          confirmed(d.id, d.version, "Corrigido o cálculo", "Cliente confirmou no grupo"),
        ),
      ).toEqual({
        stage: "Concluída",
        client_validated: true,
        client_informed: true,
        fechado: true,
        solution: "Corrigido o cálculo",
      });
      expect(
        await raw(`select approval_state from delivery_requests where demand_id='${d.id}'`),
      ).toEqual({
        approval_state: "confirmada_cliente",
      });
      expect(
        await raw(
          `select action,to_value,details->>'approval_state_before' antes,details->>'client_confirmation' conf from workflow_history where entity_id='${d.id}' and action='complete'`,
        ),
      ).toEqual({
        action: "complete",
        to_value: "Concluída",
        antes: approval,
        conf: "Cliente confirmou no grupo",
      });
      const notified = (
        await db.query<any>(
          `select recipient_id from notifications where entity_id='${d.id}' and title like 'Concluída com confirmação do cliente%'`,
        )
      ).rows.map((r) => r.recipient_id);
      expect(notified).toContain(admin);
      expect(notified).not.toContain(eduardo);
      if (technical) expect(notified).toContain(tech);
    }
  });

  it("recusa sem confirmação, sem solução, de outra pessoa, versão antiga ou demanda interna", async () => {
    const d = await demand(eduardo, "Aguardando validação", "aguardando");
    await fails(eduardo, confirmed(d.id, d.version, "Corrigido", "ok"), /como o cliente confirmou/);
    await fails(
      eduardo,
      confirmed(d.id, d.version, " ", "Cliente confirmou no grupo"),
      /solução aplicada/,
    );
    await fails(
      eduardo,
      confirmed(d.id, d.version + 5, "Corrigido", "Cliente confirmou no grupo"),
      /conflict/,
    );
    await fails(
      colleague,
      confirmed(d.id, d.version, "Corrigido", "Cliente confirmou no grupo"),
      /not_found/,
    );
    await fails(
      tech,
      confirmed(d.id, d.version, "Corrigido", "Cliente confirmou no grupo"),
      /forbidden/,
    );
    expect(await raw(`select stage,completed_at from demands where id='${d.id}'`)).toEqual({
      stage: "Aguardando validação",
      completed_at: null,
    });
    const internal = await raw(
      `insert into demands(client_id,owner_id,title,description,classification,scope) values(null,'${eduardo}','Interna','Contexto','Bug','system') returning id,version`,
    );
    await fails(
      eduardo,
      confirmed(internal.id, internal.version, "Feito", "Confirmado pelo time"),
      /demandas internas/,
    );
  });

  it("administrador também conclui; repetir em demanda já concluída não altera nada", async () => {
    const d = await demand(colleague, "Aguardando validação", "aguardando");
    expect(
      (
        await one(
          admin,
          confirmed(d.id, d.version, "Ajuste publicado", "Cliente confirmou por áudio"),
        )
      ).stage,
    ).toBe("Concluída");
    const after = await raw(`select version,completed_at from demands where id='${d.id}'`);
    expect(
      (await one(colleague, confirmed(d.id, after.version, "Outro texto", "Outra confirmação")))
        .solution,
    ).toBe("Ajuste publicado");
    expect(await raw(`select version,completed_at from demands where id='${d.id}'`)).toEqual(after);
  });
});
