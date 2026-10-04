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
vi.mock("@/integrations/supabase/client", () => ({ backendConfigured: true, supabase: { auth: { signOut: mocks.signOut } } }));
vi.mock("@/components/bi/PeriodPicker", () => ({ PeriodPicker: () => null }));
vi.mock("@/components/bi/RefreshButton", () => ({ RefreshButton: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.path = "/clientes";
  mocks.bi = { authReady: true, session: null, state: { status: "signed_out" }, mode: "real", setMode: vi.fn(), setIncludeTests: vi.fn(), includeTests: false, reload: vi.fn() };
});

describe("Entrada interna", () => {
  it.each(["/", "/clientes", "/demandas", "/integracao", "/equipe", "/ajuda"])("URL direta %s mostra somente login sem sessão", (path) => {
    mocks.path = path;
    render(<AppShell><div>Conteúdo privado</div></AppShell>);
    expect(screen.getByRole("heading", { name: "Entrar no Ikaros Vision" })).toBeVisible();
    expect(screen.queryByText("Conteúdo privado")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Clientes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Explorar demonstração" })).not.toBeInTheDocument();
    expect(mocks.nav).toHaveBeenCalledWith({ to: "/auth", replace: true });
  });

  it("não monta o painel enquanto valida a sessão e a autorização", () => {
    mocks.bi["authReady"] = false;
    render(<AppShell><div>Conteúdo privado</div></AppShell>);
    expect(screen.getByRole("status")).toHaveTextContent("Verificando acesso");
    expect(screen.queryByText("Conteúdo privado")).not.toBeInTheDocument();
  });

  it("demonstração não permite conta sem autorização entrar", () => {
    mocks.bi["session"] = { user: { email: "unapproved@example.com" } };
    mocks.bi["mode"] = "demo";
    mocks.bi["state"] = { status: "forbidden" };
    render(<AppShell><div>Conteúdo privado</div></AppShell>);
    expect(screen.getByRole("heading", { name: "Conta sem permissão interna" })).toBeVisible();
    expect(screen.queryByText("Conteúdo privado")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Explorar demonstração" })).not.toBeInTheDocument();
  });

  it.each(["pedro@ikaros.com.br", "igor.paiva@ikaros.com.br"])("%s recebe todas as telas após autorização", (email) => {
    mocks.bi["session"] = { user: { email } };
    mocks.bi["state"] = { status: "not_configured", missing: ["Conexão Notion"] };
    render(<AppShell><div>Conteúdo privado</div></AppShell>);
    expect(screen.getByText("Conteúdo privado")).toBeVisible();
    for (const name of ["Visão geral", "Demandas", "Clientes", "Equipe", "Integração", "Ajuda e glossário"]) {
      expect(screen.getAllByRole("link", { name }).length).toBeGreaterThan(0);
    }
    fireEvent.click(screen.getAllByRole("button", { name: "Sair" })[0]!);
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});
