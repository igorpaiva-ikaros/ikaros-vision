import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDemandStageTrace } from "@/lib/workspace.functions";
import { useBi } from "@/lib/bi-context";
import { dateLabel } from "./Operation";
import type { RecordRow } from "@/lib/workspace/types";
export const DEMAND_PATH = [
  "Nova",
  "Em triagem",
  "Aguardando informação",
  "Em execução",
  "Encaminhada para desenvolvimento",
  "Aguardando validação",
  "Publicada",
  "Aguardando cliente",
  "Concluída",
];
export function PipelineProgress({
  row,
  disabled,
  onSelect,
}: {
  row: RecordRow;
  disabled: boolean;
  onSelect: (stage: string) => void;
}) {
  const { session } = useBi();
  const get = useServerFn(getDemandStageTrace);
  const query = useQuery({
    queryKey: ["demand-stage-trace", session?.user.id, row.id],
    queryFn: () => get({ data: { id: row.id } }),
    retry: false,
  });
  const normalize = (s: string) =>
    s === "Aguardando aprovação"
      ? "Aguardando validação"
      : s === "Publicada / avisar cliente"
        ? "Publicada"
        : s;
  const current = normalize(row.stage ?? "Nova");
  const visited = new Map((query.data ?? []).map((v) => [normalize(v.stage), v]));
  return (
    <section
      aria-label="Percurso da demanda"
      className="rounded-lg border bg-muted/20 p-3 space-y-3"
    >
      <div className="flex justify-between gap-2 text-xs">
        <span className="font-medium">Percurso da demanda</span>
        <span aria-live="polite">{current}</span>
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-[900px] gap-2">
          {DEMAND_PATH.map((stage) => {
            const visit = visited.get(stage),
              active = current === stage;
            return (
              <button
                type="button"
                key={stage}
                aria-label={`Ir para ${stage}`}
                aria-current={active ? "step" : undefined}
                disabled={disabled || (active && stage !== "Aguardando validação")}
                onClick={() => onSelect(stage)}
                title={
                  visit
                    ? `Passou por esta etapa · ${dateLabel(visit.first_at)}`
                    : active
                      ? "Etapa atual"
                      : "Etapa sem passagem registrada"
                }
                className="group flex-1 min-w-[92px] text-center disabled:cursor-default"
              >
                <span
                  className={`relative block h-1.5 rounded-full mb-3 ${visit || active ? "bg-primary" : "bg-muted"}`}
                >
                  {active && (
                    <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-background bg-primary ring-2 ring-primary" />
                  )}
                </span>
                <span
                  className={`text-[11px] leading-tight block ${active ? "text-primary font-semibold" : visit ? "text-foreground" : "text-muted-foreground"} ${!disabled ? "group-hover:text-primary" : ""}`}
                >
                  {stage}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {query.isError
          ? "Não foi possível carregar o percurso registrado."
          : query.isPending
            ? "Carregando percurso…"
            : "As barras preenchidas indicam a etapa atual e passagens registradas; etapas puladas ficam vazias."}
      </p>
    </section>
  );
}
