import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Operation } from "@/components/workspace/Operation";
export const Route = createFileRoute("/operacao")({
  validateSearch: z.object({
    tab: z
      .enum(["clients", "demands", "onboardings", "upgrades", "interactions", "changelog", "tasks"])
      .catch("clients"),
    id: z.string().uuid().optional(),
  }),
  head: () => ({ meta: [{ title: "Operação — Ikaros Vision" }] }),
  component: () => {
    const { tab, id } = Route.useSearch();
    return <Operation tab={tab} id={id} />;
  },
});
