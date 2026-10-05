// Authenticated, internal-only server functions. Every call verifies the
// session (requireSupabaseAuth) AND an internal role before touching data.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ConnectionState, Dataset } from "./domain/types";
import {
  clientRegistrationSchema,
  type ClientRegistrationOptions,
  type RegistrationResult,
} from "./domain/client-registration";

const SNAPSHOT_KEY = "notion";

/** Read-only workflow diagnostics. Uses the same authentication as the BI;
 * never returns integration credentials or authentication context. */
export const getNotionWorkflowAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await assertInternal(context))) throw new Error("Acesso não autorizado.");
    const { resolveCredentials, notionFetch } = await import("./notion/client.server");
    const credentials = resolveCredentials(process.env);
    if (!credentials.ok) throw new Error("Notion não conectado.");
    const sources = [
      ["Demandas", "dec12f4c-bcf8-493f-b3ad-c5485dd251e7"],
      ["Onboarding", "70e6e4ec-b3d6-49ed-bf4a-1756f32de443"],
      ["Upgrades", "6b5b6d6e-0c0f-4660-a7e9-64e130a76c1c"],
    ];
    return Promise.all(
      sources.map(async ([name, id]) => {
        const schema = await notionFetch(credentials.creds, `/data_sources/${id}`);
        const rows = await notionFetch(credentials.creds, `/data_sources/${id}/query`, {
          method: "POST",
          body: { page_size: 100 },
        });
        return {
          name,
          id,
          properties: Object.fromEntries(
            Object.entries(schema.properties ?? {}).map(([key, raw]) => {
              const p = raw as any;
              return [
                key,
                { type: p.type, ...(p.formula ? { expression: p.formula.expression } : {}) },
              ];
            }),
          ),
          hasMore: Boolean(rows.has_more),
          pages: (rows.results ?? []).map((p: any) => ({
            id: p.id,
            properties: Object.fromEntries(
              Object.entries(p.properties ?? {}).filter(([, raw]) =>
                [
                  "formula",
                  "date",
                  "created_time",
                  "status",
                  "select",
                  "number",
                  "checkbox",
                  "title",
                ].includes((raw as any).type),
              ),
            ),
          })),
        };
      }),
    );
  });

async function assertInternal(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("is_internal", { _user_id: context.userId });
  if (error) throw new Error("Falha ao verificar permissão");
  return data === true;
}

export const getClientRegistrationOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClientRegistrationOptions> => {
    const { nativeClientOptions } = await import("./workspace/clients.server");
    return nativeClientOptions(context);
  });
export const createNotionClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => clientRegistrationSchema.parse(data))
  .handler(async ({ context, data }): Promise<RegistrationResult> => {
    const { registerNativeClient } = await import("./workspace/clients.server");
    return registerNativeClient(context, data);
  });
export const getBiState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConnectionState> => {
    if (!(await assertInternal(context))) return { status: "forbidden" };
    const { nativeDataset } = await import("./workspace/read.server");
    const dataset = await nativeDataset(context);
    return {
      status: "ok",
      dataset,
      lastSuccessAt: dataset.fetchedAt,
      lastAttemptAt: dataset.fetchedAt,
      lastError: null,
      stale: false,
    };
  });
// Kept for old authenticated clients: no writes or background reads of Notion.
export const refreshNotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await assertInternal(context))) return { ok: false, message: "Acesso não autorizado." };
    return {
      ok: true,
      message: "A operação agora é nativa. Recarregue o painel para consultar os dados atuais.",
    };
  });
