import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/bi/AuthPage";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Ikaros BI CS" },
      { name: "description", content: "Acesso interno ao BI de Customer Success do Ikaros." },
      { property: "og:title", content: "Entrar — Ikaros BI CS" },
      { property: "og:description", content: "Acesso interno ao BI de CS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

