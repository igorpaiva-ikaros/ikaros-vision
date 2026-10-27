// @vitest-environment node
// Projetos da equipe: identidades fictícias em banco em memória (PGlite), sem tocar o banco real.
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

describe("Projetos da equipe — acesso", () => {
  it("só administrador e CS ativos leem e criam; técnico, inativo e anônimo ficam de fora", async () => {
    const p = await create(creator, { title: "Acesso ao quadro", owner_id: creator });
    expect(p.code).toMatch(/^PRJ-\d{5}$/);
    expect(
      await one(outsider, `select count(*)::int n from team_projects where id='${p.id}'`),
    ).toEqual({ n: 1 });
    expect(await one(tech, `select count(*)::int n from team_projects`)).toEqual({ n: 0 });
    expect(await one(inactive, `select count(*)::int n from team_projects`)).toEqual({ n: 0 });
    await fails(null, `select count(*) from team_projects`, /permission denied/);
    await fails(
      tech,
      `select * from save_team_project(null,0,'{"title":"Técnico cria"}')`,
      /forbidden/,
    );
    await fails(
      inactive,
      `select * from save_team_project(null,0,'{"title":"Inativa cria"}')`,
      /forbidden/,
    );
    expect(await one(tech, `select team_project_members() m`)).toEqual({ m: [] });
    const members = (await one(outsider, `select team_project_members() m`)).m as { id: string }[];
    expect(members.map((m) => m.id)).toEqual(
      expect.arrayContaining([creator, helper, outsider, admin]),
    );
    expect(members.map((m) => m.id)).not.toContain(tech);
    expect(members.map((m) => m.id)).not.toContain(inactive);
  });
  it("não aceita gravação direta nas tabelas", async () => {
    await fails(
      creator,
      `insert into team_projects(title,owner_id,created_by) values('Direto','${creator}','${creator}')`,
      /permission denied/,
    );
    await fails(creator, `update team_projects set title='Alterado'`, /permission denied/);
    await fails(
      creator,
      `insert into team_project_activity(project_id,kind,actor_id,actor_name) select id,'message','${creator}','x' from team_projects limit 1`,
      /permission denied/,
    );
  });
  it("responsável precisa ser pessoa ativa da equipe", async () => {
    await fails(
      creator,
      `select * from save_team_project(null,0,'{"title":"Dono técnico","owner_id":"${tech}"}')`,
      /project_member_required/,
    );
    await fails(
      creator,
      `select * from save_team_project(null,0,'{"title":"Etapa inativa","owner_id":"${creator}","steps":[{"title":"Etapa","assignee_id":"${inactive}"}]}')`,
      /project_member_required/,
    );
    await fails(
      creator,
      `select * from save_team_project(null,0,'{"title":"ab","owner_id":"${creator}"}')`,
      /título do projeto/,
    );
  });
});

