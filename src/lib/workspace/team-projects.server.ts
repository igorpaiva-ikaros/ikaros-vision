import type { AuthContext } from "./access.server";
import { assertOperator, checkResult } from "./access.server";
import {
  ACTIVITY_COLUMNS,
  FILE_COLUMNS,
  PROJECT_COLUMNS,
  STEP_COLUMNS,
  type TeamMember,
  type TeamProject,
  type TeamProjectActivity,
  type TeamProjectDetail,
  type TeamProjectFile,
  type TeamProjectStep,
  type TeamProjectsState,
} from "./team-projects";

/** Lê tudo em páginas de 500 (o PostgREST corta em ~1000 linhas sem erro). */
async function pages<T>(
  query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
) {
  const out: T[] = [];
  for (let i = 0; i < 40; i++) {
    const rows = (checkResult(await query(i * 500, (i + 1) * 500 - 1)) ?? []) as T[];
    out.push(...rows);
    if (rows.length < 500) return out;
  }
  throw new Error("A consulta excedeu o limite de registros; nenhuma leitura parcial foi exibida.");
}

export async function teamProjectsState(context: AuthContext): Promise<TeamProjectsState> {
  await assertOperator(context);
  const db = context.supabase;
  const [projects, steps, members] = await Promise.all([
    pages<TeamProject>((from, to) =>
      db.from("team_projects").select(PROJECT_COLUMNS).order("id").range(from, to),
    ),
    pages<TeamProjectStep>((from, to) =>
      db.from("team_project_steps").select(STEP_COLUMNS).order("id").range(from, to),
    ),
    db.rpc("team_project_members"),
  ]);
  return {
    projects,
    steps,
    members: (checkResult(members) ?? []) as TeamMember[],
  };
}

export async function teamProjectDetail(
  context: AuthContext,
  project: string,
): Promise<TeamProjectDetail> {
  await assertOperator(context);
  const db = context.supabase;
  const [activity, files] = await Promise.all([
    pages<TeamProjectActivity>((from, to) =>
      db
        .from("team_project_activity")
        .select(ACTIVITY_COLUMNS)
        .eq("project_id", project)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    pages<TeamProjectFile>((from, to) =>
      db
        .from("team_project_files")
        .select(FILE_COLUMNS)
        .eq("project_id", project)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
  ]);
  return { activity, files };
}
