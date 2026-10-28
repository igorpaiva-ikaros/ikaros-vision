// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateUserById: vi.fn(), insert: vi.fn(), middleware: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain: any = {
      middleware: vi.fn(() => chain),
      inputValidator: vi.fn(() => chain),
      handler: (handler: any) => handler,
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: mocks.middleware,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: { admin: { updateUserById: mocks.updateUserById } },
    from: () => ({ insert: mocks.insert }),
  },
}));
import { resetMemberPassword } from "@/lib/workspace.functions";
import { memberPasswordInput } from "@/lib/workspace/validation";

const memberId = "00000000-0000-4000-8000-0000000000d1";
const adminId = "00000000-0000-4000-8000-0000000000a1";
/** Contexto do servidor: is_admin responde `admin`; o perfil existe quando `found`. */
function context(admin: boolean, found = true) {
  const profiles: any = {
    select: () => profiles,
    eq: () => profiles,
    maybeSingle: async () => ({ data: found ? { id: memberId } : null, error: null }),
  };
  return {
    userId: adminId,
    supabase: { rpc: vi.fn(async () => ({ data: admin, error: null })), from: () => profiles },
  };
}
const reset = resetMemberPassword as unknown as (args: {
  context: ReturnType<typeof context>;
  data: { id: string; password: string };
}) => Promise<{ ok: boolean; audited: boolean }>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateUserById.mockResolvedValue({ data: { user: { id: memberId } }, error: null });
  mocks.insert.mockResolvedValue({ error: null });
});

describe("Redefinir senha no servidor", () => {
  it("recusa quem não é administrador antes de tocar no Auth", async () => {
    await expect(
      reset({ context: context(false), data: { id: memberId, password: "senha-nova-1" } }),
    ).rejects.toThrow("Acesso não autorizado");
    expect(mocks.updateUserById).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("recusa conta que não está cadastrada no Vision", async () => {
    await expect(
      reset({ context: context(true, false), data: { id: memberId, password: "senha-nova-1" } }),
    ).rejects.toThrow("Usuário não encontrado");
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });

  it("administrador troca a senha, confirma o e-mail e registra no histórico sem a senha", async () => {
    expect(
      await reset({ context: context(true), data: { id: memberId, password: "senha-nova-1" } }),
    ).toEqual({ ok: true, audited: true });
    expect(mocks.updateUserById).toHaveBeenCalledWith(memberId, {
      password: "senha-nova-1",
      email_confirm: true,
    });
    expect(mocks.insert).toHaveBeenCalledWith({
      entity_type: "member",
      entity_id: memberId,
      action: "password_reset",
      actor_id: adminId,
      details: {},
    });
    expect(JSON.stringify(mocks.insert.mock.calls)).not.toContain("senha-nova-1");
  });

  it("explica senha fraca sem gravar histórico e informa quando o histórico falha", async () => {
    mocks.updateUserById.mockResolvedValueOnce({
      data: null,
      error: { code: "weak_password", message: "Password is known to be weak" },
    });
    await expect(
      reset({ context: context(true), data: { id: memberId, password: "12345678" } }),
    ).rejects.toThrow("Senha recusada pelo servidor");
    expect(mocks.insert).not.toHaveBeenCalled();
    mocks.insert.mockResolvedValueOnce({ error: { message: "falhou" } });
    expect(
      await reset({ context: context(true), data: { id: memberId, password: "senha-nova-1" } }),
    ).toEqual({ ok: true, audited: false });
  });

  it("aceita só id válido e senha de 8 a 128 caracteres, sem campos extras", () => {
    const ok = (v: object) => memberPasswordInput.safeParse(v).success;
    expect(ok({ id: memberId, password: "1234567" })).toBe(false);
    expect(ok({ id: memberId, password: "x".repeat(129) })).toBe(false);
    expect(ok({ id: "abc", password: "senha-nova-1" })).toBe(false);
    expect(ok({ id: memberId, password: "senha-nova-1", role: "admin" })).toBe(false);
    expect(ok({ id: memberId, password: "senha-nova-1" })).toBe(true);
  });
});
