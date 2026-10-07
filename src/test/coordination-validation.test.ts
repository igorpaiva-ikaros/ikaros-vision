// @vitest-environment node
import { describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";
import { caseFile, MAX_CASE_FILE } from "@/lib/workspace/evidence";
import { validateSaleWebhook } from "@/lib/workspace/sales-intake.server";
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const config = {
  secret: "test-only-not-a-real-secret-32-chars",
  sourceCompanyId: "own-sales-company",
};
const now = Date.parse("2026-10-07T12:00:00Z"),
  timestamp = String(now / 1000);
const payload = {
  event: "ikaros.sale.confirmed",
  sourceCompanyId: config.sourceCompanyId,
  saleId: "sale-1",
  customerId: "crm-contact-1",
  companyName: "Empresa documentada",
  confirmedAt: "2026-10-07T11:00:00Z",
};
async function sign(raw: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Buffer.from(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(timestamp + "." + raw)),
  ).toString("hex");
}
describe("Commercial boundary and private evidence", () => {
  it("validates real signed acquisitions with absent contact fields and stable replay identity", async () => {
    const raw = JSON.stringify(payload);
    const a = await validateSaleWebhook(raw, timestamp, await sign(raw), config, now);
    expect(a.ok).toBe(true);
    const reordered = JSON.stringify(Object.fromEntries(Object.entries(payload).reverse()));
    const b = await validateSaleWebhook(reordered, timestamp, await sign(reordered), config, now);
    expect(b.ok && a.ok && b.hash === a.hash).toBe(true);
  });
  it("rejects forged, expired, foreign-tenant and unconfigured inputs", async () => {
    const raw = JSON.stringify(payload);
    expect((await validateSaleWebhook(raw, timestamp, "0".repeat(64), config, now)).status).toBe(
      401,
    );
    expect(
      (await validateSaleWebhook(raw, timestamp, await sign(raw), config, now + 600000)).ok,
    ).toBe(false);
    const foreign = JSON.stringify({ ...payload, sourceCompanyId: "client-tenant" });
    expect(
      (await validateSaleWebhook(foreign, timestamp, await sign(foreign), config, now)).ok,
    ).toBe(false);
    expect((await validateSaleWebhook(raw, timestamp, await sign(raw), {}, now)).ok).toBe(false);
  });
  it("rejects unsupported, empty and oversized files while accepting media and sanitizing names", () => {
    expect(caseFile({ name: "print cliente.png", type: "image/png", size: 100 }).safeName).toBe(
      "print_cliente.png",
    );
    expect(caseFile({ name: "audio.webm", type: "audio/webm", size: 100 }).mime).toBe("audio/webm");
    for (const f of [
      { name: "a.exe", type: "application/octet-stream", size: 1 },
      { name: "a.png", type: "text/html", size: 1 },
      { name: "a.pdf", type: "application/pdf", size: 0 },
      { name: "a.pdf", type: "application/pdf", size: MAX_CASE_FILE + 1 },
    ])
      expect(() => caseFile(f)).toThrow();
  });
});
