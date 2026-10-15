import { useBi } from "@/lib/bi-context";
import { Leadership } from "@/components/workspace/Leadership";
import { createFileRoute } from "@tanstack/react-router";
import { Admin } from "@/components/workspace/Admin";
export const Route = createFileRoute("/administracao")({
  head: () => ({ meta: [{ title: "Administração — Ikaros Vision" }] }),
  component: AdministrationPage,
});

function AdministrationPage() {
  const { profile } = useBi();
  return profile?.role === "admin" ? <Admin /> : <Leadership />;
}
