-- A fila de transferências só é escrita pelas funções auditadas; leitura apenas por usuários autenticados (RLS).
REVOKE ALL ON public.demand_transfer_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.demand_transfer_requests FROM authenticated;
GRANT SELECT ON public.demand_transfer_requests TO authenticated;