describe("Projetos da equipe — etapas, situação e linha do tempo", () => {
  it("criação registra etapas em ordem, linha do tempo e avisa quem recebeu etapa", async () => {
    const p = await create(creator, {
      title: "Central de projetos",
      context: "Contexto",
      owner_id: creator,
      due_date: "2026-11-10",
      steps: [
        { title: "Desenho", assignee_id: helper, due_date: "2026-11-01" },
        { title: "Implementação" },
      ],
    });
    expect(
      await as(
        creator,
        `select position,title from team_project_steps where project_id='${p.id}' order by position`,
      ),
    ).toEqual([
      { position: 1, title: "Desenho" },
      { position: 2, title: "Implementação" },
    ]);
    expect(
      await as(
        creator,
        `select kind,actor_name,body from team_project_activity where project_id='${p.id}' order by created_at`,
      ),
    ).toEqual([
      { kind: "created", actor_name: "Criadora", body: "Projeto criado" },
      { kind: "step", actor_name: "Criadora", body: "2 etapas definidas" },
    ]);
    expect(
      await as(helper, `select title,link from notifications where entity_id='${p.id}'`),
    ).toEqual([
      {
        title: "Novo projeto com você · " + p.code + " · Central de projetos",
        link: `/projetos?id=${p.id}`,
      },
    ]);
    expect(
      await as(creator, `select count(*)::int n from notifications where entity_id='${p.id}'`),
    ).toEqual([{ n: 0 }]);
  });

  it("quem não gerencia não edita dados; responsável pela etapa conclui e move entre situações abertas", async () => {
    const p = await create(creator, {
      title: "Permissões de etapa",
      owner_id: creator,
      steps: [
        { title: "Minha etapa", assignee_id: helper },
        { title: "Sem responsável" },
        { title: "De outra", assignee_id: creator },
      ],
    });
    const step = async (title: string) =>
      (
        await db.query<any>(
          `select id from team_project_steps where project_id='${p.id}' and title='${title}'`,
        )
      ).rows[0].id;
    await fails(
      helper,
      `select * from save_team_project('${p.id}',${await version(p.id)},'{"title":"Outro nome"}')`,
      /forbidden/,
    );
    await fails(
      helper,
      `select * from save_team_project_step('${p.id}',${await version(p.id)},null,'{"title":"Nova"}')`,
      /forbidden/,
    );
    await fails(
      helper,
      `select * from set_team_project_step_done('${p.id}',${await version(p.id)},'${await step("De outra")}',true)`,
      /forbidden/,
    );
    await as(
      helper,
      `select * from set_team_project_step_done('${p.id}',${await version(p.id)},'${await step("Minha etapa")}',true)`,
    );
    await as(
      outsider,
      `select * from set_team_project_step_done('${p.id}',${await version(p.id)},'${await step("Sem responsável")}',true)`,
    );
    await fails(
      outsider,
      `select * from move_team_project('${p.id}',${await version(p.id)},'em_andamento')`,
      /forbidden/,
    );
    expect(
      await one(
        helper,
        `select status from move_team_project('${p.id}',${await version(p.id)},'em_andamento')`,
      ),
    ).toEqual({ status: "em_andamento" });
    await fails(
      helper,
      `select * from move_team_project('${p.id}',${await version(p.id)},'cancelado','Sem verba')`,
      /forbidden/,
    );
    expect(
      await as(
        creator,
        `select title from notifications where entity_id='${p.id}' order by created_at`,
      ),
    ).toEqual([
      { title: `Etapa concluída · ${p.code} · Permissões de etapa` },
      { title: `Etapa concluída · ${p.code} · Permissões de etapa` },
      { title: `Situação: Em andamento · ${p.code} · Permissões de etapa` },
    ]);
  });

  it("controla versão, exige etapas concluídas para concluir e motivo para cancelar", async () => {
    const p = await create(creator, {
      title: "Ciclo completo",
      owner_id: creator,
      steps: [{ title: "Única" }],
    });
    await fails(
      creator,
      `select * from save_team_project('${p.id}',${(await version(p.id)) - 1 || 99},'{"due_date":"2026-12-01"}')`,
      /conflict/,
    );
    await fails(
      creator,
      `select * from move_team_project('${p.id}',${await version(p.id)},'concluido')`,
      /conclua ou remova as etapas pendentes/,
    );
    await fails(
      creator,
      `select * from move_team_project('${p.id}',${await version(p.id)},'cancelado','')`,
      /motivo do cancelamento/,
    );
    const s = (await db.query<any>(`select id from team_project_steps where project_id='${p.id}'`))
      .rows[0].id;
    await as(
      creator,
      `select * from set_team_project_step_done('${p.id}',${await version(p.id)},'${s}',true)`,
    );
    const done = await one(
      creator,
      `select status,completed_at is not null fechado from move_team_project('${p.id}',${await version(p.id)},'concluido')`,
    );
    expect(done).toEqual({ status: "concluido", fechado: true });
    await fails(
      creator,
      `select * from save_team_project('${p.id}',${await version(p.id)},'{"title":"Depois de concluir"}')`,
      /project_closed/,
    );
    await fails(
      creator,
      `select * from set_team_project_step_done('${p.id}',${await version(p.id)},'${s}',false)`,
      /project_closed/,
    );
    expect(
      await one(
        outsider,
        `select kind,body from post_team_project_message('${p.id}','  Registro após a entrega  ')`,
      ),
    ).toEqual({ kind: "message", body: "Registro após a entrega" });
    expect(
      await one(
        admin,
        `select status,completed_at from move_team_project('${p.id}',${await version(p.id)},'em_revisao')`,
      ),
    ).toEqual({ status: "em_revisao", completed_at: null });
  });

  it("gerente altera prazo e responsável, reordena e remove etapas com registro na linha do tempo", async () => {
    const p = await create(creator, {
      title: "Gestão de etapas",
      owner_id: creator,
      due_date: "2026-11-10",
      steps: [{ title: "Etapa A" }, { title: "Etapa B" }],
    });
    await as(
      creator,
      `select * from save_team_project('${p.id}',${await version(p.id)},'{"due_date":"2026-11-20","owner_id":"${helper}"}')`,
    );
    await as(
      helper,
      `select * from save_team_project_step('${p.id}',${await version(p.id)},null,'{"title":"Etapa C","assignee_id":"${admin}"}')`,
    );
    const ids = (
      await db.query<any>(
        `select id from team_project_steps where project_id='${p.id}' order by position desc`,
      )
    ).rows.map((r) => r.id);
    await as(
      helper,
      `select * from reorder_team_project_steps('${p.id}',${await version(p.id)},array['${ids.join("','")}']::uuid[])`,
    );
    await fails(
      helper,
      `select * from reorder_team_project_steps('${p.id}',${await version(p.id)},array['${ids[0]}']::uuid[])`,
      /invalid_project_data/,
    );
    await as(
      helper,
      `select * from remove_team_project_step('${p.id}',${await version(p.id)},'${ids[1]}')`,
    );
    expect(
      await as(
        helper,
        `select position,title from team_project_steps where project_id='${p.id}' order by position`,
      ),
    ).toEqual([
      { position: 1, title: "Etapa C" },
      { position: 2, title: "Etapa A" },
    ]);
    expect(
      (
        await as(
          helper,
          `select body from team_project_activity where project_id='${p.id}' and kind<>'created' order by created_at`,
        )
      ).map((r: any) => r.body),
    ).toEqual([
      "2 etapas definidas",
      "Prazo de entrega: 10/11/2026 → 20/11/2026",
      "Responsável: Apoio",
      "Etapa adicionada: Etapa C",
      "Ordem das etapas atualizada",
      "Etapa removida: Etapa B",
    ]);
    expect(
      await as(
        admin,
        `select title from notifications where entity_id='${p.id}' and recipient_id='${admin}'`,
      ),
    ).toEqual([{ title: `Nova etapa com você · ${p.code} · Gestão de etapas` }]);
  });

  it("anexo só é registrado quando o arquivo enviado pela própria pessoa confere", async () => {
    const p = await create(creator, { title: "Anexos privados", owner_id: creator });
    const path = `${p.id}/f1/print.png`;
    await db.exec(
      `insert into storage.objects(bucket_id,name,owner_id,metadata) values('team-projects','${path}','${helper}','{"size":1234,"mimetype":"image/png"}')`,
    );
    await fails(
      creator,
      `select * from register_team_project_file('${p.id}','${path}','print.png','image/png',1234)`,
      /invalid_file/,
    );
    await fails(
      helper,
      `select * from register_team_project_file('${p.id}','${path}','print.png','image/png',99)`,
      /invalid_file/,
    );
    await fails(
      helper,
      `select * from register_team_project_file('${p.id}','00000000-0000-4000-8000-000000000000/f1/print.png','print.png','image/png',1234)`,
      /forbidden/,
    );
    const file = await one(
      helper,
      `select filename,mime_type from register_team_project_file('${p.id}','${path}','print.png','image/png',1234,'Tela de exemplo')`,
    );
    expect(file).toEqual({ filename: "print.png", mime_type: "image/png" });
    expect(
      await one(
        creator,
        `select kind,body,file_id is not null anexo from team_project_activity where project_id='${p.id}' and kind='file'`,
      ),
    ).toEqual({ kind: "file", body: "Tela de exemplo", anexo: true });
    expect(await one(tech, `select count(*)::int n from team_project_files`)).toEqual({ n: 0 });
    expect(await as(creator, `select title from notifications where entity_id='${p.id}'`)).toEqual([
      { title: `Novo anexo · ${p.code} · Anexos privados` },
    ]);
  });
});
