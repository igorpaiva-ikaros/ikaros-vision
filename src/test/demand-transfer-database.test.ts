// @vitest-environment node
// Transferência de demandas: identidades fictícias isoladas em banco em memória (PGlite).
// Nada aqui toca o banco real; cada cenário cria as próprias demandas.
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { TRANSFER_MIGRATION, TRANSFER_GRANTS_MIGRATION } from "./transfer-migration-path";

const admin = "2d31f8a5-afeb-4e12-9a64-a91432bdab61",
  seededCs = "041b0196-008a-4edc-ae60-cbb8aac105ca",
  csA = "00000000-0000-4000-8000-0000000000a1",
  csB = "00000000-0000-4000-8000-0000000000a2",
  leader = "00000000-0000-4000-8000-0000000000a3",
  leaderNo = "00000000-0000-4000-8000-0000000000a4",
  inactive = "00000000-0000-4000-8000-0000000000a5",
  tech = "00000000-0000-4000-8000-0000000000a6",
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
async function fails(id: string, sql: string, pattern: RegExp) {
  await expect(as(id, sql)).rejects.toThrow(pattern);
}
async function one(sql: string) {
  return (await db.query<any>(sql)).rows[0];
}
async function demand(owner: string | null, extra = "") {
  return one(
    `insert into demands(client_id,owner_id,title,description,classification${extra ? "," + extra.split("=")[0] : ""}) values('${client}',${owner ? `'${owner}'` : "null"},'Transferência','Contexto salvo','Bug'${extra ? "," + extra.split("=")[1] : ""}) returning id,version,stage,first_response_due,resolution_due,policy_delivery_due,description`,
  );
}
const version = async (id: string) =>
  (await one(`select version from demands where id='${id}'`)).version as number;
const owner = async (id: string) =>
  (await one(`select owner_id from demands where id='${id}'`)).owner_id as string | null;
const request = (d: string, v: number, to: string, reason = "Férias do responsável") =>
  `select request_demand_transfer('${d}',${v},'${to}','${reason}') as r`;

