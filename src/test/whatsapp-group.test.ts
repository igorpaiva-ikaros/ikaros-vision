import { describe, it, expect } from "vitest";
import { whatsappGroupSchema } from "@/lib/workspace/whatsapp-group";
describe("Links privados de grupos", () => {
  it.each([
    "",
    "https://chat.whatsapp.com/TestGroupInvite12345",
    " https://chat.whatsapp.com/TestGroupInvite12345?mode=ac_t ",
  ])("aceita grupo opcional %s", (value) =>
    expect(whatsappGroupSchema.safeParse(value).success).toBe(true),
  );
  it.each([
    "javascript:alert(1)",
    "http://chat.whatsapp.com/TestGroupInvite12345",
    "https://chat.whatsapp.com.evil.test/TestGroupInvite12345",
    "https://user@chat.whatsapp.com/TestGroupInvite12345",
    "https://wa.me/5511999999999",
    "https://chat.whatsapp.com/short",
  ])("recusa destino inválido %s", (value) =>
    expect(whatsappGroupSchema.safeParse(value).success).toBe(false),
  );
});
