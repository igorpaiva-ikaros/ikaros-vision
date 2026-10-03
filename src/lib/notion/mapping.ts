// Pure, defensive mapping of Notion page objects into domain types.
// Unknown/missing properties become null; nothing is invented.
import type { Client, Demand, Person } from "../domain/types";
import { CLIENT_PROPS, DEMAND_PROPS } from "./config";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type NotionProperty = { type: string; [k: string]: any };
export interface NotionPage {
  id: string;
  url?: string;
  created_time?: string;
  properties: Record<string, NotionProperty>;
}

const plain = (arr: any): string | null => {
  if (!Array.isArray(arr)) return null;
  const s = arr.map((t) => t?.plain_text ?? "").join("").trim();
  return s.length ? s : null;
};

export function readText(p: NotionProperty | undefined): string | null {
  if (!p) return null;
  switch (p.type) {
    case "title":
      return plain(p["title"]);
    case "rich_text":
      return plain(p["rich_text"]);
    case "select":
      return p["select"]?.name ?? null;
    case "status":
      return p["status"]?.name ?? null;
    case "email":
      return p["email"] ?? null;
    case "phone_number":
      return p["phone_number"] ?? null;
    case "url":
      return p["url"] ?? null;
    case "number":
      return p["number"] === null || p["number"] === undefined ? null : String(p["number"]);
    case "unique_id": {
      const u = p["unique_id"];
      if (!u || u.number === null || u.number === undefined) return null;
      return u.prefix ? `${u.prefix}-${u.number}` : String(u.number);
    }
    case "formula": {
      const f = p["formula"];
      if (!f) return null;
      if (f.type === "string") return f.string ?? null;
      if (f.type === "number") return f.number === null ? null : String(f.number);
      if (f.type === "boolean") return f.boolean === null ? null : f.boolean ? "Sim" : "Não";
      if (f.type === "date") return f.date?.start ?? null;
      return null;
    }
    case "multi_select":
      return Array.isArray(p["multi_select"]) && p["multi_select"].length
        ? p["multi_select"].map((o: any) => o.name).join(", ")
        : null;
    case "created_time":
      return p["created_time"] ?? null;
    case "date":
      return p["date"]?.start ?? null;
    default:
      return null;
  }
}

export function readDate(p: NotionProperty | undefined): string | null {
  if (!p) return null;
  if (p.type === "date") return p["date"]?.start ?? null;
  if (p.type === "created_time") return p["created_time"] ?? null;
  if (p.type === "formula" && p["formula"]?.type === "date") return p["formula"].date?.start ?? null;
  if (p.type === "formula" && p["formula"]?.type === "string") return p["formula"].string ?? null;
  return null;
}

export function readCheckbox(p: NotionProperty | undefined): boolean | null {
  if (!p) return null;
  if (p.type === "checkbox") return Boolean(p["checkbox"]);
  if (p.type === "formula" && p["formula"]?.type === "boolean") return p["formula"].boolean ?? null;
  return null;
}

export function readMulti(p: NotionProperty | undefined): string[] {
  if (!p) return [];
  if (p.type === "multi_select") return (p["multi_select"] ?? []).map((o: any) => o.name);
  const t = readText(p);
  return t ? [t] : [];
}

export function readRelation(p: NotionProperty | undefined): string[] {
  if (!p || p.type !== "relation" || !Array.isArray(p["relation"])) return [];
  return p["relation"].map((r: any) => r.id).filter(Boolean);
}

export function readPeople(p: NotionProperty | undefined, names: Map<string, string>): Person[] {
  if (!p || p.type !== "people" || !Array.isArray(p["people"])) return [];
  return p["people"].map((u: any) => ({ id: u.id, name: u.name ?? names.get(u.id) ?? null }));
}

/** Title property is located by type, never by a fixed name. */
export function readTitle(page: NotionPage): string | null {
  const t = Object.values(page.properties).find((p) => p.type === "title");
  return readText(t);
}

export function peopleIdsMissingNames(pages: NotionPage[]): string[] {
  const ids = new Set<string>();
  for (const page of pages)
    for (const p of Object.values(page.properties))
      if (p.type === "people") for (const u of p["people"] ?? []) if (!u.name) ids.add(u.id);
  return [...ids];
}

export function missingProps(
  schemaNames: string[] | null,
  expected: Record<string, string>,
): string[] {
  if (!schemaNames) return [];
  const set = new Set(schemaNames);
  return Object.values(expected).filter((n) => !set.has(n));
}

export function mapDemand(page: NotionPage, names: Map<string, string> = new Map()): Demand {
  const P = page.properties;
  const k = DEMAND_PROPS;
  return {
    id: page.id,
    notionUrl: page.url ?? null,
    title: readText(P[k.title]) ?? readTitle(page),
    demandCode: readText(P[k.code]),
    clientIds: readRelation(P[k.client]),
    responsaveis: readPeople(P[k.responsavel], names),
    createdAt: readDate(P[k.createdAt]) ?? page.created_time ?? null,
    completedAt: readDate(P[k.completedAt]),
    publishedAt: readDate(P[k.publishedAt]),
    dueDate: readDate(P[k.dueDate]),
    priority: readText(P[k.priority]),
    classification: readText(P[k.classification]),
    channel: readText(P[k.channel]),
    technicalType: readText(P[k.technicalType]),
    complexity: readText(P[k.complexity]),
    description: readText(P[k.description]),
    context: readText(P[k.context]),
    impact: readText(P[k.impact]),
    solution: readText(P[k.solution]),
    testsRun: readText(P[k.testsRun]),
    testResult: readText(P[k.testResult]),
    clientInformed: readCheckbox(P[k.clientInformed]),
    clientValidated: readCheckbox(P[k.clientValidated]),
    isTest: readCheckbox(P[k.isTest]) === true,
    status: readText(P[k.status]),
    sla: {
      statusUtil: readText(P[k.slaStatusUtil]),
      prazoFinalEfetivo: readDate(P[k.slaPrazoFinal]),
      prazoPrimeiraResposta: readDate(P[k.slaPrimeiraResposta]),
      prazoSolucao: readDate(P[k.slaSolucao]),
      statusSla: readText(P[k.slaStatus]),
      vencido: readCheckbox(P[k.slaVencido]),
    },
  };
}

export function mapClient(page: NotionPage, names: Map<string, string> = new Map()): Client {
  const P = page.properties;
  const k = CLIENT_PROPS;
  return {
    id: page.id,
    notionUrl: page.url ?? null,
    name: readTitle(page),
    empresa: readText(P[k.empresa]),
    idErp: readText(P[k.idErp]),
    slugErp: readText(P[k.slugErp]),
    contatoPrincipal: readText(P[k.contatoPrincipal]),
    emailEmpresa: readText(P[k.emailEmpresa]),
    telefoneEmpresa: readText(P[k.telefoneEmpresa]),
    emailContato: readText(P[k.emailContato]),
    telefoneContato: readText(P[k.telefoneContato]),
    whatsappContato: readText(P[k.whatsappContato]),
    segmentos: readMulti(P[k.segmentos]),
    plano: readText(P[k.plano]),
    status: readText(P[k.status]),
    responsaveis: readPeople(P[k.responsavel], names),
    isTest: readCheckbox(P[k.isTest]) === true,
  };
}

