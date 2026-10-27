import {Leadership} from "@/components/workspace/Leadership";
import {useBi} from "@/lib/bi-context";
import { Concierge } from "@/components/workspace/Concierge";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { Operation } from "@/components/workspace/Operation";
import { DeliveryQueue } from "@/components/workspace/DeliveryQueue";
import { Admin } from "@/components/workspace/Admin";
import { AppShell } from "@/components/bi/AppShell";
import { TeamProjects } from "@/components/workspace/TeamProjects";
import "@/styles.css";
const qc = new QueryClient();
const root = createRootRoute({
  component: () => (
    <QueryClientProvider client={qc}>
      <AppShell>
        <Outlet />
      </AppShell>
      <Toaster />
    </QueryClientProvider>
  ),
});
const operation = createRoute({
  getParentRoute: () => root,
  path: "/operacao",
  validateSearch: (s: any) => ({
    tab: s.tab ?? "clients",
    id: s.id,
    pipeline: s.pipeline ?? "demands",
  }),
  component: () => {
    const { tab, id, pipeline } = operation.useSearch();
    return <Operation tab={(tab === "crm" ? pipeline : tab) as any} id={id} />;
  },
});
const admin = createRoute({ getParentRoute: () => root, path: "/administracao", component: ()=>useBi().profile.role==="admin"?<Admin/>:<Leadership/> });
const tech = createRoute({
  getParentRoute: () => root,
  path: "/tecnico",
  component: () => <DeliveryQueue />,
});
const approvals = createRoute({
  getParentRoute: () => root,
  path: "/aprovacoes",
  component: () => <DeliveryQueue approvals />,
});
const help = createRoute({ getParentRoute: () => root, path: "/ajuda", component: Concierge });
const projects = createRoute({
  getParentRoute: () => root,
  path: "/projetos",
  validateSearch: (s: any) => ({ id: s.id }),
  component: () => <TeamProjects selected={projects.useSearch().id} />,
});
const router = createRouter({
  routeTree: root.addChildren([operation, admin, tech, approvals, help, projects]),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
