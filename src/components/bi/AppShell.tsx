import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import {
  BarChart3,
  ListChecks,
  Building2,
  Users,
  PlugZap,
  BookOpen,
  LogOut,
  Bell,
  Settings,
  PanelsTopLeft,
  ArrowUpCircle,
  MessagesSquare,
  History,
  UserPlus,
  CalendarClock,
} from "lucide-react";
import { MemberAvatar } from "@/components/workspace/AvatarPicker";
import { NotificationBell } from "@/components/workspace/NotificationBell";
import { AuthPage } from "./AuthPage";
import { StateGate } from "./StateGate";
import { useBi } from "@/lib/bi-context";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "./BrandLogo";
import { PeriodPicker } from "./PeriodPicker";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
const ADMIN_NAV = [
  { href: "/", label: "Visão geral", icon: BarChart3 },
  { href: "/demandas", label: "Demandas", icon: ListChecks },
  { href: "/clientes", label: "Clientes", icon: Building2 },
  { href: "/equipe", label: "Equipe", icon: Users },
  { href: "/operacao?tab=crm", label: "CRM", icon: PanelsTopLeft },
  { href: "/operacao?tab=clients", label: "Carteira", icon: Building2 },
  { href: "/operacao?tab=changelog", label: "Histórico de entregas", icon: History },
  { href: "/operacao?tab=interactions", label: "Conversas e decisões", icon: MessagesSquare },
  { href: "/administracao", label: "Administração", icon: Settings },
  { href: "/integracao", label: "Migração", icon: PlugZap },
  { href: "/operacao?tab=tasks", label: "Tarefas", icon: CalendarClock },
  { href: "/notificacoes", label: "Notificações", icon: Bell },
  { href: "/ajuda", label: "Ajuda", icon: BookOpen },
];
const CS_NAV = [
  { href: "/operacao?tab=crm", label: "CRM", icon: PanelsTopLeft },
  { href: "/operacao?tab=clients", label: "Carteira", icon: Building2 },
  { href: "/operacao?tab=changelog", label: "Histórico de entregas", icon: History },
  { href: "/operacao?tab=interactions", label: "Conversas e decisões", icon: MessagesSquare },
  { href: "/operacao?tab=tasks", label: "Tarefas", icon: CalendarClock },
];
export function AppShell({ children }: { children: ReactNode }) {
  const location = useRouterState({ select: (s) => s.location });
  const path = location.pathname;
  const nav = useNavigate();
  const { mode, setMode, includeTests, setIncludeTests, session, authReady, state, profile } =
    useBi();
  const isCs = profile?.role === "cs";
  const permitted = !isCs || ["/operacao", "/notificacoes", "/ajuda"].includes(path);
  useEffect(() => {
    if (authReady && !session && path !== "/auth") void nav({ to: "/auth", replace: true });
    else if (session && isCs && !permitted && path !== "/auth")
      void nav({ to: "/operacao", replace: true });
  }, [authReady, session, isCs, permitted, path, nav]);
  if (path === "/auth") return <>{children}</>;
  if (!authReady)
    return (
      <div role="status" className="flex min-h-screen items-center justify-center">
        Verificando acesso…
      </div>
    );
  if (!session) return <AuthPage />;
  if (!state)
    return (
      <div role="status" className="flex min-h-screen items-center justify-center">
        Verificando acesso…
      </div>
    );
  if (state.status === "forbidden" || state.status === "error" || !profile)
    return (
      <div className="min-h-screen p-6">
        <StateGate>{() => null}</StateGate>
        <div className="mt-6 text-center">
          <Button variant="outline" onClick={() => supabase.auth.signOut()}>
            Sair
          </Button>
        </div>
      </div>
    );
  if (!permitted)
    return (
      <div role="status" className="flex min-h-screen items-center justify-center">
        Abrindo sua operação…
      </div>
    );
  const items = isCs ? CS_NAV : ADMIN_NAV;
  const current = location.href;
  const links = (mobile = false) =>
    items.map(({ href, label, icon: Icon }) => (
      <Link
        key={href}
        to={href.split("?")[0] as "/operacao"}
        search={href.includes("?") ? { tab: href.split("tab=")[1] as "clients" } : {}}
        className={cn(
          mobile
            ? "flex items-center gap-2 whitespace-nowrap rounded px-3 py-2 text-sm"
            : "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
          current === href ||
            (href === "/" && path === "/") ||
            (href.includes("?tab=") &&
              path === "/operacao" &&
              (location.search as any)?.tab === href.split("tab=")[1])
            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_3px_0_0_var(--sidebar-primary)]"
            : "hover:bg-sidebar-accent/60",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </Link>
    ));
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="px-6 pb-6 pt-7">
          <BrandLogo className="h-auto w-full max-w-[190px]" />
          <div className="bi-eyebrow mt-4 text-sidebar-primary">
            {isCs ? "OPERAÇÃO CS" : "VISÃO EXECUTIVA"}
          </div>
          <p className="mt-3 text-[10px] tracking-wide text-muted-foreground">
            Ninguém precisa voar sozinho.
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">{links()}</nav>
        <div className="space-y-3 border-t border-sidebar-border px-6 py-5 text-xs">
          <div className="truncate opacity-80">{session.user.email}</div>
          <button
            className="flex items-center gap-2 opacity-80 hover:opacity-100"
            onClick={() => supabase.auth.signOut()}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {mode === "demo" && !isCs && (
          <div className="flex items-center justify-between gap-2 bg-demo px-6 py-2 text-sm text-demo-foreground">
            <span>
              <strong>Modo demonstração</strong> — dados sintéticos.
            </span>
            <Button variant="outline" size="sm" onClick={() => setMode("real")}>
              Sair da demonstração
            </Button>
          </div>
        )}
        <header className="bi-header flex flex-wrap items-center justify-between gap-4 border-b px-6 py-5">
          <div>
            <div className="bi-eyebrow text-muted-foreground">
              {isCs ? "MINHA OPERAÇÃO" : "ADMINISTRAÇÃO"}
            </div>
            <div className="mt-1 flex items-center gap-3">
              <MemberAvatar src={profile.avatar_url} name={profile.full_name} />
              <span className="font-display text-2xl font-normal">{profile.full_name}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <Button
              variant="outline"
              size="sm"
              className="md:hidden"
              onClick={() => supabase.auth.signOut()}
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
            {!isCs && <PeriodPicker />}
            <NotificationBell />
            <div className="flex items-center gap-2">
              <Switch id="tests" checked={includeTests} onCheckedChange={setIncludeTests} />
              <Label htmlFor="tests" className="text-sm">
                Mostrar testes
              </Label>
            </div>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b bg-card px-4 py-2 md:hidden">
          {links(true)}
        </nav>
        <main className="bi-main flex-1 px-4 py-6 sm:px-7 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
