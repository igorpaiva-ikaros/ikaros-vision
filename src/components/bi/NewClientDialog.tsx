import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createNotionClient, getClientRegistrationOptions } from "@/lib/bi.functions";
import { clientRegistrationSchema, type ClientRegistration } from "@/lib/domain/client-registration";
import { useBi } from "@/lib/bi-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const initial = (): ClientRegistration => ({ requestId: crypto.randomUUID(), name: "", ownerId: "", contactName: "", email: "", phone: "", plan: "", segment: "Consórcio", notes: "", isTest: false });
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

export function NewClientDialog() {
  const { session, mode, state, reload } = useBi();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ClientRegistration>(initial);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const create = useServerFn(createNotionClient);
  const getOptions = useServerFn(getClientRegistrationOptions);
  const options = useQuery({ queryKey: ["client-registration-options", session?.user.id], queryFn: () => getOptions(), enabled: open && mode === "real" && !!session, retry: false, staleTime: 30_000 });
  if (!session || mode === "demo" || state?.status === "forbidden") return null;

  const update = <K extends keyof ClientRegistration>(key: K, value: ClientRegistration[K]) => {
    setData(d => ({ ...d, [key]: value }));
    setError("");
  };
  const ready = !!options.data && options.data.owners.some(o => o.id === data.ownerId);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || !ready) return;
    const parsed = clientRegistrationSchema.safeParse(data);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Confira os campos."); return; }
    submitting.current = true;
    setBusy(true); setError("");
    try {
      const result = await create({ data: parsed.data });
      if (result.ok) {
        toast.success(result.code ? `${result.code}: ${result.message}` : result.message);
        setData(initial()); setUncertain(false); setOpen(false); reload();
      } else { setError(result.message); setUncertain(result.uncertain === true); }
    } catch {
      // Preserve the original request and fields; retry only reconciles it.
      setUncertain(true);
      setError("Não foi possível confirmar o envio. Clique em Confirmar envio antes de cadastrar novamente.");
    } finally { submitting.current = false; setBusy(false); }
  }
  return <>
    <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Novo cliente</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Novo cliente</DialogTitle><DialogDescription>Escolha o responsável pela carteira antes de enviar. O cliente será cadastrado na carteira do CS dentro do Ikaros Vision.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={busy || uncertain} className="space-y-4">
            <div className="space-y-1"><Label htmlFor="client-name">Nome da empresa *</Label><Input id="client-name" value={data.name} onChange={e => update("name", e.target.value)} required maxLength={200} /></div>
            <div className="space-y-1"><Label htmlFor="client-owner">Responsável de CS *</Label><select id="client-owner" className={selectClass} value={data.ownerId} onChange={e => update("ownerId", e.target.value)} required disabled={!options.data}><option value="">Selecione um colaborador</option>{options.data?.owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
            <div className="space-y-1"><Label htmlFor="client-contact">Contato principal *</Label><Input id="client-contact" value={data.contactName} onChange={e => update("contactName", e.target.value)} required maxLength={200} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor="client-email">E-mail do contato</Label><Input id="client-email" type="email" value={data.email} onChange={e => update("email", e.target.value)} maxLength={254} /></div>
              <div className="space-y-1"><Label htmlFor="client-phone">Telefone do contato</Label><Input id="client-phone" type="tel" value={data.phone} onChange={e => update("phone", e.target.value)} maxLength={30} /></div>
            </div>
            <p className="text-xs text-muted-foreground">Informe pelo menos um contato: e-mail ou telefone.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor="client-segment">Segmento *</Label><select id="client-segment" className={selectClass} value={data.segment} onChange={e => update("segment", e.target.value as ClientRegistration["segment"])}>{["Consórcio", "Seguros", "Consórcio e seguros"].map(s => <option key={s}>{s}</option>)}</select></div>
              <div className="space-y-1"><Label htmlFor="client-plan">Plano contratado</Label><select id="client-plan" className={selectClass} value={data.plan} onChange={e => update("plan", e.target.value)}><option value="">Não informado</option>{options.data?.plans.map(p => <option key={p}>{p}</option>)}</select></div>
            </div>
            <div className="space-y-1"><Label htmlFor="client-notes">Observações para o CS</Label><Textarea id="client-notes" value={data.notes} onChange={e => update("notes", e.target.value)} maxLength={2000} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={data.isTest} onChange={e => update("isTest", e.target.checked)} />Cadastro de teste</label>
          </fieldset>
          {options.isLoading && <p role="status" className="text-sm">Carregando colaboradores e planos…</p>}
          {options.isError && <div role="alert" className="text-sm text-destructive">{options.error instanceof Error ? options.error.message : "Não foi possível carregar o cadastro."}<Button type="button" variant="outline" className="mt-2" onClick={() => options.refetch()}>Tentar novamente</Button></div>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Fechar</Button><Button type="submit" disabled={busy || !ready}>{busy ? "Aguarde…" : uncertain ? "Confirmar envio" : "Cadastrar cliente"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