beforeAll(async () => {
  db = new PGlite();
  const ids = [admin, seededCs, csA, csB, leader, leaderNo, inactive, tech];
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
  await db.exec(
    `insert into profiles(id,full_name,email,active) values
      ('${csA}','CS A','a@example.test',true),('${csB}','CS B','b@example.test',true),
      ('${leader}','Líder delegado','l@example.test',true),('${leaderNo}','Líder sem delegação','n@example.test',true),
      ('${inactive}','CS inativo','i@example.test',false),('${tech}','Técnico','t@example.test',true);
     insert into user_roles(user_id,role) values('${csA}','cs'),('${csB}','cs'),('${leader}','cs'),('${leaderNo}','cs'),('${inactive}','cs'),('${tech}','technical');
     insert into member_access(user_id,is_lead,promote_cs,manage_demand_transfers) values('${leader}',true,false,true),('${leaderNo}',true,true,false);
     insert into clients(id,name) values('${client}','Empresa real fictícia');`,
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});

describe("Delegação de transferências", () => {
  it("nasce desligada e só vale para líder ativo com a concessão do administrador", async () => {
    expect(
      await one(
        `select column_default from information_schema.columns where table_name='member_access' and column_name='manage_demand_transfers'`,
      ),
    ).toEqual({ column_default: "false" });
    const caps = await one(
      `select can_manage_demand_transfers('${admin}') a, can_manage_demand_transfers('${leader}') l, can_manage_demand_transfers('${leaderNo}') n, can_manage_demand_transfers('${csA}') c`,
    );
    expect(caps).toEqual({ a: true, l: true, n: false, c: false });
  });
  it("outro líder, mesmo com promote_cs, não concede a delegação a si nem a terceiros", async () => {
    await fails(
      leaderNo,
      `select save_member_access('${leaderNo}','{"is_lead":true,"view_team":false,"manage_cs":false,"promote_cs":true,"manage_demand_transfers":true,"hidden_areas":[]}')`,
      /forbidden/,
    );
    await fails(
      leaderNo,
      `select save_member_access('${csA}','{"is_lead":true,"view_team":false,"manage_cs":false,"promote_cs":false,"manage_demand_transfers":true,"hidden_areas":[]}')`,
      /forbidden/,
    );
    await fails(
      leaderNo,
      `update member_access set manage_demand_transfers=true where user_id='${leaderNo}' returning user_id`,
      /permission denied/,
    );
    expect(await one(`select can_manage_demand_transfers('${leaderNo}') v`)).toEqual({ v: false });
  });
  it("administrador concede e revoga; desligar a liderança revoga e nova promoção não reativa", async () => {
    const access = (lead: boolean, transfers: boolean) =>
      `'{"is_lead":${lead},"view_team":false,"manage_cs":false,"promote_cs":false,"manage_demand_transfers":${transfers},"hidden_areas":[]}'`;
    await as(admin, `select save_member_access('${csB}',${access(true, true)})`);
    expect(await one(`select can_manage_demand_transfers('${csB}') v`)).toEqual({ v: true });
    await as(leaderNo, `select set_cs_leader('${csB}',false)`);
    expect(await one(`select can_manage_demand_transfers('${csB}') v`)).toEqual({ v: false });
    await as(leaderNo, `select set_cs_leader('${csB}',true)`);
    expect(await one(`select can_manage_demand_transfers('${csB}') v`)).toEqual({ v: false });
    await as(admin, `select save_member_access('${csB}',${access(true, true)})`);
    await as(admin, `select save_member_access('${csB}',${access(false, true)})`);
    expect(
      await one(`select manage_demand_transfers m from member_access where user_id='${csB}'`),
    ).toEqual({ m: false });
    await as(admin, `select save_member_access('${csB}',${access(false, false)})`);
  });
});

describe("Solicitação pelo colaborador", () => {
  it("responsável solicita; demanda continua com ele; pendência visível; duplicada recusada", async () => {
    const d = await demand(csA);
    const [{ r }] = await as(csA, request(d.id, d.version, csB));
    expect(r).toMatchObject({ status: "pendente", from_owner_id: csA, to_owner_id: csB });
    expect(await owner(d.id)).toBe(csA);
    expect(await version(d.id)).toBe(d.version);
    expect(await as(csA, `select status from demand_transfer_requests where demand_id='${d.id}'`))
      .toHaveLength(1);
    expect(await as(csB, `select status from demand_transfer_requests where demand_id='${d.id}'`))
      .toHaveLength(1);
    expect(
      await as(leaderNo, `select status from demand_transfer_requests where demand_id='${d.id}'`),
    ).toHaveLength(0);
    await fails(csA, request(d.id, d.version, csB), /transfer_pending/);
    const notified = await one(
      `select array_agg(recipient_id::text order by recipient_id) ids from notifications where entity_id='${d.id}' and obligation='transfer_request'`,
    );
    expect(notified.ids).toEqual(expect.arrayContaining([admin, leader]));
    expect(notified.ids).not.toContain(csA);
    expect(notified.ids).not.toContain(leaderNo);
  });
  it("não solicita demanda de outro colaborador, nem destino inválido, igual ou sem motivo", async () => {
    const d = await demand(csA);
    await fails(csB, request(d.id, d.version, leader), /transfer_not_owner/);
    await fails(csA, request(d.id, d.version, inactive), /transfer_target_invalid/);
    await fails(csA, request(d.id, d.version, tech), /transfer_target_invalid/);
    await fails(csA, request(d.id, d.version, admin), /transfer_target_invalid/);
    await fails(csA, request(d.id, d.version, csA), /transfer_same_owner/);
    await fails(csA, request(d.id, d.version, csB, "   "), /transfer_reason_required/);
    await fails(csA, request(d.id, d.version + 5, csB), /conflict/);
    await fails(tech, request(d.id, d.version, csB), /transfer_forbidden/);
  });
  it("só escreve por RPC: sem insert direto e sem troca direta de responsável", async () => {
    const d = await demand(csA);
    await fails(
      csA,
      `insert into demand_transfer_requests(demand_id,from_owner_id,to_owner_id,requested_by,reason,demand_version) values('${d.id}','${csA}','${csB}','${csA}','Atalho direto',1)`,
      /permission denied/,
    );
    await fails(csA, `update demands set owner_id='${csB}' where id='${d.id}'`, /forbidden/);
    expect(await owner(d.id)).toBe(csA);
  });
  it("solicitante cancela enquanto pendente; terceiros não cancelam; decisão posterior é recusada", async () => {
    const d = await demand(csA);
    const [{ r }] = await as(csA, request(d.id, d.version, csB));
    await fails(csB, `select cancel_demand_transfer('${r.id}')`, /transfer_forbidden/);
    await fails(leader, `select cancel_demand_transfer('${r.id}')`, /transfer_forbidden/);
    const [{ c }] = await as(csA, `select cancel_demand_transfer('${r.id}') as c`);
    expect(c.status).toBe("cancelada");
    await fails(csA, `select cancel_demand_transfer('${r.id}')`, /transfer_not_pending/);
    await fails(
      leader,
      `select decide_demand_transfer('${r.id}',true,${d.version},null)`,
      /transfer_not_pending/,
    );
    expect(await owner(d.id)).toBe(csA);
    await as(csA, request(d.id, d.version, csB, "Nova tentativa"));
  });
});

describe("Decisão por administrador e líder delegado", () => {
  it("líder delegado aprova: troca só o responsável e preserva etapa, SLA e conteúdo", async () => {
    const d = await demand(csA);
    const [{ r }] = await as(csA, request(d.id, d.version, csB));
    await fails(csA, `select decide_demand_transfer('${r.id}',true,${d.version},null)`, /transfer_forbidden/);
    await fails(
      leaderNo,
      `select decide_demand_transfer('${r.id}',true,${d.version},null)`,
      /transfer_forbidden/,
    );
    const [{ x }] = await as(
      leader,
      `select decide_demand_transfer('${r.id}',true,${d.version},'Equilíbrio da carteira') as x`,
    );
    expect(x.request.status).toBe("aprovada");
    const after = await one(
      `select owner_id,stage,first_response_due,resolution_due,policy_delivery_due,description,version from demands where id='${d.id}'`,
    );
    expect(after).toMatchObject({
      owner_id: csB,
      stage: d.stage,
      first_response_due: d.first_response_due,
      resolution_due: d.resolution_due,
      policy_delivery_due: d.policy_delivery_due,
      description: d.description,
      version: d.version + 1,
    });
    await fails(
      admin,
      `select decide_demand_transfer('${r.id}',true,${d.version + 1},null)`,
      /transfer_not_pending/,
    );
    const history = await one(
      `select array_agg(action order by at) a from workflow_history where entity_id='${d.id}' and action like 'transfer_%'`,
    );
    expect(history.a).toEqual(["transfer_requested", "transfer_approved"]);
    const approved = await one(
      `select actor_id,from_value,to_value,details from workflow_history where entity_id='${d.id}' and action='transfer_approved'`,
    );
    expect(approved).toMatchObject({ actor_id: leader, from_value: "CS A", to_value: "CS B" });
    expect(approved.details).toMatchObject({
      requested_by: csA,
      reason: "Férias do responsável",
      decision_reason: "Equilíbrio da carteira",
    });
    const decided = await one(
      `select array_agg(recipient_id::text) ids from notifications where entity_id='${d.id}' and obligation='transfer_decision'`,
    );
    expect(decided.ids).toEqual(expect.arrayContaining([csA, csB]));
  });
  it("líder delegado não aprova a própria solicitação; rejeição exige motivo e mantém o responsável", async () => {
    const own = await demand(leader);
    const [{ r: self }] = await as(leader, request(own.id, own.version, csB));
    await fails(
      leader,
      `select decide_demand_transfer('${self.id}',true,${own.version},null)`,
      /transfer_self_decision/,
    );
    const d = await demand(csA);
    const [{ r }] = await as(csA, request(d.id, d.version, csB));
    await fails(admin, `select decide_demand_transfer('${r.id}',false,${d.version},'')`, /transfer_reason_required/);
    const [{ x }] = await as(
      admin,
      `select decide_demand_transfer('${r.id}',false,${d.version},'CS B sem agenda nesta semana') as x`,
    );
    expect(x.request).toMatchObject({ status: "rejeitada", decided_by: admin });
    expect(await owner(d.id)).toBe(csA);
    expect(await version(d.id)).toBe(d.version);
  });
  it("revalida a delegação na decisão: revogada depois da solicitação, o líder é recusado", async () => {
    const d = await demand(csA);
    const [{ r }] = await as(csA, request(d.id, d.version, csB));
    await db.exec(`update member_access set manage_demand_transfers=false where user_id='${leader}'`);
    try {
      await fails(
        leader,
        `select decide_demand_transfer('${r.id}',true,${d.version},null)`,
        /transfer_forbidden/,
      );
      expect(await owner(d.id)).toBe(csA);
    } finally {
      await db.exec(`update member_access set manage_demand_transfers=true where user_id='${leader}'`);
    }
  });
  it("conflito de versão, responsável alterado e destino desativado não trocam nada", async () => {
    const d = await demand(csA);
    const [{ r }] = await as(csA, request(d.id, d.version, csB));
    await as(csA, `update demands set priority='Alta' where id='${d.id}'`);
    await fails(admin, `select decide_demand_transfer('${r.id}',true,${d.version},null)`, /conflict/);
    expect(await owner(d.id)).toBe(csA);
    await db.exec(`update profiles set active=false where id='${csB}'`);
    try {
      await fails(
        admin,
        `select decide_demand_transfer('${r.id}',true,${await version(d.id)},null)`,
        /transfer_target_invalid/,
      );
    } finally {
      await db.exec(`update profiles set active=true where id='${csB}'`);
    }
    await db.exec(`update demands set owner_id='${leader}' where id='${d.id}'`);
    await fails(
      admin,
      `select decide_demand_transfer('${r.id}',true,${await version(d.id)},null)`,
      /transfer_owner_changed/,
    );
    expect(
      (await one(`select status from demand_transfer_requests where id='${r.id}'`)).status,
    ).toBe("pendente");
  });
});

describe("Transferência direta", () => {
  it("admin e líder delegado transferem com motivo; colaborador e líder sem delegação não", async () => {
    const d = await demand(csA);
    const direct = (v: number, to: string, reason = "Redistribuição da carteira") =>
      `select transfer_demand('${d.id}',${v},'${to}','${reason}') as x`;
    await fails(csA, direct(d.version, csB), /transfer_forbidden/);
    await fails(leaderNo, direct(d.version, csB), /transfer_forbidden/);
    await fails(admin, direct(d.version, csB, "ok"), /transfer_reason_required/);
    await fails(admin, direct(d.version, csA), /transfer_same_owner/);
    await fails(admin, direct(d.version, tech), /transfer_target_invalid/);
    const [{ x }] = await as(admin, direct(d.version, csB));
    expect(x.request).toMatchObject({ kind: "direct", status: "aprovada", decided_by: admin });
    expect(await owner(d.id)).toBe(csB);
    await fails(admin, direct(d.version, leader), /conflict/);
    await as(leader, direct(await version(d.id), leader));
    expect(await owner(d.id)).toBe(leader);
    expect(
      await as(csA, `select kind from demand_transfer_requests where demand_id='${d.id}'`),
    ).toHaveLength(1);
  });
  it("funciona com a validação travada sem alterar etapa, conteúdo ou aprovação", async () => {
    const d = await demand(csA, "stage='Aguardando validação'");
    await db.exec(
      `insert into delivery_requests(demand_id,approval_state,change_summary) values('${d.id}','aguardando','Resumo enviado')`,
    );
    const [{ r }] = await as(csA, request(d.id, d.version, csB));
    await as(admin, `select decide_demand_transfer('${r.id}',true,${d.version},null)`);
    const after = await one(
      `select d.owner_id,d.stage,d.description,r.approval_state,r.change_summary from demands d join delivery_requests r on r.demand_id=d.id where d.id='${d.id}'`,
    );
    expect(after).toEqual({
      owner_id: csB,
      stage: "Aguardando validação",
      description: "Contexto salvo",
      approval_state: "aguardando",
      change_summary: "Resumo enviado",
    });
    await fails(csB, `update demands set description='Alterada' where id='${d.id}'`, /validation_locked/);
  });
  it("demanda encerrada não é transferida", async () => {
    const d = await one(
      `insert into demands(client_id,owner_id,title,classification,completed_at,solution,client_informed,stage) values('${client}','${csA}','Encerrada','Bug',now(),'Resolvido',true,'Concluída') returning id,version`,
    );
    await fails(admin, `select transfer_demand('${d.id}',${d.version},'${csB}','Motivo válido')`, /closed/);
    await fails(csA, request(d.id, d.version, csB), /closed/);
  });
});

describe("Liberar/assumir não burla o fluxo", () => {
  it("colaborador não libera a própria nem a alheia; gestor libera; assumir sem responsável continua", async () => {
    const d = await demand(csA);
    await fails(csA, `select claim_record('demands','${d.id}',${d.version},true)`, /transfer_required/);
    await fails(csB, `select claim_record('demands','${d.id}',${d.version},true)`, /transfer_required/);
    await fails(csB, `select claim_record('demands','${d.id}',${d.version},false)`, /already_assigned/);
    await fails(leaderNo, `select claim_record('demands','${d.id}',${d.version},true)`, /transfer_required/);
    await as(leader, `select claim_record('demands','${d.id}',${d.version},true)`);
    expect(await owner(d.id)).toBeNull();
    await as(csB, `select claim_record('demands','${d.id}',${await version(d.id)},false)`);
    expect(await owner(d.id)).toBe(csB);
  });
  it("pendência bloqueia liberação/assunção pelo administrador até a decisão", async () => {
    const d = await demand(csA);
    await as(csA, request(d.id, d.version, csB));
    await fails(admin, `select claim_record('demands','${d.id}',${d.version},true)`, /transfer_pending/);
    expect(await owner(d.id)).toBe(csA);
  });
  it("onboarding mantém a liberação pelo responsável", async () => {
    const o = await one(
      `insert into onboardings(client_id,owner_id,title) values('${client}','${csA}','Implantação') returning id,version`,
    );
    await as(csA, `select claim_record('onboardings','${o.id}',${o.version},true)`);
    expect((await one(`select owner_id from onboardings where id='${o.id}'`)).owner_id).toBeNull();
  });
  it("lista de destinos traz só CS ativos sem papel técnico", async () => {
    const [{ t }] = await as(csA, `select demand_transfer_targets() as t`);
    const names = t.map((p: any) => p.full_name);
    expect(names).toEqual(expect.arrayContaining(["CS A", "CS B", "Líder delegado"]));
    expect(names).not.toContain("CS inativo");
    expect(names).not.toContain("Técnico");
    expect(names).not.toContain("Pedro Manhães");
    await fails(tech, `select demand_transfer_targets()`, /forbidden/);
  });
});
