import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AgendaDay } from "@/components/workspace/AgendaDay";
import type { AgendaEvent } from "@/lib/workspace/agenda";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), close: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));

const clientEvent: AgendaEvent = {
  key: "demand:d1",
  day: "2026-10-29",
  group: "clients",
  kind: "demand",
  label: "Entrega combinada",
  code: "DEM-00001",
  title: "Cotação com erro",
  detail: "Corretora Exemplo · Igor Paiva",
  done: false,
  late: true,
  target: { to: "/operacao", search: { tab: "crm", pipeline: "demands", id: "d1" } },
};
const teamEvent: AgendaEvent = {
  key: "project-due:p1",
  day: "2026-10-29",
  group: "team",
  kind: "project-due",
  label: "Entrega do projeto",
  code: "PRJ-00002",
  title: "Codex: framework de atendimento",
  detail: "Projeto · Igor Paiva",
  done: false,
  late: false,
  target: { to: "/projetos", search: { id: "p1" } },
};
beforeEach(() => vi.clearAllMocks());

describe("Agenda do dia", () => {
  it("separa demandas de clientes e time em abas e abre a demanda", () => {
    render(
      <AgendaDay
        day="2026-10-29"
        events={{ clients: [clientEvent], team: [teamEvent] }}
        tasks={2}
        close={mocks.close}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /Agenda de quinta-feira, 29\/10\/2026/ }),
    ).toBeVisible();
    expect(screen.getByText(/2 tarefas agendadas/)).toBeVisible();
    const clients = screen.getByRole("tab", { name: "Demandas de clientes (1)" });
    expect(clients).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Cotação com erro");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Atrasado");
    expect(screen.getByRole("tabpanel")).not.toHaveTextContent("Codex");
    fireEvent.click(screen.getByRole("button", { name: /Cotação com erro/ }));
    expect(mocks.close).toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/operacao",
      search: { tab: "crm", pipeline: "demands", id: "d1" },
    });
  });

  it("aba do time mostra projetos e abre o projeto", () => {
    render(
      <AgendaDay
        day="2026-10-29"
        events={{ clients: [clientEvent], team: [teamEvent] }}
        close={mocks.close}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Time e projetos (1)" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Entrega do projeto");
    expect(screen.getByRole("tabpanel")).not.toHaveTextContent("Cotação com erro");
    fireEvent.click(screen.getByRole("button", { name: /Codex: framework de atendimento/ }));
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/projetos", search: { id: "p1" } });
  });

  it("abre na aba do time quando o dia só tem prazos do time", () => {
    render(
      <AgendaDay
        day="2026-10-29"
        events={{ clients: [], team: [teamEvent] }}
        close={mocks.close}
      />,
    );
    expect(screen.getByRole("tab", { name: "Time e projetos (1)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
