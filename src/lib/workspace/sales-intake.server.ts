import { z } from "zod";
const saleSchema = z
  .object({
    event: z.literal("ikaros.sale.confirmed"),
    sourceCompanyId: z.string().min(1).max(100),
    saleId: z.string().min(1).max(150),
    customerId: z.string().min(1).max(150),
    erpCompanyId: z.string().uuid().nullable().optional(),
    companyName: z.string().trim().min(2).max(200),
    confirmedAt: z.string().datetime({ offset: true }),
    contactName: z.string().max(200).nullable().optional(),
    email: z.string().email().max(254).nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
  })
  .strict();
function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function validateSaleWebhook(
  raw: string,
  timestamp: string | null,
  signature: string | null,
  config: { secret?: string | undefined; sourceCompanyId?: string | undefined },
  now = Date.now(),
) {
  if (!config.secret || config.secret.length < 32 || !config.sourceCompanyId)
    return {
      ok: false as const,
      status: 503,
      message: "Integração comercial ainda não configurada.",
    };
  if (new TextEncoder().encode(raw).byteLength > 32768)
    return { ok: false as const, status: 413, message: "Payload excede o limite." };
  if (
    !timestamp ||
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(now - Number(timestamp) * 1000) > 300000 ||
    !signature ||
    !/^[a-f0-9]{64}$/i.test(signature)
  )
    return { ok: false as const, status: 401, message: "Assinatura inválida ou expirada." };
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const bytes = Uint8Array.from(signature.match(/.{2}/g)!, (h) => parseInt(h, 16));
  if (
    !(await crypto.subtle.verify(
      "HMAC",
      key,
      bytes,
      new TextEncoder().encode(timestamp + "." + raw),
    ))
  )
    return { ok: false as const, status: 401, message: "Assinatura inválida ou expirada." };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false as const, status: 400, message: "JSON inválido." };
  }
  const parsed = saleSchema.safeParse(json);
  if (!parsed.success || parsed.data.sourceCompanyId !== config.sourceCompanyId)
    return {
      ok: false as const,
      status: 400,
      message: "Evento comercial inválido para esta integração.",
    };
  if (Date.parse(parsed.data.confirmedAt) > now + 300000)
    return { ok: false as const, status: 400, message: "Data de confirmação inválida." };
  const hash = hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(parsed.data))),
  );
  return { ok: true as const, data: parsed.data, hash };
}
export async function receiveSalesWebhook(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Corpo obrigatório." }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 32768) {
      await reader.cancel();
      return Response.json({ error: "Payload excede o limite." }, { status: 413 });
    }
    chunks.push(part.value);
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    joined.set(c, offset);
    offset += c.byteLength;
  }
  const valid = await validateSaleWebhook(
    new TextDecoder().decode(joined),
    request.headers.get("x-ikaros-timestamp"),
    request.headers.get("x-ikaros-signature"),
    {
      secret: process.env["IKAROS_SALES_WEBHOOK_SECRET"],
      sourceCompanyId: process.env["IKAROS_SALES_COMPANY_ID"],
    },
  );
  if (!valid.ok)
    return Response.json(
      { error: valid.message },
      { status: valid.status, headers: { "cache-control": "no-store" } },
    );
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const d = valid.data;
  const { data, error } = await (supabaseAdmin as any).rpc("receive_ikaros_sale", {
    _company: d.sourceCompanyId,
    _sale: d.saleId,
    _hash: valid.hash,
    _customer: d.customerId,
    _name: d.companyName,
    _sold_at: d.confirmedAt,
    _contact_name: d.contactName ?? null,
    _email: d.email ?? null,
    _phone: d.phone ?? null,
    _erp_id: d.erpCompanyId ?? null,
  });
  if (error)
    return Response.json(
      {
        error: /conflict/.test(error.message)
          ? "Venda já recebida com dados diferentes. Revisão necessária."
          : "Falha ao registrar venda; tente novamente com o mesmo evento.",
      },
      {
        status: /conflict/.test(error.message) ? 409 : 503,
        headers: { "cache-control": "no-store" },
      },
    );
  return Response.json({ ok: true, ...data }, { headers: { "cache-control": "no-store" } });
}
