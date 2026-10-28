import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { resetMemberPassword } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Administração → Equipe: o administrador define uma nova senha para o usuário quando o acesso
 * antigo não funciona mais. A senha não fica guardada na tela depois do envio.
 */
export function ResetMemberPassword({
  member,
}: {
  member: { id: string; full_name: string; email: string; active: boolean };
}) {
  const reset = useServerFn(resetMemberPassword);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function close() {
    setOpen(false);
    setPassword("");
    setConfirm("");
    setError("");
  }
  async function submit() {
    if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    if (password.length > 128) return setError("A senha pode ter no máximo 128 caracteres.");
    if (password !== confirm) return setError("As duas senhas não são iguais.");
    setBusy(true);
    setError("");
    try {
      const result = await reset({ data: { id: member.id, password } });
      toast.success(
        `Senha de ${member.full_name} redefinida. Passe a nova senha diretamente à pessoa.`,
      );
      if (!result.audited)
        toast.warning("A senha foi trocada, mas o registro no histórico não foi gravado.");
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível redefinir a senha.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-1"
        onClick={() => setOpen(true)}
      >
        <KeyRound className="h-4 w-4" />
        Redefinir senha de {member.full_name}
      </Button>
      <Dialog open={open} onOpenChange={(v) => !busy && (v ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha de {member.full_name}</DialogTitle>
            <DialogDescription>
              Login: {member.email}. A senha antiga deixa de valer assim que você confirmar.
            </DialogDescription>
          </DialogHeader>
          {!member.active && (
            <p role="note" className="rounded border border-warning/40 bg-warning/10 p-2 text-sm">
              Esta conta está inativa. Marque Ativo e salve o acesso para que o login funcione.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Nova senha</span>
              <Input
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
                disabled={busy}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Confirme a nova senha</span>
              <Input
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
                disabled={busy}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={close}>
                Voltar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Redefinindo…" : "Redefinir senha"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
