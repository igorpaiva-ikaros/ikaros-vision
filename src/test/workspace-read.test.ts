// @vitest-environment node
import { createClient } from "@supabase/supabase-js";
import { describe, it, expect, vi } from "vitest";
import { operationState, readNotifications } from "@/lib/workspace/read.server";
function database(transfers: Array<Record<string, unknown>> = []) {
  const urls: string[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    const offset = Number(new URL(url).searchParams.get("offset") ?? 0);
    const data = url.includes("/demand_transfer_requests?")
      ? transfers.slice(offset, offset + 500)
      : url.includes("/rpc/is_operator")
        ? true
        : url.includes("/app_settings")
          ? { value: 60 }
          : [];
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const db = createClient("https://example.invalid", "test-publishable-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  });
  return { db, urls };
}
describe("Production reads with real Supabase query builders", () => {
  it("loads all operation data without a query-builder exception", async () => {
    const { db, urls } = database();
    const ds = await operationState({
      supabase: db,
      userId: "00000000-0000-4000-8000-000000000001",
    });
    expect(ds.clients).toEqual([]);
    expect(ds.notifications).toEqual([]);
    expect(ds.products).toEqual([]);
    expect(ds.riskMinutes).toBe(60);
    expect(urls.some((u) => u.includes("/demands?"))).toBe(true);
    const notifications = new URL(urls.find((u) => u.includes("/notifications?"))!);
    expect(notifications.searchParams.get("superseded_at")).toBe("is.null");
    expect(notifications.searchParams.get("select")).toContain("title");
  });
  it("shares the valid notification query between bell and operation", async () => {
    const { db, urls } = database();
    expect(await readNotifications(db)).toEqual([]);
    expect(new URL(urls[0]!).searchParams.get("superseded_at")).toBe("is.null");
  });
  it("keeps pending transfers visible beyond the first 500 historical requests", async () => {
    const transfers = Array.from({ length: 501 }, (_, index) => ({
      id: String(index).padStart(6, "0"),
      demand_id: `demand-${index}`,
      status: index === 500 ? "pendente" : "aprovada",
    }));
    const { db, urls } = database(transfers);
    const ds = await operationState({
      supabase: db,
      userId: "00000000-0000-4000-8000-000000000001",
    });
    expect(ds.transfers).toHaveLength(501);
    expect(ds.transfers?.find((transfer) => transfer.status === "pendente")?.demand_id).toBe(
      "demand-500",
    );
    expect(
      urls
        .filter((url) => url.includes("/demand_transfer_requests?"))
        .map((url) => new URL(url).searchParams.get("offset")),
    ).toEqual(["0", "500"]);
  });
});
