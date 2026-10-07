import { createFileRoute } from "@tanstack/react-router";
import { DeliveryQueue } from "@/components/workspace/DeliveryQueue";
export const Route = createFileRoute("/tecnico")({
  component: DeliveryQueue,
  head: () => ({ meta: [{ title: "Equipe técnica — Ikaros Vision" }] }),
});
