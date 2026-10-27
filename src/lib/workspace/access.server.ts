import type { Profile } from "./types";
export interface AuthContext {
  supabase: any;
  userId: string;
}
export async function assertOperator(context: AuthContext) {
  const { data, error } = await context.supabase.rpc("is_operator", { _uid: context.userId });
  if (error || data !== true) throw new Error("Acesso não autorizado.");
}
export async function assertWorkspace(context: AuthContext) {
  const { data, error } = await context.supabase.rpc("is_workspace_user", { _uid: context.userId });
  if (error || data !== true) throw new Error("Acesso não autorizado.");
}
export async function assertAdmin(context: AuthContext) {
  const { data, error } = await context.supabase.rpc("is_admin", { _uid: context.userId });
  if (error || data !== true) throw new Error("Acesso não autorizado.");
}
export async function readProfile(context: AuthContext): Promise<Profile | null> {
  const { data: p, error } = await context.supabase
    .from("profiles")
    .select("id,full_name,email,active,commission_eligible,avatar_url")
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
      : roles?.some((r: any) => r.role === "technical")
        ? "technical"
        : null;
  const { data: access, error: accessError } = await context.supabase
    .from("member_access")
    .select("is_lead,view_team,manage_cs,promote_cs,manage_demand_transfers,hidden_areas")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (accessError) throw new Error("Não foi possível verificar as permissões delegadas.");
  return role ? { ...p, role, access: access ?? undefined } : null;
}
export function checkResult(result: { error?: any; data?: any }) {
  if (result.error) throw new Error(safeDbMessage(result.error.message));
  return result.data;
}
const TRANSFER_MESSAGES: [RegExp, string][] = [
  [
    /transfer_pending/,
    "Já existe uma solicitação de transferência pendente para esta demanda. Aguarde a decisão ou cancele a solicitação.",
  ],
  [
    /transfer_required/,
    "Para passar esta demanda a outra pessoa, use Solicitar transferência. A liberação direta é exclusiva do administrador ou líder autorizado.",
  ],
  [/transfer_not_owner/, "Só o responsável atual pode solicitar a transferência desta demanda."],
  [/transfer_target_invalid/, "Selecione um colaborador de CS ativo como novo responsável."],
  [/transfer_same_owner/, "O novo responsável precisa ser diferente do atual."],
  [/transfer_reason_required/, "Informe o motivo com pelo menos 5 caracteres."],
  [/transfer_not_pending/, "Esta solicitação já foi decidida ou cancelada. Recarregue a página."],
  [
    /transfer_owner_changed/,
    "O responsável da demanda mudou depois da solicitação. Recuse esta solicitação e, se preciso, transfira de novo.",
  ],
  [
    /transfer_self_decision/,
    "Você não pode decidir a própria solicitação. Outro gestor ou o administrador decide.",
  ],
  [
    /transfer_forbidden/,
    "Sem permissão para esta transferência. Administrador ou líder autorizado decide.",
  ],
];
export function safeDbMessage(message: string) {
  for (const [pattern, text] of TRANSFER_MESSAGES) if (pattern.test(message)) return text;
  if (/validation_locked/.test(message))
    return "Aguarde a validação do administrador. A etapa e os dados enviados estão bloqueados.";
  if (/already_assigned/.test(message)) return "Outra pessoa já assumiu este atendimento.";
  if (/handoff_required/.test(message))
    return "Encaminhe pelo card, informando contexto e próximo retorno.";
  if (/approval_required/.test(message))
    return "Esta mudança precisa seguir a fila de aprovação e publicação.";
  if (/shared_portfolio/.test(message))
    return "A carteira é compartilhada. Assuma a demanda para atendê-la.";
  if (/invalid_file/.test(message)) return "Não foi possível confirmar o arquivo enviado.";
  if (/project_member_required/.test(message))
    return "Escolha uma pessoa ativa da equipe (CS ou administrador).";
  if (/project_closed/.test(message))
    return "Projeto encerrado. Reabra o projeto para alterar dados ou etapas.";
  if (/invalid_project_data/.test(message)) return "Confira os dados do projeto e tente novamente.";
  if (/inactive_product|product_required|catalog_required/.test(message))
    return "Selecione um plano ativo do catálogo.";
  if (/products_unique_name/.test(message)) return "Já existe um produto ou plano com este nome.";
  if (/invalid_sla_rule/.test(message))
    return "Confira os prazos: limite de 366 dias, 8.784 horas ou 100.000 minutos.";
  if (/closed/.test(message)) return "Este registro já foi encerrado.";
  if (/invalid_stage|invalid_step/.test(message))
    return "Esta etapa não está disponível para o estado atual do registro. Use as ações de aceite, conclusão ou efetivação no card.";
  if (/conflict/.test(message))
    return "Outra pessoa alterou este registro. Recarregue e tente novamente.";
  if (/last_admin/.test(message)) return "É necessário manter pelo menos um administrador ativo.";
  if (/incomplete/.test(message)) return message.replace(/^.*incomplete:\s*/, "");
  if (/effective_locked/.test(message))
    return "Os valores de um upgrade efetivado estão preservados para a conferência da comissão.";
  if (/owner_(inactive|required)/.test(message)) return "Selecione um responsável de CS ativo.";
  return "Não foi possível executar a ação. Confira seu acesso e os campos.";
}
