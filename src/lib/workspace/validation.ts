import { z } from "zod";
export const entitySchema = z.enum([
  "demands",
  "onboardings",
  "upgrades",
  "interactions",
  "changelog",
]);
const text = z.string().trim().max(10000);
const nullable = text.nullable().optional();
const common = { client_id: z.string().uuid(), is_test: z.boolean().optional() };
export const entityForms = {
  demands: z
    .object({
      ...common,
      title: text.min(2).max(300),
      description: text.min(2),
      priority: z.enum(["Baixa", "Normal", "Alta", "Crítica"]),
      classification: z.enum([
        "Dúvida",
        "Suporte",
        "Bug",
        "Pequena melhoria",
        "Demanda complexa",
        "Configuração",
        "Onboarding",
        "Upgrade",
      ]),
      channel: nullable,
      context: nullable,
      impact: nullable,
      solution: nullable,
      tests_run: nullable,
      test_result: nullable,
      client_informed: z.boolean().optional(),
      client_validated: z.boolean().optional(),
      due_date: z.string().datetime({ offset: true }).nullable().optional(),
    })
    .strict(),
  onboardings: z
    .object({
      ...common,
      title: text.min(2).max(300),
      notes: nullable,
      expected_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
    })
    .strict(),
  upgrades: z
    .object({
      ...common,
      title: text.min(2).max(300),
      current_plan: text.max(100),
      new_plan: text.min(1).max(100),
      current_value: z.number().finite().min(0).max(10000000),
      new_value: z.number().finite().positive().max(10000000),
      notes: nullable,
      need: nullable,
    })
    .strict(),
  interactions: z
    .object({
      ...common,
      demand_id: z.string().uuid().nullable().optional(),
      summary: text.min(2).max(500),
      channel: z.enum(["WhatsApp", "E-mail", "Reunião", "Ligação", "Interno"]),
      problem: nullable,
      decision: nullable,
      next_action: nullable,
    })
    .strict(),
  changelog: z
    .object({
      ...common,
      demand_id: z.string().uuid().nullable().optional(),
      title: text.min(2).max(300),
      description: text.min(2),
      kind: z.enum(["Correção", "Melhoria", "Configuração", "Deploy", "Hotfix"]),
      tests_run: nullable,
      result: nullable,
      approved: z.boolean().optional(),
      release_version: nullable,
      files: nullable,
      tool: nullable,
      notes: nullable,
    })
    .strict(),
};
export const recordInput = z.object({
  kind: entitySchema,
  id: z.string().uuid().optional(),
  version: z.number().int().positive().optional(),
  values: z.record(z.unknown()),
});
export const transitionInput = z.object({
  kind: z.enum(["demands", "onboardings", "upgrades"]),
  id: z.string().uuid(),
  version: z.number().int().positive(),
  action: z.enum([
    "first_response",
    "forward",
    "publish",
    "validate",
    "complete",
    "cancel",
    "move",
    "info_complete",
    "step",
    "accept",
    "effective",
    "lost",
  ]),
  stage: z.string().max(100).optional(),
  reason: text.optional(),
});
export const createUserInput = z
  .object({
    name: text.min(2).max(200),
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(128),
    role: z.enum(["cs", "admin"]).default("cs"),
  })
  .strict();
export const memberInput = z
  .object({
    id: z.string().uuid(),
    role: z.enum(["cs", "admin"]),
    active: z.boolean(),
    commission: z.boolean(),
  })
  .strict();
