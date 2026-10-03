import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { refreshNotion } from "@/lib/bi.functions";
import { useBi } from "@/lib/bi-context";
import { Button } from "@/components/ui/button";

export function RefreshButton() {
  const run = useServerFn(refreshNotion);
  const { reload, mode, session } = useBi();
  const [busy, setBusy] = useState(false);
  if (mode === "demo" || !session) return null;
  return (
    <Button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await run();
          if (r.ok) toast.success(`Sincronizado: ${r.message}`);
          else toast.error(`Falha na sincronização: ${r.message}`);
        } catch {
          toast.error("Falha na sincronização.");
        } finally {
          setBusy(false);
          reload();
        }
      }}
    >
      <RefreshCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
      Atualizar agora
    </Button>
  );
}
