#!/usr/bin/env node
// Credentials are read from secure environment bindings, never command-line arguments/files.
import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  agentReportSchema,
  reportFilePath,
  completionFact,
  canonicalReport,
} from "../src/lib/workspace/agent-report.ts";
import { caseFile } from "../src/lib/workspace/evidence.ts";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
function checked(result, operation) {
  if (result.error) {
    const m = result.error.message ?? "";
    const known = [
      "ambiguous_client",
      "client_conflict",
      "report_conflict",
      "ambiguous_demand",
      "review_required",
      "conflict",
      "missing_evidence",
      "approval_required",
      "forbidden",
      "not_found",
      "invalid_report",
      "invalid_file",
      "incomplete",
    ].find((k) => m.includes(k));
    throw new Error(
      `${operation}: ${known ?? "operação recusada ou indisponível"}. Nenhum sucesso foi presumido; confira a conexão e o card antes de repetir.`,
    );
  }
  return result.data;
}
async function main() {
  const [command, input, ...args] = process.argv.slice(2);
  if (
    !["validate", "inspect", "import"].includes(command) ||
    !input ||
    args.some((a, i) => i % 2 === 0 && a !== "--file") ||
    args.length % 2
  )
    throw new Error(
      "Uso: node --experimental-strip-types scripts/agent-reports.mjs validate|inspect|import relatorio.json [--file anexo.pdf ...]",
    );
  const info = await stat(input);
  if (info.size > 200000) throw new Error("Relatório excede 200 KB.");
  const raw = await readFile(input);
  const parsed = agentReportSchema.safeParse(JSON.parse(raw.toString("utf8")));
  if (!parsed.success)
    throw new Error(
      "Relatório inválido: " +
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  const report = parsed.data;
  const files = [];
  for (let i = 1; i < args.length; i += 2) {
    const path = args[i];
    const s = await stat(path);
    const type = caseFile({ name: basename(path), type: "", size: s.size });
    const bytes = await readFile(path);
    files.push({
      bytes,
      manifest: { name: type.name, mime: type.mime, size: bytes.length, sha256: hash(bytes) },
    });
  }
  // Preserve every fact as TXT; canonical formatting avoids duplicate generated evidence.
  const source = Buffer.from(canonicalReport(report), "utf8");
  files.push({
    bytes: source,
    manifest: {
      name: "relatorio-estruturado.txt",
      mime: "text/plain",
      size: source.length,
      sha256: hash(source),
    },
  });
  const unique = [...new Map(files.map((f) => [f.manifest.sha256, f])).values()];
  if (
    report.files.some((f) => !unique.some((x) => JSON.stringify(x.manifest) === JSON.stringify(f)))
  )
    throw new Error(
      "Há anexos declarados sem arquivo local correspondente. Não serão omitidos silenciosamente.",
    );
  report.files = unique.map((f) => f.manifest);
  agentReportSchema.parse(report);
  if (command === "validate") {
    console.log(
      JSON.stringify({
        status: "validated_only",
        external_id: report.external_id,
        available_files: report.files.map((f) => f.name),
        missing_files: report.missing_files,
      }),
    );
    return;
  }
  let local = {};
  try {
    local = parseEnv(await readFile(resolve(root, ".env"), "utf8"));
  } catch {}
  const url = process.env["SUPABASE_URL"] ?? local["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? local["SUPABASE_PUBLISHABLE_KEY"];
  const token = process.env["VISION_ACCESS_TOKEN"];
  if (!url || !key || !token)
    throw new Error(
      "Configure VISION_ACCESS_TOKEN pela configuração segura e as variáveis públicas do backend do Vision. Não envie credenciais no chat.",
    );
  const backend = new URL(url);
  if (backend.protocol !== "https:") throw new Error("O backend real deve usar HTTPS.");
  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const user = checked(await db.auth.getUser(token), "Autenticação");
  if (
    !user?.user?.id ||
    checked(await db.rpc("is_operator", { _uid: user.user.id }), "Permissão") !== true
  )
    throw new Error("É necessária uma sessão ativa de administrador ou CS do Vision.");
  const preview = checked(
    await db.rpc("ingest_agent_report", { _report: report, _preview: true }),
    "Consulta de cliente e duplicidade",
  );
  if (command === "inspect") {
    console.log(JSON.stringify({ status: "read_only", ...preview }, null, 2));
    return;
  }
  // The same RPC repeats the lookup under transactional locks; a previous read is never trusted alone.
  const received = checked(
    await db.rpc("ingest_agent_report", { _report: report, _preview: false }),
    "Recebimento",
  );
  const id = received.demand.id;
  for (const f of unique) {
    const path = reportFilePath(id, f.manifest);
    const registered = checked(
      await db
        .from("case_attachments")
        .select("id,path,mime_type,size_bytes")
        .eq("demand_id", id)
        .eq("path", path)
        .maybeSingle(),
      "Consulta de anexo",
    );
    if (
      registered &&
      (registered.mime_type !== f.manifest.mime ||
        Number(registered.size_bytes) !== f.manifest.size)
    )
      throw new Error("Anexo existente tem metadados divergentes; nada foi sobrescrito.");
    if (!registered) {
      const upload = await db.storage
        .from("case-evidence")
        .upload(path, f.bytes, { contentType: f.manifest.mime, upsert: false });
      // A previous interrupted upload may exist. Validate its bytes before attempting registration.
      if (
        upload.error &&
        !["409", "Duplicate"].includes(String(upload.error.statusCode ?? upload.error.error))
      )
        checked(upload, "Upload privado");
    }
    const blob = checked(
      await db.storage.from("case-evidence").download(path),
      "Leitura autorizada do anexo",
    );
    if (hash(Buffer.from(await blob.arrayBuffer())) !== f.manifest.sha256)
      throw new Error("Integridade do anexo não confere; conclusão não solicitada.");
    if (!registered)
      checked(
        await db.rpc("register_case_file", {
          _demand: id,
          _path: path,
          _filename: f.manifest.name,
          _mime: f.manifest.mime,
          _size: f.manifest.size,
        }),
        "Registro auditado do anexo",
      );
    const confirmed = checked(
      await db.from("case_attachments").select("id").eq("demand_id", id).eq("path", path).single(),
      "Conferência do anexo registrado",
    );
    if (!confirmed?.id) throw new Error("Registro do anexo não foi confirmado.");
  }
  const final = checked(
    await db.rpc("finalize_agent_report", { _receipt: received.receipt_id }),
    "Finalização auditada",
  );
  const saved = checked(
    await db
      .from("demands")
      .select(
        "id,code,client_id,classification,stage,owner_id,version,completed_at,client_validated,source_date_precision",
      )
      .eq("id", id)
      .single(),
    "Leitura final da demanda",
  );
  const history = checked(
    await db
      .from("workflow_history")
      .select("action,details")
      .eq("entity_id", id)
      .in("action", ["agent_report_received", "agent_report_completed"]),
    "Leitura do histórico",
  );
  if (
    !history.some((h) => h.details?.receipt_id === received.receipt_id) ||
    saved.client_id !== final.client.id ||
    final.state !== "finalized"
  )
    throw new Error("A conferência final não comprovou o vínculo e histórico esperados.");
  if (final.completion_applied && (saved.stage !== "Concluída" || !saved.completed_at))
    throw new Error("Conclusão não comprovada pela leitura final.");
  let cardUrl = null;
  if (process.env["VISION_APP_URL"]) {
    const app = new URL(process.env["VISION_APP_URL"]);
    if (app.protocol !== "https:")
      throw new Error("VISION_APP_URL deve ser o endereço HTTPS publicado do Vision.");
    cardUrl = new URL(final.card_path, app.origin).href;
  }
  const fact = completionFact(saved.completed_at, saved.source_date_precision ?? []);
  console.log(
    JSON.stringify(
      {
        status: "verified",
        ...final,
        demand: { ...saved, completed_at: fact.at, completed_on: fact.on },
        card_url: cardUrl,
        attachments: report.files.map((f) => f.name),
        missing_files: report.missing_files,
        note:
          report.completion.confirmed_by_user && !final.completion_applied
            ? saved.stage === "Concluída"
              ? "A conclusão já existente no card foi preservada."
              : "O relatório foi complementado sem substituir o estado manual do card; conclusão depende de conferência."
            : null,
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error instanceof SyntaxError ? "JSON inválido." : error.message);
  process.exitCode = 1;
});
