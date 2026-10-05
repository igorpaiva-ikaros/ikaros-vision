import { resolveCredentials, notionFetch } from "../notion/client.server";
import { SOURCES, mapImportPage } from "./import-mapping";
export async function fetchImportBundle() {
  const creds = resolveCredentials(process.env);
  if (!creds.ok)
    throw new Error(
      "A conexão com a origem Notion não está disponível. A operação nativa continua independente.",
    );
  const bundle: Record<string, any[]> = Object.fromEntries(
    Object.keys(SOURCES).map((k) => [k, []]),
  );
  // Sequential pagination respects provider rate limits and never imports a partial scan.
  for (const [kind, id] of Object.entries(SOURCES)) {
    const schema = await notionFetch(creds.creds, "/data_sources/" + id);
    if (!schema.properties) throw new Error("Esquema da origem não disponível.");
    let cursor: string | undefined;
    for (let i = 0; i < 200; i++) {
      const result = await notionFetch(creds.creds, "/data_sources/" + id + "/query", {
        method: "POST",
        body: { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
      });
      for (const p of result.results ?? [])
        if (p.object === "page" && !p.archived && !p.in_trash)
          bundle[kind]!.push(mapImportPage(kind as keyof typeof SOURCES, p));
      if (!result.has_more) break;
      if (!result.next_cursor || i === 199)
        throw new Error("Paginação incompleta. Nenhum registro foi migrado.");
      cursor = result.next_cursor;
    }
  }
  return bundle;
}
