import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRecordHistory } from "@/lib/workspace.functions";
import { useBi } from "@/lib/bi-context";
import { dateLabel } from "./Operation";
import type { Entity } from "@/lib/workspace/types";
const LABEL: Record<string, string> = {
  delivery_promise: "Prazo de entrega registrado",
  created: "Criado",
  stage_entered: "Etapa inicial",
  submit_validation: "Enviada ao administrador",
  review_validate_publish: "Validada e publicada",
  review_reject: "Ajustes solicitados pelo administrador",
  edited: "Dados alterados",
  first_response: "Primeira resposta",
  forward: "Encaminhado para desenvolvimento",
  publish: "Publicação",
  validate: "Validação pelo cliente",
  complete: "Conclusão",
  cancel: "Cancelamento",
  move: "Mudança de etapa",
  info_complete: "Informações completas recebidas",
  step: "Etapa de onboarding",
  accept: "Aceite",
  effective: "Efetivação",
  lost: "Oportunidade perdida",
  assign: "Carteira transferida",
  resolve_import: "Vínculo da importação confirmado",
  agent_report_received: "Relatório de atendimento recebido",
  agent_report_completed: "Conclusão confirmada pelo usuário",
};
export function RecordHistory({ id, kind }: { id: string; kind: Entity }) {
  const { session, profile } = useBi();
  const get = useServerFn(getRecordHistory);
  const q = useQuery({
    queryKey: ["record-history", session?.user.id, kind, id],
    queryFn: () => get({ data: { id, kind } }),
    enabled: !!profile,
    retry: false,
  });
  return (
    <details className="border-t pt-3">
      <summary className="cursor-pointer text-sm">Histórico</summary>
      <div className="mt-3 space-y-2">
        {q.isError ? (
          <p className="text-xs text-destructive">Não foi possível consultar o histórico.</p>
        ) : q.isPending ? (
          <p className="text-xs">Carregando…</p>
        ) : q.data.length ? (
          q.data.map((h: any) => (
            <div key={h.id} className="border-l pl-3">
              <p className="text-sm">
                {LABEL[h.action] ?? h.action}
                {h.to_value ? ` · ${h.to_value}` : ""}
              </p>
              {h.action === "delivery_promise" && (
                <p className="text-xs">
                  Anterior: {dateLabel(h.details?.before)} · Novo: {dateLabel(h.details?.after)}
                  {h.details?.reason ? ` · Motivo: ${h.details.reason}` : ""}
                </p>
              )}
              {h.action === "agent_report_received" && (
                <p className="text-xs">
                  {h.details?.external_id} · Origem: {h.details?.source?.reference}
                  {h.details?.source?.documented_on
                    ? ` · Data documentada: ${dateLabel(h.details.source.documented_on)}`
                    : ""}
                </p>
              )}
              {h.action === "agent_report_completed" && (
                <p className="text-xs">
                  {h.details?.source}
                  {h.details?.precision === "date"
                    ? ` · Data documentada: ${dateLabel(h.details.documented_on)}; horário não informado.`
                    : ` · Conclusão documentada: ${dateLabel(h.details?.occurred_at)}`}{" "}
                  Orientação sem publicação de software. Não comprova aceite separado da cliente.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {h.action?.startsWith("agent_report_") ? "Registrado em " : ""}
                {dateLabel(h.at)} · {h.actor}
              </p>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">Sem ações registradas.</p>
        )}
      </div>
    </details>
  );
}
