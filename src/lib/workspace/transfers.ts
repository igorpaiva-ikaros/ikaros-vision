import type { OperationState, Profile, RecordRow, TransferRequest } from "./types";

const CLOSED = ["Concluída", "Cancelada"];
export const TRANSFER_DECIDERS_LABEL = "administrador ou líder autorizado";

export function pendingTransfer(rowId: string, ds: Pick<OperationState, "transfers">) {
  return (
    (ds.transfers ?? []).find((t) => t.demand_id === rowId && t.status === "pendente") ?? null
  );
}

/**
 * Ações de transferência que a interface oferece para uma demanda.
 * Só organiza os botões: quem decide de fato é o banco (RPC com auth.uid()).
 */
export function transferActions(
  row: RecordRow,
  ds: Pick<OperationState, "transfers" | "canManageTransfers">,
  profile: Pick<Profile, "id" | "role"> | null,
  /** Validação em andamento: assumir/liberar ficam travados; transferir continua permitido. */
  reviewLocked = false,
) {
  const closed = !!(row.completed_at || row.canceled_at) || CLOSED.includes(row.stage ?? "");
  const pending = pendingTransfer(row.id, ds);
  const me = profile?.id;
  const manager = !!ds.canManageTransfers;
  const ownsIt = !!me && row.owner_id === me;
  return {
    pending,
    closed,
    /** Colaborador responsável sem delegação pede ao gestor. */
    canRequest: !closed && !pending && !manager && ownsIt && profile?.role === "cs",
    /** Solicitante cancela enquanto a decisão não sai. */
    canCancel: !!pending && pending.requested_by === me,
    /** Administrador ou líder delegado troca o responsável diretamente. */
    canTransfer: !closed && !pending && manager,
    /** Gestor decide; líder não decide a própria solicitação. */
    canDecide:
      !!pending && manager && (profile?.role === "admin" || pending.requested_by !== me),
    /** Liberar para a equipe deixou de ser atalho do colaborador. */
    canRelease: !closed && !pending && !reviewLocked && manager && !!row.owner_id,
    /** Assumir demanda sem responsável continua aberto a qualquer CS. */
    canClaim: !closed && !reviewLocked && !row.owner_id && profile?.role !== "technical",
  };
}

export function transferQueue(
  ds: Pick<OperationState, "transfers" | "canManageTransfers">,
  me: string | undefined,
): TransferRequest[] {
  return (ds.transfers ?? []).filter(
    (t) => t.status === "pendente" && (ds.canManageTransfers || t.requested_by === me),
  );
}

export const TRANSFER_STATUS_LABEL: Record<TransferRequest["status"], string> = {
  pendente: "Pendente",
  aprovada: "Aprovada",
  rejeitada: "Recusada",
  cancelada: "Cancelada",
};
