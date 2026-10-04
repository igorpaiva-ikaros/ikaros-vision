// Authenticated, internal-only server functions. Every call verifies the
// session (requireSupabaseAuth) AND an internal role before touching data.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ConnectionState, Dataset } from "./domain/types";
import { clientRegistrationSchema, type ClientRegistrationOptions, type RegistrationResult } from "./domain/client-registration";

const SNAPSHOT_KEY = "notion";

async function assertInternal(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("is_internal", { _user_id: context.userId });
  if (error) throw new Error("Falha ao verificar permissão");
  return data === true;
}

export const getClientRegistrationOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClientRegistrationOptions> => {
    if (!(await assertInternal(context))) throw new Error("Acesso não autorizado.");
    const { resolveCredentials } = await import("./notion/client.server");
    const creds = resolveCredentials(process.env);
    if (!creds.ok) throw new Error("Conecte o Notion antes de cadastrar clientes.");
    const { getRegistrationOptions } = await import("./notion/registration.server");
    return getRegistrationOptions(creds.creds);
  });

export const createNotionClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => clientRegistrationSchema.parse(data))
  .handler(async ({ context, data }): Promise<RegistrationResult> => {
    if (!(await assertInternal(context))) return { ok: false, message: "Acesso não autorizado." };
    const { resolveCredentials, fetchDataset } = await import("./notion/client.server");
    const creds = resolveCredentials(process.env);
    if (!creds.ok) return { ok: false, message: "Conecte o Notion antes de cadastrar clientes." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { registerClient, registrationStore } = await import("./notion/registration.server");
    const result = await registerClient(creds.creds, data, context.userId, registrationStore(supabaseAdmin));
    if (!result.ok) return result;
    // A snapshot failure does not undo a successfully created Notion client.
    try {
      const dataset = await fetchDataset(creds.creds);
      const now = new Date().toISOString();
      const { error } = await supabaseAdmin.from("sync_snapshots").upsert({
        key: SNAPSHOT_KEY, payload: dataset as any, last_success_at: now,
        last_attempt_at: now, last_error: null, updated_at: now,
      });
      if (error) throw new Error("snapshot");
      return result;
    } catch {
      return { ...result, message: "Cliente cadastrado no Notion. Atualize o BI para carregar a nova carteira." };
    }
  });

export const getBiState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConnectionState> => {
    if (!(await assertInternal(context))) return { status: "forbidden" };
    const { resolveCredentials } = await import("./notion/client.server");
    const creds = resolveCredentials(process.env);
    const { data: snap, error: snapshotError } = await context.supabase
      .from("sync_snapshots")
      .select("payload,last_success_at,last_attempt_at,last_error")
      .eq("key", SNAPSHOT_KEY)
      .maybeSingle();
    if (snapshotError) throw new Error("Falha ao consultar última sincronização");
    if (!creds.ok && !snap?.payload) return { status: "not_configured", missing: creds.missing };
    if (!snap?.payload)
      return { status: "empty", lastError: snap?.last_error ?? null, lastAttemptAt: snap?.last_attempt_at ?? null };
    const stale =
      !creds.ok ||
      (!!snap.last_error && !!snap.last_attempt_at && snap.last_attempt_at > (snap.last_success_at ?? ""));
    return {
      status: "ok",
      dataset: snap.payload as unknown as Dataset,
      lastSuccessAt: snap.last_success_at,
      lastAttemptAt: snap.last_attempt_at,
      lastError: snap.last_error,
      stale,
    };
  });

export const refreshNotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; message: string }> => {
    if (!(await assertInternal(context))) return { ok: false, message: "Acesso não autorizado." };
    const { resolveCredentials, fetchDataset } = await import("./notion/client.server");
    const creds = resolveCredentials(process.env);
    if (!creds.ok) return { ok: false, message: `Notion não conectado: ${creds.missing.join("; ")}. A conexão precisa estar vinculada a este projeto no Lovable.` };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    try {
      const dataset = await fetchDataset(creds.creds);
      const { error } = await supabaseAdmin.from("sync_snapshots").upsert({
        key: SNAPSHOT_KEY,
        payload: dataset as any,
        last_success_at: now,
        last_attempt_at: now,
        last_error: null,
        updated_at: now,
      });
      if (error) throw new Error(`Falha ao salvar snapshot: ${error.message}`);
      return { ok: true, message: `${dataset.demands.length} demandas e ${dataset.clients.length} clientes lidos.` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Notion sync failed:", msg);
      // Keep the previous payload; only record the failure.
      const { data: existing } = await supabaseAdmin
        .from("sync_snapshots").select("key").eq("key", SNAPSHOT_KEY).maybeSingle();
      if (existing) {
        await supabaseAdmin.from("sync_snapshots")
          .update({ last_attempt_at: now, last_error: msg, updated_at: now }).eq("key", SNAPSHOT_KEY);
      } else {
        await supabaseAdmin.from("sync_snapshots")
          .insert({ key: SNAPSHOT_KEY, payload: null, last_attempt_at: now, last_error: msg });
      }
      return { ok: false, message: msg };
    }
  });
