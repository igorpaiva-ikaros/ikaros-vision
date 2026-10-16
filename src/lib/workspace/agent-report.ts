import { z } from "zod";
import { caseFile } from "./evidence.ts";

const nullableText = z.string().trim().max(10000).nullable();
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Data inválida.");
const timestamp = z.string().datetime({ offset: true });
export const agentReportFileSchema = z
  .object({
    name: z.string().min(1).max(250),
    mime: z.string().min(1),
    size: z
      .number()
      .int()
      .positive()
      .max(50 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .superRefine((v, c) => {
    try {
      caseFile({ name: v.name, type: v.mime, size: v.size });
    } catch {
      c.addIssue({ code: "custom", message: "Anexo inválido." });
    }
  });
export const agentReportSchema = z
  .object({
    version: z.literal("ikaros-vision-agent-report-v1"),
    external_id: z.string().trim().min(8).max(300),
    client: z
      .object({
        id: z.string().uuid().nullable(),
        code: nullableText,
        erp_id: z.string().uuid().nullable(),
        name: z.string().trim().min(2).max(200),
        aliases: z.array(z.string().trim().min(2).max(200)).max(10),
      })
      .strict(),
    demand: z
      .object({
        id: z.string().uuid().nullable(),
        version: z.number().int().positive().nullable(),
        create_new: z.boolean().default(false),
        title: z.string().trim().min(2).max(300),
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
        priority: z.enum(["Baixa", "Normal", "Alta", "Crítica"]).nullable(),
        channel: nullableText,
        description: z.string().trim().min(2).max(10000),
        context: nullableText,
        impact: nullableText,
        solution: nullableText,
        received_at: timestamp.nullable(),
      })
      .strict(),
    source: z
      .object({
        reference: z.string().trim().min(2).max(2000),
        agent: nullableText,
        documented_on: day.nullable(),
        requester: nullableText,
      })
      .strict(),
    completion: z
      .object({
        confirmed_by_user: z.boolean(),
        source: nullableText,
        at: timestamp.nullable(),
        on: day.nullable(),
        publication: z.enum(["nao_se_aplica", "a_confirmar"]),
      })
      .strict(),
    narrative: z.string().trim().min(2).max(30000),
    missing_files: z.array(z.string().trim().min(1).max(300)).max(30),
    files: z.array(agentReportFileSchema).max(20),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.demand.id && !v.demand.version)
      c.addIssue({ code: "custom", message: "Informe a versão consultada da demanda existente." });
    if (v.completion.at && v.completion.on)
      c.addIssue({
        code: "custom",
        message: "Informe conclusão com horário ou somente dia, não ambos.",
      });
    if (
      v.completion.confirmed_by_user &&
      (v.demand.classification !== "Dúvida" ||
        v.completion.publication !== "nao_se_aplica" ||
        !v.completion.source ||
        !v.demand.solution ||
        (!v.completion.at && !v.completion.on))
    )
      c.addIssue({
        code: "custom",
        message:
          "Conclusão automática: somente orientação, solução, fonte do usuário e data comprovadas. Demais casos seguem o fluxo do card.",
      });
    if (new Set(v.files.map((f) => f.sha256)).size !== v.files.length)
      c.addIssue({
        code: "custom",
        message: "O mesmo conteúdo não pode aparecer duas vezes nos anexos.",
      });
  });
export type AgentReport = z.infer<typeof agentReportSchema>;

export function reportFilePath(demandId: string, file: AgentReport["files"][number]) {
  return `${demandId}/agent-reports/${file.sha256}.${file.name.split(".").pop()!.toLowerCase()}`;
}

export function completionFact(at: string | null, precision: string[]) {
  if (!at) return { at: null, on: null };
  if (!precision.includes("completed_at")) return { at, on: null };
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(at));
  const p = Object.fromEntries(parts.map((v) => [v.type, v.value]));
  return { at: null, on: `${p["year"]}-${p["month"]}-${p["day"]}` };
}
