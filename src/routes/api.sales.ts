import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/sales")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { receiveSalesWebhook } = await import("@/lib/workspace/sales-intake.server");
        return receiveSalesWebhook(request);
      },
    },
  },
});
