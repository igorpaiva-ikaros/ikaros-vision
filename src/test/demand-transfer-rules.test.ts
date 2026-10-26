import { describe, expect, it } from "vitest";
import { transferActions, transferQueue } from "@/lib/workspace/transfers";
import { safeDbMessage } from "@/lib/workspace/access.server";
import { can } from "@/lib/workspace/customization";
import type { RecordRow, TransferRequest } from "@/lib/workspace/types";

const me = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const row = (extra: Partial<RecordRow> = {}) =>
  ({ id: "d1", code: "DEM-1", owner_id: me, stage: "Em execução", version: 3, ...extra }) as RecordRow;
const pending = (by = me): TransferRequest => ({
  id: "t1",
  demand_id: "d1",
  kind: "request",
  status: "pendente",
  from_owner_id: by,
  to_owner_id: "x",
  requested_by: by,
  reason: "Férias",
  decided_by: null,
  decided_at: null,
  decision_reason: null,
  demand_version: 3,
  version: 1,
  created_at: "2026-10-26T12:00:00Z",
});
const cs = { id: me, role: "cs" as const };

describe("Ações de transferência no card", () => {
  it("colaborador responsável só solicita; não libera nem transfere direto", () => {
    const a = transferActions(row(), { transfers: [], canManageTransfers: false }, cs);
    expect(a).toMatchObject({ canRequest: true, canTransfer: false, canRelease: false });
  });
  it("colaborador não solicita demanda de outra pessoa", () => {
    const a = transferActions(row({ owner_id: other }), { canManageTransfers: false }, cs);
    expect(a.canRequest).toBe(false);
  });
  it("pendência mostra cancelar ao solicitante e bloqueia nova solicitação", () => {
    const a = transferActions(row(), { transfers: [pending()], canManageTransfers: false }, cs);
    expect(a).toMatchObject({ canRequest: false, canCancel: true, canDecide: false });
  });
  it("gestor transfere demanda alheia, mesmo com validação travada", () => {
    const a = transferActions(row({ owner_id: other }), { canManageTransfers: true }, cs, true);
    expect(a).toMatchObject({ canTransfer: true, canRelease: false, canClaim: false });
  });
  it("líder delegado não decide a própria solicitação; administrador decide", () => {
    const ds = { transfers: [pending()], canManageTransfers: true };
    expect(transferActions(row(), ds, cs).canDecide).toBe(false);
    expect(transferActions(row(), ds, { id: me, role: "admin" }).canDecide).toBe(true);
    expect(
      transferActions(row(), { transfers: [pending(other)], canManageTransfers: true }, cs)
        .canDecide,
    ).toBe(true);
  });
  it("demanda encerrada não oferece transferência", () => {
    const a = transferActions(row({ stage: "Concluída" }), { canManageTransfers: true }, cs);
    expect(a).toMatchObject({ canTransfer: false, canRequest: false });
  });
  it("fila do colaborador traz só as próprias solicitações; gestor vê todas", () => {
    const ds = { transfers: [pending(), pending(other)] };
    expect(transferQueue({ ...ds, canManageTransfers: false }, me)).toHaveLength(1);
    expect(transferQueue({ ...ds, canManageTransfers: true }, me)).toHaveLength(2);
  });
});

describe("Delegação e mensagens", () => {
  it("delegação de transferências exige liderança ativa", () => {
    const base = {
      id: me,
      full_name: "CS",
      email: "cs@example.test",
      active: true,
      commission_eligible: false,
      role: "cs" as const,
    };
    const access = {
      is_lead: false,
      view_team: false,
      manage_cs: false,
      promote_cs: false,
      manage_demand_transfers: true,
      hidden_areas: [],
    };
    expect(can({ ...base, access }, "manage_demand_transfers")).toBe(false);
    expect(can({ ...base, access: { ...access, is_lead: true } }, "manage_demand_transfers")).toBe(
      true,
    );
  });
  it("códigos do banco viram mensagens claras em português", () => {
    expect(safeDbMessage("transfer_pending")).toMatch(/solicitação de transferência pendente/);
    expect(safeDbMessage("transfer_required")).toMatch(/Solicitar transferência/);
    expect(safeDbMessage("transfer_target_invalid")).toMatch(/CS ativo/);
    expect(safeDbMessage("transfer_self_decision")).toMatch(/própria solicitação/);
    expect(safeDbMessage("transfer_owner_changed")).toMatch(/responsável da demanda mudou/);
    expect(safeDbMessage("conflict")).toMatch(/Outra pessoa alterou/);
  });
});
