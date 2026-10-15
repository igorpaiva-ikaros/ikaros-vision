-- Restaura o SLA por categoria e exige prazo na 1ª resposta das demandas com entrega.
--
-- 1. A migration 20261007080100_shared_portfolio recriou guard_operation_row() com prazos fixos
--    (4 horas úteis / próxima data útil) e deixou de aplicar as regras de sla_policies e o prazo
--    automático de entrega (policy_delivery_due). Esta versão é a mesma função da carteira
--    compartilhada, com o bloco de prazos da 20261006120000_crm_catalog_sla: prazos calculados
--    por categoria e preservados em registros encerrados. Sem regra configurada, policy_due()
--    mantém 4 horas úteis e a próxima data útil. Demandas abertas cujos prazos divergem da regra
--    salva são alinhadas uma única vez e seus avisos antigos são arquivados, como faz o salvamento
--    da regra em Administração; a checagem de 5 minutos recria os avisos com os prazos corretos.
-- 2. Primeira resposta registra o recebimento ao cliente, sem exigir previsão de entrega.
BEGIN;
CREATE OR REPLACE FUNCTION public.guard_operation_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); admin boolean := uid IS NULL OR public.is_admin(uid); tr boolean := coalesce(current_setting('app.transition', true), '') = 'on';
  cowner uuid;
