import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Operation } from "@/components/workspace/Operation";
export const Route = createFileRoute("/operacao")({
  validateSearch: z.object({
    tab: z
      .enum([
        "crm",
        "clients",
        "demands",
        "onboardings",
        "upgrades",
        "interactions",
        "changelog",
        "tasks",
      ])
      .catch("clients"),
    pipeline: z.enum(["demands", "onboardings", "upgrades"]).catch("demands"),
    id: z.string().uuid().optional(),
  }),
  head: () => ({ meta: [{ title: "Operação — Ikaros Vision" }] }),
  component: () => {
    const { tab, id, pipeline } = Route.useSearch();
    return <Operation tab={tab === "crm" ? pipeline : tab} id={id} />;
  },
});
