// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  agentReportSchema,
  reportFilePath,
  completionFact,
  canonicalReport,
} from "@/lib/workspace/agent-report";

const payload = () => ({
  version: "ikaros-vision-agent-report-v1",
  external_id: "synthetic:cli:case-1",
  client: { id: null, code: null, erp_id: null, name: "Synthetic company", aliases: [] },
  demand: {
    id: null,
    version: null,
    title: "A synthetic question",
    classification: "Dúvida",
    priority: null,
    channel: null,
    description: "Synthetic source description",
    context: null,
    impact: null,
    solution: null,
    received_at: null,
  },
  source: { reference: "Synthetic source", agent: null, requester: null, documented_on: null },
  completion: {
    confirmed_by_user: false,
    source: null,
    at: null,
    on: null,
    publication: "a_confirmar",
  },
  narrative: "Synthetic text, no production customer data.",
  files: [],
  missing_files: ["Original image not supplied"],
});
describe("Report facts, local validation and credential boundary", () => {
  it("gives regenerated JSON with identical facts the same evidence content", () => {
    const first = agentReportSchema.parse(payload());
    const reordered = Object.fromEntries(Object.entries(payload()).reverse());
    expect(canonicalReport(first)).toBe(canonicalReport(agentReportSchema.parse(reordered)));
    const changed = payload();
    changed.narrative = "New, independently documented evidence.";
    expect(canonicalReport(first)).not.toBe(canonicalReport(agentReportSchema.parse(changed)));
  });
  it("returns date-only completion without exposing its internal normalized hour", () => {
    expect(completionFact("2000-01-03T02:00:00Z", ["completed_at"])).toEqual({
      at: null,
      on: "2000-01-03",
    });
    expect(completionFact("2000-01-03T15:42:00Z", [])).toEqual({
      at: "2000-01-03T15:42:00Z",
      on: null,
    });
    expect(completionFact(null, [])).toEqual({ at: null, on: null });
  });
  it("keeps unknown facts null and uses persisted classification instead of a display label", () => {
    const p = payload();
    expect(agentReportSchema.parse(p).demand).toMatchObject({
      priority: null,
      received_at: null,
      impact: null,
    });
    p.demand.classification = "Dúvida / orientação";
    expect(agentReportSchema.safeParse(p).success).toBe(false);
  });
  it("rejects invented dates, authority/owner fields and completion without a proven source", () => {
    const p: any = payload();
    p.source.documented_on = "2026-02-30";
    expect(agentReportSchema.safeParse(p).success).toBe(false);
    p.source.documented_on = null;
    p.demand.owner_id = "00000000-0000-4000-8000-000000000001";
    expect(agentReportSchema.safeParse(p).success).toBe(false);
    delete p.demand.owner_id;
    p.completion.confirmed_by_user = true;
    expect(agentReportSchema.safeParse(p).success).toBe(false);
  });
  it("deduplicates content identity and rejects MIME/extension mismatches", () => {
    const p: any = payload();
    const f = { name: "source.txt", mime: "text/plain", size: 3, sha256: "b".repeat(64) };
    p.files = [f, { ...f, name: "copy.txt" }];
    expect(agentReportSchema.safeParse(p).success).toBe(false);
    p.files = [{ ...f, mime: "application/pdf" }];
    expect(agentReportSchema.safeParse(p).success).toBe(false);
    expect(reportFilePath("00000000-0000-4000-8000-000000000001", f)).toBe(
      `00000000-0000-4000-8000-000000000001/agent-reports/${f.sha256}.txt`,
    );
  });
  it("validates available files without credentials and refuses real lookup without an authorized session", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vision-report-test-"));
    try {
      const input = join(dir, "report.json"),
        file = join(dir, "source.txt");
      await writeFile(input, JSON.stringify(payload()));
      await writeFile(file, "Synthetic evidence.");
      const args = ["--experimental-strip-types", "scripts/agent-reports.mjs"];
      const env = { ...process.env, VISION_ACCESS_TOKEN: "" };
      const valid = spawnSync(process.execPath, [...args, "validate", input, "--file", file], {
        encoding: "utf8",
        env,
      });
      expect(valid.status).toBe(0);
      expect(JSON.parse(valid.stdout)).toMatchObject({
        status: "validated_only",
        available_files: ["source.txt", "relatorio-estruturado.txt"],
        missing_files: ["Original image not supplied"],
      });
      const lookup = spawnSync(process.execPath, [...args, "inspect", input], {
        encoding: "utf8",
        env,
      });
      expect(lookup.status).toBe(1);
      expect(lookup.stderr).toContain("configuração segura");
      expect(lookup.stdout).toBe("");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
