import { whatsappGroupSchema } from "../workspace/whatsapp-group";
import { z } from "zod";

const text = z.string().trim().max(2000);
const email = z.union([
  z.string().trim().email("Informe um e-mail válido.").max(254),
  z.literal(""),
]);
const phone = z
  .string()
  .trim()
  .max(30)
  .refine(
    (v) => !v || (/^\+?[\d\s().-]+$/.test(v) && v.replace(/\D/g, "").length >= 8),
    "Informe um telefone válido.",
  );

export const clientRegistrationSchema = z.object({
  requestId: z.string().uuid(),
  name: text.min(2, "Informe o nome da empresa.").max(200),
  ownerId: z.string().uuid("Selecione um responsável de CS."),
  contactName: text.max(200).default(""),
  whatsappGroupUrl: whatsappGroupSchema,
  email: email.default(""),
  phone: phone.default(""),
  plan: text.max(100).default(""),
  productId: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().uuid("Selecione um plano do catálogo.").optional(),
  ),
  segment: z
    .enum(["Consórcio", "Seguros", "Consórcio e seguros", "Não informado"])
    .default("Não informado"),
  notes: text.default(""),
  isTest: z.boolean().default(false),
});

export type ClientRegistration = z.infer<typeof clientRegistrationSchema>;
export interface ClientRegistrationOptions {
  owners: { id: string; name: string }[];
  plans: string[];
  products?: import("../workspace/types").Product[];
}
export type RegistrationResult =
  | { ok: true; pageId: string; code: string | null; notionUrl: string | null; message: string }
  | { ok: false; uncertain?: boolean; message: string };
