import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { saveProduct, saveSlaPolicy } from "@/lib/workspace.functions";
import type { Product, SlaPolicy } from "@/lib/workspace/types";
import { Section } from "@/components/bi/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "./Operation";

export function Configuration({
  products,
  policies,
  reload,
}: {
  products: Product[];
  policies: SlaPolicy[];
  reload: () => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-6">
      <Section title="Produtos e planos">
        <p className="mb-4 text-sm text-muted-foreground">
          O CS seleciona os planos ativos. Alterações no catálogo não reajustam contratos nem
          comissões anteriores. O preço anual é o equivalente mensal de um contrato de 12 meses.
        </p>
        <div className="space-y-3">
          {products.map((p) => (
            <ProductForm key={p.id + ":" + p.version} product={p} reload={reload} />
          ))}
          {adding && (
            <ProductForm
              reload={() => {
                setAdding(false);
                reload();
              }}
            />
          )}
        </div>
        <Button className="mt-4" variant="outline" onClick={() => setAdding(!adding)}>
          {adding ? "Cancelar novo plano" : "+ Novo produto / plano"}
        </Button>
      </Section>
      <Section title="SLA por categoria de demanda">
        <p className="mb-4 text-sm text-muted-foreground">
          A instalação preserva os prazos atuais. Ao salvar uma mudança, demandas abertas desta
          categoria são recalculadas a partir do recebimento. Demandas encerradas e prazos manuais
          de entrega são preservados. Contagem útil: segunda a sexta, 9h às 18h, horário de São
          Paulo, respeitando os feriados do calendário.
        </p>
        <div className="space-y-3">
          {policies.map((p) => (
            <PolicyForm key={p.category + ":" + p.version} policy={p} reload={reload} />
          ))}
        </div>
      </Section>
    </div>
  );
}
function ProductForm({ product, reload }: { product?: Product; reload: () => void }) {
  const save = useServerFn(saveProduct);
  const [id] = useState(() => product?.id ?? crypto.randomUUID());
  const [values, set] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    monthly: Number(product?.monthly_value ?? 0),
    annual: Number(product?.annual_monthly_value ?? 0),
    active: product?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <details className="rounded-lg border bg-card p-4" open={!product || undefined}>
      <summary className="cursor-pointer font-medium">
        {product?.name ?? "Novo plano"}{" "}
        {product && (
          <span className="ml-2 text-xs text-muted-foreground">
            {product.active ? "Ativo" : "Inativo"} · R${" "}
            {Number(product.monthly_value).toLocaleString("pt-BR")}/mês
          </span>
        )}
      </summary>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await save({ data: { id, version: product?.version ?? null, ...values } });
            toast.success("Catálogo atualizado.");
            reload();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao salvar.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Nome do produto / plano *">
          <Input
            required
            minLength={2}
            maxLength={100}
            value={values.name}
            onChange={(e) => set({ ...values, name: e.target.value })}
          />
        </Field>
        <Field label="Descrição curta">
          <Input
            maxLength={2000}
            value={values.description}
            onChange={(e) => set({ ...values, description: e.target.value })}
          />
        </Field>
        <Field label="Mensalidade · contrato mensal (R$)">
          <Input
            type="number"
            required
            min={0}
            max={10000000}
            step="0.01"
            value={values.monthly}
            onChange={(e) => set({ ...values, monthly: Number(e.target.value) })}
          />
        </Field>
        <Field label="Equivalente mensal · contrato anual (R$)">
          <Input
            type="number"
            required
            min={0}
            max={10000000}
            step="0.01"
            value={values.annual}
            onChange={(e) => set({ ...values, annual: Number(e.target.value) })}
          />
        </Field>
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.active}
            onChange={(e) => set({ ...values, active: e.target.checked })}
          />
          Disponível para novos cadastros
        </label>
        <Button disabled={busy}>{busy ? "Salvando…" : "Salvar plano"}</Button>
        {error && (
          <p role="alert" className="text-sm text-destructive sm:col-span-2">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}
function PolicyForm({ policy, reload }: { policy: SlaPolicy; reload: () => void }) {
  const save = useServerFn(saveSlaPolicy);
  const { category, version, ...initial } = policy;
  // Database rows contain timestamps too: submit an explicit whitelist of editable values.
  const [rules, set] = useState({
    response_value: initial.response_value,
    response_unit: initial.response_unit,
    response_basis: initial.response_basis,
    resolution_value: initial.resolution_value,
    resolution_unit: initial.resolution_unit,
    resolution_basis: initial.resolution_basis,
    delivery_value: initial.delivery_value,
    delivery_unit: initial.delivery_unit,
    delivery_basis: initial.delivery_basis,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="cursor-pointer font-medium">
        {category}
        <span className="ml-2 text-xs text-muted-foreground">
          Resposta: {rules.response_value} {unitLabel(rules.response_unit)} · Resolução:{" "}
          {rules.resolution_value} {unitLabel(rules.resolution_unit)}
        </span>
      </summary>
      <form
        className="mt-4 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await save({ data: { category, version, rules } });
            toast.success(
              result.changed
                ? `${result.recalculated} demanda(s) recalculada(s).${result.missingStart ? ` ${result.missingStart} sem data de recebimento; prazos preservados.` : ""}`
                : "Regras já estão atualizadas; nenhum prazo alterado.",
            );
            reload();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao salvar.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {(
          [
            ["response", "Primeira resposta"],
            ["resolution", "Resolução ou encaminhamento"],
            ["delivery", "Entrega final"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <p className="mb-2 text-sm font-medium">{label}</p>
            {key === "delivery" && (
              <label className="mb-2 flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={rules.delivery_value !== null}
                  onChange={(e) => set({ ...rules, delivery_value: e.target.checked ? 1 : null })}
                />
                Prazo automático de entrega (prazo manual tem prioridade)
              </label>
            )}
            <div className="grid grid-cols-3 gap-2">
              <Input
                aria-label={`${category} ${label} quantidade`}
                type="number"
                min={1}
                max={100000}
                required
                disabled={rules[`${key}_value`] === null || busy}
                value={rules[`${key}_value`] ?? ""}
                onChange={(e) => set({ ...rules, [`${key}_value`]: Number(e.target.value) })}
              />
              <select
                aria-label={`${category} ${label} unidade`}
                className={selectClass}
                disabled={rules[`${key}_value`] === null || busy}
                value={rules[`${key}_unit`]}
                onChange={(e) => set({ ...rules, [`${key}_unit`]: e.target.value })}
              >
                <option value="minutes">Minutos</option>
                <option value="hours">Horas</option>
                <option value="days">Dias</option>
              </select>
              <select
                aria-label={`${category} ${label} contagem`}
                className={selectClass}
                disabled={rules[`${key}_value`] === null || busy}
                value={rules[`${key}_basis`]}
                onChange={(e) => set({ ...rules, [`${key}_basis`]: e.target.value })}
              >
                <option value="business">Úteis</option>
                <option value="calendar">Corridos</option>
              </select>
            </div>
          </div>
        ))}
        <Button disabled={busy}>
          {busy ? "Recalculando…" : "Salvar regras e recalcular abertas"}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}
function unitLabel(unit: string) {
  return { minutes: "min", hours: "h", days: "dia(s)" }[unit] ?? unit;
}
