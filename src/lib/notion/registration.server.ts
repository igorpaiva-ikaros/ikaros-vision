import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clientRegistrationSchema, type ClientRegistrationOptions, type RegistrationResult } from "../domain/client-registration";
import { CLIENT_PROPS, NOTION_SOURCES, CS_TEAM, REGISTRATION_PROPERTY } from "./config";
import { notionFetch, type Creds, NotionHttpError } from "./client.server";
import { readText, type NotionPage } from "./mapping";

export interface Reservation {
  user_id: string;
  payload_hash: string;
  notion_page_id: string | null;
}
export interface RegistrationStore {
  reserve(requestId: string, userId: string, hash: string): Promise<{ fresh: boolean; row: Reservation }>;
  complete(requestId: string, pageId: string): Promise<void>;
  release(requestId: string): Promise<void>;
}

export function registrationStore(admin: SupabaseClient<any>): RegistrationStore {
  const table = () => admin.from("client_registration_requests");
  return {
    async reserve(requestId, userId, hash) {
      const { error } = await table().insert({ request_id: requestId, user_id: userId, payload_hash: hash });
      if (!error) return { fresh: true, row: { user_id: userId, payload_hash: hash, notion_page_id: null } };
      if (error.code !== "23505") throw new Error("Não foi possível registrar o envio. Nenhum cliente foi enviado.");
      const { data, error: readError } = await table().select("user_id,payload_hash,notion_page_id").eq("request_id", requestId).single();
      if (readError || !data) throw new Error("Não foi possível confirmar o envio anterior.");
      return { fresh: false, row: data as Reservation };
    },
    async complete(requestId, pageId) {
      const { error } = await table().update({ state: "complete", notion_page_id: pageId }).eq("request_id", requestId);
      if (error) throw new Error("Cliente recebido pelo Notion; confirmação pendente.");
    },
    async release(requestId) {
      const { error } = await table().delete().eq("request_id", requestId).eq("state", "pending");
      if (error) throw new Error("Não foi possível liberar o envio recusado.");
    },
  };
}

async function registrationContext(creds: Creds) {
  const schema = await notionFetch(creds, `/data_sources/${NOTION_SOURCES.clientes.dataSourceId}`);
  const props = schema.properties ?? {};
  const title = Object.keys(props).find(key => props[key].type === "title");
  const required: Record<string, string> = {
    [CLIENT_PROPS.empresa]: "rich_text", [CLIENT_PROPS.contatoPrincipal]: "rich_text",
    [CLIENT_PROPS.responsavel]: "people", [CLIENT_PROPS.emailContato]: "email",
    [CLIENT_PROPS.telefoneContato]: "phone_number", [CLIENT_PROPS.segmentos]: "rich_text",
    [CLIENT_PROPS.plano]: "select", [CLIENT_PROPS.status]: "select",
    [CLIENT_PROPS.isTest]: "checkbox", [REGISTRATION_PROPERTY]: "rich_text",
    "Observações": "rich_text", "Data de entrada": "date",
  };
  if (!title || Object.entries(required).some(([key, type]) => props[key]?.type !== type))
    throw new Error("O cadastro de Clientes no Notion mudou. Confira os campos antes de enviar.");
  if (!(props[CLIENT_PROPS.status].select?.options ?? []).some((o: any) => o.name === "Ativo"))
    throw new Error("O status Ativo não está disponível no Notion.");
  const users = await Promise.all(CS_TEAM.map(async member => {
    const u = await notionFetch(creds, `/users/${member.id}`);
    return u.type === "person" && u.id === member.id ? { id: u.id, name: u.name || member.name } : null;
  }));
  const options: ClientRegistrationOptions = {
    owners: users.filter((u): u is { id: string; name: string } => !!u),
    plans: (props[CLIENT_PROPS.plano].select?.options ?? []).map((o: any) => o.name),
  };
  return { title, options };
}

export async function getRegistrationOptions(creds: Creds): Promise<ClientRegistrationOptions> {
  return (await registrationContext(creds)).options;
}

