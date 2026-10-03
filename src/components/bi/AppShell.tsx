import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BarChart3, ListChecks, Building2, Users, PlugZap, BookOpen, LogOut } from "lucide-react";
import { useBi } from "@/lib/bi-context";
import { supabase } from "@/integrations/supabase/client";
import { PeriodPicker } from "./PeriodPicker";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Visão geral", icon: BarChart3 },
  { to: "/demandas", label: "Demandas", icon: ListChecks },
  { to: "/clientes", label: "Clientes", icon: Building2 },
  { to: "/equipe", label: "Equipe", icon: Users },
  { to: "/integracao", label: "Integração", icon: PlugZap },
  { to: "/ajuda", label: "Ajuda e glossário", icon: BookOpen },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { mode, setMode, includeTests, setIncludeTests, session } = useBi();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="px-6 pb-6 pt-7">
          <div className="font-display text-2xl font-semibold tracking-tight text-sidebar-accent-foreground">
            Ikaros
          </div>
          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-sidebar-primary">
            BI Customer Success
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? path === "/" : path.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_3px_0_0_var(--sidebar-primary)]"
                    : "hover:bg-sidebar-accent/60",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-3 border-t border-sidebar-border px-6 py-5 text-xs">
          {session ? (
            <>
              <div className="truncate opacity-80">{session.user.email}</div>
              <button
                className="flex items-center gap-2 opacity-80 hover:opacity-100"
                onClick={() => supabase.auth.signOut()}
              >
                <LogOut className="h-3.5 w-3.5" /> Sair
              </button>
            </>
          ) : (
            <Link to="/auth" className="text-sidebar-primary hover:underline">
              Entrar (acesso interno)
            </Link>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {mode === "demo" && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-demo px-6 py-2 text-sm text-demo-foreground">
            <span>
              <strong>Modo demonstração</strong> — dados sintéticos, não representam clientes nem números reais.
            </span>
            <Button size="sm" variant="outline" onClick={() => setMode("real")}>
              Sair da demonstração
            </Button>
          </div>
        )}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-card px-6 py-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">CEO</div>
            <div className="font-display text-lg font-semibold">Pedro Manhães</div>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <PeriodPicker />
            <div className="flex items-center gap-2">
              <Switch id="tests" checked={includeTests} onCheckedChange={setIncludeTests} />
              <Label htmlFor="tests" className="text-sm">Incluir testes</Label>
            </div>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b bg-card px-4 py-2 md:hidden">
          {NAV.map(({ to, label }) => (
            <Link key={to} to={to} className="whitespace-nowrap rounded px-2 py-1 text-sm" activeProps={{ className: "bg-secondary font-medium" }} activeOptions={{ exact: to === "/" }}>
              {label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
