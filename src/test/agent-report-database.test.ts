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
    "20261015180000_restore_sla_policy_and_first_response_deadline",
    "20261015193000_independent_client_promise",
    "20261015210000_admin_controls",
    "20261016143000_general_system_demands",
    "20261016200000_agent_report_intake",
  ])
    await db.exec(await readFile(`supabase/migrations/${file}.sql`, "utf8"));
  await db.exec(
    `insert into profiles(id,full_name,email) values('${other}','Other CS','other@example.test'),('${tech}','Tech member','technical@example.test');insert into user_roles(user_id,role) values('${other}','cs'),('${tech}','technical');insert into clients(id,name,owner_id) values('${client}','Shared company','${cs}');`,
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});

function report(overrides: Record<string, any> = {}): any {
  return {
    version: "ikaros-vision-agent-report-v1",
    external_id: "synthetic:orientation:2000-01-03",
    client: { id: null, code: null, erp_id: null, name: "Shared company", aliases: [] },
    demand: {
      id: null,
      version: null,
      create_new: false,
      title: "Synthetic orientation",
      classification: "Dúvida",
      priority: null,
      description: "A synthetic question was answered.",
      channel: "WhatsApp",
      context: null,
      impact: null,
      solution: "Orientation delivered.",
      received_at: null,
    },
    source: {
      reference: "Synthetic operator confirmation",
      agent: null,
      documented_on: "2000-01-03",
      requester: null,
    },
    completion: {
      confirmed_by_user: true,
      source: "The operator explicitly confirmed completion.",
      at: null,
      on: "2000-01-03",
      publication: "nao_se_aplica",
    },
    narrative: "Synthetic report; no customer production data.",
    missing_files: ["Original image not supplied"],
    files: [],
    ...overrides,
  };
}
async function ingest(payload: any, preview = false) {
  return (
    await db.query<any>("select ingest_agent_report($1::jsonb,$2) as r", [
      JSON.stringify(payload),
      preview,
    ])
  ).rows[0].r;
}
async function finish(id: string) {
  return (await db.query<any>("select finalize_agent_report($1::uuid) as r", [id])).rows[0].r;
}
async function rejected(work: () => Promise<unknown>, pattern: RegExp) {
  await db.exec("savepoint expected_rejection");
  await expect(work()).rejects.toThrow(pattern);
  await db.exec("rollback to savepoint expected_rejection;release savepoint expected_rejection");
}

