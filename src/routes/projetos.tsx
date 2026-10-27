import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { TeamProjects } from "@/components/workspace/TeamProjects";
export const Route = createFileRoute("/projetos")({
  validateSearch: z.object({ id: z.string().uuid().optional().catch(undefined) }),
  head: () => ({ meta: [{ title: "Projetos da equipe — Ikaros Vision" }] }),
  component: () => {
    const { id } = Route.useSearch();
    return <TeamProjects selected={id} />;
  },
});
