import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), middleware: {} }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const chain: any = { middleware: vi.fn(() => chain), inputValidator: vi.fn(() => chain), handler: (handler: any) => handler };
  return chain;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: mocks.middleware }));
vi.mock("@/lib/notion/client.server", () => ({ resolveCredentials: mocks.resolve }));
import { createNotionClient, getClientRegistrationOptions, getNotionWorkflowAudit } from "@/lib/bi.functions";

describe("Autorização do cadastro no servidor", () => {
  it("recusa auditoria por conta sem papel interno antes de ler esquemas ou registros", async () => {
    const context = { userId: "unauthorized", supabase: { rpc: vi.fn(async () => ({ data: false, error: null })) } };
    await expect((getNotionWorkflowAudit as any)({ context })).rejects.toThrow("Acesso não autorizado");
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it("recusa listagem de colaboradores antes de acessar o Notion", async () => {
    const context = { userId: "unauthorized", supabase: { rpc: vi.fn(async () => ({ data: false, error: null })) } };
    await expect((getClientRegistrationOptions as any)({ context })).rejects.toThrow("Acesso não autorizado");
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it("recusa criação por conta sem papel interno antes de reservar/escrever", async () => {
    const context = { userId: "unauthorized", supabase: { rpc: vi.fn(async () => ({ data: false, error: null })) } };
    expect(await (createNotionClient as any)({ context, data: {} })).toMatchObject({ ok: false, message: "Acesso não autorizado." });
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});
