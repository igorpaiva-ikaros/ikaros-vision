import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getCaseWorkspace,
  postCaseMessage,
  registerCaseFile,
  runDeliveryAction,
} from "@/lib/workspace.functions";
import { useBi } from "@/lib/bi-context";
import { supabase } from "@/integrations/supabase/client";
import { caseFile } from "@/lib/workspace/evidence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, dateLabel, selectClass } from "./Operation";
import { toUtc, toLocalTime } from "./Tasks";
import type { DeliveryRequest } from "@/lib/workspace/types";
export function CaseWorkspace({
  demand,
  canManage,
  technical = false,
}: {
  demand: string;
  canManage: boolean;
  technical?: boolean;
}) {
  const { session, reload } = useBi();
  const get = useServerFn(getCaseWorkspace),
    post = useServerFn(postCaseMessage),
    register = useServerFn(registerCaseFile);
  const q = useQuery({
    queryKey: ["case-workspace", session?.user.id, demand],
    queryFn: () => get({ data: { demand } }),
    refetchInterval: 15000,
    retry: false,
  });
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function work(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível executar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {q.isPending ? (
        <p role="status">Carregando comunicação e anexos…</p>
      ) : q.isError ? (
        <Button type="button" variant="outline" onClick={() => q.refetch()}>
          Tentar carregar contexto
        </Button>
      ) : (
        <>
          <DeliveryControls
            demand={demand}
            request={q.data?.request ?? null}
            canManage={canManage}
            technical={technical}
          />
          <details open className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Anexos e evidências</summary>
            <div className="mt-3 space-y-2">
              {(q.data?.files ?? []).map((f) => (
                <Button
                  key={f.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void work(async () => {
                      const { data, error } = await supabase.storage
                        .from("case-evidence")
                        .createSignedUrl(f.path, 60, { download: f.filename });
                      if (error || !data) throw new Error("Não foi possível abrir o anexo.");
                      const a = document.createElement("a");
                      a.href = data.signedUrl;
                      a.target = "_blank";
                      a.rel = "noopener noreferrer";
                      a.click();
                    })
                  }
                >
                  {f.filename} · {(f.size_bytes / 1024 / 1024).toFixed(1)} MB
                </Button>
              ))}
              <Field label="Anexar documento, imagem, vídeo ou áudio">
                <Input
                  type="file"
                  disabled={busy}
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.mp4,.webm,.mov,.mp3,.ogg,.wav,.m4a,.docx,.xlsx,.txt,.csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file)
                      void work(async () => {
                        const info = caseFile(file);
                        const path = `${demand}/${crypto.randomUUID()}/${info.safeName}`;
                        const result = await supabase.storage
                          .from("case-evidence")
                          .upload(path, file, { contentType: info.mime, upsert: false });
                        if (result.error) throw new Error("Não foi possível enviar o arquivo.");
                        try {
                          await register({
                            data: {
                              demand,
                              path,
                              filename: info.name,
                              mime: info.mime,
                              size: file.size,
                            },
                          });
                        } catch (e) {
                          await supabase.storage.from("case-evidence").remove([path]);
                          throw e;
                        }
                      });
                  }}
                />
              </Field>
              <p className="text-xs text-muted-foreground">
                Até 50 MB por arquivo. Acesso privado, restrito às pessoas autorizadas neste
                atendimento.
              </p>
            </div>
          </details>
          <details open className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Observações e comunicação interna
            </summary>
            <div className="mt-3 max-h-64 space-y-3 overflow-y-auto">
              {(q.data?.messages ?? []).map((m) => (
                <div key={m.id} className="border-b pb-2 text-sm">
                  <p className="text-xs text-muted-foreground">
                    {m.author_name} · {dateLabel(m.created_at)}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
              ))}
            </div>
            <Field label="Nova observação">
              <Textarea
                value={message}
                maxLength={10000}
                disabled={busy}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>
            <Button
              type="button"
              className="mt-2"
              disabled={busy || message.trim().length < 2}
              onClick={() =>
                void work(async () => {
                  await post({ data: { demand, body: message } });
                  setMessage("");
                })
              }
            >
              Enviar observação
            </Button>
          </details>
        </>
      )}
    </div>
  );
}
export function DeliveryControls({
  demand,
  request,
  canManage,
  technical = false,
}: {
  demand: string;
  request: DeliveryRequest | null;
  canManage: boolean;
  technical?: boolean;
}) {
  const { profile, reload } = useBi(),
    run = useServerFn(runDeliveryAction);
  const [mode, setMode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [values, setValues] = useState<Record<string, string>>({
    context: request?.context ?? "",
    next_update_at: request?.next_update_at ? toLocalTime(request.next_update_at) : "",
    delivery_eta: request?.delivery_eta ? toLocalTime(request.delivery_eta) : "",
    stage:
      request?.technical_stage === "Recebida"
        ? "Em análise"
        : (request?.technical_stage ?? "Em análise"),
    reason: "",
    result: request?.technical_result ?? "",
    tests: request?.tests_result ?? "",
    summary: request?.change_summary ?? "",
    repository_url: request?.repository_url ?? "",
    deployment_ref: "",
  });
  const update = (k: string, v: string) => setValues((old) => ({ ...old, [k]: v }));
  async function act(action: string) {
    setBusy(true);
    setError("");
    try {
      const data: Record<string, string | boolean | null> = { ...values };
      if (values["next_update_at"]) data["next_update_at"] = toUtc(values["next_update_at"]);
      if (values["delivery_eta"]) data["delivery_eta"] = toUtc(values["delivery_eta"]);
      if (action === "published") data["confirmed"] = true;
      await run({
        data: { demand, action: action as "forward", version: request?.version ?? 0, values: data },
      });
      reload();
      setMode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível executar.");
    } finally {
      setBusy(false);
    }
  }
  const input = (key: string, label: string, type = "text", required = true) => (
    <Field label={label}>
      <Input
        value={values[key] ?? ""}
        type={type}
        required={required}
        onChange={(e) => update(key, e.target.value)}
      />
    </Field>
  );
  const area = (key: string, label: string) => (
    <Field label={label}>
      <Textarea
        required
        value={values[key] ?? ""}
        maxLength={10000}
        onChange={(e) => update(key, e.target.value)}
      />
    </Field>
  );
  return (
    <section className="rounded-lg border p-3 space-y-3" aria-label="Percurso técnico e aprovação">
      {request && (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            Equipe técnica: <b>{request.technical ? request.technical_stage : "Não encaminhada"}</b>
          </p>
          <p>
            Aprovação: <b>{request.approval_state}</b>
          </p>
          <p
            className={
              request.next_update_at &&
              Date.parse(request.next_update_at) < Date.now() &&
              request.technical_stage !== "Pronta para validação"
                ? "text-destructive"
                : ""
            }
          >
            Próximo retorno: {dateLabel(request.next_update_at)}
          </p>
          <p>
            Previsão de entrega:{" "}
            {request.delivery_eta
              ? dateLabel(request.delivery_eta)
              : "A confirmar pela equipe técnica"}
          </p>
          {request.repository_url && (
            <a
              href={request.repository_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-primary"
            >
              Abrir mudança no GitHub
            </a>
          )}
          {request.technical_result && (
            <p className="whitespace-pre-wrap">Solução técnica: {request.technical_result}</p>
          )}
          {request.rejection_reason && <p>Solicitação de ajuste: {request.rejection_reason}</p>}
          {request.approval_state === "publicada" && (
            <p className="text-primary sm:col-span-2">
              Publicação registrada. CS: valide a entrega, avise o cliente e então conclua a
              demanda.
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {canManage &&
          !technical &&
          (!request ||
            !["aguardando", "aprovada", "publicada"].includes(request.approval_state)) && (
            <>
              <Button type="button" size="sm" variant="outline" onClick={() => setMode("forward")}>
                Encaminhar à equipe técnica
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setMode("request_approval")}
              >
                Enviar para aprovação
              </Button>
            </>
          )}
        {(technical || profile?.role === "admin") &&
          request?.technical &&
          !["aguardando", "aprovada", "publicada"].includes(request.approval_state) && (
            <Button type="button" size="sm" onClick={() => setMode("technical_update")}>
              Atualizar atendimento técnico
            </Button>
          )}
        {profile?.role === "admin" && request?.approval_state === "aguardando" && (
          <>
            <Button type="button" size="sm" disabled={busy} onClick={() => void act("approve")}>
              Aprovar para publicação
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setMode("reject")}>
              Solicitar ajustes
            </Button>
          </>
        )}
        {profile?.role === "admin" && request?.approval_state === "aprovada" && (
          <Button type="button" size="sm" onClick={() => setMode("published")}>
            Registrar publicação realizada
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {mode && (
        <div className="space-y-3 rounded-lg bg-muted/30 p-3">
          <fieldset disabled={busy} className="space-y-3">
            {mode === "forward" && (
              <>
                {area("context", "Contexto e impacto para a equipe técnica")}
                {input(
                  "next_update_at",
                  "Retorno para confirmar a previsão (São Paulo)",
                  "datetime-local",
                )}
              </>
            )}
            {mode === "technical_update" && (
              <>
                <Field label="Etapa técnica">
                  <select
                    className={selectClass}
                    value={values["stage"]}
                    onChange={(e) => update("stage", e.target.value)}
                  >
                    {["Em análise", "Em desenvolvimento", "Bloqueada", "Pronta para validação"].map(
                      (v) => (
                        <option key={v}>{v}</option>
                      ),
                    )}
                  </select>
                </Field>
                {input("next_update_at", "Próxima atualização (São Paulo)", "datetime-local")}
                {input("delivery_eta", "Previsão de entrega (São Paulo)", "datetime-local", false)}
                {area("reason", "Justificativa de bloqueio ou mudança de previsão")}
                {area("result", "Solução / andamento técnico")}
                {area("tests", "Testes e evidências")}
              </>
            )}
            {mode === "request_approval" && (
              <>
                {area("summary", "Resumo da mudança e comportamento esperado")}
                {input("repository_url", "Link do PR ou commit no GitHub", "url")}
                {area("tests", "Testes realizados e resultado")}
              </>
            )}
            {mode === "reject" && area("reason", "Ajustes necessários")}
            {mode === "published" && (
              <>
                {input("deployment_ref", "Referência do deploy realizado")}
                <p className="text-xs">
                  Confirme somente depois da publicação efetiva. Este botão registra o evento e não
                  executa o deploy.
                </p>
              </>
            )}
          </fieldset>
          <div className="flex gap-2">
            <Button type="button" disabled={busy} onClick={() => void act(mode)}>
              {mode === "published" ? "Confirmar que foi publicada" : "Enviar"}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setMode("")}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
