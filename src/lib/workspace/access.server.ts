import type { Profile } from "./types";
export interface AuthContext {
  supabase: any;
  userId: string;
}
export async function assertOperator(context: AuthContext) {
  const { data, error } = await context.supabase.rpc("is_operator", { _uid: context.userId });
  if (error || data !== true) throw new Error("Acesso não autorizado.");
}
export async function assertAdmin(context: AuthContext) {
  const { data, error } = await context.supabase.rpc("is_admin", { _uid: context.userId });
  if (error || data !== true) throw new Error("Acesso não autorizado.");
}
export async function readProfile(context: AuthContext): Promise<Profile | null> {
  const { data: p, error } = await context.supabase
    .from("profiles")
    .select("id,full_name,email,active,commission_eligible")
    .eq("id", context.userId)
    .maybeSingle();
  if (error || !p?.active) return null;
  const { data: roles, error: roleError } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (roleError) throw new Error("Não foi possível verificar o acesso.");
  const role = roles?.some((r: any) => r.role === "admin")
    ? "admin"
    : roles?.some((r: any) => r.role === "cs")
      ? "cs"
      : null;
  return role ? { ...p, role } : null;
}
export function checkResult(result: { error?: any; data?: any }) {
  if (result.error) throw new Error(safeDbMessage(result.error.message));
  return result.data;
}
export function safeDbMessage(message: string) {
  if (/conflict/.test(message))
    return "Outra pessoa alterou este registro. Recarregue e tente novamente.";
  if (/last_admin/.test(message)) return "É necessário manter pelo menos um administrador ativo.";
  if (/incomplete/.test(message)) return message.replace(/^.*incomplete:\s*/, "");
  if (/effective_locked/.test(message))
    return "Os valores de um upgrade efetivado estão preservados para a conferência da comissão.";
  if (/owner_(inactive|required)/.test(message)) return "Selecione um responsável de CS ativo.";
  return "Não foi possível executar a ação. Confira seu acesso e os campos.";
}
