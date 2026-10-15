import { createFileRoute } from "@tanstack/react-router";
import { Concierge } from "@/components/workspace/Concierge";
export const Route = createFileRoute("/ajuda")({
  head: () => ({ meta: [{ title: "Concierge — Ikaros Vision" }] }),
  component: Concierge,
});
