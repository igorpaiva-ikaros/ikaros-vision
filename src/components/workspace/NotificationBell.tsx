import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";
import { getNotifications } from "@/lib/workspace.functions";
import { useBi } from "@/lib/bi-context";
export function NotificationBell() {
  const { profile, session } = useBi();
  const get = useServerFn(getNotifications);
  const q = useQuery({
    queryKey: ["notifications", session?.user.id],
    queryFn: () => get(),
    enabled: !!profile,
    refetchInterval: 30_000,
    retry: false,
  });
  const count = q.data?.filter((n: any) => !n.read_at).length ?? 0;
  return (
    <a
      href="/notificacoes"
      className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm"
      aria-label={`Notificações: ${count} não lidas`}
    >
      <Bell className="h-4 w-4" />
      {count > 0 && (
        <span className="rounded-full bg-destructive px-2 text-xs text-white">{count}</span>
      )}
    </a>
  );
}
