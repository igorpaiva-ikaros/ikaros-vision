import { createFileRoute } from "@tanstack/react-router";
import { Admin } from "@/components/workspace/Admin";
export const Route = createFileRoute("/administracao")({
  head: () => ({ meta: [{ title: "Administração — Ikaros Vision" }] }),
  component: Admin,
});
