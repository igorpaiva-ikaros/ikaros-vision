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
import { Admin } from "@/components/workspace/Admin";
import { AppShell } from "@/components/bi/AppShell";
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
  validateSearch: (s: any) => ({ tab: s.tab ?? "clients", id: s.id }),
  component: () => {
    const { tab, id } = operation.useSearch();
    return <Operation tab={tab as any} id={id} />;
  },
});
const admin = createRoute({ getParentRoute: () => root, path: "/administracao", component: Admin });
const router = createRouter({ routeTree: root.addChildren([operation, admin]) });
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
