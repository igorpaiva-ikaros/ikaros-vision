import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRecordHistory } from "@/lib/workspace.functions";
import { useBi } from "@/lib/bi-context";
import { dateLabel } from "./Operation";
import type { Entity } from "@/lib/workspace/types";
const LABEL: Record<string, string> = {
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
              <p className="text-xs text-muted-foreground">
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
