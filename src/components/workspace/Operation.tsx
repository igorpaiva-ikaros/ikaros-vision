import { RecordHistory } from "./RecordHistory";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useBi } from "@/lib/bi-context";
import {
  getOperationState,
  saveRecord,
  transitionRecord,
  updateClientContact,
} from "@/lib/workspace.functions";
import {
  ENTITY_LABEL,
  ONBOARDING_STEPS,
  ONBOARDING_STATUSES,
  UPGRADE_STATUSES,
  SLA_LABEL,
  activeSla,
  type Entity,
  type NativeClient,
  type RecordRow,
  type OperationState,
} from "@/lib/workspace/types";
import { PageTitle, Section } from "@/components/bi/primitives";
import { NewClientDialog } from "@/components/bi/NewClientDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export const DEMAND_STAGES = [
  "Nova",
  "Em triagem",
  "Aguardando informação",
  "Em execução",
  "Aguardando validação",
  "Encaminhada para desenvolvimento",
  "Publicada",
  "Aguardando cliente",
  "Bloqueada",
  "Concluída",
  "Cancelada",
];
export const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
export function dateLabel(value: unknown) {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value)))
    return String(value).split("-").reverse().join("/");
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}
function money(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function title(row: RecordRow) {
  return row.title ?? row.summary ?? row.code;
}
function pending(row: RecordRow) {
  return !["Concluída", "Cancelada", "Concluído", "Efetivado", "Perdido"].includes(row.stage ?? "");
}
export function riskFor(row: RecordRow, ds: OperationState) {
  if (row.stage === "Cancelada") return "sem_registro" as const;
  const sla = ds.sla.find((x) => x.id === row.id);
  if (sla) return activeSla([sla.first_response_state, sla.resolution_state, sla.delivery_state]);
  if (!pending(row))
    return row.completed_at &&
      row.limit15_due &&
      new Date(String(row.completed_at)) > new Date(String(row.limit15_due))
      ? ("cumprido_atrasado" as const)
      : ("cumprido" as const);
  if (row.limit15_due) {
    const diff = new Date(String(row.limit15_due)).getTime() - Date.now();
    return diff < 0 ? "atrasado" : diff < ds.riskMinutes * 60000 ? "em_risco" : "no_prazo";
  }
  return "sem_dados" as const;
}
export function SlaBadge({ row, ds }: { row: RecordRow; ds: OperationState }) {
  const status = riskFor(row, ds);
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-xs ${status === "atrasado" ? "border-destructive text-destructive" : status === "em_risco" ? "border-warning text-warning" : "text-muted-foreground"}`}
    >
      {SLA_LABEL[status]}
    </span>
  );
}
export function Operation({ tab, id }: { tab: "clients" | Entity; id?: string | undefined }) {
  const { session, profile, includeTests, setIncludeTests, reload } = useBi();
  const get = useServerFn(getOperationState);
  const transition = useServerFn(transitionRecord);
  const query = useQuery({
    queryKey: ["operation-state", session?.user.id],
    queryFn: () => get(),
    enabled: !!profile,
    refetchInterval: 30_000,
    retry: false,
  });
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<{ kind: Entity; client: string; row?: RecordRow } | null>(
    null,
  );
  const [clientEditor, setClientEditor] = useState<NativeClient | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (id && query.data && tab !== "clients") {
      const row = query.data[tab].find((r) => r.id === id);
      if (row?.client_id) setEditor({ kind: tab, client: row.client_id, row });
    }
  }, [id, tab, query.data?.clients]);
  const ds = query.data!;
  if (query.isPending) return <p role="status">Carregando sua carteira…</p>;
  if (query.isError || !ds)
    return (
      <Section title="Não foi possível carregar">
        <Button onClick={() => query.refetch()}>Tentar novamente</Button>
      </Section>
    );
  const clientById = new Map(ds.clients.map((c) => [c.id, c]));
  const clients = ds.clients.filter(
    (c) =>
      (includeTests || !c.is_test) &&
      `${c.name} ${c.code}`.toLowerCase().includes(search.toLowerCase()),
  );
  const visible = (row: RecordRow) =>
    (includeTests || (!row.is_test && !clientById.get(row.client_id ?? "")?.is_test)) &&
    `${title(row)} ${row.code} ${clientById.get(row.client_id ?? "")?.name ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
  const rows = tab === "clients" ? [] : ds[tab].filter(visible);
  const empty = tab === "clients" ? clients.length === 0 : rows.length === 0;
  async function move(row: RecordRow, stage: string) {
    if (tab === "clients" || tab === "interactions" || tab === "changelog" || busy) return;
    setBusy(true);
    try {
      await transition({
        data: { kind: tab, id: row.id, version: row.version, action: "move", stage },
      });
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível mover.");
    } finally {
      setBusy(false);
    }
  }
  function card(row: RecordRow) {
    const client = clientById.get(row.client_id ?? "");
    return (
      <div key={row.id} className="rounded-lg border bg-background p-3 shadow-sm space-y-2">
        <button
          className="w-full text-left"
          onClick={() =>
            client
              ? setEditor({ kind: tab as Entity, client: client.id, row })
              : toast.info("O administrador precisa vincular este registro a um cliente.")
          }
        >
          <div className="font-mono text-xs text-muted-foreground">
            {row.code}
            {row.is_test ? " · TESTE" : ""}
          </div>
          <div className="mt-1 font-semibold text-sm">{title(row)}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {client?.name ?? "Vínculo pendente"}
          </div>
        </button>
        {(tab === "demands" || tab === "onboardings") && <SlaBadge row={row} ds={ds} />}
        <div className="text-xs text-muted-foreground">
          {String(row.priority ?? row.current_step ?? row.new_plan ?? "")}
        </div>
        {tab === "upgrades" && <div className="text-sm">{money(row.new_value)} / mês</div>}
        {pending(row) && ["demands", "onboardings", "upgrades"].includes(tab) && (
          <select
            aria-label={`Mover ${row.code}`}
            className={`${selectClass} text-xs`}
            disabled={busy}
            value={row.stage ?? ""}
            onChange={(e) => move(row, e.target.value)}
          >
            {(tab === "demands"
              ? DEMAND_STAGES.slice(0, -2)
              : tab === "onboardings"
                ? ONBOARDING_STATUSES.slice(0, -1)
                : UPGRADE_STATUSES.slice(0, 4)
            ).map((s) => (
              <option key={s}>{s}</option>
            ))}
            {!(
              tab === "demands"
                ? DEMAND_STAGES.slice(0, -2)
                : tab === "onboardings"
                  ? ONBOARDING_STATUSES.slice(0, -1)
                  : UPGRADE_STATUSES.slice(0, 4)
            ).includes(row.stage ?? "") && <option>{row.stage}</option>}
          </select>
        )}
      </div>
    );
  }
  const stages =
    tab === "demands"
      ? DEMAND_STAGES
      : tab === "onboardings"
        ? ONBOARDING_STATUSES
        : UPGRADE_STATUSES;
  return (
    <>
      <PageTitle
        title={tab === "clients" ? "Minha carteira" : ENTITY_LABEL[tab]}
        subtitle={profile?.role === "admin" ? "Consulta da operação · visão do administrador" : ""}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => query.refetch()}>
              Atualizar
            </Button>
            <NewClientDialog />
          </div>
        }
      />
      <Input
        aria-label="Buscar na carteira"
        placeholder="Buscar por nome, cliente ou código"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-5 max-w-lg"
      />
      {id && tab !== "clients" && !ds[tab].some((r) => r.id === id) && (
        <p role="alert" className="mb-4 text-sm text-muted-foreground">
          Registro não encontrado na sua carteira.
        </p>
      )}
      {empty && (
        <Section title="Nenhum registro nesta seleção">
          {!includeTests && ds.clients.some((c) => c.is_test) && (
            <Button variant="outline" onClick={() => setIncludeTests(true)}>
              Mostrar carteira de teste
            </Button>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            Comece pela carteira e abra um cliente para criar o trabalho.
          </p>
        </Section>
      )}
      {tab === "clients" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {clients.map((c) => {
            const risky = ds.demands
              .concat(ds.onboardings)
              .filter(
                (r) => r.client_id === c.id && ["em_risco", "atrasado"].includes(riskFor(r, ds)),
              );
            return (
              <Section key={c.id} title={c.name}>
                <div className="flex flex-wrap justify-between gap-3">
                  <span className="font-mono text-xs">
                    {c.code}
                    {c.is_test ? " · TESTE" : ""}
                  </span>
                  {risky.length > 0 && (
                    <span className="text-destructive text-xs">
                      Em risco · {risky.length} pendência(s) de SLA
                    </span>
                  )}
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  <p>
                    {c.contact_name ?? "Sem contato"} · {c.plan ?? "Plano não informado"}
                  </p>
                  {c.contact_email && (
                    <a className="block underline" href={`mailto:${c.contact_email}`}>
                      {c.contact_email}
                    </a>
                  )}
                  {c.contact_phone && (
                    <a
                      className="block underline"
                      href={`tel:${c.contact_phone.replace(/[^+\d]/g, "")}`}
                    >
                      {c.contact_phone}
                    </a>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(Object.keys(ENTITY_LABEL) as Entity[]).map((kind) => (
                    <Button
                      key={kind}
                      size="sm"
                      variant={kind === "demands" ? "default" : "outline"}
                      onClick={() => setEditor({ kind, client: c.id })}
                    >
                      {kind === "demands"
                        ? "+ Demanda"
                        : kind === "onboardings"
                          ? "+ Onboarding"
                          : kind === "upgrades"
                            ? "+ Upgrade"
                            : kind === "interactions"
                              ? "+ Interação"
                              : "+ Changelog"}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => setClientEditor(c)}>
                    Perfil
                  </Button>
                </div>
              </Section>
            );
          })}
        </div>
      ) : ["interactions", "changelog"].includes(tab) ? (
        <div className="grid gap-3 md:grid-cols-2">{rows.map(card)}</div>
      ) : (
        !empty && (
          <div className="flex gap-4 overflow-x-auto pb-5" aria-label="Kanban">
            {stages.map((stage) => (
              <section key={stage} className="w-72 shrink-0 rounded-lg border bg-muted/30 p-3">
                <h2 className="mb-3 flex justify-between font-sans text-sm font-semibold">
                  {stage}
                  <span className="text-muted-foreground">
                    {rows.filter((r) => r.stage === stage).length}
                  </span>
                </h2>
                <div className="space-y-3">{rows.filter((r) => r.stage === stage).map(card)}</div>
              </section>
            ))}
          </div>
        )
      )}
      {editor && (
        <RecordEditor
          key={`${editor.kind}-${editor.row?.id ?? editor.client}`}
          {...editor}
          ds={ds}
          close={() => setEditor(null)}
        />
      )}
      {clientEditor && <ClientEditor client={clientEditor} close={() => setClientEditor(null)} />}
    </>
  );
}
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
function RecordEditor({
  kind,
  client,
  row,
  ds,
  close,
}: {
  kind: Entity;
  client: string;
  row?: RecordRow;
  ds: OperationState;
  close: () => void;
}) {
  const { reload, profile } = useBi();
  const save = useServerFn(saveRecord);
  const transition = useServerFn(transitionRecord);
  const [values, setValues] = useState<Record<string, any>>(() =>
    kind === "demands"
      ? {
          client_id: client,
          title: row?.title ?? "",
          description: row?.description ?? "",
          priority: row?.priority ?? "Normal",
          classification: row?.classification ?? "Suporte",
          solution: row?.solution ?? "",
          client_informed: row?.client_informed ?? false,
          context: row?.context ?? "",
          tests_run: row?.tests_run ?? "",
          test_result: row?.test_result ?? "",
          due_date: row?.due_date ?? null,
        }
      : kind === "upgrades"
        ? {
            client_id: client,
            title: row?.title ?? "",
            current_plan: row?.current_plan ?? ds.clients.find((c) => c.id === client)?.plan ?? "",
            new_plan: row?.new_plan ?? "Wing",
            current_value: row?.current_value ?? 0,
            new_value: row?.new_value ?? 1197,
            need: row?.need ?? "",
            notes: row?.notes ?? "",
          }
        : kind === "onboardings"
          ? {
              client_id: client,
              title: row?.title ?? "",
              notes: row?.notes ?? "",
              expected_date: row?.expected_date ?? null,
            }
          : kind === "interactions"
            ? {
                client_id: client,
                demand_id: row?.demand_id ?? null,
                summary: row?.summary ?? "",
                channel: row?.channel ?? "WhatsApp",
                problem: row?.problem ?? "",
                decision: row?.decision ?? "",
                next_action: row?.next_action ?? "",
              }
            : {
                client_id: client,
                title: row?.title ?? "",
                description: row?.description ?? "",
                demand_id: row?.demand_id ?? null,
                kind: row?.kind ?? "Correção",
                tests_run: row?.tests_run ?? "",
                result: row?.result ?? "",
                approved: row?.approved ?? false,
                release_version: row?.release_version ?? "",
              },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [reason, setReason] = useState("");
  const update = (key: string, value: unknown) => {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty(true);
    setError("");
  };
  const current = row ? (ds[kind].find((r) => r.id === row.id) ?? row) : undefined;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await save({ data: { kind, id: current?.id, version: current?.version, values } });
      toast.success("Registro salvo.");
      reload();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function action(action: string, stage?: string) {
    if (!current || busy || dirty) return;
    setBusy(true);
    setError("");
    try {
      await transition({
        data: {
          kind: kind as "demands" | "onboardings" | "upgrades",
          id: current.id,
          version: current.version,
          action: action as any,
          stage,
          reason: action === "cancel" ? reason : undefined,
        },
      });
      reload();
      close();
      toast.success("Ação registrada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível registrar.");
    } finally {
      setBusy(false);
    }
  }
  const text = (key: string, label: string, required = false, area = false) => (
    <Field label={label}>
      {area ? (
        <Textarea
          value={values[key] ?? ""}
          required={required}
          onChange={(e) => update(key, e.target.value)}
        />
      ) : (
        <Input
          value={values[key] ?? ""}
          required={required}
          onChange={(e) => update(key, e.target.value)}
        />
      )}
    </Field>
  );
  const select = (key: string, label: string, options: string[]) => (
    <Field label={label}>
      <select
        className={selectClass}
        value={values[key] ?? ""}
        onChange={(e) => update(key, e.target.value)}
      >
        {options.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </Field>
  );
  const eventButton = (label: string, name: string, disabled = false) => (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy || dirty || disabled}
      onClick={() => action(name)}
    >
      {label}
    </Button>
  );
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) close();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {row ? `${row.code} · ${title(row)}` : `Novo registro · ${ENTITY_LABEL[kind]}`}
          </DialogTitle>
          <DialogDescription>
            {ds.clients.find((c) => c.id === client)?.name} ·{" "}
            {ds.people?.find(
              (p) =>
                p.id === (current?.owner_id ?? ds.clients.find((c) => c.id === client)?.owner_id),
            )?.full_name ?? profile?.full_name}
            {current?.stage ? ` · ${current.stage}` : ""}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <fieldset disabled={busy} className="space-y-4">
            {text(
              kind === "interactions" ? "summary" : "title",
              kind === "interactions" ? "Resumo *" : "Nome *",
              true,
            )}
            {kind === "demands" && (
              <>
                {text("description", "Demanda *", true, true)}
                <div className="grid gap-3 sm:grid-cols-2">
                  {select("classification", "Classificação", [
                    "Dúvida",
                    "Suporte",
                    "Bug",
                    "Pequena melhoria",
                    "Demanda complexa",
                    "Configuração",
                    "Onboarding",
                    "Upgrade",
                  ])}
                  {select("priority", "Prioridade", ["Baixa", "Normal", "Alta", "Crítica"])}
                </div>
                {current && (
                  <>
                    <SlaBadge row={current} ds={ds} />
                    <div className="grid gap-2 text-xs sm:grid-cols-2">
                      <span>1ª resposta até {dateLabel(current.first_response_due)}</span>
                      <span>Solução / encaminhamento até {dateLabel(current.resolution_due)}</span>
                    </div>
                    {text("solution", "Solução aplicada", false, true)}
                    <label className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!values["client_informed"]}
                        onChange={(e) => update("client_informed", e.target.checked)}
                      />
                      Cliente informado
                    </label>
                  </>
                )}
                <details>
                  <summary className="cursor-pointer text-sm">
                    Contexto, testes e prazo de entrega
                  </summary>
                  <div className="mt-3 space-y-3">
                    {text("context", "Contexto", false, true)}
                    {text("tests_run", "Testes realizados", false, true)}
                    {text("test_result", "Resultado dos testes", false, true)}
                    <Field label="Prazo de entrega combinado (São Paulo)">
                      <Input
                        type="datetime-local"
                        value={
                          values["due_date"]
                            ? new Intl.DateTimeFormat("sv-SE", {
                                timeZone: "America/Sao_Paulo",
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              })
                                .format(new Date(values["due_date"]))
                                .replace(" ", "T")
                            : ""
                        }
                        onChange={(e) =>
                          update(
                            "due_date",
                            e.target.value
                              ? new Date(`${e.target.value}:00-03:00`).toISOString()
                              : null,
                          )
                        }
                      />
                    </Field>
                  </div>
                </details>
              </>
            )}
            {kind === "onboardings" && (
              <>
                {text("notes", "Observações", false, true)}
                {current && (
                  <>
                    <SlaBadge row={current} ds={ds} />
                    <div className="text-xs space-y-1">
                      <p>
                        Informações completas:{" "}
                        {dateLabel(
                          current.source_date_precision?.includes("info_complete_at")
                            ? String(current.info_complete_at).slice(0, 10)
                            : current.info_complete_at,
                        )}
                      </p>
                      <p>Marco de 5 dias: {dateLabel(current.milestone5_due)}</p>
                      <p>Limite de 15 dias: {dateLabel(current.limit15_due)}</p>
                    </div>
                    <Field label="Etapa de produção">
                      <select
                        className={selectClass}
                        value={String(current.current_step ?? ONBOARDING_STEPS[0])}
                        disabled={busy || dirty || !pending(current)}
                        onChange={(e) => action("step", e.target.value)}
                      >
                        {ONBOARDING_STEPS.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </Field>
                  </>
                )}
                <Field label="Data combinada">
                  <Input
                    type="date"
                    value={values["expected_date"] ?? ""}
                    onChange={(e) => update("expected_date", e.target.value || null)}
                  />
                </Field>
              </>
            )}
            {kind === "upgrades" && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {text("current_plan", "Plano atual")}
                  {select("new_plan", "Novo plano", ["Feather", "Wing", "Sun"])}
                  <Field label="Mensalidade atual (R$)">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={values["current_value"]}
                      onChange={(e) => update("current_value", Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Nova mensalidade contratada (R$)">
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={values["new_value"]}
                      onChange={(e) => update("new_value", Number(e.target.value))}
                    />
                  </Field>
                </div>
                {text("need", "Necessidade do cliente", false, true)}
                {current && (
                  <div className="rounded border p-3 text-sm">
                    Comissão prevista:{" "}
                    {money(ds.commissions.find((c) => c.id === current.id)?.commission_expected)} ·
                    Devida: {money(ds.commissions.find((c) => c.id === current.id)?.commission_due)}
                    <p className="text-xs text-muted-foreground">
                      Pagamento previsto:{" "}
                      {dateLabel(ds.commissions.find((c) => c.id === current.id)?.payment_expected)}
                    </p>
                  </div>
                )}
              </>
            )}
            {["interactions", "changelog"].includes(kind) && (
              <Field label="Demanda relacionada (opcional)">
                <select
                  className={selectClass}
                  value={values["demand_id"] ?? ""}
                  onChange={(e) => update("demand_id", e.target.value || null)}
                >
                  <option value="">Sem demanda relacionada</option>
                  {ds.demands
                    .filter((d) => d.client_id === client)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} · {d.title}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            {kind === "interactions" && (
              <>
                {select("channel", "Canal", [
                  "WhatsApp",
                  "E-mail",
                  "Reunião",
                  "Ligação",
                  "Interno",
                ])}
                {text("problem", "Problema", false, true)}
                {text("decision", "Decisão", false, true)}
                {text("next_action", "Próxima ação", false, true)}
              </>
            )}
            {kind === "changelog" && (
              <>
                {text("description", "O que mudou *", true, true)}
                {select("kind", "Tipo", [
                  "Correção",
                  "Melhoria",
                  "Configuração",
                  "Deploy",
                  "Hotfix",
                ])}
                {text("tests_run", "Testes realizados", false, true)}
                {text("result", "Resultado", false, true)}
                {text("release_version", "Versão")}
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!values["approved"]}
                    onChange={(e) => update("approved", e.target.checked)}
                  />
                  Mudança aprovada
                </label>
              </>
            )}
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={close}>
              Fechar
            </Button>
            <Button disabled={busy}>
              {busy ? "Salvando…" : current ? "Salvar alterações" : "Criar registro"}
            </Button>
          </div>
          {current && pending(current) && ["demands", "onboardings", "upgrades"].includes(kind) && (
            <div className="border-t pt-4 space-y-3">
              {dirty && (
                <p className="text-xs text-muted-foreground">
                  Salve as alterações antes de executar uma ação.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {kind === "demands" && (
                  <>
                    {eventButton(
                      "Registrar 1ª resposta",
                      "first_response",
                      !!current.first_response_at,
                    )}
                    {eventButton("Encaminhar para dev", "forward", !!current.forwarded_at)}
                    {eventButton("Registrar publicação", "publish", !!current.published_at)}
                    {eventButton("Cliente validou", "validate", !!current.validated_at)}
                    {eventButton("Concluir demanda", "complete")}
                  </>
                )}
                {kind === "onboardings" && (
                  <>
                    {eventButton(
                      "Informações completas recebidas",
                      "info_complete",
                      !!current.info_complete_at,
                    )}
                    {eventButton("Concluir onboarding", "complete")}
                  </>
                )}
                {kind === "upgrades" && (
                  <>
                    {eventButton("Registrar aceite", "accept", !!current.accepted_at)}
                    {eventButton("Efetivar upgrade", "effective", !current.accepted_at)}
                    {eventButton("Oportunidade perdida", "lost")}
                  </>
                )}
              </div>
              {kind === "demands" && (
                <details>
                  <summary className="text-sm cursor-pointer">Cancelar demanda</summary>
                  <div className="mt-2 flex gap-2">
                    <Input
                      aria-label="Motivo do cancelamento"
                      placeholder="Motivo obrigatório"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={busy || dirty || !reason.trim()}
                      onClick={() => action("cancel")}
                    >
                      Cancelar
                    </Button>
                  </div>
                </details>
              )}
            </div>
          )}
          {current && <RecordHistory id={current.id} kind={kind} />}
        </form>
      </DialogContent>
    </Dialog>
  );
}
function ClientEditor({ client, close }: { client: NativeClient; close: () => void }) {
  const { reload } = useBi();
  const update = useServerFn(updateClientContact);
  const [values, setValues] = useState({
    id: client.id,
    version: client.version,
    name: client.name,
    contact_name: client.contact_name ?? "",
    contact_email: client.contact_email ?? "",
    contact_phone: client.contact_phone ?? "",
    whatsapp: client.whatsapp ?? "",
    plan: client.plan ?? "",
    notes: client.notes ?? "",
    status: (client.status ?? "Ativo") as "Ativo" | "Atenção" | "Em risco" | "Encerrado",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) close();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{client.code} · Perfil do cliente</DialogTitle>
          <DialogDescription>Contato e informações da carteira</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await update({ data: values });
              reload();
              close();
              toast.success("Perfil atualizado.");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Não foi possível salvar.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} className="space-y-3">
            {(
              [
                "name",
                "contact_name",
                "contact_email",
                "contact_phone",
                "whatsapp",
                "plan",
              ] as const
            ).map((key, i) => (
              <Field
                key={key}
                label={["Nome", "Contato", "E-mail", "Telefone", "WhatsApp", "Plano"][i] ?? key}
              >
                <Input
                  type={key === "contact_email" ? "email" : "text"}
                  value={values[key]}
                  required={key === "name"}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                />
              </Field>
            ))}
            <Field label="Status cadastral">
              <select
                className={selectClass}
                value={values["status"]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, status: e.target.value as (typeof values)["status"] }))
                }
              >
                {["Ativo", "Atenção", "Em risco", "Encerrado"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </fieldset>
          <Field label="Observações para o CS">
            <Textarea
              value={values.notes}
              disabled={busy}
              maxLength={2000}
              onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
            />
          </Field>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <Button disabled={busy}>Salvar perfil</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
