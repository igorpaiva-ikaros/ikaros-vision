import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewClientDialog } from "@/components/bi/NewClientDialog";

const mocks = vi.hoisted(() => ({
  options: vi.fn(),
  create: vi.fn(),
  reload: vi.fn(),
  mode: "real",
  session: true,
}));
vi.mock("@/lib/bi.functions", () => ({
  createNotionClient: "create",
  getClientRegistrationOptions: "options",
}));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: string) => (fn === "create" ? mocks.create : mocks.options),
}));
vi.mock("@/lib/bi-context", () => ({
  useBi: () => ({
    session: mocks.session ? { user: { id: "user" } } : null,
    mode: mocks.mode,
    state: { status: "ok" },
    reload: mocks.reload,
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.mode = "real";
  mocks.session = true;
  mocks.options.mockResolvedValue({
    owners: [{ id: "76a3f1dc-d043-49ef-b9b3-bbfc8a29ef22", name: "Pedro" }],
    plans: ["Growth"],
    products: [{ id: "00000000-0000-4000-8000-000000000090", name: "Growth", active: true }],
  });
  mocks.create.mockResolvedValue({ ok: true, code: "CLI-0008", message: "Cliente cadastrado." });
});
function renderDialog() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <NewClientDialog />
    </QueryClientProvider>,
  );
}
async function fill() {
  fireEvent.click(screen.getByRole("button", { name: "Novo cliente" }));
  await screen.findByRole("option", { name: "Pedro" }, { timeout: 4000 });
  fireEvent.change(screen.getByLabelText("Plano contratado *"), {
    target: { value: "00000000-0000-4000-8000-000000000090" },
  });
  fireEvent.change(screen.getByLabelText("Nome da empresa *"), {
    target: { value: "Corretora Exemplo" },
  });
  fireEvent.change(screen.getByLabelText("Contato principal *"), {
    target: { value: "Contato Exemplo" },
  });
  fireEvent.change(screen.getByLabelText("E-mail do contato"), {
    target: { value: "contato@example.com" },
  });
}
describe("Formulário de cliente", () => {
  it("não permite enviar até escolher um responsável e confirma o cadastro", async () => {
    renderDialog();
    await fill();
    expect(screen.getByRole("button", { name: "Cadastrar cliente" })).toBeDisabled();
    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Responsável de CS *"), {
      target: { value: "76a3f1dc-d043-49ef-b9b3-bbfc8a29ef22" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar cliente" }));
    await waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce());
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: "76a3f1dc-d043-49ef-b9b3-bbfc8a29ef22",
        name: "Corretora Exemplo",
      }),
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("preserva campos e identificador após resposta incerta", async () => {
    mocks.create.mockResolvedValueOnce({
      ok: false,
      uncertain: true,
      message: "Confirme o envio.",
    });
    renderDialog();
    await fill();
    fireEvent.change(screen.getByLabelText("Responsável de CS *"), {
      target: { value: "76a3f1dc-d043-49ef-b9b3-bbfc8a29ef22" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar cliente" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar envio" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[0]![0]).toEqual(mocks.create.mock.calls[1]![0]);
  });
  it.each(["demo", "signed_out"])("não oferece cadastro em %s", (mode) => {
    if (mode === "signed_out") mocks.session = false;
    else mocks.mode = mode;
    renderDialog();
    expect(screen.queryByRole("button", { name: "Novo cliente" })).not.toBeInTheDocument();
    expect(mocks.options).not.toHaveBeenCalled();
  });
});
