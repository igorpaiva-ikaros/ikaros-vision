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
      approval_repository_url: z
        .string()
        .regex(
          /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(pull\/[0-9]+|commit\/[a-fA-F0-9]{7,40})\/?$/,
        )
        .nullable()
        .optional(),
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
export const avatarInput = z
  .union([
    z.literal(""),
    z
      .string()
      .max(350000)
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
  ])
  .nullable()
  .optional();
export const scheduledTaskInput = z
  .object({
    id: z.string().uuid(),
    client: z.string().uuid(),
    title: z.string().trim().min(2).max(300),
    type: z.enum(["Retorno", "Ligação", "Reunião", "Treinamento", "Validação", "Outro"]),
    due: z.string().datetime({ offset: true }),
    notes: z.string().max(2000),
    kind: entitySchema.nullable().optional(),
    record: z.string().uuid().nullable().optional(),
    version: z.number().int().positive().optional(),
    status: z.enum(["pending", "completed", "canceled"]).default("pending"),
  })
  .strict()
  .refine((v) => !!v.kind === !!v.record, "Vincule um registro válido.");
export const createUserInput = z
  .object({
    name: text.min(2).max(200),
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(128),
    role: z.enum(["cs", "admin", "technical"]).default("cs"),
    avatar: avatarInput,
  })
  .strict();
export const memberInput = z
  .object({
    id: z.string().uuid(),
    role: z.enum(["cs", "admin", "technical"]),
    active: z.boolean(),
    commission: z.boolean(),
    name: text.min(2).max(200).optional(),
    avatar: avatarInput,
  })
  .strict();
