import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDataset, resolveCredentials } from "@/lib/notion/client.server";
import { mapClient, mapDemand } from "@/lib/notion/mapping";
import { mailtoLink, whatsappLink } from "@/lib/domain/contact";

afterEach(() => vi.unstubAllGlobals());
describe("Leitura Notion", () => {
  it("não inventa conexão nem campos ausentes", () => {
    expect(resolveCredentials({})).toMatchObject({ ok: false });
    expect(resolveCredentials({ NOTION_TOKEN: "test-only" })).toMatchObject({ ok: true, creds: { base: "https://api.notion.com/v1" } });
    expect(mapDemand({ id: "d", properties: {} })).toMatchObject({ title: null, completedAt: null, status: null, sla: { statusUtil: null } });
  });
  it("localiza título pelo tipo e preserva vínculo/contacto/teste", () => {
    const c = mapClient({ id: "c", properties: { "Nome personalizado": { type: "title", title: [{ plain_text: "Empresa Exemplo" }] }, "Registro de teste": { type: "checkbox", checkbox: true }, "E-mail do contato": { type: "email", email: "contato@example.com" } } });
    expect(c).toMatchObject({ name: "Empresa Exemplo", emailContato: "contato@example.com", isTest: true });
    expect(mapDemand({ id: "d", properties: { Cliente: { type: "relation", relation: [{ id: "c" }] } } }).clientIds).toEqual(["c"]);
  });
  it("busca todas as páginas e não faz escrita nas bases", async () => {
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => {
      calls.push({ url, method: options.method ?? "GET" });
      if (!url.endsWith("/query")) return Response.json({ properties: {} });
      const b = JSON.parse(String(options.body));
      return Response.json({ results: [{ object: "page", id: b.start_cursor ? "second" : "first", properties: {} }], has_more: !b.start_cursor, next_cursor: b.start_cursor ? null : "cursor" });
    }));
    const creds = resolveCredentials({ NOTION_TOKEN: "test-only" });
    if (!creds.ok) throw new Error("fixture");
    const ds = await fetchDataset(creds.creds);
    expect(ds.demands).toHaveLength(2);
    expect(ds.clients).toHaveLength(2);
    expect(calls.filter(c => c.method === "POST").every(c => c.url.endsWith("/query"))).toBe(true);
  });
  it("valida links sem envio de mensagens", () => {
    expect(mailtoLink("contato@example.com")).toBe("mailto:contato@example.com");
    expect(mailtoLink("inválido")).toBeNull();
    expect(whatsappLink("javascript:alert(1)")).toBeNull();
    expect(whatsappLink("https://evil.example/whatsapp")).toBeNull();
    expect(whatsappLink("https://wa.me/5511999999999")).toBe("https://wa.me/5511999999999");
  });
});
