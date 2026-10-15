import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLeadershipState, createMember, setCsLeader } from "@/lib/workspace.functions";
import { useBi } from "@/lib/bi-context";
import { can } from "@/lib/workspace/customization";
import { PageTitle, Section } from "@/components/bi/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvatarPicker } from "./AvatarPicker";
export function Leadership() {
  const { profile, session, reload } = useBi();
  const get = useServerFn(getLeadershipState),
    create = useServerFn(createMember),
    promote = useServerFn(setCsLeader);
  const q = useQuery({
    queryKey: ["leadership-state", session?.user.id],
    queryFn: () => get(),
    retry: false,
  });
  const [form, set] = useState({
    name: "",
    email: "",
    password: "",
    avatar: null as string | null,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      reload();
      setMessage("Alteração salva.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  if (q.isPending) return <p>Carregando liderança…</p>;
  if (q.isError || !q.data)
    return <p role="alert">Não foi possível acessar a liderança. Confira sua autorização.</p>;
  return (
    <>
      <PageTitle
        title="Liderança CS"
        subtitle="Acompanhe a operação e use as responsabilidades delegadas pelo administrador."
      />
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className="space-y-5">
        {can(profile, "view_team") && (
          <Section title="Resultados do time">
            <p className="mb-3 text-xs text-muted-foreground">
              Operação real · totais da base · sem testes, valores de contratos ou comissões.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left p-2">Responsável</th>
                    <th>Em aberto</th>
                    <th>Concluídas</th>
                    <th>SLA atrasado agora</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.stats.map((s: any) => (
                    <tr key={s.owner_id ?? "none"} className="border-t">
                      <td className="p-3">{s.full_name ?? "A assumir"}</td>
                      <td className="text-center">{s.open}</td>
                      <td className="text-center">{s.completed}</td>
                      <td className="text-center">{s.overdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!q.data.stats.length && <p className="p-3">Ainda não há demandas reais.</p>}
            </div>
          </Section>
        )}
        {can(profile, "manage_cs") && (
          <Section title="Adicionar colaborador CS">
            <form
              className="max-w-xl space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await create({ data: { ...form, role: "cs" } });
                  set({ name: "", email: "", password: "", avatar: null });
                });
              }}
            >
              <fieldset disabled={busy} className="space-y-3">
                <AvatarPicker
                  value={form.avatar}
                  name={form.name}
                  onChange={(avatar) => set((v) => ({ ...v, avatar }))}
                />
                {(["name", "email", "password"] as const).map((key) => (
                  <label key={key} className="block text-sm">
                    {key === "name" ? "Nome" : key === "email" ? "E-mail (login)" : "Senha inicial"}
                    <Input
                      required
                      minLength={key === "password" ? 8 : 2}
                      type={key === "password" ? "password" : key === "email" ? "email" : "text"}
                      value={form[key]}
                      onChange={(e) => set((v) => ({ ...v, [key]: e.target.value }))}
                    />
                  </label>
                ))}
                <Button>Criar conta CS</Button>
              </fieldset>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">
              A conta nasce como colaborador. Permissões administrativas não podem ser concedidas
              por líderes.
            </p>
          </Section>
        )}
        {(can(profile, "manage_cs") || can(profile, "promote_cs")) && (
          <Section title="Colaboradores CS">
            <p className="mb-3 text-xs text-muted-foreground">
              Promover a líder não concede poderes de administrador nem transfere suas permissões. O
              administrador define cada delegação.
            </p>
            {q.data.members.map((m: any) => (
              <div key={m.id} className="flex flex-wrap justify-between gap-3 border-b py-3">
                <div>
                  <p>
                    {m.full_name} · {m.access?.is_lead ? "Líder CS" : "Colaborador CS"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.email} · {m.active ? "Ativo" : "Inativo"}
                  </p>
                </div>
                {can(profile, "promote_cs") && m.id !== profile?.id && (
                  <Button
                    variant="outline"
                    disabled={busy || !m.active}
                    onClick={() =>
                      void run(() => promote({ data: { id: m.id, leader: !m.access?.is_lead } }))
                    }
                  >
                    {m.access?.is_lead ? "Remover liderança" : "Promover a líder CS"}
                  </Button>
                )}
              </div>
            ))}
          </Section>
        )}
      </div>
    </>
  );
}
