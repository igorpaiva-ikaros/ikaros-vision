import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { getNotifications, getScheduledTasks } from "@/lib/workspace.functions";
import { useBi } from "@/lib/bi-context";
export function NotificationBell() {
  const { profile, session } = useBi();
  const get = useServerFn(getNotifications);
  const tasks = useServerFn(getScheduledTasks);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    seen.current.clear();
  }, [session?.user.id]);
  const q = useQuery({
    queryKey: ["notifications", session?.user.id],
    queryFn: () => get(),
    enabled: !!profile,
    refetchInterval: 15000,
    staleTime: 10000,
    retry: false,
  });
  const agenda = useQuery({
    queryKey: ["scheduled-tasks", session?.user.id],
    queryFn: () => tasks(),
    enabled: !!profile && profile.role !== "technical",
    refetchInterval: 30000,
    staleTime: 30000,
    retry: false,
  });
  useEffect(() => {
    function announce() {
      for (const t of agenda.data ?? []) {
        const key = `task-${t.id}-${new Date(t.due_at).toISOString()}`;
        if (
          t.status === "pending" &&
          new Date(t.due_at).getTime() <= Date.now() &&
          !seen.current.has(key)
        ) {
          seen.current.add(key);
          toast.info(`Horário da tarefa: ${t.title}`, { id: key, duration: 15000 });
        }
      }
    }
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      announce();
      const next = agenda.data
        ?.filter((t) => t.status === "pending")
        .map((t) => new Date(t.due_at).getTime() - Date.now())
        .filter((ms) => ms > 0)
        .sort((a, b) => a - b)[0];
      if (next !== undefined) timer = setTimeout(schedule, Math.min(next + 50, 2147483647));
    }
    schedule();
    function resume() {
      clearTimeout(timer);
      schedule();
    }
    window.addEventListener("focus", resume);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", resume);
    };
  }, [agenda.data]);
  useEffect(() => {
    for (const n of q.data ?? []) {
      if (n.read_at || n.level !== "reminder") continue;
      const key = `task-${n.entity_id}-${new Date(n.deadline!).toISOString()}`;
      if (!seen.current.has(key)) {
        seen.current.add(key);
        toast.info(n.title, { id: key, duration: 15000 });
      }
    }
  }, [q.data]);
  const count = q.data?.filter((n) => !n.read_at).length ?? 0;
  return (
    <Link
      to="/notificacoes"
      className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm"
      aria-label={`Notificações: ${count} não lidas`}
    >
      <Bell className="h-4 w-4" />
      {count > 0 && (
        <span className="rounded-full bg-destructive px-2 text-xs text-white">{count}</span>
      )}
    </Link>
  );
}
