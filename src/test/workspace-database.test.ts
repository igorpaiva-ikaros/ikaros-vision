// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const admin = "2d31f8a5-afeb-4e12-9a64-a91432bdab61";
const cs = "041b0196-008a-4edc-ae60-cbb8aac105ca";
const other = "00000000-0000-4000-8000-000000000003";
const ownClient = "00000000-0000-4000-8000-000000000011";
const otherClient = "00000000-0000-4000-8000-000000000012";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 insert into auth.users values('${admin}','admin@example.test'),('${cs}','cs@example.test'),('${other}','other@example.test');
 grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;`);
  await db.exec(await readFile("drizzle/migrations/0000_ikaros_access_and_snapshot.sql", "utf8"));
  await db.exec(
    `alter type public.app_role add value 'cs'; insert into public.user_roles(user_id,role) values('${admin}','admin'),('${cs}','admin');`,
  );
  await db.exec(await readFile("supabase/migrations/20261005214500_native_operation.sql", "utf8"));
  await db.exec(
    await readFile("supabase/migrations/20261006113000_operation_productivity.sql", "utf8"),
  );
  await db.exec(await readFile("supabase/migrations/20261006120000_crm_catalog_sla.sql", "utf8"));
  await db.exec(`insert into profiles(id,full_name,email) values('${other}','Other CS','other@example.test');insert into user_roles(user_id,role) values('${other}','cs');
 insert into clients(id,name,owner_id) values('${ownClient}','Own client','${cs}'),('${otherClient}','Other client','${other}');`);
}, 30_000);
afterAll(async () => {
  await db?.close();
});
async function asUser<T>(id: string, work: () => Promise<T>) {
  await db.exec(
    `begin;set local role authenticated;select set_config('request.jwt.claim.sub','${id}',true);`,
  );
  try {
    return await work();
  } finally {
    await db.exec("rollback;");
  }
}
async function scalar(sql: string) {
  return (await db.query<any>(sql)).rows[0];
}
describe("Native PostgreSQL access and workflow", () => {
  it("scopes clients and all record kinds to current owner, hides orphans", async () => {
    await db.exec(
      `insert into demands(client_id,owner_id,title,notion_id) values('${ownClient}','${cs}','Own demand',null),('${otherClient}','${other}','Foreign demand',null),(null,'${cs}','Unlinked','orphan-source');`,
    );
    await asUser(cs, async () => {
      expect((await db.query("select name from clients")).rows).toEqual([{ name: "Own client" }]);
      expect((await db.query("select title from demands")).rows).toEqual([{ title: "Own demand" }]);
      expect((await db.query("select id from profiles")).rows).toHaveLength(1);
    });
  });
  it("refuses writes to a foreign client and direct event/role/owner changes", async () => {
    await expect(
      asUser(cs, () =>
        db.exec(`insert into demands(client_id,title) values('${otherClient}','Forbidden');`),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(cs, () =>
        db.exec(`update demands set first_response_at=now() where title='Own demand';`),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(cs, () => db.exec(`update clients set owner_id='${other}' where id='${ownClient}';`)),
    ).rejects.toThrow();
    await expect(
      asUser(cs, () => db.exec(`insert into user_roles(user_id,role) values('${cs}','admin');`)),
    ).rejects.toThrow();
  });
  it("creates codes, inherits owner and records idempotent first response with version conflict", async () => {
    await asUser(cs, async () => {
      let d = await scalar(
        `insert into demands(client_id,title,description) values('${ownClient}','Native creation','Question') returning *`,
      );
      expect(d.owner_id).toBe(cs);
      expect(d.code).toMatch(/^DEM-\d{5}$/);
      expect(d.received_at).toBeTruthy();
      const first = await scalar(
        `select * from transition_demand('${d.id}','first_response',${d.version})`,
      );
      expect(first.first_response_at).toBeTruthy();
      expect(first.stage).toBe("Em triagem");
      const second = await scalar(
        `select * from transition_demand('${d.id}','first_response',${first.version})`,
      );
      expect(second.first_response_at).toEqual(first.first_response_at);
      // A stale browser must not overwrite the fresh record.
      await expect(
        db.exec(`select transition_demand('${d.id}','complete',${d.version});`),
      ).rejects.toThrow(/conflict/);
    });
  });
  it("requires solution and client informed before completion", async () => {
    await expect(
      asUser(cs, async () => {
        const d = await scalar(
          `insert into demands(client_id,title) values('${ownClient}','Incomplete') returning *`,
        );
        await db.exec(`select transition_demand('${d.id}','complete',${d.version});`);
      }),
    ).rejects.toThrow(/incomplete/);
    await asUser(cs, async () => {
      const d = await scalar(
        `insert into demands(client_id,title,solution,client_informed) values('${ownClient}','Finished','Resolved',true) returning *`,
      );
      const closed = await scalar(
        `select * from transition_demand('${d.id}','complete',${d.version})`,
      );
      expect(closed.stage).toBe("Concluída");
      expect(closed.completed_at).toBeTruthy();
    });
  });
  it("blocks disabled access and removing the final administrator", async () => {
    await db.exec(
      `begin;update profiles set active=false where id='${cs}';set local role authenticated;select set_config('request.jwt.claim.sub','${cs}',true);`,
    );
    try {
      expect((await db.query("select id from clients")).rows).toHaveLength(0);
      expect((await scalar(`select is_operator('${cs}') as allowed`)).allowed).toBe(false);
    } finally {
      await db.exec("rollback;");
    }
    await expect(
      db.exec(`begin;update profiles set active=false where id='${admin}';commit;`),
    ).rejects.toThrow(/last_admin/);
    await db.exec("rollback;");
  });
  it("onboarding only starts contractual deadlines after complete information", async () => {
    await asUser(cs, async () => {
      const o = await scalar(
        `insert into onboardings(client_id,title) values('${ownClient}','Onboarding') returning *`,
      );
      expect(o.limit15_due).toBeNull();
      const started = await scalar(
        `select * from transition_onboarding('${o.id}','info_complete',${o.version})`,
      );
      expect(started.milestone5_due).toBeTruthy();
      expect(started.limit15_due).toBeTruthy();
    });
  });
  it("upgrade requires acceptance, calculates full monthly commission and preserves attribution on transfer", async () => {
    await db.exec("begin;");
    try {
      await db.exec(
        `set local role authenticated;select set_config('request.jwt.claim.sub','${cs}',true);`,
      );
      const u = await scalar(
        `insert into upgrades(client_id,title,new_plan,new_value,current_value) values('${ownClient}','Upgrade','Sun',2197,1197) returning *`,
      );
      const accepted = await scalar(
        `select * from transition_upgrade('${u.id}','accept',${u.version})`,
      );
      const effective = await scalar(
        `select * from transition_upgrade('${u.id}','effective',${accepted.version})`,
      );
      expect(effective.commission_owner_id).toBe(cs);
      expect(
        (await scalar(`select commission_due::float from upgrade_commission where id='${u.id}'`))
          .commission_due,
      ).toBe(2197);
      await db.exec(
        `select set_config('request.jwt.claim.sub','${admin}',true);select assign_client('${ownClient}','${other}',(select version from clients where id='${ownClient}'));`,
      );
      const transferred = await scalar(`select * from upgrades where id='${u.id}'`);
      expect(transferred.owner_id).toBe(other);
      expect(transferred.commission_owner_id).toBe(cs);
    } finally {
      await db.exec("rollback;");
    }
  });
  it("notifies owner and administrator once per obligation, excludes tests, preserves Kanban", async () => {
    await db.exec("begin;");
    try {
      await db.exec(`insert into demands(client_id,owner_id,title,received_at,stage) values('${ownClient}','${cs}','Old pending','2020-01-02T09:00:00-03:00','Aguardando cliente');
   insert into demands(client_id,owner_id,title,received_at,is_test) values('${ownClient}','${cs}','Old test','2020-01-02T09:00:00-03:00',true);select sla_tick();`);
      const count = (await scalar("select count(*)::int as n from notifications")).n;
      expect(count).toBe(4);
      await db.exec("select sla_tick();");
      expect((await scalar("select count(*)::int as n from notifications")).n).toBe(count);
      expect((await scalar("select stage from demands where title='Old pending'")).stage).toBe(
        "Aguardando cliente",
      );
    } finally {
      await db.exec("rollback;");
    }
  });
  it("imports once, preserves native edits, queues missing client and rejects CS importing", async () => {
    const bundle = {
      clients: [
        {
          id: "00000000-0000-4000-8000-000000000021",
          notion_id: "source-client",
          name: "Imported",
          owner_id: cs,
          is_test: true,
        },
      ],
      demands: [
        {
          id: "00000000-0000-4000-8000-000000000022",
          notion_id: "source-demand",
          title: "Missing client",
          owner_id: cs,
        },
      ],
      onboardings: [],
      upgrades: [],
      interactions: [],
      changelog: [],
    };
    const sql = `select import_notion_bundle('${JSON.stringify(bundle)}'::jsonb,'${admin}') as result`;
    await expect(asUser(cs, () => db.exec(sql))).rejects.toThrow();
    await db.exec("begin;");
    try {
      await db.exec(sql);
      await db.exec("update clients set name='Edited natively' where notion_id='source-client'");
      await db.exec(sql);
      expect((await scalar("select name from clients where notion_id='source-client'")).name).toBe(
        "Edited natively",
      );
      expect(
        (await scalar("select count(*)::int as n from demands where notion_id='source-demand'")).n,
      ).toBe(1);
      expect((await scalar("select count(*)::int as n from import_issues")).n).toBeGreaterThan(0);
    } finally {
      await db.exec("rollback;");
    }
  });
});
describe("Contractual useful time", () => {
  it("crosses the weekend and national holiday without dropping seconds", async () => {
    const r = await scalar(
      `select sla_add_business_minutes('2026-10-09T17:00:30-03:00',240) as response,sla_next_business_day('2026-10-09T17:00:30-03:00') as forward`,
    );
    expect(new Date(r.response).toISOString()).toBe("2026-10-13T15:00:30.000Z");
    expect(new Date(r.forward).toISOString()).toBe("2026-10-13T20:00:30.000Z");
  });
  it("normalizes closed hours and counts 15 onboarding days", async () => {
    const r = await scalar(
      `select sla_add_business_minutes('2026-10-09T19:00:00-03:00',240) as response,sla_onboarding_due('2026-10-01T09:00:00-03:00',15) as onboarding`,
    );
    expect(new Date(r.response).toISOString()).toBe("2026-10-13T16:00:00.000Z");
    expect(new Date(r.onboarding).toISOString()).toBe("2026-10-23T21:00:00.000Z");
  });
});

describe("Scheduled tasks and member profiles", () => {
  const task = "00000000-0000-4000-8000-000000000090";
  it("schedules, inherits the current portfolio and refuses foreign or mismatched records", async () => {
    await asUser(cs, async () => {
      const row = await scalar(
        `select * from save_scheduled_task('${task}','${ownClient}','Client follow up','Retorno',now()+interval '1 day','','demands',(select id from demands where title='Own demand'))`,
      );
      expect(row.status).toBe("pending");
      expect(row.version).toBe(1);
      expect((await db.query(`select * from scheduled_tasks`)).rows).toHaveLength(1);
    });
    await expect(
      asUser(cs, () =>
        db.exec(
          `select save_scheduled_task('${task}','${otherClient}','Foreign','Retorno',now()+interval '1 day','')`,
        ),
      ),
    ).rejects.toThrow(/not_found/);
    await expect(
      asUser(cs, () =>
        db.exec(
          `select save_scheduled_task('${task}','${ownClient}','Mismatch','Retorno',now()+interval '1 day','','demands',(select id from demands where title='Foreign demand'))`,
        ),
      ),
    ).rejects.toThrow(/invalid_record/);
  });
  it("reminds once, survives browser closure, follows portfolio transfers and respects completion", async () => {
    await db.exec("begin;");
    try {
      await db.exec(
        `insert into scheduled_tasks(id,client_id,title,task_type,due_at,created_by) values('${task}','${ownClient}','Due task','Ligação',now()-interval '1 minute','${cs}');select task_reminder_tick();select task_reminder_tick();`,
      );
      expect(
        (await scalar(`select count(*)::int as n from notifications where entity_type='task'`)).n,
      ).toBe(1);
      await db.exec(
        `set local role authenticated;select set_config('request.jwt.claim.sub','${cs}',true);`,
      );
      expect(
        (await db.query(`select title from notifications where entity_type='task'`)).rows,
      ).toHaveLength(1);
      await db.exec(
        `select set_config('request.jwt.claim.sub','${admin}',true);select assign_client('${ownClient}','${other}',(select version from clients where id='${ownClient}'));select set_config('request.jwt.claim.sub','${cs}',true);`,
      );
      expect((await db.query("select * from scheduled_tasks")).rows).toHaveLength(0);
      expect(
        (await db.query(`select * from notifications where entity_type='task'`)).rows,
      ).toHaveLength(0);
      await db.exec(`reset role;select task_reminder_tick();`);
      expect(
        (
          await scalar(
            `select count(*)::int as n from notifications where entity_type='task' and recipient_id='${other}'`,
          )
        ).n,
      ).toBe(1);
      await db.exec(
        `set local role authenticated;select set_config('request.jwt.claim.sub','${other}',true);`,
      );
      const completed = await scalar(
        `select * from save_scheduled_task('${task}','${ownClient}','Due task','Ligação',now()-interval '1 minute','',null,null,1,'completed')`,
      );
      expect(completed.status).toBe("completed");
      expect(completed.completed_at).toBeTruthy();
      await db.exec(`reset role;select task_reminder_tick();`);
      expect(
        (await scalar(`select count(*)::int as n from notifications where entity_type='task'`)).n,
      ).toBe(2);
    } finally {
      await db.exec("rollback;");
    }
  });
  it("rejects stale task writes, past schedules and direct unprivileged inserts", async () => {
    await expect(
      asUser(cs, () =>
        db.exec(
          `select save_scheduled_task('${task}','${ownClient}','Past','Retorno',now()-interval '1 minute','')`,
        ),
      ),
    ).rejects.toThrow(/incomplete/);
    await expect(
      asUser(cs, () =>
        db.exec(
          `insert into scheduled_tasks(id,client_id,title,task_type,due_at,created_by) values('${task}','${ownClient}','Direct','Retorno',now(),'${cs}')`,
        ),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(cs, async () => {
        await db.exec(
          `select save_scheduled_task('${task}','${ownClient}','Initial','Retorno',now()+interval '1 day','')`,
        );
        await db.exec(
          `select save_scheduled_task('${task}','${ownClient}','Stale','Retorno',now()+interval '1 day','',null,null,2,'pending')`,
        );
      }),
    ).rejects.toThrow(/conflict/);
  });
  it("allows only administrators to edit profiles and rejects unsafe photo formats", async () => {
    await expect(
      asUser(cs, () =>
        db.exec(`select admin_edit_member_profile('${other}','Hacked',null,'admin',true,true)`),
      ),
    ).rejects.toThrow(/forbidden/);
    await asUser(admin, async () => {
      await db.exec(
        `select admin_edit_member_profile('${other}','Updated CS','data:image/jpeg;base64,YQ==','cs',true,false)`,
      );
      expect(
        (await scalar(`select full_name,avatar_url from profiles where id='${other}'`)).full_name,
      ).toBe("Updated CS");
    });
    await expect(
      asUser(admin, () =>
        db.exec(
          `select admin_edit_member_profile('${other}','Unsafe','data:image/svg+xml;base64,YQ==','cs',true,false)`,
        ),
      ),
    ).rejects.toThrow();
  });
});

describe("Catalogue and configurable SLA", () => {
  it("preserves the legacy 4 useful hours and next useful day defaults", async () => {
    const value = await scalar(
      `select policy_due('2026-10-09 16:00-03','Bug','response')=sla_add_business_minutes('2026-10-09 16:00-03',240) as response,policy_due('2026-10-09 16:00-03','Bug','resolution')=sla_next_business_day('2026-10-09 16:00-03') as resolution,policy_due(now(),'Bug','delivery') is null as no_auto_delivery`,
    );
    expect(value).toEqual({ response: true, resolution: true, no_auto_delivery: true });
  });
  it("supports useful and elapsed minutes, hours, days including holidays", async () => {
    const value = await scalar(
      `select configured_due('2026-10-09 17:30-03',60,'minutes','business')='2026-10-13 09:30-03'::timestamptz as business,configured_due('2026-10-09 17:30-03',2,'hours','calendar')='2026-10-09 19:30-03'::timestamptz as elapsed,configured_due('2026-10-09 17:30-03',2,'days','calendar')='2026-10-11 17:30-03'::timestamptz as days`,
    );
    expect(value).toEqual({ business: true, elapsed: true, days: true });
  });
  it("CS can select the catalogue but cannot configure products or rules", async () => {
    await asUser(cs, async () => {
      expect((await db.query("select name from products")).rows).toHaveLength(3);
    });
    await expect(
      asUser(cs, () =>
        db.query(`select save_product(gen_random_uuid(),null,'Forbidden','',10,10,true)`),
      ),
    ).rejects.toThrow("forbidden");
    await expect(
      asUser(cs, () => db.query(`select save_sla_policy('Bug',1,'{"response_value":2}')`)),
    ).rejects.toThrow("forbidden");
    await expect(
      asUser(cs, () => db.query(`update clients set plan='Unlisted' where id='${ownClient}'`)),
    ).rejects.toThrow("catalog_required");
  });
  it("blocks inactive products and preserves contracted names after catalogue editing", async () => {
    const product = await scalar(`select id,version from products where name='Wing'`);
    await asUser(admin, async () => {
      await db.query(`update clients set product_id='${product.id}' where id='${ownClient}'`);
      await db.query(
        `select save_product('${product.id}',${product.version},'Wing atualizado','',1500,1000,false)`,
      );
      expect(await scalar(`select plan from clients where id='${ownClient}'`)).toEqual({
        plan: "Wing",
      });
      await db.query(`update clients set contact_name='Teste' where id='${ownClient}'`);
      expect(await scalar(`select plan from clients where id='${ownClient}'`)).toEqual({
        plan: "Wing",
      });
    });
    await expect(
      asUser(admin, async () => {
        await db.query(
          `select save_product('${product.id}',${product.version},'Wing','',1500,1000,false)`,
        );
        await db.query(`update clients set product_id='${product.id}' where id='${ownClient}'`);
      }),
    ).rejects.toThrow("inactive_product");
  });
  it("admin changes recalculate open items only, preserve manual delivery and reject stale saves", async () => {
    const ids = (
      await db.query<any>(
        `insert into demands(client_id,owner_id,title,classification,received_at,due_date,completed_at) values('${ownClient}','${cs}','SLA open','Bug','2026-10-06 10:00-03','2026-10-20 12:00-03',null),('${ownClient}','${cs}','SLA closed','Bug','2026-10-06 10:00-03',null,'2026-10-06 11:00-03') returning id,first_response_due,resolution_due`,
      )
    ).rows;
    await asUser(admin, async () => {
      const policy = await scalar(`select version from sla_policies where category='Bug'`);
      const noChange = await scalar(
        `select save_sla_policy('Bug',${policy.version},'{}') as result`,
      );
      expect(noChange.result).toEqual({ changed: false, recalculated: 0 });
      const result = await scalar(
        `select save_sla_policy('Bug',${policy.version},'{"response_value":30,"response_unit":"minutes","response_basis":"calendar","delivery_value":2,"delivery_unit":"hours","delivery_basis":"calendar"}') as result`,
      );
      expect(result.result.changed).toBe(true);
      const open = await scalar(
        `select first_response_due='2026-10-06 10:30-03'::timestamptz as response,policy_delivery_due='2026-10-06 12:00-03'::timestamptz as automatic,due_date='2026-10-20 12:00-03'::timestamptz as manual from demands where id='${ids[0].id}'`,
      );
      expect(open).toEqual({ response: true, automatic: true, manual: true });
      const closed = await scalar(
        `select first_response_due,resolution_due from demands where id='${ids[1].id}'`,
      );
      expect(closed).toEqual({
        first_response_due: ids[1].first_response_due,
        resolution_due: ids[1].resolution_due,
      });
    });
    await expect(
      asUser(admin, async () => {
        await db.query(`select save_sla_policy('Bug',1,'{"response_value":5}')`);
        await db.query(`select save_sla_policy('Bug',1,'{"response_value":6}')`);
      }),
    ).rejects.toThrow("conflict");
  });
});