BEGIN
  IF NEW.client_id IS NOT NULL THEN SELECT owner_id INTO cowner FROM public.clients WHERE id = NEW.client_id; END IF;
  IF uid IS NOT NULL AND NOT public.is_operator(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF TG_TABLE_NAME IN ('interactions','changelog') AND uid IS NOT NULL THEN
    IF NEW.demand_id IS NOT NULL AND NOT exists(SELECT 1 FROM public.demands WHERE id=NEW.demand_id AND client_id=NEW.client_id) THEN RAISE EXCEPTION 'invalid_demand_relation'; END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF uid IS NOT NULL AND NOT admin THEN
      NEW.notion_id:=NULL; NEW.notion_raw:=NULL; NEW.source_date_precision:='[]'::jsonb;
      NEW.is_test:=(SELECT is_test FROM public.clients WHERE id=NEW.client_id);
      NEW.code:=CASE TG_TABLE_NAME WHEN 'demands' THEN 'DEM-'||lpad(nextval('public.dem_code_seq')::text,5,'0') WHEN 'onboardings' THEN 'ONB-'||lpad(nextval('public.onb_code_seq')::text,5,'0') WHEN 'upgrades' THEN 'UPG-'||lpad(nextval('public.upg_code_seq')::text,5,'0') WHEN 'interactions' THEN 'INT-'||lpad(nextval('public.int_code_seq')::text,5,'0') ELSE 'CHG-'||lpad(nextval('public.chg_code_seq')::text,5,'0') END;
      IF TG_TABLE_NAME='upgrades' THEN NEW.commission_eligible_at_effective:=NULL;NEW.commission_owner_id:=NULL;NEW.commission_paid:=false; END IF;
      IF TG_TABLE_NAME='demands' THEN NEW.stage:='Nova'; NEW.received_at:=now();
      ELSIF TG_TABLE_NAME='onboardings' THEN NEW.stage:='Não iniciado'; NEW.current_step:='1. Recepção e apresentação';
      ELSIF TG_TABLE_NAME='upgrades' THEN NEW.stage:='Oportunidade identificada'; END IF;
    END IF;
    IF uid IS NOT NULL AND NOT admin THEN NEW.owner_id:=uid; END IF;
    IF NEW.notion_id IS NULL AND NEW.client_id IS NULL THEN RAISE EXCEPTION 'client_required'; END IF;
    IF NOT admin AND NEW.owner_id IS DISTINCT FROM uid THEN
      RAISE EXCEPTION 'forbidden: só é possível registrar itens da própria carteira';
    END IF;
  ELSE
    IF NOT admin AND coalesce(current_setting('app.assignment',true),'')<>'on' AND (NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.client_id IS DISTINCT FROM OLD.client_id) THEN
      RAISE EXCEPTION 'forbidden: alteração de responsável/cliente é exclusiva do administrador';
    END IF;
    NEW.version := OLD.version + 1; NEW.updated_at := now();
  END IF;
  IF TG_TABLE_NAME = 'demands' THEN
    IF NOT tr AND uid IS NOT NULL AND (
      (TG_OP = 'INSERT' AND (NEW.first_response_at IS NOT NULL OR NEW.forwarded_at IS NOT NULL OR NEW.published_at IS NOT NULL OR NEW.validated_at IS NOT NULL OR NEW.completed_at IS NOT NULL OR NEW.canceled_at IS NOT NULL OR NEW.client_validated))
      OR (TG_OP = 'UPDATE' AND (NEW.first_response_at IS DISTINCT FROM OLD.first_response_at OR NEW.forwarded_at IS DISTINCT FROM OLD.forwarded_at
        OR NEW.published_at IS DISTINCT FROM OLD.published_at OR NEW.validated_at IS DISTINCT FROM OLD.validated_at
        OR NEW.completed_at IS DISTINCT FROM OLD.completed_at OR NEW.canceled_at IS DISTINCT FROM OLD.canceled_at
        OR NEW.client_validated IS DISTINCT FROM OLD.client_validated OR NEW.stage IS DISTINCT FROM OLD.stage OR NEW.received_at IS DISTINCT FROM OLD.received_at))) THEN
      RAISE EXCEPTION 'forbidden: etapas e eventos só mudam pelas ações registradas';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.received_at IS NULL AND NEW.notion_id IS NULL THEN NEW.received_at := now(); END IF;
    -- Prazos derivados da regra configurada por categoria (Administração → SLA por categoria).
    -- Registros encerrados conservam os prazos com que foram atendidos.
    IF TG_OP = 'UPDATE' AND (OLD.completed_at IS NOT NULL OR OLD.canceled_at IS NOT NULL) THEN
      NEW.sla_start_at := OLD.sla_start_at; NEW.first_response_due := OLD.first_response_due;
      NEW.resolution_due := OLD.resolution_due; NEW.policy_delivery_due := OLD.policy_delivery_due;
    ELSE
      NEW.sla_start_at := public.sla_normalize(NEW.received_at);
      NEW.first_response_due := public.policy_due(NEW.received_at, NEW.classification, 'response');
      NEW.resolution_due := public.policy_due(NEW.received_at, NEW.classification, 'resolution');
      NEW.policy_delivery_due := public.policy_due(NEW.received_at, NEW.classification, 'delivery');
    END IF;
  ELSIF TG_TABLE_NAME = 'onboardings' THEN
    IF NOT tr AND uid IS NOT NULL AND ((TG_OP = 'INSERT' AND (NEW.info_complete_at IS NOT NULL OR NEW.completed_at IS NOT NULL)) OR (TG_OP = 'UPDATE' AND (NEW.info_complete_at IS DISTINCT FROM OLD.info_complete_at OR NEW.completed_at IS DISTINCT FROM OLD.completed_at OR NEW.stage IS DISTINCT FROM OLD.stage OR NEW.current_step IS DISTINCT FROM OLD.current_step))) THEN
      RAISE EXCEPTION 'forbidden: eventos do onboarding só mudam pelas ações registradas';
    END IF;
    IF NEW.notion_id IS NULL OR (TG_OP='UPDATE' AND NEW.current_step IS DISTINCT FROM OLD.current_step) THEN NEW.progress:=coalesce(substring(NEW.current_step from '^([0-9]+)')::numeric,0)/10; END IF;
    NEW.milestone5_due := public.sla_onboarding_due(NEW.info_complete_at, 5);
    NEW.limit15_due := public.sla_onboarding_due(NEW.info_complete_at, 15);
  ELSIF TG_TABLE_NAME = 'upgrades' THEN
    IF NOT tr AND uid IS NOT NULL AND ((TG_OP = 'INSERT' AND (NEW.accepted_at IS NOT NULL OR NEW.effective_at IS NOT NULL OR NEW.lost_at IS NOT NULL)) OR (TG_OP = 'UPDATE' AND (NEW.accepted_at IS DISTINCT FROM OLD.accepted_at OR NEW.effective_at IS DISTINCT FROM OLD.effective_at OR NEW.lost_at IS DISTINCT FROM OLD.lost_at OR NEW.stage IS DISTINCT FROM OLD.stage))) THEN
      RAISE EXCEPTION 'forbidden: etapas do upgrade só mudam pelas ações registradas';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.effective_at IS NOT NULL AND (NEW.current_value IS DISTINCT FROM OLD.current_value OR NEW.new_value IS DISTINCT FROM OLD.new_value OR NEW.new_plan IS DISTINCT FROM OLD.new_plan) THEN RAISE EXCEPTION 'effective_locked: upgrade efetivado preserva os dados da comissão'; END IF;
    IF TG_OP='INSERT' AND NEW.notion_id IS NULL THEN NEW.opportunity_at:=now(); END IF;
    IF NEW.effective_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.effective_at IS NULL) THEN
      NEW.commission_owner_id := NEW.owner_id;
      SELECT commission_eligible INTO NEW.commission_eligible_at_effective FROM public.profiles WHERE id=NEW.owner_id;
    ELSIF TG_OP = 'UPDATE' THEN NEW.commission_owner_id:=OLD.commission_owner_id; NEW.commission_eligible_at_effective:=OLD.commission_eligible_at_effective; END IF;
  END IF;
  IF TG_OP='UPDATE' AND uid IS NOT NULL AND NOT admin AND (NEW.code IS DISTINCT FROM OLD.code OR NEW.notion_id IS DISTINCT FROM OLD.notion_id OR NEW.notion_raw IS DISTINCT FROM OLD.notion_raw OR NEW.is_test IS DISTINCT FROM OLD.is_test OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.source_date_precision IS DISTINCT FROM OLD.source_date_precision) THEN RAISE EXCEPTION 'forbidden: origem e identidade protegidas'; END IF;
  IF TG_TABLE_NAME='upgrades' THEN
    IF TG_OP='UPDATE' AND uid IS NOT NULL AND NOT admin AND NEW.commission_paid IS DISTINCT FROM OLD.commission_paid THEN RAISE EXCEPTION 'forbidden: comissão paga é conferida pelo administrador'; END IF;
  END IF;
  IF TG_OP='INSERT' AND uid IS NOT NULL AND NOT admin THEN NEW.created_at:=now(); NEW.notion_id:=NULL; NEW.notion_raw:=NULL; END IF;
  RETURN NEW;
