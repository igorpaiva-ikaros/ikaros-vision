import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AppShell } from "@/components/bi/AppShell";

const mocks = vi.hoisted(() => ({
  path: "/clientes",
  nav: vi.fn(),
  signOut: vi.fn(),
  bi: {} as Record<string, any>,
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.nav,
  useRouterState: ({ select }: any) => select({ location: { pathname: mocks.path } }),
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));
vi.mock("@/lib/bi-context", () => ({ useBi: () => mocks.bi }));
vi.mock("@/integrations/supabase/client", () => ({
  backendConfigured: true,
  supabase: { auth: { signOut: mocks.signOut } },
}));
vi.mock("@/components/workspace/NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("@/components/bi/PeriodPicker", () => ({ PeriodPicker: () => null }));
vi.mock("@/components/bi/RefreshButton", () => ({ RefreshButton: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.path = "/clientes";
  mocks.bi = {
    authReady: true,
    session: null,
    state: { status: "signed_out" },
    mode: "real",
    setMode: vi.fn(),
    setIncludeTests: vi.fn(),
    includeTests: false,
    reload: vi.fn(),
  };
});

describe("Entrada interna", () => {
  it.each(["/", "/clientes", "/demandas", "/integracao", "/equipe", "/ajuda"])(
    "URL direta %s mostra somente login sem sessão",
    (path) => {
      mocks.path = path;
      render(
        <AppShell>
          <div>Conteúdo privado</div>
        </AppShell>,
      );
      expect(screen.getByRole("heading", { name: "Entrar no Ikaros Vision" })).toBeVisible();
      expect(screen.queryByText("Conteúdo privado")).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Clientes" })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Explorar demonstração" }),
      ).not.toBeInTheDocument();
      expect(mocks.nav).toHaveBeenCalledWith({ to: "/auth", replace: true });
    },
  );

  it("não monta o painel enquanto valida a sessão e a autorização", () => {
    mocks.bi["authReady"] = false;
    render(
      <AppShell>
        <div>Conteúdo privado</div>
      </AppShell>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Verificando acesso");
    expect(screen.queryByText("Conteúdo privado")).not.toBeInTheDocument();
  });

  it("demonstração não permite conta sem autorização entrar", () => {
    mocks.bi["session"] = { user: { email: "unapproved@example.com" } };
    mocks.bi["mode"] = "demo";
    mocks.bi["state"] = { status: "forbidden" };
    render(
      <AppShell>
        <div>Conteúdo privado</div>
      </AppShell>,
    );
    expect(screen.getByRole("heading", { name: "Conta sem permissão interna" })).toBeVisible();
    expect(screen.queryByText("Conteúdo privado")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Explorar demonstração" })).not.toBeInTheDocument();
  });

  it("administrador recebe BI e administração", () => {
    mocks.bi["session"] = { user: { email: "admin@example.test" } };
    mocks.bi["profile"] = { role: "admin", full_name: "Gestor" };
    mocks.bi["state"] = { status: "ok" };
    render(
      <AppShell>
        <div>Conteúdo privado</div>
      </AppShell>,
    );
    expect(screen.getByText("Conteúdo privado")).toBeVisible();
    for (const name of [
      "Visão geral",
      "Relatório de demandas",
      "Indicadores de clientes",
      "Resultados do time",
      "Administração",
      "CRM",
      "Concierge",
      "Projetos",
    ])
      expect(screen.getAllByRole("link", { name }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Sair" })[0]!);
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
  it.each(["/", "/clientes", "/administracao", "/integracao"])(
    "CS não monta tela administrativa na URL %s",
    (path) => {
      mocks.path = path;
      mocks.bi["session"] = { user: { id: "cs" } };
      mocks.bi["profile"] = { role: "cs", full_name: "Colaborador" };
      mocks.bi["state"] = { status: "operator" };
      render(
        <AppShell>
          <div>Conteúdo administrativo</div>
        </AppShell>,
      );
      expect(screen.queryByText("Conteúdo administrativo")).not.toBeInTheDocument();
      expect(mocks.nav).toHaveBeenCalledWith({ to: "/operacao", replace: true });
    },
  );
  it("CS recebe somente carteira, produção e notificações", () => {
    mocks.path = "/operacao";
    mocks.bi["session"] = { user: { id: "cs" } };
    mocks.bi["profile"] = { role: "cs", full_name: "Colaborador" };
    mocks.bi["state"] = { status: "operator" };
    render(
      <AppShell>
        <div>Minha produção</div>
      </AppShell>,
    );
    expect(screen.getByText("Minha produção")).toBeVisible();
    expect(screen.queryByLabelText("Mostrar testes")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Carteira" })).not.toHaveLength(0);
    expect(screen.getAllByRole("link", { name: "Projetos" })).not.toHaveLength(0);
    expect(screen.queryByRole("link", { name: "Administração" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Visão geral" })).not.toBeInTheDocument();
  });
  it("CS e equipe técnica abrem Projetos da equipe", () => {
    mocks.path = "/projetos";
    mocks.bi["session"] = { user: { id: "cs" } };
    mocks.bi["profile"] = { role: "cs", full_name: "Colaborador" };
    mocks.bi["state"] = { status: "operator" };
    const view = render(
      <AppShell>
        <div>Quadro de projetos</div>
      </AppShell>,
    );
    expect(screen.getByText("Quadro de projetos")).toBeVisible();
    view.unmount();
    mocks.bi["profile"] = { role: "technical", full_name: "Técnico" };
    render(
      <AppShell>
        <div>Quadro de projetos do técnico</div>
      </AppShell>,
    );
    expect(screen.getByText("Quadro de projetos do técnico")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Projetos" })).not.toHaveLength(0);
    expect(screen.getAllByRole("link", { name: "Equipe técnica" })).not.toHaveLength(0);
    expect(mocks.nav).not.toHaveBeenCalled();
  });
  it("equipe técnica continua fora do CRM, da carteira e da administração", () => {
    mocks.bi["session"] = { user: { id: "tech" } };
    mocks.bi["profile"] = { role: "technical", full_name: "Técnico" };
    mocks.bi["state"] = { status: "operator" };
    for (const path of ["/operacao", "/administracao", "/"]) {
      mocks.path = path;
      const view = render(
        <AppShell>
          <div>Área proibida</div>
        </AppShell>,
      );
      expect(screen.queryByText("Área proibida")).not.toBeInTheDocument();
      expect(mocks.nav).toHaveBeenLastCalledWith({ to: "/tecnico", replace: true });
      expect(screen.queryByRole("link", { name: "Carteira" })).not.toBeInTheDocument();
      view.unmount();
    }
  });
});
