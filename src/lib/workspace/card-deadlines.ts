import {
  activeSla,
  type DeliveryRequest,
  type Entity,
  type RecordRow,
  type SlaRow,
  type SlaStatus,
} from "./types";

export type DeadlineTone = "ok" | "risk" | "overdue" | "muted";
export interface CardDeadline {
  key: string;
  label: string;
  text: string;
  tone: DeadlineTone;
  due?: string;
  detail: string;
}
const timestamp = (value?: string | null) => (value ? Date.parse(value) : NaN);
const valid = (value?: string | null): value is string => Number.isFinite(timestamp(value));
const date = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

/** Elapsed clock time to a deadline already calculated by the server's SLA policy. */
export function compactDuration(ms: number) {
  const minutes = Math.floor(Math.abs(ms) / 60_000);
  if (minutes < 1) return "< 1 min";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${rest}min` : `${rest}min`;
}
function countdown(
  key: string,
  label: string,
  due: string,
  now: number,
  state?: SlaStatus,
  riskMinutes?: number,
): CardDeadline {
  const diff = timestamp(due) - now;
  // Corporate risk comes from the server (business/calendar rules and holidays).
  // Only technical forecasts/onboarding use the existing elapsed-time risk window.
  const tone =
    diff < 0
      ? "overdue"
      : state === "em_risco" || (riskMinutes !== undefined && diff <= riskMinutes * 60000)
        ? "risk"
        : "ok";
  const text =
    diff === 0 ? "Vence agora" : `${diff < 0 ? "Atraso" : "Falta"} ${compactDuration(diff)}`;
  return {
    key,
    label,
    text,
    tone,
    due,
    detail: `${label}: ${date(due)} (São Paulo). ${tone === "risk" ? "Em risco. " : ""}Tempo corrido ${diff < 0 ? "desde o vencimento" : "até a data final"}; os prazos oficiais já consideram a regra de SLA cadastrada.`,
  };
}
function notice(
  key: string,
  label: string,
  text: string,
  detail: string,
  tone: DeadlineTone = "muted",
): CardDeadline {
  return { key, label, text, detail, tone };
}

export function cardDeadlines(
  row: RecordRow,
  kind: Entity,
  sla: SlaRow | undefined,
  technical: DeliveryRequest | undefined,
  riskMinutes: number,
  now: number,
): CardDeadline[] {
  if (kind !== "demands" && kind !== "onboardings") return [];
  if (row.canceled_at || row.stage === "Cancelada")
    return [
      notice(
        "closed",
        "Cancelada",
        "Contagem encerrada",
        "Demanda cancelada; nenhum prazo continua contando.",
      ),
    ];
  const closed = !!row.completed_at || ["Concluída", "Concluído"].includes(row.stage ?? "");
  if (kind === "onboardings") {
    if (!valid(row.limit15_due))
      return [
        notice(
          "sla",
          "SLA · implantação",
          "Aguardando dados",
          "O prazo da implantação começa após o registro das informações completas.",
        ),
      ];
    if (closed) return [result("sla", "SLA · implantação", row.limit15_due, row.completed_at)];
    return [countdown("sla", "SLA · implantação", row.limit15_due, now, undefined, riskMinutes)];
  }

  const obligations = [
    {
      label: "SLA · 1ª resposta",
      due: row.first_response_due ?? sla?.first_response_due,
      done: row.first_response_at,
      state: sla?.first_response_state,
      applies: row.scope !== "system",
    },
    {
      label: "SLA · solução",
      due: row.resolution_due ?? sla?.resolution_due,
      done: row.forwarded_at || row.completed_at,
      state: sla?.resolution_state,
      applies: true,
    },
    {
      label: "SLA · entrega",
      due: row.policy_delivery_due ?? sla?.delivery_due,
      done: row.completed_at,
      state: sla?.delivery_state,
      applies: true,
    },
  ].filter((o) => o.applies);
  const pending = obligations
    .filter((o) => valid(o.due) && !o.done && !closed)
    .sort((a, b) => timestamp(a.due) - timestamp(b.due));
  const next = pending[0];
  const indicators: CardDeadline[] = [];
  if (next && valid(next.due)) {
    const indicator = countdown("sla", next.label, next.due, now, next.state);
    indicator.detail +=
      " Solução inclui encaminhamento técnico. Mostra o prazo pendente mais antigo. " +
      pending.map((o) => `${o.label}: ${date(o.due!)}.`).join(" ");
    indicators.push(indicator);
  } else {
    const status = activeSla(obligations.map((o) => o.state));
    const hasDeadline = obligations.some((o) => valid(o.due));
    const late =
      status === "cumprido_atrasado" ||
      obligations.some(
        (o) => valid(o.due) && valid(o.done) && timestamp(o.done) > timestamp(o.due),
      );
    indicators.push(
      notice(
        "sla",
        "SLA",
        !hasDeadline
          ? "Sem prazo"
          : late
            ? "Atendido com atraso"
            : closed
              ? "Encerrado"
              : "Etapas atendidas",
        !hasDeadline
          ? "Nenhum prazo oficial disponível neste cadastro; não é possível afirmar que está no prazo."
          : "Nenhum prazo oficial pendente. Os resultados de cada obrigação permanecem no registro da demanda.",
        late ? "overdue" : "muted",
      ),
    );
  }
  const label = row.scope === "system" ? "Planejado" : "Cliente";
  if (valid(row.due_date)) {
    const indicator = closed
      ? result("promise", label, row.due_date, row.completed_at)
      : countdown("promise", label, row.due_date, now, sla?.promise_state);
    indicator.detail += " Compromisso de entrega separado do SLA da empresa.";
    if (valid(row.original_promise_due) && row.original_promise_due !== row.due_date)
      indicator.detail += ` Prazo original: ${date(row.original_promise_due)}. Alterações e justificativas estão no histórico.`;
    indicators.push(indicator);
  } else if (!closed) {
    indicators.push(
      notice(
        "promise",
        label,
        row.scope === "system" ? "Sem previsão" : "Sem prazo alinhado",
        "Ainda não há uma previsão de entrega registrada. Isso não altera o SLA oficial.",
      ),
    );
  }
  if (
    !closed &&
    technical?.technical &&
    technical.technical_stage !== "Pronta para validação" &&
    technical.approval_state !== "publicada"
  ) {
    const deadlines = [
      { label: "Técnico · retorno", due: technical.next_update_at },
      { label: "Técnico · entrega", due: technical.delivery_eta },
    ]
      .filter((d) => valid(d.due))
      .sort((a, b) => timestamp(a.due) - timestamp(b.due));
    const next = deadlines[0];
    if (next && valid(next.due))
      indicators.push(countdown("technical", next.label, next.due, now, undefined, riskMinutes));
  }
  return indicators;
}
function result(key: string, label: string, due: string, completed?: string | null): CardDeadline {
  if (!valid(completed))
    return notice(
      key,
      label,
      "Encerrado",
      "Registro encerrado sem data de conclusão; não é possível calcular o resultado.",
    );
  const late = timestamp(completed) > timestamp(due);
  return {
    key,
    label,
    text: late
      ? `Atraso ${compactDuration(timestamp(completed) - timestamp(due))}`
      : "Entregue no prazo",
    tone: late ? "overdue" : "ok",
    due,
    detail: `Prazo: ${date(due)}. Conclusão: ${date(completed)} (São Paulo). Contagem encerrada.`,
  };
}
