import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { saveMemberAccess } from "@/lib/workspace.functions";
import { DEFAULT_ACCESS, AREAS, type MemberAccess } from "@/lib/workspace/customization";
import { useBi } from "@/lib/bi-context";
import { Button } from "@/components/ui/button";
export function AccessSettings({ member }: { member: any }) {
  const [value, set] = useState<MemberAccess>({ ...DEFAULT_ACCESS, ...member.access });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const save = useServerFn(saveMemberAccess);
  const { reload } = useBi();
  return (
    <details className="rounded border p-4">
      <summary className="cursor-pointer text-sm">
        Liderança e navegação · {member.full_name}
      </summary>
      <form
        className="mt-4 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await save({
              data: {
                id: member.id,
                access: {
                  is_lead: value.is_lead,
                  view_team: value.view_team,
                  manage_cs: value.manage_cs,
                  promote_cs: value.promote_cs,
                  hidden_areas: value.hidden_areas,
                },
              },
            });
            reload();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Não foi possível salvar.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="space-y-3">
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.is_lead}
              onChange={(e) => set((v) => ({ ...v, is_lead: e.target.checked }))}
            />
            Líder de CS
          </label>
          {(
            [
              ["view_team", "Ver resultados operacionais do time"],
              ["manage_cs", "Cadastrar novos colaboradores CS"],
              ["promote_cs", "Promover e remover líderes CS"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex gap-2 text-sm">
              <input
                type="checkbox"
                disabled={!value.is_lead}
                checked={value[key]}
                onChange={(e) => set((v) => ({ ...v, [key]: e.target.checked }))}
              />
              {label}
            </label>
          ))}
          <p className="text-xs text-muted-foreground">
            Só o administrador concede estas permissões. Líderes não criam administradores nem
            repassam permissões de gestão. Desmarcar liderança suspende todas as delegações.
          </p>
          <p className="text-sm font-medium">Atalhos visíveis</p>
          <p className="text-xs text-muted-foreground">
            Organiza a navegação do colaborador. A carteira e os dados operacionais continuam
            compartilhados conforme o papel CS; não é uma restrição de confidencialidade.
          </p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(AREAS).map(([key, label]) => (
              <label key={key} className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!value.hidden_areas.includes(key)}
                  onChange={(e) =>
                    set((v) => ({
                      ...v,
                      hidden_areas: e.target.checked
                        ? v.hidden_areas.filter((x) => x !== key)
                        : [...v.hidden_areas, key],
                    }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <Button variant="outline" disabled={busy}>
          Salvar delegação
        </Button>
      </form>
    </details>
  );
}
