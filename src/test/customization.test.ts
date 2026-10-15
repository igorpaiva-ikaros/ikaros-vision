import { describe, it, expect } from "vitest";
import {
  presentationSchema,
  orderedStages,
  displayLabel,
  can,
  DEFAULT_ACCESS,
} from "@/lib/workspace/customization";
describe("Personalização preserva chaves de negócio", () => {
  it("renomeia sem alterar a chave ou remover etapas da visão completa", () => {
    const c = presentationSchema.parse({
      labels: { "demands:Aguardando validação": "Revisão Pedro" },
      order: { demands: ["Em execução"] },
      views: [],
    });
    expect(displayLabel(c, "demands", "Aguardando validação")).toBe("Revisão Pedro");
    expect(orderedStages(c, "demands")[0]).toBe("Em execução");
    expect(orderedStages(c, "demands")).toContain("Aguardando validação");
  });
  it("recusa identificadores, ordens duplicadas e nomes ambíguos", () => {
    for (const patch of [
      { labels: { "category:Bug": "Pequena melhoria" } },
      { labels: { unknown: "Exemplo" } },
      { order: { demands: ["Nova", "Nova"] } },
      {
        views: [
          { id: "id", label: "Visão", kind: "demands", stages: ["Inventada"], categories: [] },
        ],
      },
    ])
      expect(
        presentationSchema.safeParse({ labels: {}, order: {}, views: [], ...patch }).success,
      ).toBe(false);
  });
  it("cargo de líder não equivale a permissão administrativa", () => {
    const p: any = { role: "cs", access: { ...DEFAULT_ACCESS, is_lead: true, view_team: true } };
    expect(can(p, "view_team")).toBe(true);
    expect(can(p, "manage_cs")).toBe(false);
    expect(can(p, "promote_cs")).toBe(false);
    expect(can({ ...p, access: { ...p.access, is_lead: false } }, "view_team")).toBe(false);
  });
});
