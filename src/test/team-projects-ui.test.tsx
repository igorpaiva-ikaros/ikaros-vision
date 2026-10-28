import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TeamProjects } from "@/components/workspace/TeamProjects";
import type { TeamProjectsState } from "@/lib/workspace/team-projects";

const me = "00000000-0000-4000-8000-000000000001";
const helper = "00000000-0000-4000-8000-000000000002";
const project = "00000000-0000-4000-8000-000000000101";
const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  get: vi.fn(),
  detail: vi.fn(),
  save: vi.fn(),
  move: vi.fn(),
  saveStep: vi.fn(),
  removeStep: vi.fn(),
  reorder: vi.fn(),
  setDone: vi.fn(),
  post: vi.fn(),
  register: vi.fn(),
  profile: { id: "", role: "cs", full_name: "" } as { id: string; role: string; full_name: string },
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: any) => fn }));
vi.mock("@/lib/team-projects.functions", () => ({
  getTeamProjects: mocks.get,
  getTeamProjectDetail: mocks.detail,
  saveTeamProject: mocks.save,
  moveTeamProject: mocks.move,
  saveTeamProjectStep: mocks.saveStep,
  removeTeamProjectStep: mocks.removeStep,
  reorderTeamProjectSteps: mocks.reorder,
  setTeamProjectStepDone: mocks.setDone,
  postTeamProjectMessage: mocks.post,
  registerTeamProjectFile: mocks.register,
}));
vi.mock("@/lib/bi-context", () => ({
  useBi: () => ({ session: { user: { id: mocks.profile.id } }, profile: mocks.profile }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({ error: null })),
        remove: vi.fn(async () => ({ error: null })),
        createSignedUrl: vi.fn(async () => ({
          data: { signedUrl: "https://example.test/f" },
          error: null,
        })),
      }),
    },
  },
}));

const state = (): TeamProjectsState => ({
  members: [
    { id: me, full_name: "Igor CS" },
    { id: helper, full_name: "Eduardo CS" },
  ],
  projects: [
    {
      id: project,
      code: "PRJ-00001",
      title: "Central de projetos",
      context: "Organizar as pautas do time",
      status: "em_andamento",
      priority: "Alta",
      owner_id: me,
      created_by: me,
      start_date: "2026-10-01",
      due_date: "2026-10-20",
      completed_at: null,
      canceled_at: null,
      cancel_reason: null,
      visibility: "team",
      version: 4,
      created_at: "2026-10-01T12:00:00Z",
      updated_at: "2026-10-02T12:00:00Z",
    },
  ],
  participants: [],
  steps: [
    {
      id: "00000000-0000-4000-8000-000000000201",
      project_id: project,
      position: 1,
      title: "Desenho",
      description: null,
      assignee_id: me,
      due_date: null,
      done_at: "2026-10-03T12:00:00Z",
      done_by: me,
    },
    {
      id: "00000000-0000-4000-8000-000000000202",
      project_id: project,
      position: 2,
      title: "Implementação",
      description: null,
      assignee_id: helper,
      due_date: null,
      done_at: null,
      done_by: null,
    },
  ],
});
function mount(selected?: string) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TeamProjects selected={selected} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.profile = { id: me, role: "cs", full_name: "Igor CS" };
  mocks.get.mockResolvedValue(state());
  mocks.detail.mockResolvedValue({
    files: [],
    activity: [
      {
        id: "00000000-0000-4000-8000-000000000301",
        project_id: project,
        kind: "created",
        actor_id: me,
        actor_name: "Igor CS",
        body: "Projeto criado",
        file_id: null,
        created_at: "2026-10-01T12:00:00Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000302",
        project_id: project,
        kind: "message",
        actor_id: helper,
        actor_name: "Eduardo CS",
        body: "Comecei a implementação",
        file_id: null,
        created_at: "2026-10-02T15:30:00Z",
      },
    ],
  });
  mocks.save.mockResolvedValue({
    ...state().projects[0],
    id: "00000000-0000-4000-8000-000000000199",
    code: "PRJ-00002",
  });
  mocks.move.mockResolvedValue({});
  mocks.setDone.mockResolvedValue({});
  mocks.post.mockResolvedValue({});
});

