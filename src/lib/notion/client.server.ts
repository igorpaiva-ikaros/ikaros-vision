// Server-only Notion reader. Never imported by browser code.
// Two credential modes (checked in this order):
//  1. Lovable connector: NOTION_API_KEY + LOVABLE_API_KEY → connector gateway.
//  2. Direct integration token: NOTION_TOKEN → api.notion.com (portable / self-hosted).
import type { Dataset } from "../domain/types";
import { CLIENT_PROPS, DEMAND_PROPS, NOTION_SOURCES, NOTION_VERSION } from "./config";
import {
  mapClient,
  mapDemand,
  missingProps,
  peopleIdsMissingNames,
  type NotionPage,
} from "./mapping";

interface Creds {
  base: string;
  headers: Record<string, string>;
}

export function resolveCredentials(env: Record<string, string | undefined>):
  | { ok: true; creds: Creds }
  | { ok: false; missing: string[] } {
  if (env["NOTION_API_KEY"] && env["LOVABLE_API_KEY"]) {
    return {
      ok: true,
      creds: {
        base: "https://connector-gateway.lovable.dev/notion/v1",
        headers: {
          Authorization: `Bearer ${env["LOVABLE_API_KEY"]}`,
          "X-Connection-Api-Key": env["NOTION_API_KEY"],
          "Notion-Version": NOTION_VERSION,
        },
      },
    };
  }
  if (env["NOTION_TOKEN"]) {
    return {
      ok: true,
      creds: {
        base: "https://api.notion.com/v1",
        headers: { Authorization: `Bearer ${env["NOTION_TOKEN"]}`, "Notion-Version": NOTION_VERSION },
      },
    };
  }
  return {
    ok: false,
    missing: env["NOTION_API_KEY"]
      ? ["Credencial gerenciada do projeto Lovable (LOVABLE_API_KEY)"]
      : ["Vínculo da conexão Notion com este projeto (ou NOTION_TOKEN no servidor)"],
  };
}

export function notionErrorMessage(status: number): string {
  if (status === 401) return "Notion: credencial inválida ou conexão expirada. Reconecte o Notion no Lovable e confira o vínculo com este projeto.";
  if (status === 403) return "Notion: acesso negado. Confira as permissões de leitura da conexão e das bases Demandas e Clientes.";
  if (status === 404) return "Notion: base não encontrada ou não compartilhada com a conexão. Compartilhe a Central de Operações, incluindo Demandas e Clientes.";
  if (status === 429) return "Notion: limite de consultas atingido. Aguarde e tente atualizar novamente.";
  if (status >= 500) return "Notion: serviço temporariamente indisponível. A última leitura foi preservada; tente novamente.";
  return `Notion: consulta recusada (HTTP ${status}). Confira a configuração da conexão e das bases.`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function notionFetch(
  creds: Creds,
  path: string,
  init: { method?: string; body?: unknown } = {},
  attempt = 0,
): Promise<any> {
  const res = await fetch(`${creds.base}${path}`, {
    signal: AbortSignal.timeout(25_000),
    method: init.method ?? "GET",
    headers: { ...creds.headers, "Content-Type": "application/json" },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : 500 * 2 ** attempt);
    return notionFetch(creds, path, init, attempt + 1);
  }
  if (!res.ok) {
    // Provider bodies may contain identifiers or credential details. Do not
    // persist them in snapshots or send them to browser diagnostics.
    throw new Error(notionErrorMessage(res.status));
  }
  return res.json();
}

async function queryAll(creds: Creds, dataSourceId: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 200; i++) {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body["start_cursor"] = cursor;
    const data = await notionFetch(creds, `/data_sources/${dataSourceId}/query`, { method: "POST", body });
    for (const r of data.results ?? []) if (r.object === "page") pages.push(r);
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
    if (i === 199) throw new Error("Limite de paginação atingido. Leitura incompleta não foi salva.");
  }
  return pages;
}

async function schemaNames(creds: Creds, dataSourceId: string): Promise<string[] | null> {
  try {
    const ds = await notionFetch(creds, `/data_sources/${dataSourceId}`);
    return Object.keys(ds.properties ?? {});
  } catch {
    return null;
  }
}

/** Resolves people names in one paginated users listing (no N+1). */
async function userNames(creds: Creds): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  let cursor: string | undefined;
  try {
    for (let i = 0; i < 50; i++) {
      const q = cursor ? `?page_size=100&start_cursor=${cursor}` : "?page_size=100";
      const data = await notionFetch(creds, `/users${q}`);
      for (const u of data.results ?? []) if (u.name) names.set(u.id, u.name);
      if (!data.has_more) break;
      cursor = data.next_cursor;
    }
  } catch {
    // Integration may lack user-read capability; names stay "Sem informação".
  }
  return names;
}

export async function fetchDataset(creds: Creds): Promise<Dataset> {
  const [demandPages, clientPages, demandSchema, clientSchema] = await Promise.all([
    queryAll(creds, NOTION_SOURCES.demandas.dataSourceId),
    queryAll(creds, NOTION_SOURCES.clientes.dataSourceId),
    schemaNames(creds, NOTION_SOURCES.demandas.dataSourceId),
    schemaNames(creds, NOTION_SOURCES.clientes.dataSourceId),
  ]);
  const needNames = peopleIdsMissingNames([...demandPages, ...clientPages]);
  const names = needNames.length ? await userNames(creds) : new Map<string, string>();
  return {
    source: "notion",
    fetchedAt: new Date().toISOString(),
    demands: demandPages.map((p) => mapDemand(p, names)),
    clients: clientPages.map((p) => mapClient(p, names)),
    schemaWarnings: [
      ...missingProps(demandSchema, DEMAND_PROPS).map((n) => `Demandas: "${n}"`),
      ...missingProps(clientSchema, CLIENT_PROPS).map((n) => `Clientes: "${n}"`),
    ],
  };
}
