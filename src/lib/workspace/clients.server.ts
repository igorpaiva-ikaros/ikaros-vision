import type { AuthContext } from "./access.server";
import { assertOperator, checkResult } from "./access.server";
import type { ClientRegistration, RegistrationResult } from "../domain/client-registration";
export async function nativeClientOptions(context: AuthContext) {
  await assertOperator(context);
  const db = context.supabase;
  const roles = checkResult(await db.from("user_roles").select("user_id,role")) ?? [];
  const profiles = checkResult(await db.from("profiles").select("id,full_name,active")) ?? [];
  const products =
    checkResult(await (db as any).from("products").select("*").eq("active", true).order("name")) ??
    [];
  return {
    products,
    owners: profiles
      .filter((p: any) => p.active && roles.some((r: any) => r.user_id === p.id && r.role === "cs"))
      .map((p: any) => ({ id: p.id, name: p.full_name })),
    plans: products.map((p: any) => p.name),
  };
}
export async function registerNativeClient(
  context: AuthContext,
  data: ClientRegistration,
): Promise<RegistrationResult> {
  try {
    await assertOperator(context);
  } catch {
    return { ok: false, message: "Acesso não autorizado." };
  }
  const db = context.supabase as any;
  const existing = checkResult(
    await db.from("clients").select("id,code").eq("id", data.requestId).maybeSingle(),
  );
  if (existing)
    return {
      ok: true,
      pageId: existing.id,
      code: existing.code,
      notionUrl: null,
      message: "Cliente já cadastrado no Ikaros Vision.",
    };
  const product = data.productId
    ? checkResult(
        await db
          .from("products")
          .select("id,name")
          .eq("id", data.productId)
          .eq("active", true)
          .maybeSingle(),
      )
    : null;
  if (data.productId && !product)
    return { ok: false, message: "Selecione um plano ativo do catálogo." };
  const row = {
    id: data.requestId,
    name: data.name,
    empresa: data.name,
    owner_id: null,
    contact_name: data.contactName || null,
    whatsapp_group_url: data.whatsappGroupUrl || null,
    contact_email: data.email || null,
    contact_phone: data.phone || null,
    notes: data.notes,
    segments: data.segment === "Não informado" ? [] : [data.segment],
    plan: product?.name ?? null,
    product_id: product?.id ?? null,
    status: "Ativo",
    is_test: data.isTest,
  };
  const r = await db
    .from("clients")
    .upsert(row, { onConflict: "id", ignoreDuplicates: true })
    .select("id,code")
    .maybeSingle();
  checkResult(r);
  const saved =
    r.data ??
    checkResult(await db.from("clients").select("id,code").eq("id", data.requestId).single());
  return {
    ok: true,
    pageId: saved.id,
    code: saved.code,
    notionUrl: null,
    message: "Cliente cadastrado na carteira do CS.",
  };
}
