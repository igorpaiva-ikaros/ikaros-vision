import { Configuration } from "./Configuration";
import { AvatarPicker } from "./AvatarPicker";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getAdminState,
  createMember,
  updateMember,
  resolveImportIssue,
  setRiskWindow,
} from "@/lib/workspace.functions";
import { useBi } from "@/lib/bi-context";
import { PageTitle, Section } from "@/components/bi/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass, dateLabel } from "./Operation";
export function Admin() {
  const { profile, reload, session } = useBi();
  const get = useServerFn(getAdminState);
  const create = useServerFn(createMember);
  const resolve = useServerFn(resolveImportIssue);
  const risk = useServerFn(setRiskWindow);
  const query = useQuery({
    queryKey: ["admin-state", session?.user.id],
    queryFn: () => get(),
    enabled: profile?.role === "admin",
    refetchInterval: 30_000,
    retry: false,
  });
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "cs" as "cs" | "admin" | "technical",
    avatar: null as string | null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [minutes, setMinutes] = useState(60);
  async function perform(work: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
      reload();
      toast.success(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending) return <p role="status">Carregando administração…</p>;
  if (query.isError || !query.data)
    return (
      <Section title="Administração indisponível">
        <Button onClick={() => query.refetch()}>Tentar novamente</Button>
      </Section>
    );
  const ds = query.data;
  const job = ds.jobs[0];
  const healthy = job?.ok && Date.now() - new Date(job.ran_at).getTime() < 12 * 60000;
  return (
    <>
      <PageTitle
        title="Administração"
        subtitle="Contas, carteira compartilhada e regras da operação"
      />
      {error && (
        <p role="alert" className="mb-4 text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Novo colaborador">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                await create({ data: newUser });
                setNewUser({ name: "", email: "", password: "", role: "cs", avatar: null });
              }, "Conta criada. Compartilhe o acesso diretamente com o colaborador.");
            }}
          >
            <fieldset disabled={busy} className="space-y-3">
              <AvatarPicker
                value={newUser.avatar}
                name={newUser.name}
                onChange={(avatar) => setNewUser((v) => ({ ...v, avatar }))}
              />
              <Field label="Nome">
                <Input
                  required
                  minLength={2}
                  value={newUser.name}
                  onChange={(e) => setNewUser((v) => ({ ...v, name: e.target.value }))}
                />
              </Field>
              <Field label="E-mail (login)">
                <Input
                  type="email"
                  required
                  value={newUser.email}
                  onChange={(e) => setNewUser((v) => ({ ...v, email: e.target.value }))}
                />
              </Field>
              <Field label="Senha inicial">
                <Input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={newUser.password}
                  onChange={(e) => setNewUser((v) => ({ ...v, password: e.target.value }))}
                />
              </Field>
              <Field label="Acesso">
                <select
                  className={selectClass}
                  value={newUser.role}
                  onChange={(e) =>
                    setNewUser((v) => ({
                      ...v,
                      role: e.target.value as "cs" | "admin" | "technical",
                    }))
                  }
                >
                  <option value="cs">CS · carteira e produção</option>
                  <option value="admin">Administrador · gestão e contas</option>
                  <option value="technical">Equipe técnica · somente demandas encaminhadas</option>
                </select>
              </Field>
            </fieldset>
            <Button disabled={busy}>Criar conta</Button>
          </form>
        </Section>
        <Section title="Automação de SLA">
          <p className={`text-sm ${healthy ? "text-success" : "text-destructive"}`}>
            {healthy ? "Checagem ativa" : "Checagem sem confirmação recente"}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Última execução: {dateLabel(job?.ran_at)} · a cada 5 minutos
          </p>
          <p className="mt-3 text-sm">
            As regras por categoria estão abaixo. A janela de risco avisa antes do vencimento,
            respeitando a contagem útil ou corrida escolhida para cada obrigação.
          </p>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void perform(() => risk({ data: { minutes } }), "Janela de risco atualizada.");
            }}
          >
            <Field
              label={`Alerta antes do vencimento (atual: ${Number(ds.settings.find((x: any) => x.key === "sla_risk_minutes")?.value ?? 60)} minutos)`}
            >
              <Input
                type="number"
                min={5}
                max={240}
                required
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </Field>
            <Button variant="outline" disabled={busy}>
              Salvar janela de risco
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Avisos internos para o responsável e os administradores, mesmo com o navegador fechado.
            Cadastros de teste não geram avisos.
          </p>
        </Section>
        <Section title="Entregas do mês" className="xl:col-span-2">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <p>
              Relatório de {ds.calendar?.report_month}: <b>{dateLabel(ds.calendar?.report_due)}</b>
            </p>
            <p>
              NF do mês até: <b>{dateLabel(ds.calendar?.invoice_due)}</b>
            </p>
            <p>
              Pagamento previsto: <b>{dateLabel(ds.calendar?.payment_expected)}</b>
            </p>
          </div>
        </Section>
        <Section title="Equipe" className="xl:col-span-2">
          <div className="space-y-4">
            {ds.members.map((m: any) => (
              <MemberRow
                key={`${m.id}-${m.role}-${m.active}-${m.commission_eligible}`}
                member={m}
              />
            ))}
          </div>
        </Section>
        <Section
          title={`Vínculos pendentes da migração · ${ds.issues.length}`}
          className="xl:col-span-2"
        >
          {!ds.issues.length ? (
            <p className="text-sm text-muted-foreground">Nenhum vínculo pendente.</p>
          ) : (
            ds.issues.map((issue: any) => (
              <div key={issue.id} className="grid gap-2 border-b py-3 sm:grid-cols-[1fr_300px]">
                <div>
                  <p className="text-sm font-medium">{issue.title ?? issue.notion_id}</p>
                  <p className="text-xs text-muted-foreground">
                    {issue.source} · {issue.kind}
                  </p>
                </div>
                <select
                  className={selectClass}
                  aria-label={`Vincular ${issue.title ?? issue.id}`}
                  disabled={busy}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value)
                      void perform(
                        () => resolve({ data: { issue: issue.id, client: e.target.value } }),
                        "Vínculo resolvido.",
                      );
                  }}
                >
                  <option value="">Escolha o cliente correto</option>
                  {ds.clients.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ))
          )}
        </Section>
      </div>
      <Configuration
        products={ds.products ?? []}
        policies={ds.policies ?? []}
        reload={() => {
          reload();
          void query.refetch();
        }}
      />
    </>
  );
}
function MemberRow({ member }: { member: any }) {
  const { reload } = useBi();
  const update = useServerFn(updateMember);
  const [values, setValues] = useState({
    id: member.id,
    role: member.role as "admin" | "cs" | "technical",
    active: member.active as boolean,
    commission: member.commission_eligible as boolean,
    name: member.full_name as string,
    avatar: member.avatar_url as string | null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="grid items-center gap-3 rounded border p-3 lg:grid-cols-[1fr_180px_auto_auto_auto]"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          await update({ data: values });
          reload();
          toast.success("Acesso atualizado.");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Não foi possível salvar.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="space-y-2">
        <Field label={`Nome de ${member.full_name}`}>
          <Input
            required
            minLength={2}
            maxLength={200}
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          />
        </Field>
        <AvatarPicker
          value={values.avatar}
          name={values.name}
          onChange={(avatar) => setValues((v) => ({ ...v, avatar }))}
        />
        <p className="text-xs text-muted-foreground">{member.email}</p>
      </div>
      <select
        className={selectClass}
        aria-label={`Acesso de ${member.full_name}`}
        value={values.role}
        disabled={busy}
        onChange={(e) =>
          setValues((v) => ({ ...v, role: e.target.value as "admin" | "cs" | "technical" }))
        }
      >
        <option value="cs">Colaborador CS</option>
        <option value="admin">Administrador</option>
        <option value="technical">Equipe técnica</option>
      </select>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.active}
          disabled={busy}
          onChange={(e) => setValues((v) => ({ ...v, active: e.target.checked }))}
        />
        Ativo
      </label>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.commission}
          disabled={busy}
          onChange={(e) => setValues((v) => ({ ...v, commission: e.target.checked }))}
        />
        Comissão 100%
      </label>
      <Button variant="outline" disabled={busy}>
        Salvar acesso
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive lg:col-span-5">
          {error}
        </p>
      )}
    </form>
  );
}
