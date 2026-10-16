import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RecordHistory } from "@/components/workspace/RecordHistory";
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    isError: false,
    isPending: false,
    data: [
      {
        id: "receipt",
        action: "agent_report_received",
        at: "2026-10-17T15:00:00Z",
        actor: "Operador",
        details: {
          external_id: "synthetic:source:1",
          source: { reference: "Documento sintético", documented_on: "2026-10-16" },
        },
      },
      {
        id: "complete",
        action: "agent_report_completed",
        at: "2026-10-17T15:01:00Z",
        actor: "Operador",
        details: {
          source: "O usuário confirmou o atendimento concluído.",
          precision: "date",
          documented_on: "2026-10-16",
          occurred_at: null,
        },
      },
    ],
  }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@/lib/workspace.functions", () => ({ getRecordHistory: vi.fn() }));
vi.mock("@/lib/bi-context", () => ({
  useBi: () => ({ session: { user: { id: "operator" } }, profile: { role: "cs" } }),
}));
vi.mock("@/components/workspace/Operation", () => ({
  dateLabel: (value: string) =>
    value?.length === 10
      ? value.split("-").reverse().join("/")
      : "17/10/2026 · horário de registro",
}));
describe("Report history separates evidence from import time", () => {
  it("shows date-only conclusion and user source without inventing client acceptance or midnight", () => {
    const { container } = render(<RecordHistory id="case" kind="demands" />);
    expect(screen.getByText("Conclusão confirmada pelo usuário")).toBeInTheDocument();
    expect(
      screen.getByText(/Data documentada: 16\/10\/2026; horário não informado/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Não comprova aceite separado da cliente/)).toBeInTheDocument();
    expect(screen.getAllByText(/Registrado em/)).toHaveLength(2);
    expect(container.textContent).not.toContain("00:00");
  });
});