END $$;

-- Alinha uma única vez as demandas abertas que ficaram com prazos fixos desde 07/10.
WITH drift AS (
 SELECT id FROM public.demands
 WHERE completed_at IS NULL AND canceled_at IS NULL AND received_at IS NOT NULL
   AND (first_response_due IS DISTINCT FROM public.policy_due(received_at,classification,'response')
     OR resolution_due IS DISTINCT FROM public.policy_due(received_at,classification,'resolution')
     OR policy_delivery_due IS DISTINCT FROM public.policy_due(received_at,classification,'delivery'))
), realigned AS (
 UPDATE public.demands d SET classification=d.classification FROM drift WHERE d.id=drift.id RETURNING d.id
)
UPDATE public.notifications SET superseded_at=now()
WHERE entity_type='demand' AND superseded_at IS NULL AND entity_id IN(SELECT id FROM realigned)
AND obligation IN('first_response','resolution_or_forward','delivery')
AND deadline IS DISTINCT FROM (SELECT CASE notifications.obligation WHEN 'first_response' THEN d.first_response_due WHEN 'resolution_or_forward' THEN d.resolution_due ELSE coalesce(d.due_date,d.policy_delivery_due) END FROM public.demands d WHERE d.id=notifications.entity_id);

CREATE OR REPLACE FUNCTION public.transition_demand(_id uuid,_action text,_version int,_stage text DEFAULT NULL,_reason text DEFAULT NULL) RETURNS public.demands LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.demands;
BEGIN
 IF _action='move' AND _stage IN('Aguardando validação','Aguardando aprovação') THEN RETURN public.submit_demand_validation(_id,_version); END IF;
 IF _action='publish' OR (_action='move' AND _stage IN('Publicada','Publicada / avisar cliente','Aprovada para publicação')) THEN RAISE EXCEPTION 'approval_required'; END IF;
 IF EXISTS(SELECT 1 FROM public.delivery_requests WHERE demand_id=_id AND approval_state IN('aguardando','aprovada')) THEN RAISE EXCEPTION 'validation_locked: aguarde a decisão do administrador'; END IF;
 RETURN public.transition_demand_core(_id,_action,_version,_stage,_reason);
END $$;
REVOKE ALL ON FUNCTION public.transition_demand(uuid,text,int,text,text) FROM public,anon;GRANT EXECUTE ON FUNCTION public.transition_demand(uuid,text,int,text,text) TO authenticated;
COMMIT;
