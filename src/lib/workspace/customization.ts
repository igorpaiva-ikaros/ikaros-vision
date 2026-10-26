import { z } from "zod";
import { CATEGORIES, categoryLabel as defaultCategoryLabel } from "../domain/categories";
import { ONBOARDING_STEPS, ONBOARDING_STATUSES, UPGRADE_STATUSES, type Profile } from "./types";
export const STAGES = {
  demands: [
    "Nova",
    "Em triagem",
    "Aguardando informação",
    "Em execução",
    "Encaminhada para desenvolvimento",
    "Aguardando validação",
    "Publicada",
    "Aguardando cliente",
    "Bloqueada",
    "Concluída",
    "Cancelada",
  ],
  onboardings: ONBOARDING_STEPS,
  onboarding_status: ONBOARDING_STATUSES,
  upgrades: UPGRADE_STATUSES,
};
export const PIPELINES = { demands: "Demandas", onboardings: "Onboarding", upgrades: "Upgrades" };
export type Pipeline = keyof typeof PIPELINES;
export type StageGroup = keyof typeof STAGES;
export const AREAS = {
  crm: "CRM",
  clients: "Carteira",
  tasks: "Tarefas",
  changelog: "Histórico de entregas",
  interactions: "Conversas e decisões",
  technical: "Equipe técnica",
};
export interface MemberAccess {
  is_lead: boolean;
  view_team: boolean;
  manage_cs: boolean;
  promote_cs: boolean;
  /** Delegação concedida só pelo administrador; só vale com liderança ativa. */
  manage_demand_transfers?: boolean;
  hidden_areas: string[];
}
export const DEFAULT_ACCESS: MemberAccess = {
  is_lead: false,
  view_team: false,
  manage_cs: false,
  promote_cs: false,
  manage_demand_transfers: false,
  hidden_areas: [],
};
export const accessSchema = z
  .object({
    is_lead: z.boolean(),
    view_team: z.boolean(),
    manage_cs: z.boolean(),
    promote_cs: z.boolean(),
    manage_demand_transfers: z.boolean().optional(),
    hidden_areas: z
      .array(z.enum(["crm", "clients", "tasks", "changelog", "interactions", "technical"]))
      .max(6),
  })
  .strict();
export const can = (
  p: Profile | null,
  capability: "view_team" | "manage_cs" | "promote_cs" | "manage_demand_transfers",
) =>
  p?.role === "admin" || (p?.role === "cs" && !!p.access?.is_lead && !!p.access?.[capability]);
export const areaAllowed = (p: Profile | null, area: string) =>
  p?.role === "admin" ||
  (p?.role === "technical"
    ? area === "technical"
    : p?.role === "cs" && !p.access?.hidden_areas?.includes(area));
const label = z.string().trim().min(2).max(60);
export const presentationSchema = z
  .object({
    labels: z.record(z.string().max(120), label),
    order: z.record(z.string().max(30), z.array(z.string().max(100)).max(30)),
    views: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            label,
            kind: z.enum(["demands", "onboardings", "upgrades"]),
            stages: z.array(z.string().max(100)).max(30),
            categories: z.array(z.string().max(100)).max(8),
          })
          .strict(),
      )
      .max(20),
  })
  .strict()
  .superRefine((v, ctx) => {
    const valid = new Set([
      ...CATEGORIES.map((c) => `category:${c.value}`),
      ...Object.keys(PIPELINES).map((k) => `pipeline:${k}`),
      ...Object.entries(STAGES).flatMap(([k, ss]) => ss.map((s) => `${k}:${s}`)),
    ]);
    if (Object.keys(v.labels).some((k) => !valid.has(k)))
      ctx.addIssue({ code: "custom", message: "Nome interno desconhecido." });
    for (const [k, arr] of Object.entries(v.order)) {
      const allowed = STAGES[k as StageGroup];
      if (!allowed || new Set(arr).size !== arr.length || arr.some((s) => !allowed.includes(s)))
        ctx.addIssue({ code: "custom", message: "Ordem de etapas inválida." });
    }
    if (new Set(v.views.map((x) => x.id)).size !== v.views.length)
      ctx.addIssue({ code: "custom", message: "Funil duplicado." });
    for (const x of v.views)
      if (
        x.stages.some((s) => !STAGES[x.kind].includes(s)) ||
        x.categories.some((s) => !CATEGORIES.some((c) => c.value === s))
      )
        ctx.addIssue({ code: "custom", message: "Selecione etapas e categorias existentes." });
    for (const prefix of ["category:", "pipeline:", ...Object.keys(STAGES).map((k) => k + ":")]) {
      const names = [...valid]
        .filter((k) => k.startsWith(prefix))
        .map((k) =>
          (
            v.labels[k] ||
            (prefix === "category:"
              ? defaultCategoryLabel(k.slice(prefix.length))
              : prefix === "pipeline:"
                ? PIPELINES[k.slice(prefix.length) as Pipeline]
                : k.slice(prefix.length))
          )
            .trim()
            .toLocaleLowerCase("pt-BR"),
        );
      if (new Set(names).size !== names.length)
        ctx.addIssue({ code: "custom", message: "Use nomes diferentes dentro do mesmo grupo." });
    }
  });
export type Presentation = z.infer<typeof presentationSchema>;
export const DEFAULT_PRESENTATION: Presentation = { labels: {}, order: {}, views: [] };
export function displayLabel(
  config: Presentation | undefined,
  group: string,
  key: string,
  fallback = key,
) {
  return config?.labels[`${group}:${key}`] || fallback;
}
export function orderedStages(
  config: Presentation | undefined,
  group: StageGroup,
  available: readonly string[] = STAGES[group],
) {
  return [
    ...(config?.order[group] ?? []).filter((s) => available.includes(s)),
    ...available.filter((s) => !config?.order[group]?.includes(s)),
  ];
}
