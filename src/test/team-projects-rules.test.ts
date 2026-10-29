import { describe, expect, it } from "vitest";
import {
  attentionList,
  canCompleteStep,
  canManageProject,
  canMoveProject,
  currentStep,
  daysUntil,
  deadlineSignal,
  participantsOf,
  progress,
  projectPeople,
  projectSignal,
  saoPauloToday,
  visibilityLabel,
  type TeamProject,
  type TeamProjectStep,
} from "@/lib/workspace/team-projects";

const today = "2026-10-27";
const project = (over: Partial<TeamProject> = {}): TeamProject => ({
  id: "p1",
  code: "PRJ-00001",
  title: "Projeto",
  context: null,
  status: "em_andamento",
  priority: "Normal",
  owner_id: "owner",
  created_by: "creator",
  start_date: null,
  due_date: null,
  completed_at: null,
  canceled_at: null,
  cancel_reason: null,
  visibility: "team",
  version: 1,
  created_at: "2026-10-01T12:00:00Z",
  updated_at: "2026-10-01T12:00:00Z",
  ...over,
});
const step = (over: Partial<TeamProjectStep> = {}): TeamProjectStep => ({
  id: "s1",
  project_id: "p1",
  position: 1,
  title: "Etapa",
  description: null,
  assignee_id: null,
  due_date: null,
  done_at: null,
  done_by: null,
  ...over,
});

describe("Farol dos projetos", () => {
  it("usa a data de São Paulo, não a do UTC", () => {
    expect(saoPauloToday(new Date("2026-10-28T02:30:00Z"))).toBe("2026-10-27");
    expect(daysUntil("2026-11-01", today)).toBe(5);
    expect(daysUntil("2026-10-20", today)).toBe(-7);
  });
  it("classifica prazo atrasado, de hoje, próximo, folgado e ausente", () => {
    expect(deadlineSignal("2026-10-25", false, today)).toMatchObject({
      tone: "bad",
      label: "Atrasado há 2 dias",
    });
    expect(deadlineSignal("2026-10-27", false, today)).toMatchObject({
      tone: "warn",
      label: "Vence hoje",
    });
    expect(deadlineSignal("2026-10-28", false, today)).toMatchObject({
      tone: "warn",
      label: "Vence em 1 dia",
    });
    expect(deadlineSignal("2026-11-15", false, today)).toMatchObject({
      tone: "ok",
      label: "No prazo · até 15/11",
    });
    expect(deadlineSignal(null, false, today)).toMatchObject({
      tone: "neutral",
      label: "Sem prazo",
    });
    expect(deadlineSignal("2026-10-01", true, today)).toMatchObject({
      tone: "ok",
      label: "Concluída",
    });
  });
  it("projeto atrasado pesa mais que etapa atrasada; encerrado não alerta", () => {
    const late = [step({ due_date: "2026-10-20" })];
    expect(projectSignal(project({ due_date: "2026-10-26" }), late, today).label).toBe(
      "Atrasado há 1 dia",
    );
    expect(projectSignal(project({ due_date: "2026-12-01" }), late, today).label).toBe(
      "1 etapa atrasada",
    );
    expect(
      projectSignal(project({ status: "concluido", due_date: "2026-10-01" }), late, today).tone,
    ).toBe("ok");
    expect(projectSignal(project({ status: "cancelado" }), late, today).tone).toBe("neutral");
  });
  it("lista de atenção ignora encerrados e ordena do mais urgente", () => {
    const list = attentionList(
      [
        project({ id: "a", code: "PRJ-00003", due_date: "2026-10-28" }),
        project({ id: "b", code: "PRJ-00002", due_date: "2026-10-20" }),
        project({ id: "c", code: "PRJ-00001", status: "concluido", due_date: "2026-10-01" }),
        project({ id: "d", code: "PRJ-00004", due_date: "2026-12-01" }),
      ],
      [],
      today,
    );
    expect(list.map((x) => x.project.code)).toEqual(["PRJ-00002", "PRJ-00003"]);
  });
  it("progresso e etapa atual seguem a ordem das etapas", () => {
    const steps = [
      step({ id: "b", position: 2, title: "Segunda" }),
      step({ id: "a", position: 1, title: "Primeira", done_at: "2026-10-26T10:00:00Z" }),
      step({ id: "c", position: 3, title: "Terceira" }),
    ];
    expect(progress(steps)).toEqual({ done: 1, total: 3, percent: 33 });
    expect(currentStep(steps)?.title).toBe("Segunda");
    expect(progress([])).toEqual({ done: 0, total: 0, percent: 0 });
  });
});

describe("Permissões espelhadas do banco", () => {
  const admin = { id: "adm", role: "admin" };
  const owner = { id: "owner", role: "cs" };
  const helper = { id: "helper", role: "cs" };
  const other = { id: "other", role: "cs" };
  it("gerencia: administrador, quem criou ou responsável", () => {
    expect(canManageProject(project(), admin)).toBe(true);
    expect(canManageProject(project(), owner)).toBe(true);
    expect(canManageProject(project(), { id: "creator", role: "cs" })).toBe(true);
    expect(canManageProject(project(), other)).toBe(false);
    expect(canManageProject(project(), null)).toBe(false);
  });
  it("etapa: responsável da etapa conclui; sem responsável qualquer um; encerrado ninguém", () => {
    expect(canCompleteStep(project(), step({ assignee_id: "helper" }), helper)).toBe(true);
    expect(canCompleteStep(project(), step({ assignee_id: "helper" }), other)).toBe(false);
    expect(canCompleteStep(project(), step(), other)).toBe(true);
    expect(canCompleteStep(project({ status: "concluido" }), step(), admin)).toBe(false);
  });
  it("quadro: quem tem etapa move só entre situações abertas", () => {
    const steps = [step({ assignee_id: "helper" })];
    expect(canMoveProject(project(), steps, helper, "em_revisao")).toBe(true);
    expect(canMoveProject(project(), steps, helper, "concluido")).toBe(false);
    expect(canMoveProject(project(), steps, other, "em_revisao")).toBe(false);
    expect(canMoveProject(project({ status: "concluido" }), steps, helper, "em_andamento")).toBe(
      false,
    );
    expect(canMoveProject(project({ status: "concluido" }), steps, owner, "em_andamento")).toBe(
      true,
    );
  });
});

describe("Projetos — quem vê e participantes", () => {
  it("participantes reúnem quem criou, responsável, responsáveis por etapa e adicionados, sem repetir", () => {
    const steps = [
      step({ id: "s1", assignee_id: "tech" }),
      step({ id: "s2", assignee_id: "owner" }),
      step({ id: "s3", project_id: "p2", assignee_id: "other" }),
      step({ id: "s4", assignee_id: null }),
    ];
    const participants = [
      { project_id: "p1", user_id: "cs2" },
      { project_id: "p1", user_id: "tech" },
      { project_id: "p2", user_id: "cs3" },
    ];
    expect(participantsOf(participants, "p1")).toEqual(["cs2", "tech"]);
    expect(projectPeople(project(), steps, participants)).toEqual([
      "creator",
      "owner",
      "tech",
      "cs2",
    ]);
  });
  it("rótulos de visibilidade", () => {
    expect(visibilityLabel("team")).toBe("Todo o time");
    expect(visibilityLabel("participants")).toBe("Só quem eu escolher");
  });
});
