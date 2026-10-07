// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const admin = "2d31f8a5-afeb-4e12-9a64-a91432bdab61",
  cs = "041b0196-008a-4edc-ae60-cbb8aac105ca",
  other = "00000000-0000-4000-8000-000000000003",
  tech = "00000000-0000-4000-8000-000000000004",
  client = "00000000-0000-4000-8000-000000000011";
let db: PGlite;
async function user<T>(id: string, work: () => Promise<T>) {
  await db.exec(
    `begin;set local role authenticated;select set_config('request.jwt.claim.sub','${id}',true);`,
  );
  try {
    return await work();
  } finally {
    await db.exec("rollback");
  }
}
async function one(sql: string) {
  return (await db.query<any>(sql)).rows[0];
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;insert into auth.users values('${admin}','admin@example.test'),('${cs}','cs@example.test'),('${other}','other@example.test'),('${tech}','technical@example.test');grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`,
  );
  for (const file of ["drizzle/migrations/0000_ikaros_access_and_snapshot.sql"])
    await db.exec(await readFile(file, "utf8"));
  await db.exec(
    `alter type public.app_role add value 'cs';insert into user_roles(user_id,role) values('${admin}','admin'),('${cs}','admin');`,
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
  ])
    await db.exec(await readFile(`supabase/migrations/${file}.sql`, "utf8"));
  await db.exec(
    `insert into profiles(id,full_name,email) values('${other}','Other CS','other@example.test'),('${tech}','Tech member','technical@example.test');insert into user_roles(user_id,role) values('${other}','cs'),('${tech}','technical');insert into clients(id,name,owner_id) values('${client}','Shared company','${cs}');`,
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe("Shared CS, technical delivery and approvals", () => {
  it("shares company data, assigns work to its creator and prevents simultaneous claims", async () => {
    expect(await one(`select owner_id from clients where id='${client}'`)).toEqual({
      owner_id: null,
    });
    await user(other, async () =>
      expect((await db.query("select id from clients")).rows).toHaveLength(1),
    );
    const d = await one(
      `insert into demands(client_id,title,description) values('${client}','Unassigned','Context') returning id,version`,
    );
    await user(cs, async () => {
      await db.query(`select claim_record('demands','${d.id}',${d.version})`);
      await expect(
        db.query(`select claim_record('demands','${d.id}',${d.version})`),
      ).rejects.toThrow();
    });
    await user(other, async () =>
      expect(
        (await db.query(`update demands set title='Cannot edit' where id='${d.id}' returning id`))
          .rows,
      ).toHaveLength(0),
    );
    await user(cs, async () => {
      const r = await one(
        `insert into demands(client_id,title) values('${client}','Created by CS') returning owner_id`,
      );
      expect(r.owner_id).toBe(cs);
    });
  });
  it("technical account sees no portfolio or BI and only forwarded cases", async () => {
    const d = await one(
      `insert into demands(client_id,owner_id,title) values('${client}','${cs}','Private demand') returning id`,
    );
    await user(tech, async () => {
      expect((await db.query("select id from clients")).rows).toHaveLength(0);
      expect((await db.query("select id from demands")).rows).toHaveLength(0);
      expect(await one(`select is_internal('${tech}') as allowed`)).toEqual({ allowed: false });
      expect((await one("select technical_queue() as rows")).rows).toEqual([]);
      await expect(db.query(`select post_case_message('${d.id}','No access')`)).rejects.toThrow();
    });
  });
  it("routes, estimates, approves, publishes then requires client communication before closure", async () => {
    const d = await one(
      `insert into demands(client_id,owner_id,title,description) values('${client}','${cs}','Delivery workflow','Context') returning id,first_response_due,resolution_due`,
    );
    await db.exec("begin");
    try {
      await db.exec(
        `set local role authenticated;select set_config('request.jwt.claim.sub','${cs}',true)`,
      );
      let r = (
        await one(
          `select to_jsonb(delivery_action('${d.id}','forward',0,'{"context":"Erro reproduzido e impacto documentado","next_update_at":"2099-01-01T12:00:00Z"}')) as r`,
        )
      ).r;
      await db.exec(`select set_config('request.jwt.claim.sub','${tech}',true)`);
      expect((await one("select technical_queue() as rows")).rows).toHaveLength(1);
      await db.query(`select post_case_message('${d.id}','Recebido pelo time técnico')`);
      r = (
        await one(
          `select to_jsonb(delivery_action('${d.id}','technical_update',${r.version},'{"stage":"Pronta para validação","next_update_at":"2099-01-02T12:00:00Z","result":"Correção validada localmente","tests":"Regressão passou"}')) as r`,
        )
      ).r;
      await db.exec(`select set_config('request.jwt.claim.sub','${cs}',true)`);
      r = (
        await one(
          `select to_jsonb(delivery_action('${d.id}','request_approval',${r.version},'{"summary":"Corrigir comportamento específico","tests":"Cenários reais verificados","repository_url":"https://github.com/example/project/pull/42"}')) as r`,
        )
      ).r;
      await db.exec(`select set_config('request.jwt.claim.sub','${admin}',true)`);
      r = (
        await one(`select to_jsonb(delivery_action('${d.id}','approve',${r.version},'{}')) as r`)
      ).r;
      expect(
        (await one(`select completed_at from demands where id='${d.id}'`)).completed_at,
      ).toBeNull();
      r = (
        await one(
          `select to_jsonb(delivery_action('${d.id}','published',${r.version},'{"deployment_ref":"deployment-example-42","confirmed":true}')) as r`,
        )
      ).r;
      expect((await one(`select stage from demands where id='${d.id}'`)).stage).toBe("Publicada");
      await db.exec(`select set_config('request.jwt.claim.sub','${cs}',true)`);
      await db.query(
        `update demands set solution='Entrega validada',client_informed=true where id='${d.id}'`,
      );
      const version = (await one(`select version from demands where id='${d.id}'`)).version;
      await db.query(`select transition_demand('${d.id}','complete',${version})`);
      const after = await one(
        `select first_response_due,resolution_due,completed_at from demands where id='${d.id}'`,
      );
      expect(after.first_response_due).toEqual(d.first_response_due);
      expect(after.resolution_due).toEqual(d.resolution_due);
      expect(after.completed_at).not.toBeNull();
    } finally {
      await db.exec("rollback");
    }
  });
  it("refuses approval by CS and direct publication bypass", async () => {
    const d = await one(
      `insert into demands(client_id,owner_id,title) values('${client}','${cs}','Approval security') returning id,version`,
    );
    await user(cs, async () => {
      await expect(
        db.query(`select transition_demand('${d.id}','publish',${d.version})`),
      ).rejects.toThrow();
    });
    await user(cs, async () => {
      const r = (
        await one(
          `select to_jsonb(delivery_action('${d.id}','request_approval',0,'{"summary":"Mudança registrada","tests":"Teste validado","repository_url":"https://github.com/example/project/commit/abcdef1234"}')) as r`,
        )
      ).r;
      await expect(
        db.query(`select delivery_action('${d.id}','approve',${r.version},'{}')`),
      ).rejects.toThrow();
    });
  });
  it("private file registration verifies uploader, case and actual object metadata", async () => {
    const d = await one(
      `insert into demands(client_id,owner_id,title) values('${client}','${cs}','Evidence') returning id`,
    );
    const path = `${d.id}/file-id/evidence.png`;
    await db.exec(
      `insert into storage.objects(bucket_id,name,owner_id,metadata) values('case-evidence','${path}','${cs}','{"size":120,"mimetype":"image/png"}')`,
    );
    await user(cs, async () => {
      expect(
        (
          await one(
            `select to_jsonb(register_case_file('${d.id}','${path}','evidence.png','image/png',120)) as r`,
          )
        ).r.filename,
      ).toBe("evidence.png");
    });
    await user(tech, async () =>
      expect(
        (await db.query(`select name from storage.objects where name='${path}'`)).rows,
      ).toHaveLength(0),
    );
    await user(other, async () => {
      await expect(
        db.query(`select register_case_file('${d.id}','${path}','spoof.png','image/png',121)`),
      ).rejects.toThrow();
    });
  });
  it("commercial intake is service-only, idempotent and preserves unknown fields", async () => {
    const payload = `'source-company','sale-1','hash-1','erp-new-company','New real company','2026-10-06T12:00:00Z'`;
    const a = (await one(`select receive_ikaros_sale(${payload}) as r`)).r;
    const b = (await one(`select receive_ikaros_sale(${payload}) as r`)).r;
    expect(b.client_id).toBe(a.client_id);
    expect(b.duplicate).toBe(true);
    const c = await one(
      `select contact_email,contact_phone,product_id,owner_id from clients where id='${a.client_id}'`,
    );
    expect(c).toEqual({
      contact_email: null,
      contact_phone: null,
      product_id: null,
      owner_id: null,
    });
    await expect(
      db.query(
        `select receive_ikaros_sale('source-company','sale-1','other-hash','erp-new-company','New real company','2026-10-06T12:00:00Z')`,
      ),
    ).rejects.toThrow();
    await user(cs, async () => {
      await expect(db.query(`select receive_ikaros_sale(${payload})`)).rejects.toThrow();
    });
  });
});

describe("Coordination regressions", () => {
  it("releases an assigned demand through audited action and preserves onboarding progress", async () => {
    const d = await one(
      `insert into demands(client_id,owner_id,title) values('${client}','${cs}','Release case') returning id,version`,
    );
    await user(cs, async () => {
      await db.query(`select claim_record('demands','${d.id}',${d.version},true)`);
      expect((await one(`select owner_id from demands where id='${d.id}'`)).owner_id).toBeNull();
    });
    const o = await one(
      `insert into onboardings(client_id,owner_id,title,current_step) values('${client}','${cs}','Progress','10. Conclusão') returning progress`,
    );
    expect(Number(o.progress)).toBe(1);
  });
  it("does not allow deletion of already registered private evidence", async () => {
    const d = await one(
      `insert into demands(client_id,owner_id,title) values('${client}','${cs}','File retention') returning id`,
    );
    const path = `${d.id}/file-id/evidence.png`;
    await db.exec(
      `insert into storage.objects(bucket_id,name,owner_id,metadata) values('case-evidence','${path}','${cs}','{"size":120,"mimetype":"image/png"}')`,
    );
    await user(cs, async () => {
      await db.query(
        `select register_case_file('${d.id}','${path}','evidence.png','image/png',120)`,
      );
      expect(
        (await db.query(`delete from storage.objects where name='${path}' returning name`)).rows,
      ).toHaveLength(0);
    });
  });
});

describe("Forecast alerts", () => {
  it("requires a reason when changing an already promised delivery", async () => {
    const d = await one(
      `insert into demands(client_id,owner_id,title) values('${client}','${cs}','Reforecast') returning id`,
    );
    await db.exec(
      `insert into delivery_requests(demand_id,technical,technician_id,delivery_eta,next_update_at) values('${d.id}',true,'${tech}','2099-01-01T12:00:00Z','2099-01-01T10:00:00Z')`,
    );
    await user(tech, async () => {
      await expect(
        db.query(
          `select delivery_action('${d.id}','technical_update',1,'{"stage":"Em desenvolvimento","delivery_eta":"2099-01-02T12:00:00Z","next_update_at":"2099-01-01T10:00:00Z"}')`,
        ),
      ).rejects.toThrow();
    });
  });
  it("creates deduplicated risk notifications without altering contractual deadlines", async () => {
    const d = await one(
      `insert into demands(client_id,owner_id,title) values('${client}','${cs}','Near technical return') returning id,first_response_due`,
    );
    await db.exec(
      `insert into delivery_requests(demand_id,technical,next_update_at) values('${d.id}',true,now()+interval '10 minutes')`,
    );
    const first = await one(`select delivery_deadline_tick() as n`);
    expect(first.n).toBeGreaterThan(0);
    const before = await one(
      `select count(*)::int as n from notifications where entity_id='${d.id}'`,
    );
    await db.query("select delivery_deadline_tick()");
    expect(
      await one(`select count(*)::int as n from notifications where entity_id='${d.id}'`),
    ).toEqual(before);
    expect(
      (await one(`select first_response_due from demands where id='${d.id}'`)).first_response_due,
    ).toEqual(d.first_response_due);
  });
});

describe("Click / drag validation workflow", () => {
  it("moving to validation automatically sends saved context and locks the case without inventing tests", async () => {
    const d = await one(
      `insert into demands(client_id,owner_id,title,description) values('${client}','${cs}','Pedido real','Contexto documentado do cliente') returning id,version`,
    );
    await user(cs, async () => {
      await db.query(
        `select transition_demand('${d.id}','move',${d.version},'Aguardando validação')`,
      );
      const r = await one(
        `select approval_state,change_summary,tests_result,repository_url from delivery_requests where demand_id='${d.id}'`,
      );
      expect(r.approval_state).toBe("aguardando");
      expect(r.change_summary).toContain("Contexto documentado");
      expect(r.tests_result).toBeNull();
      expect(r.repository_url).toBeNull();
      const trace = (await one(`select demand_stage_trace('${d.id}') as rows`)).rows;
      expect(trace.map((v: any) => v.stage)).toContain("Aguardando validação");
      expect((await one(`select stage from demands where id='${d.id}'`)).stage).toBe(
        "Aguardando validação",
      );
    });
  });
  it("blocks CS changes, forwarding, completion and the original core RPC while Pedro is reviewing", async () => {
    const d = await one(
      `insert into demands(client_id,owner_id,title,description,stage) values('${client}','${cs}','Waiting','Saved context','Aguardando validação') returning id,version`,
    );
    await db.exec(
      `insert into delivery_requests(demand_id,approval_state) values('${d.id}','aguardando')`,
    );
    for (const sql of [
      `select transition_demand('${d.id}','move',${d.version},'Em execução')`,
      `update demands set description='Changed' where id='${d.id}'`,
      `select delivery_action('${d.id}','forward',1,'{"context":"Bypass attempt","next_update_at":"2099-01-01T12:00:00Z"}')`,
      `select transition_demand_core('${d.id}','move',${d.version},'Em execução')`,
      `select delivery_action_core('${d.id}','approve',1,'{}')`,
    ])
      await user(cs, async () => {
        await expect(db.query(sql)).rejects.toThrow();
      });
  });
  it("only administrator can validate and publish atomically with a real deployment confirmation", async () => {
    const d = await one(
      `insert into demands(client_id,owner_id,title,description,stage) values('${client}','${cs}','Validate publication','Saved context','Aguardando validação') returning id,first_response_due`,
    );
    await db.exec(
      `insert into delivery_requests(demand_id,approval_state) values('${d.id}','aguardando')`,
    );
    const valid = `select delivery_action('${d.id}','validate_publish',1,'{"confirmed":true,"deployment_ref":"deployment-confirmed-42"}')`;
    await user(cs, async () => {
      await expect(db.query(valid)).rejects.toThrow();
    });
    await user(admin, async () => {
      await expect(
        db.query(`select delivery_action('${d.id}','validate_publish',1,'{}')`),
      ).rejects.toThrow();
    });
    await user(admin, async () => {
      await db.query(valid);
      const after = await one(
        `select stage,completed_at,client_informed,first_response_due from demands where id='${d.id}'`,
      );
      expect(after.stage).toBe("Publicada");
      expect(after.completed_at).toBeNull();
      expect(after.client_informed).toBe(false);
      expect(after.first_response_due).toEqual(d.first_response_due);
    });
  });
  it("rejecting validation releases the case back to CS execution with an explicit reason", async () => {
    const d = await one(
      `insert into demands(client_id,owner_id,title,description,stage) values('${client}','${cs}','Review adjustments','Saved context','Aguardando validação') returning id`,
    );
    await db.exec(
      `insert into delivery_requests(demand_id,approval_state) values('${d.id}','aguardando')`,
    );
    await user(admin, async () => {
      await db.query(
        `select delivery_action('${d.id}','reject',1,'{"reason":"Ajustar comportamento e testar novamente"}')`,
      );
      expect((await one(`select stage from demands where id='${d.id}'`)).stage).toBe("Em execução");
      expect(
        (await one(`select approval_state from delivery_requests where demand_id='${d.id}'`))
          .approval_state,
      ).toBe("rejeitada");
    });
  });
});
