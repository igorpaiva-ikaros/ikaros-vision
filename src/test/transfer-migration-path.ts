// Migrações aplicadas pelo Lovable Cloud para a transferência de demandas (mesmo SQL usado nos testes).
export const TRANSFER_MIGRATION = "drizzle/migrations/0003_demand_transfers.sql";
export const TRANSFER_GRANTS_MIGRATION =
  "drizzle/migrations/0004_demand_transfers_tighten_grants.sql";
export const TRANSFER_SLA_MIGRATION = "drizzle/migrations/0005_transfer_preserve_sla_deadlines.sql";
