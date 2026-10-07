import { createFileRoute } from "@tanstack/react-router";
import { DeliveryQueue } from "@/components/workspace/DeliveryQueue";
export const Route = createFileRoute("/aprovacoes")({
  component: () => <DeliveryQueue approvals />,
  head: () => ({ meta: [{ title: "Aprovações — Ikaros Vision" }] }),
});
