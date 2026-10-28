import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResetMemberPassword } from "@/components/workspace/ResetMemberPassword";

const mocks = vi.hoisted(() => ({
  reset: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: any) => fn }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/workspace.functions", () => ({ resetMemberPassword: mocks.reset }));

const member = {
  id: "00000000-0000-4000-8000-0000000000d1",
  full_name: "Equipe técnica",
  email: "tecnico@example.test",
  active: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.reset.mockResolvedValue({ ok: true, audited: true });
});
function open(props = member) {
  render(<ResetMemberPassword member={props} />);
  fireEvent.click(screen.getByRole("button", { name: `Redefinir senha de ${props.full_name}` }));
  return {
    password: screen.getByLabelText("Nova senha"),
    confirm: screen.getByLabelText("Confirme a nova senha"),
  };
}
function fill(fields: ReturnType<typeof open>, password: string, confirm: string) {
  fireEvent.change(fields.password, { target: { value: password } });
  fireEvent.change(fields.confirm, { target: { value: confirm } });
  fireEvent.click(screen.getByRole("button", { name: "Redefinir senha" }));
}

describe("Administração → Redefinir senha", () => {
  it("mostra o login da conta e não envia quando as duas senhas diferem", async () => {
    const fields = open();
    expect(screen.getByText(/tecnico@example\.test/)).toBeVisible();
    fill(fields, "senha-nova-1", "senha-nova-2");
    expect(await screen.findByRole("alert")).toHaveTextContent("As duas senhas não são iguais.");
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it("envia id e senha, confirma o sucesso e não mantém a senha na tela", async () => {
    const fields = open();
    fill(fields, "senha-nova-1", "senha-nova-1");
    await waitFor(() =>
      expect(mocks.reset).toHaveBeenCalledWith({
        data: { id: member.id, password: "senha-nova-1" },
      }),
    );
    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith(
        "Senha de Equipe técnica redefinida. Passe a nova senha diretamente à pessoa.",
      ),
    );
    expect(mocks.toast.warning).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Redefinir senha de Equipe técnica" }));
    expect(screen.getByLabelText("Nova senha")).toHaveValue("");
  });

  it("mostra o erro do servidor e mantém o diálogo aberto", async () => {
    mocks.reset.mockRejectedValueOnce(new Error("Senha recusada pelo servidor por ser fraca."));
    fill(open(), "12345678", "12345678");
    expect(await screen.findByRole("alert")).toHaveTextContent("Senha recusada pelo servidor");
    expect(screen.getByLabelText("Nova senha")).toBeVisible();
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it("avisa quando o histórico não foi gravado e quando a conta está inativa", async () => {
    mocks.reset.mockResolvedValueOnce({ ok: true, audited: false });
    fill(open({ ...member, active: false }), "senha-nova-1", "senha-nova-1");
    await waitFor(() => expect(mocks.toast.warning).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Redefinir senha de Equipe técnica" }));
    expect(screen.getByRole("note")).toHaveTextContent("Esta conta está inativa");
  });
});
