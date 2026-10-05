import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Operation } from "@/components/workspace/Operation";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  transition: vi.fn(),
  reload: vi.fn(),
  includeTests: false,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: any) => fn }));
vi.mock("@/lib/workspace.functions", () => ({
  getRecordHistory: async () => [],
  getOperationState: mocks.get,
  saveRecord: mocks.save,
  transitionRecord: mocks.transition,
  updateClientContact: vi.fn(),
}));
vi.mock("@/lib/bi-context", () => ({
  useBi: () => ({
    session: { user: { id: "00000000-0000-4000-8000-000000000001" } },
    profile: { role: "cs", full_name: "CS Example" },
    includeTests: mocks.includeTests,
    setIncludeTests: vi.fn(),
    reload: mocks.reload,
  }),
}));
vi.mock("@/components/bi/NewClientDialog", () => ({ NewClientDialog: () => null }));
const client = "00000000-0000-4000-8000-000000000011";
const demand = "00000000-0000-4000-8000-000000000021";
const ds = () => ({
  clients: [
    {
      id: client,
      code: "CLI-00001",
      name: "Corretora Exemplo",
      owner_id: "00000000-0000-4000-8000-000000000001",
      contact_name: "Contato",
      contact_email: "example@example.test",
      plan: "Wing",
      is_test: false,
    },
  ],
  demands: [
    {
      id: demand,
      code: "DEM-00001",
      client_id: client,
      title: "Cotação com erro",
      description: "Proposta de consórcio não carrega",
      stage: "Nova",
      priority: "Alta",
      classification: "Bug",
      version: 1,
      is_test: false,
    },
  ],
  onboardings: [],
  upgrades: [],
  interactions: [],
  changelog: [],
  sla: [
    {
      id: demand,
      first_response_state: "em_risco",
      resolution_state: "no_prazo",
      delivery_state: "sem_dados",
    },
  ],
  commissions: [],
  notifications: [],
  riskMinutes: 60,
});
function mount(tab: "clients" | "demands") {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Operation tab={tab} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.includeTests = false;
  mocks.get.mockResolvedValue(ds());
  mocks.save.mockResolvedValue({ id: demand });
  mocks.transition.mockResolvedValue({});
});
describe("Client-first operation", () => {
  it("creates a demand from the selected client without exposing another client selector", async () => {
    mount("clients");
    fireEvent.click(await screen.findByRole("button", { name: "+ Demanda" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Corretora Exemplo");
    expect(screen.queryByLabelText("Responsável")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Nova dúvida" } });
    fireEvent.change(screen.getByLabelText("Demanda *"), {
      target: { value: "Como revisar a proposta?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar registro" }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: "demands",
            values: expect.objectContaining({ client_id: client, title: "Nova dúvida" }),
          }),
        }),
      ),
    );
    expect(mocks.reload).toHaveBeenCalled();
  });
  it("opens a compact card, protects unsaved changes and registers an action with version", async () => {
    mount("demands");
    fireEvent.click(await screen.findByRole("button", { name: /DEM-00001/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Em risco");
    fireEvent.change(screen.getByLabelText("Solução aplicada"), { target: { value: "Corrigido" } });
    expect(screen.getByRole("button", { name: "Registrar 1ª resposta" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Concluir demanda" })).toBeDisabled();
    expect(mocks.transition).not.toHaveBeenCalled();
  });
  it("registers first response through audited action, not direct field save", async () => {
    mount("demands");
    fireEvent.click(await screen.findByRole("button", { name: /DEM-00001/ }));
    fireEvent.click(screen.getByRole("button", { name: "Registrar 1ª resposta" }));
    await waitFor(() =>
      expect(mocks.transition).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: "demands",
          id: demand,
          version: 1,
          action: "first_response",
        }),
      }),
    );
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("hides records marked as test by either record or client", async () => {
    const data = ds();
    data.clients[0]!.is_test = true;
    mocks.get.mockResolvedValue(data);
    mount("demands");
    await screen.findByText("Nenhum registro nesta seleção");
    expect(screen.queryByRole("button", { name: /DEM-00001/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mostrar carteira de teste" })).toBeVisible();
  });
});
