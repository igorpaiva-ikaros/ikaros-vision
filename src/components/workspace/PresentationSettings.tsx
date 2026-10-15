import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getPresentation, savePresentation } from "@/lib/workspace.functions";
import { useBi } from "@/lib/bi-context";
import { CATEGORIES } from "@/lib/domain/categories";
import {
  STAGES,
  PIPELINES,
  DEFAULT_PRESENTATION,
  displayLabel,
  orderedStages,
  presentationSchema,
  type Presentation,
  type Pipeline,
  type StageGroup,
} from "@/lib/workspace/customization";
import { STAGE_GUIDE } from "@/lib/workspace/guidance";
import { Section } from "@/components/bi/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function PresentationSettings() {
  const { session, reload } = useBi();
  const get = useServerFn(getPresentation);
  const q = useQuery({
    queryKey: ["presentation", session?.user.id],
    queryFn: () => get(),
    retry: false,
  });
  if (q.isPending) return <p>Carregando configuração…</p>;
  if (q.isError || !q.data)
    return (
      <p role="alert">
        Não foi possível carregar as configurações.{" "}
        <Button onClick={() => q.refetch()}>Tentar novamente</Button>
      </p>
    );
  return (
    <Editor
      key={q.data.version}
      version={q.data.version}
      initial={q.data.draft ?? DEFAULT_PRESENTATION}
      reload={reload}
    />
  );
}
function Editor({
  version,
  initial,
  reload,
}: {
  version: number;
  initial: Presentation;
  reload: () => void;
}) {
  const [config, set] = useState(initial);
  const [confirmed, confirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = useServerFn(savePresentation);
  const { setPreviewConfig } = useBi();
  const edit = (group: string, key: string, value: string) => {
    set((v) => ({ ...v, labels: { ...v.labels, [`${group}:${key}`]: value } }));
    confirm(false);
  };
  async function submit(publish: boolean) {
    setBusy(true);
    setError("");
    try {
      const validated = presentationSchema.parse({
        ...config,
        labels: Object.fromEntries(Object.entries(config.labels).filter(([, v]) => v.trim())),
      });
      await save({ data: { version, config: validated, publish } });
      setPreviewConfig(!publish);
      reload();
      toast.success(
        publish
          ? "Configuração publicada para a equipe."
          : "Rascunho salvo. Só você vê a prévia nesta sessão.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  const rename = (group: string, key: string, name: string, help: string) => (
    <div key={key} className="grid gap-2 border-b py-3 sm:grid-cols-2">
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
      <Input
        aria-label={`Nome de ${group} ${key}`}
        placeholder={name}
        maxLength={60}
        value={config.labels[`${group}:${key}`] ?? ""}
        onChange={(e) => edit(group, key, e.target.value)}
      />
    </div>
  );
  return (
    <Section title="Nomes, etapas e funis">
      <p className="mb-4 text-sm text-muted-foreground">
        Personalize a linguagem da equipe. A função original, o histórico, o SLA e as exigências de
        aprovação permanecem. Um nome com outro significado pode confundir o colaborador.
      </p>
      <fieldset disabled={busy} className="space-y-4">
        <details className="rounded border p-4">
          <summary className="cursor-pointer font-medium">Categorias</summary>
          {CATEGORIES.map((c) => rename("category", c.value, c.label, c.description))}
        </details>
        <details className="rounded border p-4">
          <summary className="cursor-pointer font-medium">Nomes dos funis principais</summary>
          {Object.entries(PIPELINES).map(([key, name]) =>
            rename(
              "pipeline",
              key,
              name,
              "Altera somente o nome exibido. Os registros continuam no mesmo fluxo.",
            ),
          )}
        </details>
        {Object.entries(STAGES).map(([kind, stages]) => (
          <details key={kind} className="rounded border p-4">
            <summary className="cursor-pointer font-medium">
              Etapas ·{" "}
              {kind === "onboarding_status"
                ? "Situação do onboarding"
                : PIPELINES[kind as Pipeline]}
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              A ordem altera as colunas e a barra visual. Não executa ações nem libera etapas
              protegidas.
            </p>
            {orderedStages(config, kind as StageGroup).map((stage, i, arr) => (
              <div key={stage} className="flex items-center gap-2">
                <div className="flex-1">
                  {rename(
                    kind,
                    stage,
                    stage,
                    STAGE_GUIDE[stage] ?? "A função original desta etapa permanece.",
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={i === 0}
                  aria-label={`Subir ${kind} ${stage}`}
                  onClick={() => {
                    const order = [...arr];
                    [order[i - 1], order[i]] = [order[i]!, order[i - 1]!];
                    set((v) => ({ ...v, order: { ...v.order, [kind]: order } }));
                    confirm(false);
                  }}
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={i === arr.length - 1}
                  aria-label={`Descer ${kind} ${stage}`}
                  onClick={() => {
                    const order = [...arr];
                    [order[i + 1], order[i]] = [order[i]!, order[i + 1]!];
                    set((v) => ({ ...v, order: { ...v.order, [kind]: order } }));
                    confirm(false);
                  }}
                >
                  ↓
                </Button>
              </div>
            ))}
          </details>
        ))}
        <details className="rounded border p-4">
          <summary className="cursor-pointer font-medium">
            Funis de visualização · {config.views.length}
          </summary>
          <p className="my-3 text-sm text-muted-foreground">
            Separe implantação, acompanhamento ou outra frente com filtros de etapas e categorias.
            São visões dos mesmos cards: não duplicam dados nem criam automações. A visão completa
            permanece disponível.
          </p>
          {config.views.map((view, i) => (
            <div key={view.id} className="mb-3 space-y-3 rounded border p-3">
              <Input
                aria-label={`Nome do funil ${i + 1}`}
                value={view.label}
                maxLength={60}
                onChange={(e) =>
                  set((v) => ({
                    ...v,
                    views: v.views.map((x) =>
                      x.id === view.id ? { ...x, label: e.target.value } : x,
                    ),
                  }))
                }
              />
              <label className="block text-sm">
                Fluxo de origem
                <select
                  className="ml-3 rounded border bg-background p-2"
                  value={view.kind}
                  onChange={(e) =>
                    set((v) => ({
                      ...v,
                      views: v.views.map((x) =>
                        x.id === view.id
                          ? { ...x, kind: e.target.value as Pipeline, stages: [], categories: [] }
                          : x,
                      ),
                    }))
                  }
                >
                  {Object.entries(PIPELINES).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs">Etapas (nenhuma selecionada = todas)</p>
              <div className="flex flex-wrap gap-3">
                {STAGES[view.kind].map((s) => (
                  <label key={s} className="flex gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={view.stages.includes(s)}
                      onChange={(e) =>
                        set((v) => ({
                          ...v,
                          views: v.views.map((x) =>
                            x.id === view.id
                              ? {
                                  ...x,
                                  stages: e.target.checked
                                    ? [...x.stages, s]
                                    : x.stages.filter((a) => a !== s),
                                }
                              : x,
                          ),
                        }))
                      }
                    />
                    {displayLabel(config, view.kind, s)}
                  </label>
                ))}
              </div>
              {view.kind === "demands" && (
                <>
                  <p className="text-xs">Categorias (nenhuma selecionada = todas)</p>
                  <div className="flex flex-wrap gap-3">
                    {CATEGORIES.map((c) => (
                      <label key={c.value} className="flex gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={view.categories.includes(c.value)}
                          onChange={(e) =>
                            set((v) => ({
                              ...v,
                              views: v.views.map((x) =>
                                x.id === view.id
                                  ? {
                                      ...x,
                                      categories: e.target.checked
                                        ? [...x.categories, c.value]
                                        : x.categories.filter((a) => a !== c.value),
                                    }
                                  : x,
                              ),
                            }))
                          }
                        />
                        {displayLabel(config, "category", c.value, c.label)}
                      </label>
                    ))}
                  </div>
                </>
              )}
              <Button
                variant="ghost"
                onClick={() =>
                  set((v) => ({ ...v, views: v.views.filter((x) => x.id !== view.id) }))
                }
              >
                Remover visão
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            disabled={config.views.length >= 20}
            onClick={() =>
              set((v) => ({
                ...v,
                views: [
                  ...v.views,
                  {
                    id: crypto.randomUUID(),
                    label: "Novo funil",
                    kind: "demands",
                    stages: [],
                    categories: [],
                  },
                ],
              }))
            }
          >
            Criar funil de visualização
          </Button>
        </details>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(e) => confirm(e.target.checked)} />
          Revisei os nomes e entendo que as regras e funções originais permanecem.
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => void submit(false)}>
            Salvar rascunho e testar
          </Button>
          <Button disabled={!confirmed} onClick={() => void submit(true)}>
            Publicar para a equipe
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              set(DEFAULT_PRESENTATION);
              confirm(false);
            }}
          >
            Restaurar nomes e ordem padrão
          </Button>
        </div>
      </fieldset>
    </Section>
  );
}
