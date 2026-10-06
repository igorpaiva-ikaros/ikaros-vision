import { z } from "zod";
export function isWhatsAppGroupLink(value: string) {
  if (!value) return true;
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      u.hostname === "chat.whatsapp.com" &&
      !u.username &&
      !u.password &&
      !u.port &&
      /^\/[A-Za-z0-9_-]{10,100}\/?$/.test(u.pathname)
    );
  } catch {
    return false;
  }
}
export const whatsappGroupSchema = z
  .string()
  .trim()
  .max(500)
  .refine(isWhatsAppGroupLink, "Cole um link de convite válido: https://chat.whatsapp.com/…")
  .default("");
