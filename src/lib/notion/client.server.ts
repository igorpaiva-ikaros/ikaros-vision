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
  return { ok: false, missing: ["NOTION_TOKEN (ou conexão Notion do Lovable → NOTION_API_KEY)"] };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function notionFetch(
  creds: Creds,
  path: string,
  init: { method?: string; body?: unknown } = {},
  attempt = 0,
): Promise<any> {
  const res = await fetch(`${creds.base}${path}`, {
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
    const text = await res.text();
    throw new Error(`Notion [${res.status}] ${path}: ${text.slice(0, 300)}`);
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