describe("Authenticated agent report intake and native audit", () => {
  it("rejects an operator after account deactivation", async () => {
    await db.query("update profiles set active=false where id=$1", [cs]);
    try {
      await expect(user(cs, () => ingest(report()))).rejects.toThrow(/forbidden/);
    } finally {
      await db.query("update profiles set active=true where id=$1", [cs]);
    }
  });
  it("rejects anonymous, technical and inactive actors without touching the portfolio", async () => {
    await expect(ingest(report())).rejects.toThrow(/forbidden/);
    await expect(user(tech, () => ingest(report()))).rejects.toThrow(/forbidden/);
    await user(cs, async () => {
      await rejected(
        () => db.query("update agent_report_receipts set state='applying'"),
        /permission denied/,
      );
      await rejected(
        () =>
          db.query("insert into agent_client_aliases values('forged',$1,$2,now())", [client, cs]),
        /permission denied/,
      );
    });
  });
  it("previews exact aliases and existing cases without inserting clients, cards or events", async () => {
    await user(cs, async () => {
      const p = report();
      p.client.name = "New synthetic company";
      const preview = await ingest(p, true);
      expect(preview).toMatchObject({
        client: null,
        will_create_client: true,
        demand_candidates: [],
      });
      expect(await one("select count(*)::int as n from agent_report_receipts")).toEqual({ n: 0 });
      expect(await one("select count(*)::int as n from demands")).toEqual({ n: 0 });
      expect(await one("select count(*)::int as n from clients")).toEqual({ n: 1 });
    });
  });
  it("uses the native owner and closes an orientation with date precision, no fictitious SLA or acceptance", async () => {
    await user(cs, async () => {
      const received = await ingest(report());
      expect(received.client.id).toBe(client);
      expect(received.demand.owner_id).toBe(cs);
      let d = await one(`select * from demands where id='${received.demand.id}'`);
      expect(d.priority).toBeNull();
      expect(d.received_at).toBeNull();
      expect(d.first_response_due).toBeNull();
      expect(d.resolution_due).toBeNull();
      expect(d.policy_delivery_due).toBeNull();
      const final = await finish(received.receipt_id);
      expect(final).toMatchObject({
        state: "finalized",
        completion_applied: true,
        demand: { stage: "Concluída" },
      });
      d = await one(`select * from demands where id='${d.id}'`);
      // São Paulo was on daylight saving time in January 2000; never assume UTC-3.
      expect(d.completed_at.toISOString()).toBe("2000-01-03T02:00:00.000Z");
      expect(d.source_date_precision).toContain("completed_at");
      expect(d.client_validated).toBe(false);
      expect(d.validated_at).toBeNull();
      expect(d.published_at).toBeNull();
      expect(d.first_response_due).toBeNull();
      const history = await one(
        `select details from workflow_history where entity_id='${d.id}' and action='agent_report_completed'`,
      );
      expect(history.details).toMatchObject({
        occurred_at: null,
        documented_on: "2000-01-03",
        precision: "date",
        client_acceptance: "not_asserted",
        publication: "nao_se_aplica",
      });
      expect(await one("select count(*)::int as n from scheduled_tasks")).toEqual({ n: 0 });
    });
  });
  it("replaying the same report and finalization cannot duplicate a client, card, message or event", async () => {
    await user(cs, async () => {
      const a = await ingest(report());
      await finish(a.receipt_id);
      const before = await one(
        "select (select count(*) from workflow_history)::int as history,(select count(*) from case_messages)::int as messages",
      );
      const b = await ingest(report());
      await finish(b.receipt_id);
      expect(b.receipt_id).toBe(a.receipt_id);
      expect(b.replayed).toBe(true);
      expect(
        await one(
          "select (select count(*) from workflow_history)::int as history,(select count(*) from case_messages)::int as messages",
        ),
      ).toEqual(before);
      expect(await one("select count(*)::int as n from demands")).toEqual({ n: 1 });
      expect(await one("select count(*)::int as n from clients")).toEqual({ n: 1 });
    });
  });
  it("registers new report revisions as history while preserving native title, solution and stage", async () => {
    await user(cs, async () => {
      const p = report();
      p.completion.confirmed_by_user = false;
      const a = await ingest(p);
      await finish(a.receipt_id);
      await db.query(
        "update demands set title='Native edited title',solution='Native solution' where id=$1",
        [a.demand.id],
      );
      const version = (await one(`select version from demands where id='${a.demand.id}'`)).version;
      await db.query("select transition_demand($1,'move',$2,'Em execução')", [
        a.demand.id,
        version,
      ]);
      const revision = report();
      revision.narrative = "Additional evidence for the same synthetic case.";
      const b = await ingest(revision);
      const final = await finish(b.receipt_id);
      expect(b.demand.id).toBe(a.demand.id);
      expect(final.completion_applied).toBe(false);
      expect(
        await one(`select title,solution,stage from demands where id='${a.demand.id}'`),
      ).toEqual({
        title: "Native edited title",
        solution: "Native solution",
        stage: "Em execução",
      });
    });
  });
  it("minimal creation does not invent a plan, contact, business IDs or client ownership", async () => {
    await user(cs, async () => {
      const p = report();
      p.client = {
        ...p.client,
        name: "Brand new synthetic company",
        aliases: ["New synthetic alias"],
      };
      const a = await ingest(p);
      expect(
        await one(
          `select plan,product_id,contact_name,contact_email,contact_phone,erp_id,owner_id from clients where id='${a.client.id}'`,
        ),
      ).toEqual({
        plan: null,
        product_id: null,
        contact_name: null,
        contact_email: null,
        contact_phone: null,
        erp_id: null,
        owner_id: null,
      });
      const revision = report();
      revision.external_id = "synthetic:other-report:2000-01-03";
      revision.client.name = "New synthetic alias";
      expect((await ingest(revision, true)).client.id).toBe(a.client.id);
    });
  });
  it("refuses ambiguous client aliases rather than picking one of two companies", async () => {
    await user(cs, async () => {
      await db.query("insert into clients(name) values('Another synthetic company')");
      const p = report();
      p.client.aliases = ["Another synthetic company"];
      const preview = await ingest(p, true);
      expect(preview.requires_review).toBe(true);
      expect(preview.client_candidates).toHaveLength(2);
      await rejected(() => ingest(p), /ambiguous_client/);
      expect(await one("select count(*)::int as n from agent_report_receipts")).toEqual({ n: 0 });
    });
  });
  it("matches duplicate case titles and requires explicit review for unrelated existing cases", async () => {
    await user(cs, async () => {
      const first = await ingest(report());
      const second = report();
      second.external_id = "synthetic:independent-source:2000-01-03";
      expect((await ingest(second)).demand.id).toBe(first.demand.id);
      const third = report();
      third.external_id = "synthetic:possibly-related:2000-01-03";
      third.demand.title = "A different subject";
      await rejected(() => ingest(third), /review_required/);
      third.demand.create_new = true;
      expect((await ingest(third)).demand.id).not.toBe(first.demand.id);
    });
  });
  it("will not conclude before a real upload and register_case_file have both succeeded", async () => {
    await user(cs, async () => {
      const p = report();
      const sha = "a".repeat(64);
      p.files = [{ name: "synthetic.txt", mime: "text/plain", size: 3, sha256: sha }];
      const r = await ingest(p);
      await rejected(() => finish(r.receipt_id), /missing_evidence/);
      const path = `${r.demand.id}/agent-reports/${sha}.txt`;
      await db.query(
        "insert into storage.objects(bucket_id,name,owner_id,metadata) values('case-evidence',$1,$2,$3)",
        [path, cs, JSON.stringify({ size: 3, mimetype: "text/plain" })],
      );
      await rejected(() => finish(r.receipt_id), /missing_evidence/);
      await db.query("select register_case_file($1,$2,'synthetic.txt','text/plain',3)", [
        r.demand.id,
        path,
      ]);
      await db.query("select register_case_file($1,$2,'synthetic.txt','text/plain',3)", [
        r.demand.id,
        path,
      ]);
      expect((await finish(r.receipt_id)).demand.stage).toBe("Concluída");
      expect(await one("select count(*)::int as n from case_attachments")).toEqual({ n: 1 });
    });
  });
  it("rejects stale versions after a manual change instead of overwriting it during finalization", async () => {
    await user(cs, async () => {
      const r = await ingest(report());
      await db.query("update demands set title='Manual title' where id=$1", [r.demand.id]);
      await rejected(() => finish(r.receipt_id), /conflict/);
      expect(await one(`select title,completed_at from demands where id='${r.demand.id}'`)).toEqual(
        { title: "Manual title", completed_at: null },
      );
    });
  });
  it("cannot use a persisted receipt or a forged setting to bypass native stage/date guards", async () => {
    await user(cs, async () => {
      const r = await ingest(report());
      await db.query("select set_config('app.agent_report',$1,true)", [r.receipt_id]);
      await rejected(
        () => db.query("update demands set received_at='2000-01-01' where id=$1", [r.demand.id]),
        /forbidden/,
      );
      await rejected(
        () =>
          db.query("update demands set source_date_precision='[\"completed_at\"]' where id=$1", [
            r.demand.id,
          ]),
        /forbidden/,
      );
      await rejected(
        () =>
          db.query("update agent_report_receipts set state='applying' where id=$1", [r.receipt_id]),
        /permission denied/,
      );
      await rejected(
        () => db.query("select in_agent_report($1)", [r.demand.id]),
        /permission denied/,
      );
    });
  });
  it("preserves regular native creation behavior outside report intake", async () => {
    await user(cs, async () => {
      const d = (
        await db.query<any>(
          "insert into demands(client_id,title) values($1,'Native creation') returning *",
          [client],
        )
      ).rows[0];
      expect(d.received_at).toBeTruthy();
      expect(d.owner_id).toBe(cs);
      expect(d.priority).toBe("Normal");
    });
  });
  it("keeps the native unassigned-owner behavior for administrator creation", async () => {
    await user(admin, async () => {
      const r = await ingest(report());
      expect(r.demand.owner_id).toBeNull();
      expect((await finish(r.receipt_id)).completion_applied).toBe(true);
    });
  });
  it("preserves the original receipt actor when an administrator finishes it", async () => {
    await user(cs, async () => {
      const r = await ingest(report());
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [admin]);
      await finish(r.receipt_id);
      expect(
        (await one(`select requested_by from agent_report_receipts where id='${r.receipt_id}'`))
          .requested_by,
      ).toBe(cs);
    });
  });
  it("refuses to infer historical SLA duration when only the completion day is known", async () => {
    await user(cs, async () => {
      const p = report();
      p.demand.received_at = "2000-01-03T10:00:00-02:00";
      const r = await ingest(p);
      await rejected(() => finish(r.receipt_id), /incomplete/);
      expect(
        (await one(`select completed_at from demands where id='${r.demand.id}'`)).completed_at,
      ).toBeNull();
    });
  });
  it("cannot change client identity by reusing another company's external report ID", async () => {
    await user(cs, async () => {
      await ingest(report());
      const p = report();
      p.client.name = "A different synthetic identity";
      p.narrative = "A changed source.";
      await rejected(() => ingest(p), /client_conflict/);
      expect(await one("select count(*)::int as n from clients")).toEqual({ n: 1 });
    });
  });
  it("enforces actor ownership, expected version and real case guards when targeting an existing card", async () => {
    await user(cs, async () => {
      const a = await ingest(report());
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [other]);
      await rejected(() => finish(a.receipt_id), /not_found/);
      const p = report();
      p.external_id = "synthetic:other-operator:2000-01-03";
      p.demand.id = a.demand.id;
      p.demand.version = a.demand.version;
      const b = await ingest(p);
      expect((await finish(b.receipt_id)).completion_applied).toBe(false);
      expect(
        (await one(`select completed_at from demands where id='${a.demand.id}'`)).completed_at,
      ).toBeNull();
    });
  });
  it("rejects invented deployment/completion and malformed file manifests even over direct RPC", async () => {
    await user(cs, async () => {
      const p = report();
      p.demand.classification = "Bug";
      await rejected(() => ingest(p), /incomplete/);
      const q = report();
      q.files = [{ name: "missing.txt", mime: "text/plain", size: 0 }];
      await rejected(() => ingest(q), /invalid_file/);
      q.files = [{ name: "mismatch.pdf", mime: "image/jpeg", size: 3, sha256: "b".repeat(64) }];
      await rejected(() => ingest(q), /invalid_file/);
      const future = report();
      future.completion.on = "2999-01-01";
      await rejected(() => ingest(future), /invalid_report/);
    });
  });
});
