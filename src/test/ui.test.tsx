import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDemoDataset } from "@/lib/demo/dataset";
import { indexClients } from "@/lib/domain/metrics";
import { DemandTable } from "@/components/bi/DemandTable";

afterEach(cleanup);
describe("Tabela de demandas", () => {
  it("busca, limpa filtros e abre descrição e contato do cliente", async () => {
    const ds = buildDemoDataset(new Date("2026-10-03T21:00:00Z"));
    const c = ds.clients[0]!;
    const d = { ...ds.demands[0]!, title: "Demanda de homologação", description: "Falha na comissão", clientIds: [c.id] };
    render(<DemandTable demands={[d]} clients={[c]} clientsById={indexClients([c])} />);
    const input = screen.getByPlaceholderText("Buscar título, ID, cliente…");
    fireEvent.change(input, { target: { value: "não existe" } });
    expect(screen.getByText("Nenhuma demanda com estes filtros.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    fireEvent.click(screen.getByText("Demanda de homologação"));
    expect(await screen.findByRole("dialog")).toBeVisible();
    expect(screen.getByText("Falha na comissão")).toBeVisible();
    expect(screen.getByRole("link", { name: c.emailEmpresa! })).toHaveAttribute("href", `mailto:${c.emailEmpresa}`);
    expect(screen.queryByRole("link", { name: "Abrir no Notion" })).toBeNull();
  });
});
