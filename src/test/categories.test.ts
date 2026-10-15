import { describe, expect, it } from "vitest";
import { categoryCounts, categoryKey, categoryLabel } from "@/lib/domain/categories";
import { inPeriod } from "@/lib/domain/period";
describe("Categorias operacionais e histórico", () => {
  it("agrupa suporte legado com dúvida, preserva categorias desconhecidas e zeros", () => {
    const counts = categoryCounts(["Dúvida", "Suporte", "Bug", null, "Legado"], (x) => x);
    expect(counts.find((c) => c.key === "Dúvida")?.value).toBe(2);
    expect(counts.find((c) => c.key === "Bug")?.value).toBe(1);
    expect(counts.find((c) => c.key === "Upgrade")?.value).toBe(0);
    expect(counts.find((c) => c.key === "Sem categoria")?.value).toBe(1);
    expect(counts.reduce((sum, c) => sum + c.value, 0)).toBe(5);
    expect(categoryLabel("Configuração")).toBe("Implantação / configuração");
    expect(categoryKey("Suporte")).toBe(categoryKey("Dúvida"));
  });
  it("compara entradas por recebimento e dia de São Paulo, sem inventar datas", () => {
    const period = { preset: "custom" as const, start: "2026-10-15", end: "2026-10-15" };
    expect(inPeriod("2026-10-16T02:00:00Z", period)).toBe(true);
    expect(inPeriod("2026-10-16T04:00:00Z", period)).toBe(false);
    expect(inPeriod(null, period)).toBe(false);
  });
});
