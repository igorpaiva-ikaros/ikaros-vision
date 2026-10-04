import { afterEach, describe, expect, it, vi } from "vitest";
import { clientRegistrationSchema } from "@/lib/domain/client-registration";
import { registerClient, type RegistrationStore, type Reservation } from "@/lib/notion/registration.server";
import { CLIENT_PROPS, CS_TEAM, REGISTRATION_PROPERTY } from "@/lib/notion/config";
import { resolveCredentials } from "@/lib/notion/client.server";

afterEach(() => vi.unstubAllGlobals());
const credentials = resolveCredentials({ NOTION_TOKEN: "test-only" });
if (!credentials.ok) throw new Error("fixture");
const creds = credentials.creds;
const input = { requestId: "a9bd2135-4ca3-477d-97b9-ec78d2ce4140", name: "Corretora Exemplo", ownerId: CS_TEAM[1].id, contactName: "Contato Exemplo", email: "contato@example.com", phone: "", segment: "Consórcio", plan: "Growth", notes: "", isTest: true };
const properties = {
  "Nome do cliente": { type: "title" }, Empresa: { type: "rich_text" },
  "Contato principal": { type: "rich_text" }, "Responsável principal": { type: "people" },
  "E-mail do contato": { type: "email" }, "Telefone do contato": { type: "phone_number" },
  "Segmentos ERP": { type: "rich_text" }, "Plano contratado": { type: "select", select: { options: [{ name: "Growth" }] } },
  "Status do cliente": { type: "select", select: { options: [{ name: "Ativo" }] } },
  "Registro de teste": { type: "checkbox" }, [REGISTRATION_PROPERTY]: { type: "rich_text" },
  "Observações": { type: "rich_text" }, "Data de entrada": { type: "date" },
};
const page = { id: "client-test", properties: { Código: { type: "formula", formula: { type: "string", string: "CLI-0008" } } } };
function fixture(outcome: "success" | "timeout" | "forbidden" = "success") {
  const rows = new Map<string, Reservation>();
  const store: RegistrationStore = {
    reserve: vi.fn(async (id, userId, hash) => {
      const previous = rows.get(id);
      if (previous) return { fresh: false, row: previous };
      const row = { user_id: userId, payload_hash: hash, notion_page_id: null };
      rows.set(id, row); return { fresh: true, row };
    }),
    complete: vi.fn(async (id, pageId) => { rows.get(id)!.notion_page_id = pageId; }),
    release: vi.fn(async id => { rows.delete(id); }),
  };
  let recovered = false;
  const writes: Record<string, any>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/query")) return Response.json({ results: recovered ? [page] : [] });
    if (url.includes("/data_sources/")) return Response.json({ properties });
    const user = CS_TEAM.find(u => url.endsWith(`/users/${u.id}`));
    if (user) return Response.json({ id: user.id, name: user.name, type: "person" });
    if (url.endsWith("/pages") && init.method === "POST") {
      writes.push(JSON.parse(String(init.body)));
      if (outcome === "timeout") throw new Error("timeout");
      if (outcome === "forbidden") return new Response("private provider body", { status: 403 });
      return Response.json(page);
    }
    return Response.json(page);
  }));
  return { store, writes, recover: () => { recovered = true; } };
}

describe("Cadastro manual de clientes", () => {
  it("exige responsável e um meio de contato, mesmo fora da interface", async () => {
    const f = fixture();
    expect(clientRegistrationSchema.safeParse({ ...input, email: "", phone: "" }).success).toBe(false);
    expect(await registerClient(creds, { ...input, ownerId: "" }, "user", f.store)).toMatchObject({ ok: false });
    expect(f.store.reserve).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("recusa uma pessoa fora da equipe antes de criar qualquer registro", async () => {
    const f = fixture();
    expect(await registerClient(creds, { ...input, ownerId: "76a3f1dc-d043-49ef-b9b3-bbfc8a29ef22" }, "user", f.store)).toMatchObject({ ok: false });
    expect(f.writes).toHaveLength(0);
    expect(f.store.reserve).not.toHaveBeenCalled();
  });
  it("cria na base Clientes com o responsável escolhido e deixa o código a cargo do Notion", async () => {
    const f = fixture();
    expect(await registerClient(creds, input, "user", f.store)).toMatchObject({ ok: true, code: "CLI-0008" });
    const p = f.writes[0]!["properties"];
    expect(p[CLIENT_PROPS.responsavel].people).toEqual([{ object: "user", id: CS_TEAM[1].id }]);
    expect(p[CLIENT_PROPS.isTest].checkbox).toBe(true);
    expect(p[REGISTRATION_PROPERTY].rich_text[0].text.content).toBe(input.requestId);
    expect(p).not.toHaveProperty("Código");
    expect(p).not.toHaveProperty("ID ERP");
  });
  it("envios concorrentes e repetidos não criam uma segunda página", async () => {
    const f = fixture();
    await Promise.all([registerClient(creds, input, "user", f.store), registerClient(creds, input, "user", f.store)]);
    expect(await registerClient(creds, input, "user", f.store)).toMatchObject({ ok: true });
    expect(f.writes).toHaveLength(1);
  });
  it("timeout conserva o envio e confirma pelo marcador sem repetir o POST", async () => {
    const f = fixture("timeout");
    expect(await registerClient(creds, input, "user", f.store)).toMatchObject({ ok: false, uncertain: true });
    expect(await registerClient(creds, input, "user", f.store)).toMatchObject({ ok: false, uncertain: true });
    f.recover();
    expect(await registerClient(creds, input, "user", f.store)).toMatchObject({ ok: true });
    expect(f.writes).toHaveLength(1);
  });
  it("explica falta de permissão de escrita e não retém um envio recusado", async () => {
    const f = fixture("forbidden");
    expect(await registerClient(creds, input, "user", f.store)).toMatchObject({ ok: false, message: expect.stringContaining("permita criar conteúdo") });
    expect(f.store.release).toHaveBeenCalledOnce();
    expect(f.writes).toHaveLength(1);
  });
  it("não repete uma criação após erro 500 do provedor", async () => {
    const f = fixture();
    const existing = fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => url.endsWith("/pages") && init.method === "POST" ? new Response("private", { status: 500 }) : existing(url, init)));
    expect(await registerClient(creds, input, "user", f.store)).toMatchObject({ ok: false, uncertain: true });
    expect((fetch as any).mock.calls.filter(([url, init]: any) => url.endsWith("/pages") && init.method === "POST")).toHaveLength(1);
    expect(f.store.release).not.toHaveBeenCalled();
  });
  it("não reutiliza um envio com outra pessoa ou dados alterados", async () => {
    const f = fixture();
    await registerClient(creds, input, "user", f.store);
    expect(await registerClient(creds, input, "another", f.store)).toMatchObject({ ok: false });
    expect(await registerClient(creds, { ...input, name: "Outra empresa" }, "user", f.store)).toMatchObject({ ok: false });
    expect(f.writes).toHaveLength(1);
  });
});
