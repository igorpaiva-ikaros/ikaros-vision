import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
  type TeamProject,
  type TeamProjectActivity,
  type TeamProjectDetail,
  type TeamProjectFile,
  type TeamProjectsState,
} from "./workspace/team-projects";

const uuid = z.string().uuid();
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
export const projectStepInput = z
  .object({
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(5000).nullable().optional(),
    assignee_id: uuid.nullable().optional(),
    due_date: day.optional(),
  })
  .strict();
export const projectDataInput = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    context: z.string().max(20000).nullable().optional(),
    priority: z.enum(PROJECT_PRIORITIES).optional(),
    owner_id: uuid.optional(),
    start_date: day.optional(),
    due_date: day.optional(),
    steps: z.array(projectStepInput).max(50).optional(),
  })
  .strict()
  .refine((v) => !v.start_date || !v.due_date || v.start_date <= v.due_date, {
    message: "O prazo de entrega precisa ser igual ou posterior ao início.",
  });
const statusKeys = PROJECT_STATUSES.map((s) => s.key) as [
  (typeof PROJECT_STATUSES)[number]["key"],
  ...(typeof PROJECT_STATUSES)[number]["key"][],
];

export const getTeamProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeamProjectsState> => {
    const { teamProjectsState } = await import("./workspace/team-projects.server");
    return teamProjectsState(context);
  });

export const getTeamProjectDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ project: uuid }).strict().parse(d))
  .handler(async ({ context, data }): Promise<TeamProjectDetail> => {
    const { teamProjectDetail } = await import("./workspace/team-projects.server");
    return teamProjectDetail(context, data.project);
  });

async function rpc<T>(context: { supabase: any; userId: string }, fn: string, args: object) {
  const { assertOperator, checkResult } = await import("./workspace/access.server");
  await assertOperator(context);
  return checkResult(await context.supabase.rpc(fn, args)) as T;
}

export const saveTeamProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: uuid.nullable(),
        version: z.number().int().min(0),
        values: projectDataInput,
      })
      .strict()
      .refine((v) => v.id !== null || (!!v.values.title && !!v.values.owner_id), {
        message: "Informe título e responsável.",
      })
      .refine((v) => v.id === null || !v.values.steps, {
        message: "Etapas são editadas no projeto.",
      })
      .parse(d),
  )
  .handler(({ context, data }) =>
    rpc<TeamProject>(context, "save_team_project", {
      _id: data.id,
      _version: data.version,
      _data: data.values,
    }),
  );

export const moveTeamProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: uuid,
        version: z.number().int().positive(),
        status: z.enum(statusKeys),
        reason: z.string().trim().max(2000).optional(),
      })
      .strict()
      .parse(d),
  )
  .handler(({ context, data }) =>
    rpc<TeamProject>(context, "move_team_project", {
      _id: data.id,
      _version: data.version,
      _status: data.status,
      _reason: data.reason ?? null,
    }),
  );

export const saveTeamProjectStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        project: uuid,
        version: z.number().int().positive(),
        step: uuid.nullable(),
        values: projectStepInput,
      })
      .strict()
      .parse(d),
  )
  .handler(({ context, data }) =>
    rpc<TeamProject>(context, "save_team_project_step", {
      _project: data.project,
      _version: data.version,
      _step: data.step,
      _data: data.values,
    }),
  );

export const removeTeamProjectStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ project: uuid, version: z.number().int().positive(), step: uuid }).strict().parse(d),
  )
  .handler(({ context, data }) =>
    rpc<TeamProject>(context, "remove_team_project_step", {
      _project: data.project,
      _version: data.version,
      _step: data.step,
    }),
  );

export const reorderTeamProjectSteps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        project: uuid,
        version: z.number().int().positive(),
        order: z.array(uuid).min(1).max(50),
      })
      .strict()
      .parse(d),
  )
  .handler(({ context, data }) =>
    rpc<TeamProject>(context, "reorder_team_project_steps", {
      _project: data.project,
      _version: data.version,
      _order: data.order,
    }),
  );

export const setTeamProjectStepDone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        project: uuid,
        version: z.number().int().positive(),
        step: uuid,
        done: z.boolean(),
      })
      .strict()
      .parse(d),
  )
  .handler(({ context, data }) =>
    rpc<TeamProject>(context, "set_team_project_step_done", {
      _project: data.project,
      _version: data.version,
      _step: data.step,
      _done: data.done,
    }),
  );

export const postTeamProjectMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ project: uuid, body: z.string().trim().min(1).max(10000) })
      .strict()
      .parse(d),
  )
  .handler(({ context, data }) =>
    rpc<TeamProjectActivity>(context, "post_team_project_message", {
      _project: data.project,
      _body: data.body,
    }),
  );

export const registerTeamProjectFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        project: uuid,
        path: z.string().max(600),
        filename: z.string().min(1).max(250),
        mime: z.string().max(200),
        size: z.number().int().positive().max(52428800),
        note: z.string().trim().max(10000).optional(),
      })
      .strict()
      .parse(d),
  )
  .handler(({ context, data }) =>
    rpc<TeamProjectFile>(context, "register_team_project_file", {
      _project: data.project,
      _path: data.path,
      _filename: data.filename,
      _mime: data.mime,
      _size: data.size,
      _note: data.note ?? null,
    }),
  );
