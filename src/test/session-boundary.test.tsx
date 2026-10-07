import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { BiProvider, useBi } from "@/lib/bi-context";

const mocks = vi.hoisted(() => ({
  session: null as any,
  authEvent: null as ((event: string, session: any) => void) | null,
  getState: vi.fn(),
  getAccess: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: any) => fn }));
vi.mock("@/lib/workspace.functions", () => ({ getAccess: mocks.getAccess }));
vi.mock("@/lib/bi.functions", () => ({ getBiState: mocks.getState }));
vi.mock("@/integrations/supabase/client", () => ({
  backendConfigured: true,
  supabase: {
    channel: () => {
      const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
      return channel;
    },
    removeChannel: vi.fn(),
    auth: {
      getSession: async () => ({ data: { session: mocks.session } }),
      onAuthStateChange: (callback: any) => {
        mocks.authEvent = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));

function Probe() {
  const bi = useBi();
  return (
    <>
      <span data-testid="status">{bi.state?.status ?? "pending"}</span>
      <span data-testid="data">{bi.dataset ? "has-data" : "no-data"}</span>
    </>
  );
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BiProvider>
        <Probe />
      </BiProvider>
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.session = null;
  mocks.authEvent = null;
  mocks.getAccess.mockResolvedValue(null);
});

it("modo demo gravado no navegador não libera dados sem sessão", async () => {
  sessionStorage.setItem("ikaros-bi-mode", "demo");
  mount();
  await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed_out"));
  expect(screen.getByTestId("data")).toHaveTextContent("no-data");
  expect(mocks.getState).not.toHaveBeenCalled();
});

it("modo demo não ignora a autorização do servidor", async () => {
  sessionStorage.setItem("ikaros-bi-mode", "demo");
  mocks.session = { user: { id: "unapproved" } };
  mocks.getAccess.mockResolvedValue(null);
  mount();
  await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("forbidden"));
  expect(screen.getByTestId("data")).toHaveTextContent("no-data");
  expect(mocks.getAccess).toHaveBeenCalled();
  expect(mocks.getState).not.toHaveBeenCalled();
});

it("sair remove os dados e a demonstração antes de permitir outra sessão", async () => {
  sessionStorage.setItem("ikaros-bi-mode", "demo");
  mocks.session = { user: { id: "approved" } };
  mocks.getAccess.mockResolvedValue({ id: "approved", role: "admin", active: true });
  mocks.getState.mockResolvedValue({ status: "not_configured", missing: [] });
  const client = mount();
  await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("demo"));
  expect(screen.getByTestId("data")).toHaveTextContent("has-data");
  act(() => mocks.authEvent?.("SIGNED_OUT", null));
  await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed_out"));
  expect(screen.getByTestId("data")).toHaveTextContent("no-data");
  expect(sessionStorage.getItem("ikaros-bi-mode")).toBeNull();
  expect(client.getQueriesData({ queryKey: ["bi-state", "approved"] })).toEqual([]);
});