describe("Equipe → Projetos", () => {
  it("mostra o quadro por situação, progresso e o projeto atrasado em atenção", async () => {
    mount();
    expect(await screen.findByRole("heading", { name: "Projetos da equipe" })).toBeVisible();
    const column = screen.getByRole("region", { name: "Em andamento" });
    expect(within(column).getByText("Central de projetos")).toBeVisible();
    expect(within(column).getByText("1/2 etapas")).toBeVisible();
    expect(within(column).getByText(/Agora: Implementação · Eduardo CS/)).toBeVisible();
    expect(screen.getByRole("region", { name: "Projetos que pedem atenção" })).toHaveTextContent(
      "PRJ-00001",
    );
    expect(screen.queryByRole("region", { name: "Cancelado" })).not.toBeInTheDocument();
  });

  it("cria projeto com responsável, prazo e etapas na ordem desenhada", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Novo projeto/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Título *"), {
      target: { value: "Integração do CRM com o onboarding" },
    });
    fireEvent.change(within(dialog).getByLabelText("Prazo de entrega"), {
      target: { value: "2026-11-30" },
    });
    fireEvent.change(within(dialog).getByLabelText("Nome da etapa 1"), {
      target: { value: "Mapear campos" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Adicionar etapa/ }));
    fireEvent.change(within(dialog).getByLabelText("Nome da etapa 2"), {
      target: { value: "Implementar envio" },
    });
    fireEvent.change(within(dialog).getByLabelText("Responsável pela etapa 2"), {
      target: { value: helper },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Subir etapa 2" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Criar projeto" }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({
        data: {
          id: null,
          version: 0,
          values: expect.objectContaining({
            title: "Integração do CRM com o onboarding",
            owner_id: me,
            due_date: "2026-11-30",
            steps: [
              { title: "Implementar envio", assignee_id: helper, due_date: null },
              { title: "Mapear campos", assignee_id: null, due_date: null },
            ],
          }),
        },
      }),
    );
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/projetos",
      search: { id: "00000000-0000-4000-8000-000000000199" },
    });
  });

  it("cria projeto visível só para participantes, com participante escolhido", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Novo projeto/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Título *"), {
      target: { value: "Pauta restrita" },
    });
    fireEvent.change(within(dialog).getByLabelText("Quem vê o projeto"), {
      target: { value: "participants" },
    });
    expect(within(dialog).getByText(/Administradores sempre veem/)).toBeVisible();
    const group = within(dialog).getByRole("group", { name: "Participantes do projeto" });
    fireEvent.click(within(group).getByLabelText("Eduardo CS"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Criar projeto" }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({
        data: {
          id: null,
          version: 0,
          values: expect.objectContaining({
            title: "Pauta restrita",
            visibility: "participants",
            participants: [helper],
          }),
        },
      }),
    );
  });

  it("detalhe mostra quem vê e os participantes; edição envia visibilidade e participantes", async () => {
    mocks.get.mockResolvedValue({
      ...state(),
      projects: [{ ...state().projects[0]!, visibility: "participants" }],
      participants: [{ project_id: project, user_id: helper }],
      steps: [],
    });
    mount(project);
    const dialog = await screen.findByRole("dialog");
    const who = within(dialog).getByLabelText("Quem vê o projeto");
    expect(who).toHaveTextContent("Quem vê: Só participantes");
    expect(who).toHaveTextContent("Participantes: Igor CS, Eduardo CS");
    expect(who).toHaveTextContent("administradores também veem");
    fireEvent.click(within(dialog).getByRole("button", { name: /Editar dados/ }));
    const edit = screen.getByRole("dialog", { name: "Editar PRJ-00001" });
    const group = within(edit).getByRole("group", { name: "Participantes do projeto" });
    expect(within(group).getByLabelText("Eduardo CS")).toBeChecked();
    fireEvent.click(within(group).getByLabelText("Eduardo CS"));
    fireEvent.change(within(edit).getByLabelText("Quem vê o projeto"), {
      target: { value: "team" },
    });
    fireEvent.click(within(edit).getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({
        data: {
          id: project,
          version: 4,
          values: expect.objectContaining({ visibility: "team", participants: [] }),
        },
      }),
    );
  });

  it("não envia projeto sem título", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Novo projeto/ }));
    fireEvent.click(screen.getByRole("button", { name: "Criar projeto" }));
    expect(await screen.findByText(/Informe o título do projeto/)).toBeVisible();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("detalhe mostra etapas e conversa; gerente conclui etapa e envia mensagem", async () => {
    mount(project);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Central de projetos" })).toBeVisible();
    expect(await within(dialog).findByText("Comecei a implementação")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: /Editar dados/ })).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Concluir etapa Implementação" }));
    await waitFor(() =>
      expect(mocks.setDone).toHaveBeenCalledWith({
        data: {
          project,
          version: 4,
          step: "00000000-0000-4000-8000-000000000202",
          done: true,
        },
      }),
    );
    fireEvent.change(within(dialog).getByLabelText("Mensagem para o time"), {
      target: { value: "  Revisão amanhã às 10h  " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar mensagem" }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith({ data: { project, body: "Revisão amanhã às 10h" } }),
    );
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Mensagem para o time")).toHaveValue(""),
    );
  });

  it("quem só tem etapa não edita o projeto nem conclui etapa de outra pessoa", async () => {
    mocks.profile = { id: helper, role: "cs", full_name: "Eduardo CS" };
    mount(project);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: /Editar dados/ })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Adicionar etapa" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Reabrir etapa Desenho" })).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Concluir etapa Implementação" }),
    ).toBeEnabled();
    const status = within(dialog).getByLabelText("Situação do projeto");
    expect(within(status).queryByRole("option", { name: "Concluído" })).not.toBeInTheDocument();
    expect(within(status).getByRole("option", { name: "Em revisão" })).toBeInTheDocument();
  });

  it("cancelar pede motivo antes de gravar", async () => {
    mount();
    fireEvent.change(await screen.findByLabelText("Mover PRJ-00001"), {
      target: { value: "cancelado" },
    });
    expect(mocks.move).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Cancelar projeto" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Motivo do cancelamento *"), {
      target: { value: "Prioridade mudou" },
    });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(mocks.move).toHaveBeenCalledWith({
        data: { id: project, version: 4, status: "cancelado", reason: "Prioridade mudou" },
      }),
    );
  });
});
