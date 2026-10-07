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
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to, search, ...props }: any) => (
    <a href={`${to}?tab=${search?.tab}`} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: any) => fn }));
vi.mock("@/lib/workspace.functions", () => ({
  claimRecord: vi.fn(),
  getDemandStageTrace: async () => [],
  getCaseWorkspace: async () => ({ request: null, messages: [], files: [] }),
  runDeliveryAction: vi.fn(),
  postCaseMessage: vi.fn(),
  registerCaseFile: vi.fn(),
  getRecordHistory: async () => [],
  getOperationState: mocks.get,
  saveRecord: mocks.save,
  transitionRecord: mocks.transition,
  updateClientContact: vi.fn(),
  getScheduledTasks: async () => [],
  saveScheduledTask: vi.fn(),
}));
vi.mock("@/lib/bi-context", () => ({
  useBi: () => ({
    session: { user: { id: "00000000-0000-4000-8000-000000000001" } },
    profile: { id: "00000000-0000-4000-8000-000000000001", role: "cs", full_name: "CS Example" },
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
      owner_id: "00000000-0000-4000-8000-000000000001",
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
  return render(
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

describe("Fast operational funnels", () => {
  it("moves by drag with immediate feedback and uses the audited action", async () => {
    let resolve!: (value: unknown) => void;
    mocks.transition.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const view = mount("demands");
    const card = (await screen.findByRole("button", { name: /DEM-00001/ })).closest("article")!;
    const transfer = {
      data: {} as Record<string, string>,
      setData(key: string, value: string) {
        this.data[key] = value;
      },
      getData(key: string) {
        return this.data[key];
      },
      effectAllowed: "",
    };
    fireEvent.dragStart(card, { dataTransfer: transfer });
    fireEvent.drop(view.container.querySelector('[data-stage="Em execução"]')!, {
      dataTransfer: transfer,
    });
    await waitFor(() =>
      expect(
        view.container.querySelector('[data-card-id="' + demand + '"]')?.closest("section"),
      ).toHaveAttribute("data-stage", "Em execução"),
    );
    expect(mocks.transition).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "demands",
        id: demand,
        version: 1,
        action: "move",
        stage: "Em execução",
      }),
    });
    resolve({ id: demand, stage: "Em execução", version: 2 });
    await waitFor(() => expect(mocks.reload).toHaveBeenCalled());
  });
  it("restores the prior stage if saving fails", async () => {
    mocks.transition.mockRejectedValueOnce(new Error("conflict"));
    mount("demands");
    const select = await screen.findByLabelText("Mover DEM-00001");
    fireEvent.change(select, { target: { value: "Em execução" } });
    await waitFor(() => expect(mocks.transition).toHaveBeenCalled());
    await waitFor(() => expect(select).toHaveValue("Nova"));
  });
  it("does not conclude an incomplete card just because it was moved", async () => {
    mount("demands");
    fireEvent.change(await screen.findByLabelText("Mover DEM-00001"), {
      target: { value: "Concluída" },
    });
    expect(await screen.findByRole("dialog")).toHaveTextContent("Solução aplicada");
    expect(mocks.transition).not.toHaveBeenCalled();
  });
  it("reuses cached data when switching from demands to onboarding and shows empty columns", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={qc}>
        <Operation tab="demands" />
      </QueryClientProvider>,
    );
    await screen.findByLabelText("Mover DEM-00001");
    view.rerender(
      <QueryClientProvider client={qc}>
        <Operation tab="onboardings" />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "CRM" })).toBeVisible();
    expect(view.container.querySelector('[data-stage="8. Treinamento"]')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Carregando sua carteira…")).not.toBeInTheDocument();
  });
  it("opens scheduling from the client with portfolio assignment preserved", async () => {
    mount("clients");
    fireEvent.click(await screen.findByRole("button", { name: "Agendar tarefa" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Horário de São Paulo");
    expect(screen.getByLabelText("Cliente *")).toBeDisabled();
  });
});
