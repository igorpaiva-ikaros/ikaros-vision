import { WhatsAppGroup } from "./WhatsAppGroup";
import { RecordHistory } from "./RecordHistory";
import { useEffect, useState, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "@tanstack/react-router";
import { GripVertical, CalendarClock } from "lucide-react";
import { AREA_GUIDE, STAGE_GUIDE, stageAction, isClosed } from "@/lib/workspace/guidance";
import { Tasks, TaskDialog, type TaskDraft } from "./Tasks";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useBi } from "@/lib/bi-context";
import {
  getOperationState,
  getScheduledTasks,
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
  type OperationTab,
} from "@/lib/workspace/types";
import { PageTitle, Section } from "@/components/bi/primitives";
import { NewClientDialog } from "@/components/bi/NewClientDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
export function Operation({ tab, id }: { tab: OperationTab; id?: string | undefined }) {
  const navigate = useNavigate();
  const { session, profile, includeTests, setIncludeTests, reload } = useBi();
  const qc = useQueryClient();
  const queryKey = ["operation-state", session?.user.id];
  const get = useServerFn(getOperationState);
  const transition = useServerFn(transitionRecord);
  const query = useQuery({
    queryKey,
    queryFn: () => get(),
    enabled: !!profile,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    refetchInterval: 30_000,
    retry: false,
  });
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<{ kind: Entity; client: string; row?: RecordRow } | null>(
    null,
  );
  const [choosingClient, setChoosingClient] = useState(false);
  const [clientEditor, setClientEditor] = useState<NativeClient | null>(null);
  const [busy, setBusy] = useState(false);
  const moving = useRef(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);
  const [production, setProduction] = useState(true);
  const openedId = useRef<string | undefined>(undefined);
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const [stageLimit, setStageLimit] = useState<Record<string, number>>({});
  useEffect(() => {
    setSearch("");
    setChoosingClient(false);
    setEditor(null);
    setClientEditor(null);
    setTaskDraft(null);
    setDragged(null);
    setDropStage(null);
  }, [tab]);
  const clientById = useMemo(
    () => new Map(query.data?.clients.map((c) => [c.id, c]) ?? []),
    [query.data?.clients],
  );
  useEffect(() => {
    if (id && openedId.current !== id && query.data && tab !== "clients" && tab !== "tasks") {
      const row = query.data[tab].find((r) => r.id === id);
      if (row?.client_id) {
        openedId.current = id;
        setEditor({ kind: tab, client: row.client_id, row });
      }
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
  const rows = tab === "clients" || tab === "tasks" ? [] : ds[tab].filter(visible);
  const empty = tab === "clients" ? clients.length === 0 : rows.length === 0;
  async function move(row: RecordRow, stage: string) {
    if (!["demands", "onboardings", "upgrades"].includes(tab) || moving.current || isClosed(row))
      return;
    const kind = tab as "demands" | "onboardings" | "upgrades";
    const action = stageAction(kind, stage, kind === "onboardings" && production);
    if (stage === (kind === "onboardings" && production ? row.current_step : row.stage)) return;
    if (
      action === "cancel" ||
      (action === "complete" &&
        kind === "demands" &&
        (!row.solution?.trim() || !row.client_informed)) ||
      (action === "complete" && kind === "onboardings" && !row.info_complete_at) ||
      (action === "effective" && !row.accepted_at)
    ) {
      if (row.client_id) setEditor({ kind, client: row.client_id, row });
      toast.info(
        action === "cancel"
          ? "Informe o motivo no card para cancelar."
          : action === "effective"
            ? "Registre o aceite antes de efetivar."
            : "Complete as informações no card antes de concluir.",
      );
      return;
    }
    moving.current = true;
    setBusy(true);
    setDragged(null);
    setDropStage(null);
    await qc.cancelQueries({ queryKey });
    const original = qc.getQueryData<OperationState>(queryKey);
    const field =
      kind === "onboardings" && production && action === "step" ? "current_step" : "stage";
    qc.setQueryData<OperationState>(queryKey, (old) =>
      old
        ? {
            ...old,
            [kind]: old[kind].map((r) =>
              r.id === row.id
                ? {
                    ...r,
                    [field]: action === "complete" && kind === "onboardings" ? "Concluído" : stage,
                  }
                : r,
            ),
          }
        : old,
    );
    try {
      const updated = await transition({
        data: { kind, id: row.id, version: row.version, action: action as "move", stage },
      });
      qc.setQueryData<OperationState>(queryKey, (old) =>
        old
          ? { ...old, [kind]: old[kind].map((r) => (r.id === row.id ? { ...r, ...updated } : r)) }
          : old,
      );
      toast.success(`Movido para ${stage}.`);
      reload();
    } catch (e) {
      // Restore only this row, preserving other concurrent cache edits.
      const previous = original?.[kind].find((r) => r.id === row.id);
      if (previous)
        qc.setQueryData<OperationState>(queryKey, (old) =>
          old ? { ...old, [kind]: old[kind].map((r) => (r.id === row.id ? previous : r)) } : old,
        );
      toast.error(e instanceof Error ? e.message : "Não foi possível mover.");
      void query.refetch();
    } finally {
      moving.current = false;
      setBusy(false);
    }
  }
  function card(row: RecordRow) {
    const client = clientById.get(row.client_id ?? "");
    return (
      <article
        key={row.id}
        data-card-id={row.id}
        draggable={!busy && !isClosed(row) && ["demands", "onboardings", "upgrades"].includes(tab)}
        onDragStart={(e) => {
          e.dataTransfer.setData(
            "application/x-ikaros-card",
            JSON.stringify({ id: row.id, kind: tab }),
          );
          e.dataTransfer.effectAllowed = "move";
          setDragged(row.id);
        }}
        onDragEnd={() => {
          setDragged(null);
          setDropStage(null);
        }}
        className={`rounded-xl border border-l-4 bg-card p-3 shadow-sm space-y-2 transition-shadow hover:shadow-md ${dragged === row.id ? "opacity-40" : ""} ${riskFor(row, ds) === "atrasado" ? "border-l-destructive" : riskFor(row, ds) === "em_risco" ? "border-l-warning" : "border-l-primary/60"} ${!isClosed(row) ? "cursor-grab active:cursor-grabbing" : ""}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {ds.people?.find((p) => p.id === row.owner_id)?.full_name ?? profile?.full_name}
          </span>
          {!isClosed(row) && ["demands", "onboardings", "upgrades"].includes(tab) && (
            <GripVertical
              aria-label="Arraste o card para outra etapa"
              className="h-4 w-4 text-muted-foreground"
            />
          )}
        </div>
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
        {client && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-full justify-start px-0 text-xs"
            onClick={() => setTaskDraft({ client: client.id, kind: tab as Entity, record: row.id })}
          >
            <CalendarClock className="mr-1 h-3.5 w-3.5" />
            Agendar tarefa
          </Button>
        )}
        {!isClosed(row) && ["demands", "onboardings", "upgrades"].includes(tab) && (
          <select
            aria-label={`Mover ${row.code}`}
            className={`${selectClass} h-8 text-xs`}
            disabled={busy}
            value={
              tab === "onboardings" && production
                ? (row.current_step ?? ONBOARDING_STEPS[0])
                : (row.stage ?? "")
            }
            onChange={(e) => void move(row, e.target.value)}
          >
            {(tab === "demands"
              ? DEMAND_STAGES
              : tab === "onboardings"
                ? production
                  ? ONBOARDING_STEPS
                  : ONBOARDING_STATUSES
                : UPGRADE_STATUSES
            ).map((stage) => (
              <option key={stage}>{stage}</option>
            ))}
          </select>
        )}
      </article>
    );
  }
  const stages =
    tab === "demands"
      ? DEMAND_STAGES
      : tab === "onboardings"
        ? production
          ? ONBOARDING_STEPS
          : ONBOARDING_STATUSES
        : UPGRADE_STATUSES;
  return (
    <>
      <PageTitle
        title={["demands", "onboardings", "upgrades"].includes(tab) ? "CRM" : AREA_GUIDE[tab].label}
        subtitle={AREA_GUIDE[tab].description}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => query.refetch()}>
              Atualizar
            </Button>
            {tab === "clients" && <NewClientDialog />}
            {["demands", "onboardings", "upgrades"].includes(tab) && (
              <Button onClick={() => setChoosingClient(true)}>Nova demanda</Button>
            )}
          </div>
        }
      />
      {["demands", "onboardings", "upgrades"].includes(tab) && (
        <Tabs
          value={tab}
          onValueChange={(pipeline) =>
            void navigate({
              to: "/operacao",
              search: { tab: "crm", pipeline: pipeline as "demands" },
            })
          }
          className="mb-5 overflow-x-auto"
        >
          <TabsList
            aria-label="Funis CRM"
            className="h-auto w-full justify-start rounded-none bg-transparent p-0 border-b border-border"
          >
            {(["demands", "onboardings", "upgrades"] as const).map((kind) => (
              <TabsTrigger
                key={kind}
                value={kind}
                className="shrink-0 rounded-none border-b-2 border-transparent px-5 py-3 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-primary/5 data-[state=active]:shadow-none"
              >
                {AREA_GUIDE[kind].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      {tab === "onboardings" && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={production ? "secondary" : "ghost"}
            onClick={() => setProduction(true)}
          >
            Funil de implantação
          </Button>
          <Button
            size="sm"
            variant={!production ? "secondary" : "ghost"}
            onClick={() => setProduction(false)}
          >
            Situação do onboarding
          </Button>
        </div>
      )}
      <Input
        aria-label="Buscar na carteira"
        placeholder="Buscar por nome, cliente ou código"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-5 max-w-lg"
      />
      {id && tab !== "clients" && tab !== "tasks" && !ds[tab].some((r) => r.id === id) && (
        <p role="alert" className="mb-4 text-sm text-muted-foreground">
          Registro não encontrado na sua carteira.
        </p>
      )}
      {empty && tab !== "tasks" && (
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
      {tab === "tasks" ? (
        <Tasks ds={ds} id={id} search={search} open={setTaskDraft} />
      ) : tab === "clients" ? (
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
                  <WhatsAppGroup url={c.whatsapp_group_url} />
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
                              ? "+ Conversa"
                              : "+ Entrega"}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTaskDraft({ client: c.id })}
                  >
                    <CalendarClock className="mr-1 h-4 w-4" />
                    Agendar tarefa
                  </Button>
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
        <div
          className="flex gap-3 overflow-x-auto pb-5 snap-x"
          aria-label={`Kanban ${AREA_GUIDE[tab].label}`}
        >
          {stages.map((stage) => {
            const group = rows.filter(
              (r) =>
                (tab === "onboardings" && production
                  ? isClosed(r)
                    ? "9. Conclusão"
                    : (r.current_step ?? ONBOARDING_STEPS[0])
                  : r.stage) === stage,
            );
            const limit = stageLimit[`${tab}-${stage}`] ?? 30;
            return (
              <section
                key={stage}
                data-stage={stage}
                onDragOver={(e) => {
                  if (dragged && !busy) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropStage(stage);
                  }
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropStage(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  let data;
                  try {
                    data = JSON.parse(e.dataTransfer.getData("application/x-ikaros-card"));
                  } catch {
                    return;
                  }
                  if (data.kind !== tab) return;
                  const row = rows.find((r) => r.id === data.id);
                  if (row) void move(row, stage);
                  setDropStage(null);
                }}
                className={`min-h-64 w-64 shrink-0 snap-start rounded-xl border p-3 transition-colors ${dropStage === stage ? "border-primary bg-primary/10" : "bg-muted/40"}`}
              >
                <h2 className="flex items-start justify-between gap-2 font-sans text-sm font-semibold">
                  <span>{stage}</span>
                  <span className="rounded-full bg-background px-2 text-xs text-muted-foreground">
                    {group.length}
                  </span>
                </h2>
                <p className="mb-3 mt-2 min-h-10 text-xs leading-relaxed text-muted-foreground">
                  {STAGE_GUIDE[stage]}
                </p>
                <div className="space-y-3">{group.slice(0, limit).map(card)}</div>
                {!group.length && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Arraste um card para esta etapa
                  </div>
                )}
                {group.length > limit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() =>
                      setStageLimit((v) => ({ ...v, [`${tab}-${stage}`]: limit + 30 }))
                    }
                  >
                    Mostrar mais {group.length - limit}
                  </Button>
                )}
              </section>
            );
          })}
        </div>
      )}
      {choosingClient && (
        <ClientDemandPicker
          clients={ds.clients.filter((c) => includeTests || !c.is_test)}
          close={() => setChoosingClient(false)}
          select={(client) => {
            setChoosingClient(false);
            setEditor({ kind: "demands", client });
          }}
        />
      )}
      {taskDraft && (
        <TaskDialog
          key={taskDraft.task?.id ?? `${taskDraft.client}-${taskDraft.record ?? ""}`}
          draft={taskDraft}
          ds={ds}
          close={() => setTaskDraft(null)}
        />
      )}
      {editor && (
        <RecordEditor
          key={`${editor.kind}-${editor.row?.id ?? editor.client}`}
          {...editor}
          ds={ds}
          openClient={() => {
            const c = clientById.get(editor.client);
            if (c) setClientEditor(c);
          }}
          openTask={setTaskDraft}
          close={() => setEditor(null)}
        />
      )}
      {clientEditor && (
        <ClientEditor
          products={ds.products ?? []}
          client={clientEditor}
          close={() => setClientEditor(null)}
        />
      )}
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
function LinkedRecordTasks({
  client,
  kind,
  record,
  open,
}: {
  client: string;
  kind: Entity;
  record: string;
  open: (draft: TaskDraft) => void;
}) {
  const { session } = useBi();
  const get = useServerFn(getScheduledTasks);
  const query = useQuery({
    queryKey: ["scheduled-tasks", session?.user.id],
    queryFn: () => get(),
    staleTime: 30000,
    refetchInterval: 30000,
    retry: false,
  });
  const tasks =
    query.data?.filter(
      (t) => t.client_id === client && t.record_kind === kind && t.record_id === record,
    ) ?? [];
  return (
    <section aria-label="Tarefas desta demanda" className="rounded-lg border p-3 space-y-2">
      <h3 className="text-sm font-medium">Tarefas vinculadas</h3>
      {query.isPending ? (
        <p role="status" className="text-xs">
          Carregando tarefas…
        </p>
      ) : query.isError ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => query.refetch()}>
          Tentar carregar tarefas
        </Button>
      ) : !tasks.length ? (
        <p className="text-xs text-muted-foreground">Nenhuma tarefa agendada.</p>
      ) : (
        tasks.map((task) => (
          <Button
            key={task.id}
            type="button"
            variant="ghost"
            className="h-auto w-full justify-start text-left whitespace-normal"
            onClick={() => open({ client, task })}
          >
            <span>
              {task.title}
              <span className="block text-xs text-muted-foreground">
                {dateLabel(task.due_at)} ·{" "}
                {task.status === "completed"
                  ? "Concluída"
                  : task.status === "canceled"
                    ? "Cancelada"
                    : "Pendente"}
              </span>
            </span>
          </Button>
        ))
      )}
    </section>
  );
}
function ClientDemandPicker({
  clients,
  close,
  select,
}: {
  clients: NativeClient[];
  close: () => void;
  select: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const matched = clients.filter((c) =>
    `${c.name} ${c.code}`
      .toLocaleLowerCase("pt-BR")
      .includes(search.trim().toLocaleLowerCase("pt-BR")),
  );
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova demanda</DialogTitle>
          <DialogDescription>Selecione o cliente da sua carteira.</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          aria-label="Pesquisar cliente para nova demanda"
          placeholder="Pesquisar empresa ou código"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="max-h-[45dvh] overflow-y-auto space-y-1" aria-label="Clientes disponíveis">
          {matched.map((c) => (
            <Button
              key={c.id}
              variant="ghost"
              className="h-auto w-full justify-start text-left whitespace-normal"
              onClick={() => select(c.id)}
            >
              <span>
                {c.name}
                <span className="block text-xs text-muted-foreground">{c.code}</span>
              </span>
            </Button>
          ))}
          {!matched.length && (
            <p role="status" className="p-3 text-sm text-muted-foreground">
              Nenhum cliente encontrado na sua carteira.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
function RecordEditor({
  kind,
  client,
  row,
  ds,
  close,
  openClient,
  openTask,
}: {
  kind: Entity;
  client: string;
  row?: RecordRow;
  ds: OperationState;
  close: () => void;
  openClient: () => void;
  openTask: (draft: TaskDraft) => void;
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
            new_plan: row?.new_plan ?? "",
            current_value: row?.current_value ?? 0,
            new_value: row?.new_value ?? 0,
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
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={openClient}>
            Ver cliente
          </Button>
          <WhatsAppGroup url={ds.clients.find((c) => c.id === client)?.whatsapp_group_url} />
          {current && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openTask({ client, kind, record: current.id })}
            >
              <CalendarClock className="h-4 w-4" />
              Agendar tarefa
            </Button>
          )}
        </div>
        {current && (
          <LinkedRecordTasks client={client} kind={kind} record={current.id} open={openTask} />
        )}
        {!current && (
          <p className="text-xs text-muted-foreground">
            Salve a demanda para agendar tarefas vinculadas a ela.
          </p>
        )}
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
                        {(pending(current) ? ONBOARDING_STEPS.slice(0, -1) : ONBOARDING_STEPS).map(
                          (s) => (
                            <option key={s}>{s}</option>
                          ),
                        )}
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
                  <Field label="Novo plano *">
                    <select
                      required
                      className={selectClass}
                      value={values["new_plan"]}
                      onChange={(e) => {
                        update("new_plan", e.target.value);
                        const p = ds.products?.find((p) => p.name === e.target.value);
                        if (p) update("new_value", Number(p.monthly_value));
                      }}
                    >
                      <option value="">Selecione o plano</option>
                      {Array.from(
                        new Set([
                          ...(ds.products ?? []).filter((p) => p.active).map((p) => p.name),
                          ...(row?.new_plan ? [row.new_plan] : []),
                        ]),
                      ).map((name) => (
                        <option key={name}>{name}</option>
                      ))}
                    </select>
                  </Field>
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
function ClientEditor({
  client,
  close,
  products,
}: {
  client: NativeClient;
  close: () => void;
  products: import("@/lib/workspace/types").Product[];
}) {
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
    whatsapp_group_url: client.whatsapp_group_url ?? "",
    product_id: client.product_id ?? null,
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
            {(["name", "contact_name", "contact_email", "contact_phone", "whatsapp"] as const).map(
              (key, i) => (
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
              ),
            )}
            <Field label="Link do grupo (WhatsApp)">
              <Input
                type="url"
                placeholder="https://chat.whatsapp.com/…"
                maxLength={500}
                value={values.whatsapp_group_url}
                onChange={(e) => setValues((v) => ({ ...v, whatsapp_group_url: e.target.value }))}
              />
              <div className="mt-2">
                <WhatsAppGroup url={values.whatsapp_group_url} />
              </div>
            </Field>
            <Field label="Plano contratado">
              <select
                className={selectClass}
                value={values.product_id ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, product_id: e.target.value || null }))}
              >
                <option value="" disabled>
                  {client.plan ? `${client.plan} · cadastro anterior` : "Selecione o plano"}
                </option>
                {products
                  .filter((p) => p.active || p.id === client.product_id)
                  .map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      disabled={!p.active && p.id !== client.product_id}
                    >
                      {p.name}
                      {!p.active ? " · inativo" : ""}
                    </option>
                  ))}
              </select>
            </Field>
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
