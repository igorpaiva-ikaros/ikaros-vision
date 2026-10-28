// @vitest-environment node
// Projetos: quem vê cada projeto e participantes. Identidades fictícias em banco em memória (PGlite).
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
  creator = "00000000-0000-4000-8000-0000000000b1",
  helper = "00000000-0000-4000-8000-0000000000b2",
  outsider = "00000000-0000-4000-8000-0000000000b3",
  inactive = "00000000-0000-4000-8000-0000000000b4",
  tech = "00000000-0000-4000-8000-0000000000b5";
let db: PGlite;

async function as<T = any>(id: string | null, sql: string): Promise<T[]> {
  await db.exec(
    id
      ? `begin;set local role authenticated;select set_config('request.jwt.claim.sub','${id}',true);`
      : "begin;set local role anon;",
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
const one = async (id: string | null, sql: string) => (await as(id, sql))[0];
const fails = (id: string | null, sql: string, pattern: RegExp) =>
  expect(as(id, sql)).rejects.toThrow(pattern);
const version = async (project: string) =>
  (await db.query<any>(`select version from team_projects where id='${project}'`)).rows[0]
    .version as number;
const create = (by: string, data: object) =>
  one(by, `select * from save_team_project(null,0,'${JSON.stringify(data)}'::jsonb)`);

beforeAll(async () => {
  db = new PGlite();
  const ids = [admin, seededCs, creator, helper, outsider, inactive, tech];
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;insert into auth.users values ${ids.map((id, i) => `('${id}','user${i}@example.test')`).join(",")};grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`,
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
  await db.exec(await readFile("supabase/migrations/20261027120000_team_projects.sql", "utf8"));
  await db.exec(
    await readFile("supabase/migrations/20261028140000_team_projects_technical.sql", "utf8"),
  );
  await db.exec(
    await readFile("supabase/migrations/20261028180000_team_project_visibility.sql", "utf8"),
  );
  await db.exec(
    `insert into profiles(id,full_name,email,active) values
      ('${creator}','Criadora','c@example.test',true),('${helper}','Apoio','h@example.test',true),
      ('${outsider}','Outra CS','o@example.test',true),('${inactive}','CS inativa','i@example.test',false),
      ('${tech}','Técnico','t@example.test',true);
     insert into user_roles(user_id,role) values('${creator}','cs'),('${helper}','cs'),('${outsider}','cs'),('${inactive}','cs'),('${tech}','technical');`,
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});

const sees = async (who: string, project: string) =>
  (await one(who, `select count(*)::int n from team_projects where id='${project}'`)).n as number;

describe("Projetos — quem vê", () => {
  it("projeto existente e novo sem escolha ficam visíveis para toda a equipe", async () => {
    const p = await create(creator, { title: "Aberto ao time", owner_id: creator });
    expect(p.visibility).toBe("team");
    for (const who of [admin, helper, outsider, tech]) expect(await sees(who, p.id)).toBe(1);
    expect(await sees(inactive, p.id)).toBe(0);
  });

  it("só participantes: criador, responsável, etapa, adicionados e administradores veem; os demais não", async () => {
    const p = await create(creator, {
      title: "Pauta restrita",
      owner_id: creator,
      visibility: "participants",
      participants: [tech],
      steps: [{ title: "Revisão", assignee_id: helper }],
    });
    expect(p.visibility).toBe("participants");
    for (const who of [creator, tech, helper, admin]) expect(await sees(who, p.id)).toBe(1);
    expect(await sees(outsider, p.id)).toBe(0);
    for (const t of ["team_project_steps", "team_project_activity", "team_project_participants"])
      expect(
        await one(outsider, `select count(*)::int n from ${t} where project_id='${p.id}'`),
      ).toEqual({ n: 0 });
    await fails(outsider, `select * from post_team_project_message('${p.id}','Olá')`, /forbidden/);
    expect(await as(tech, `select title from notifications where entity_id='${p.id}'`)).toEqual([
      { title: `Novo projeto com você · ${p.code} · Pauta restrita` },
    ]);
    expect(
      await one(
        creator,
        `select string_agg(body,' | ' order by created_at) b from team_project_activity where project_id='${p.id}'`,
      ),
    ).toEqual({
      b: "Projeto criado · visível só para participantes | 1 etapa definida | Participantes: Técnico",
    });
  });

  it("quem gerencia troca participantes e visibilidade; quem sai perde acesso e avisos", async () => {
    const p = await create(creator, {
      title: "Troca de participantes",
      owner_id: creator,
      visibility: "participants",
      participants: [tech],
    });
    await fails(
      tech,
      `select * from save_team_project('${p.id}',${await version(p.id)},'{"participants":[]}')`,
      /forbidden/,
    );
    await as(
      creator,
      `select * from save_team_project('${p.id}',${await version(p.id)},'{"participants":["${outsider}"]}')`,
    );
    expect(await sees(tech, p.id)).toBe(0);
    expect(await sees(outsider, p.id)).toBe(1);
    expect(
      await one(tech, `select count(*)::int n from notifications where entity_id='${p.id}'`),
    ).toEqual({ n: 0 });
    expect(await as(outsider, `select title from notifications where entity_id='${p.id}'`)).toEqual(
      [{ title: `Você foi incluído no projeto · ${p.code} · Troca de participantes` }],
    );
    await as(
      creator,
      `select * from save_team_project('${p.id}',${await version(p.id)},'{"visibility":"team"}')`,
    );
    expect(await sees(tech, p.id)).toBe(1);
    expect(
      await as(
        creator,
        `select body from team_project_activity where project_id='${p.id}' and kind='edit' order by created_at`,
      ),
    ).toEqual([
      { body: "Participantes: Técnico" },
      { body: "Participantes: Outra CS" },
      { body: "Quem vê: toda a equipe" },
    ]);
  });

  it("recusa visibilidade inválida, participante inválido ou inativo", async () => {
    await fails(
      creator,
      `select * from save_team_project(null,0,'{"title":"Inválida","visibility":"all"}')`,
      /invalid_project_data/,
    );
    await fails(
      creator,
      `select * from save_team_project(null,0,'{"title":"Inválida","participants":["abc"]}')`,
      /invalid_project_data/,
    );
    await fails(
      creator,
      `select * from save_team_project(null,0,'{"title":"Inválida","participants":"${tech}"}')`,
      /invalid_project_data/,
    );
    await fails(
      creator,
      `select * from save_team_project(null,0,'{"title":"Inválida","participants":["${inactive}"]}')`,
      /project_member_required/,
    );
    expect(
      await one(creator, `select count(*)::int n from team_projects where title='Inválida'`),
    ).toEqual({ n: 0 });
  });

  it("anexos de projeto restrito: só quem vê envia e lê", async () => {
    const p = await create(creator, {
      title: "Anexo restrito",
      owner_id: creator,
      visibility: "participants",
      participants: [tech],
    });
    const path = `${p.id}/r1/nota.txt`;
    await fails(
      outsider,
      `insert into storage.objects(bucket_id,name,owner_id,metadata) values('team-projects','${path}','${outsider}','{"size":5,"mimetype":"text/plain"}')`,
      /row-level security/,
    );
    await as(
      tech,
      `insert into storage.objects(bucket_id,name,owner_id,metadata) values('team-projects','${path}','${tech}','{"size":5,"mimetype":"text/plain"}')`,
    );
    expect(
      await one(
        tech,
        `select filename from register_team_project_file('${p.id}','${path}','nota.txt','text/plain',5)`,
      ),
    ).toEqual({ filename: "nota.txt" });
    expect(
      await one(outsider, `select count(*)::int n from storage.objects where name='${path}'`),
    ).toEqual({ n: 0 });
    expect(
      await one(admin, `select count(*)::int n from storage.objects where name='${path}'`),
    ).toEqual({ n: 1 });
  });
});
