import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { completeDemandConfirmed } from "@/lib/workspace.functions";
import type { RecordRow } from "@/lib/workspace/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Conclusão pelo responsável quando o cliente confirmou que está funcionando, mesmo com a entrega
 * aguardando validação ou sem publicação registrada. O banco confere responsável, solução e
 * confirmação (complete_demand_confirmed) e avisa o administrador.
 */
export function ConfirmedCompletion({
  row,
  solution,
  disabled,
  done,
}: {
  row: RecordRow;
  solution: string;
  disabled: boolean;
  done: () => void;
}) {
  const complete = useServerFn(completeDemandConfirmed);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(solution);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (text.trim().length < 2) return setError("Informe a solução aplicada.");
    if (confirmation.trim().length < 5)
      return setError("Informe como o cliente confirmou que está funcionando.");
    setBusy(true);
    setError("");
    try {
      await complete({
        data: {
          id: row.id,
          version: row.version,
          solution: text.trim(),
          confirmation: confirmation.trim(),
        },
      });
      toast.success(`${row.code} concluída com a confirmação do cliente.`);
      setOpen(false);
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        type="button"
        size="sm"
        disabled={disabled}
        onClick={() => {
          setText(solution);
          setConfirmation("");
          setError("");
          setOpen(true);
        }}
      >
        Concluir com confirmação do cliente
      </Button>
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Concluir {row.code} com confirmação do cliente</DialogTitle>
            <DialogDescription>
              Use quando o cliente confirmou que está funcionando. A demanda é concluída mesmo sem
              publicação registrada na fila de aprovações, e o administrador recebe um aviso.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Solução aplicada *</span>
            <Textarea value={text} rows={3} onChange={(e) => setText(e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Como o cliente confirmou *</span>
            <Textarea
              value={confirmation}
              rows={3}
              placeholder="Ex.: cliente confirmou no grupo do WhatsApp em 27/10 que a cotação voltou a funcionar."
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Voltar
            </Button>
            <Button type="button" disabled={busy} onClick={() => void submit()}>
              {busy ? "Concluindo…" : "Concluir demanda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