const richText = (content: string) => ({ rich_text: content ? [{ type: "text", text: { content } }] : [] });
function success(page: NotionPage): RegistrationResult {
  return { ok: true, pageId: page.id, code: readText(page.properties["Código"]) ?? readText(page.properties["ID"]), notionUrl: page.url ?? null, message: "Cliente cadastrado no Notion e atribuído à carteira selecionada." };
}

export async function registerClient(creds: Creds, input: unknown, userId: string, store: RegistrationStore): Promise<RegistrationResult> {
  const parsed = clientRegistrationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Confira o cadastro." };
  const data = parsed.data;
  const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  const { title, options } = await registrationContext(creds);
  if (!options.owners.some(o => o.id === data.ownerId)) return { ok: false, message: "Selecione um colaborador ativo da equipe de CS." };
  if (data.plan && !options.plans.includes(data.plan)) return { ok: false, message: "Selecione um plano disponível no Notion." };
  const reservation = await store.reserve(data.requestId, userId, hash);
  if (reservation.row.user_id !== userId || reservation.row.payload_hash !== hash)
    return { ok: false, message: "O envio anterior tem outros dados. Confirme-o antes de iniciar outro cadastro." };
  if (!reservation.fresh) {
    if (reservation.row.notion_page_id) return success(await notionFetch(creds, `/pages/${reservation.row.notion_page_id}`));
    const found = await notionFetch(creds, `/data_sources/${NOTION_SOURCES.clientes.dataSourceId}/query`, {
      method: "POST", body: { page_size: 2, filter: { property: REGISTRATION_PROPERTY, rich_text: { equals: data.requestId } } },
    });
    if (found.results?.length === 1) {
      await store.complete(data.requestId, found.results[0].id);
      return success(found.results[0]);
    }
    return { ok: false, uncertain: true, message: "O envio anterior ainda não foi confirmado. Use Confirmar envio; o sistema não enviará uma cópia." };
  }
  let page: NotionPage;
  try {
    page = await notionFetch(creds, "/pages", { method: "POST", body: {
      parent: { type: "data_source_id", data_source_id: NOTION_SOURCES.clientes.dataSourceId },
      properties: {
        [title]: { title: [{ type: "text", text: { content: data.name } }] },
        [CLIENT_PROPS.empresa]: richText(data.name),
        [CLIENT_PROPS.responsavel]: { people: [{ object: "user", id: data.ownerId }] },
        [CLIENT_PROPS.contatoPrincipal]: richText(data.contactName),
        [CLIENT_PROPS.emailContato]: { email: data.email || null },
        [CLIENT_PROPS.telefoneContato]: { phone_number: data.phone || null },
        [CLIENT_PROPS.segmentos]: richText(data.segment),
        [CLIENT_PROPS.plano]: { select: data.plan ? { name: data.plan } : null },
        [CLIENT_PROPS.status]: { select: { name: "Ativo" } },
        [CLIENT_PROPS.isTest]: { checkbox: data.isTest },
        "Observações": richText(data.notes),
        "Data de entrada": { date: { start: new Date().toISOString() } },
        [REGISTRATION_PROPERTY]: richText(data.requestId),
      },
    } });
  } catch (error) {
    // Explicit 4xx rejection guarantees no page was created. Timeouts/5xx
    // remain reserved; subsequent attempts only look up the original write.
    if (error instanceof NotionHttpError && error.status >= 400 && error.status < 500) {
      await store.release(data.requestId);
      return { ok: false, message: error.status === 403 ? "Notion: permita criar conteúdo na base Clientes para esta conexão." : error.message };
    }
    return { ok: false, uncertain: true, message: "Não foi possível confirmar se o Notion recebeu o cadastro. Use Confirmar envio antes de cadastrar novamente." };
  }
  try { await store.complete(data.requestId, page.id); } catch { /* Notion marker still lets us reconcile safely. */ }
  return success(page);
}
