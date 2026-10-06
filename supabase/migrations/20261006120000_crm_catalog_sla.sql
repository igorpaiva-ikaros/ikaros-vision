-- Catalogue and configurable SLA. Installing this migration never updates existing deadlines.
CREATE TABLE public.products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 100),
 description text NOT NULL DEFAULT '', monthly_value numeric(12,2) NOT NULL CHECK(monthly_value>=0),
 annual_monthly_value numeric(12,2) NOT NULL CHECK(annual_monthly_value>=0),
 active boolean NOT NULL DEFAULT true, version int NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX products_unique_name ON public.products(lower(name));
INSERT INTO public.products(name,monthly_value,annual_monthly_value) VALUES ('Feather',697,397),('Wing',1197,897),('Sun',2197,1897);
ALTER TABLE public.clients ADD COLUMN product_id uuid REFERENCES public.products(id);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Operators read catalog" ON public.products FOR SELECT TO authenticated USING(public.is_operator(auth.uid()));
GRANT SELECT ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
CREATE OR REPLACE FUNCTION public.save_product(_id uuid,_version int,_name text,_description text,_monthly numeric,_annual numeric,_active boolean)
RETURNS public.products LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products;
BEGIN
 IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF length(_description)>2000 THEN RAISE EXCEPTION 'description_too_long'; END IF;
 SELECT * INTO p FROM public.products WHERE id=_id FOR UPDATE;
 IF FOUND THEN
  IF p.version<>_version THEN RAISE EXCEPTION 'conflict: recarregue o catálogo'; END IF;
  UPDATE public.products SET name=btrim(_name),description=_description,monthly_value=_monthly,annual_monthly_value=_annual,active=_active,version=version+1,updated_at=now() WHERE id=_id RETURNING * INTO p;
 ELSE
  IF _version IS NOT NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  INSERT INTO public.products(id,name,description,monthly_value,annual_monthly_value,active) VALUES(_id,btrim(_name),_description,_monthly,_annual,_active) RETURNING * INTO p;
 END IF;
 INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('product',p.id,'configure',auth.uid(),to_jsonb(p));
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.save_product(uuid,int,text,text,numeric,numeric,boolean) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.save_product(uuid,int,text,text,numeric,numeric,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.guard_client_product() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products; changed boolean;
BEGIN
 IF coalesce(current_setting('app.import',true),'')='on' THEN RETURN NEW; END IF;
 changed := TG_OP='INSERT';
 IF TG_OP='UPDATE' THEN changed:=NEW.product_id IS DISTINCT FROM OLD.product_id; END IF;
 IF changed AND NEW.product_id IS NOT NULL THEN
  SELECT * INTO p FROM public.products WHERE id=NEW.product_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'inactive_product: selecione um plano ativo'; END IF;
  NEW.plan:=p.name;
 ELSIF auth.uid() IS NOT NULL THEN
  IF changed THEN RAISE EXCEPTION 'product_required: selecione um plano'; END IF;
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN RAISE EXCEPTION 'catalog_required: selecione um plano do catálogo'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_client_product BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.guard_client_product();

CREATE TABLE public.sla_policies (
 category text PRIMARY KEY,
 response_value int NOT NULL DEFAULT 4 CHECK(response_value BETWEEN 1 AND 100000), response_unit text NOT NULL DEFAULT 'hours' CHECK(response_unit IN('minutes','hours','days')), response_basis text NOT NULL DEFAULT 'business' CHECK(response_basis IN('business','calendar')),
 resolution_value int NOT NULL DEFAULT 1 CHECK(resolution_value BETWEEN 1 AND 100000), resolution_unit text NOT NULL DEFAULT 'days' CHECK(resolution_unit IN('minutes','hours','days')), resolution_basis text NOT NULL DEFAULT 'business' CHECK(resolution_basis IN('business','calendar')),
 delivery_value int CHECK(delivery_value BETWEEN 1 AND 100000), delivery_unit text NOT NULL DEFAULT 'days' CHECK(delivery_unit IN('minutes','hours','days')), delivery_basis text NOT NULL DEFAULT 'business' CHECK(delivery_basis IN('business','calendar')),
 version int NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.sla_policies(category) VALUES('Dúvida'),('Suporte'),('Bug'),('Pequena melhoria'),('Demanda complexa'),('Configuração'),('Onboarding'),('Upgrade');
ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Operators read policies" ON public.sla_policies FOR SELECT TO authenticated USING(public.is_operator(auth.uid()));
GRANT SELECT ON public.sla_policies TO authenticated;
GRANT ALL ON public.sla_policies TO service_role;
ALTER TABLE public.demands ADD COLUMN policy_delivery_due timestamptz;
CREATE OR REPLACE FUNCTION public.configured_due(_start timestamptz,_value int,_unit text,_basis text) RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE result timestamptz:=_start;i int;
BEGIN
 IF _start IS NULL OR _value IS NULL THEN RETURN NULL; END IF;
 IF _value<1 OR _value>100000 OR (_unit='days' AND _value>366) OR (_unit='hours' AND _value>8784) OR _unit NOT IN('minutes','hours','days') OR _basis NOT IN('business','calendar') THEN RAISE EXCEPTION 'invalid_sla_rule'; END IF;
 IF _basis='calendar' THEN RETURN _start + _value * CASE _unit WHEN 'minutes' THEN interval '1 minute' WHEN 'hours' THEN interval '1 hour' ELSE interval '1 day' END; END IF;
 IF _unit='days' THEN
  -- Preserve legacy semantics: one useful day means the next workday at the normalized time.
  FOR i IN 1.._value LOOP result:=public.sla_next_business_day(result); END LOOP;
  RETURN result;
 END IF;
 RETURN public.sla_add_business_minutes(_start,_value * CASE _unit WHEN 'hours' THEN 60 ELSE 1 END);
END $$;
CREATE OR REPLACE FUNCTION public.policy_due(_start timestamptz,_category text,_obligation text) RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE p public.sla_policies;
BEGIN
 SELECT * INTO p FROM public.sla_policies WHERE category=_category;
 IF NOT FOUND THEN
  IF _obligation='response' THEN RETURN public.sla_add_business_minutes(_start,240); END IF;
  IF _obligation='resolution' THEN RETURN public.sla_next_business_day(_start); END IF;
  RETURN NULL;
 END IF;
 IF _obligation='response' THEN RETURN public.configured_due(_start,p.response_value,p.response_unit,p.response_basis); END IF;
 IF _obligation='resolution' THEN RETURN public.configured_due(_start,p.resolution_value,p.resolution_unit,p.resolution_basis); END IF;
 RETURN public.configured_due(_start,p.delivery_value,p.delivery_unit,p.delivery_basis);
END $$;
CREATE OR REPLACE FUNCTION public.policy_risk_start(_due timestamptz,_category text,_obligation text) RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE basis text;
BEGIN
 SELECT CASE _obligation WHEN 'first_response' THEN response_basis WHEN 'resolution_or_forward' THEN resolution_basis ELSE delivery_basis END INTO basis FROM public.sla_policies WHERE category=_category;
 IF basis='calendar' THEN RETURN _due-public.sla_risk_minutes()*interval '1 minute'; END IF;
 RETURN public.sla_sub_business_minutes(_due,public.sla_risk_minutes());
END $$;
CREATE OR REPLACE FUNCTION public.policy_sla_state(_done timestamptz,_due timestamptz,_closed boolean,_category text,_obligation text) RETURNS text LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT CASE WHEN _due IS NULL THEN 'sem_dados' WHEN _done IS NOT NULL THEN CASE WHEN _done<=_due THEN 'cumprido' ELSE 'cumprido_atrasado' END WHEN _closed THEN 'sem_registro' WHEN now()>_due THEN 'atrasado' WHEN now()>=public.policy_risk_start(_due,_category,_obligation) THEN 'em_risco' ELSE 'no_prazo' END
$$;
CREATE OR REPLACE FUNCTION public.guard_operation_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); admin boolean := uid IS NULL OR public.is_admin(uid); tr boolean := coalesce(current_setting('app.transition', true), '') = 'on';
  cowner uuid;
BEGIN
  IF NEW.client_id IS NOT NULL THEN SELECT owner_id INTO cowner FROM public.clients WHERE id = NEW.client_id; END IF;
  IF NOT admin AND cowner IS DISTINCT FROM uid THEN RAISE EXCEPTION 'forbidden: cliente fora da carteira'; END IF;
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
      ELSIF TG_TABLE_NAME='onboardings' THEN NEW.stage:='Não iniciado'; NEW.current_step:='1. Dados recebidos';
      ELSIF TG_TABLE_NAME='upgrades' THEN NEW.stage:='Oportunidade identificada'; END IF;
    END IF;
    IF NEW.notion_id IS NULL THEN NEW.owner_id := cowner; ELSIF NEW.owner_id IS NULL THEN NEW.owner_id := cowner; END IF;
    IF NEW.notion_id IS NULL AND NEW.client_id IS NULL THEN RAISE EXCEPTION 'client_required'; END IF;
    IF NOT admin AND (NEW.owner_id IS DISTINCT FROM uid OR cowner IS DISTINCT FROM uid) THEN
      RAISE EXCEPTION 'forbidden: só é possível registrar itens da própria carteira';
    END IF;
  ELSE
    IF NOT admin AND (NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.client_id IS DISTINCT FROM OLD.client_id) THEN
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
    IF TG_OP='UPDATE' AND (OLD.completed_at IS NOT NULL OR OLD.canceled_at IS NOT NULL) THEN
      NEW.sla_start_at:=OLD.sla_start_at;NEW.first_response_due:=OLD.first_response_due;NEW.resolution_due:=OLD.resolution_due;NEW.policy_delivery_due:=OLD.policy_delivery_due;
    ELSE
      NEW.sla_start_at := public.sla_normalize(NEW.received_at);
      NEW.first_response_due := public.policy_due(NEW.received_at,NEW.classification,'response');
      NEW.resolution_due := public.policy_due(NEW.received_at,NEW.classification,'resolution');
      NEW.policy_delivery_due := public.policy_due(NEW.received_at,NEW.classification,'delivery');
    END IF;
  ELSIF TG_TABLE_NAME = 'onboardings' THEN
    IF NOT tr AND uid IS NOT NULL AND ((TG_OP = 'INSERT' AND (NEW.info_complete_at IS NOT NULL OR NEW.completed_at IS NOT NULL)) OR (TG_OP = 'UPDATE' AND (NEW.info_complete_at IS DISTINCT FROM OLD.info_complete_at OR NEW.completed_at IS DISTINCT FROM OLD.completed_at OR NEW.stage IS DISTINCT FROM OLD.stage OR NEW.current_step IS DISTINCT FROM OLD.current_step))) THEN
      RAISE EXCEPTION 'forbidden: eventos do onboarding só mudam pelas ações registradas';
    END IF;
    IF NEW.notion_id IS NULL OR (TG_OP='UPDATE' AND NEW.current_step IS DISTINCT FROM OLD.current_step) THEN NEW.progress:=coalesce(substring(NEW.current_step from '^([0-9]+)')::numeric,0)/9; END IF;
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
CREATE OR REPLACE VIEW public.demand_sla WITH (security_invoker = true) AS
SELECT d.id, d.owner_id, d.client_id, d.is_test,
  public.policy_sla_state(d.first_response_at,d.first_response_due,d.completed_at IS NOT NULL OR d.canceled_at IS NOT NULL,d.classification,'first_response') AS first_response_state,
  public.policy_sla_state(least(d.forwarded_at,d.completed_at),d.resolution_due,d.completed_at IS NOT NULL OR d.canceled_at IS NOT NULL,d.classification,'resolution_or_forward') AS resolution_state,
  public.policy_sla_state(d.completed_at,coalesce(d.due_date,d.policy_delivery_due),d.completed_at IS NOT NULL OR d.canceled_at IS NOT NULL,d.classification,'delivery') AS delivery_state,
  d.first_response_due, d.resolution_due,coalesce(d.due_date,d.policy_delivery_due) AS delivery_due
FROM public.demands d WHERE d.canceled_at IS NULL;

ALTER TABLE public.notifications ADD COLUMN rule_version int NOT NULL DEFAULT 1;
ALTER TABLE public.notifications ADD COLUMN superseded_at timestamptz;
DO $$ DECLARE c record; BEGIN FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.notifications'::regclass AND contype='u' LOOP EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I',c.conname); END LOOP; END $$;
ALTER TABLE public.notifications ADD UNIQUE(recipient_id,entity_type,entity_id,obligation,deadline,level,rule_version);
CREATE OR REPLACE FUNCTION public.sla_tick() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int := 0; c int;
BEGIN
  WITH pending AS (
    SELECT d.id, d.owner_id, 'first_response'::text AS obligation, d.first_response_due AS due, d.code || ' — ' || d.title AS title,d.classification,coalesce((SELECT version FROM public.sla_policies WHERE category=d.classification),1) AS rule_version
      FROM public.demands d JOIN public.clients cl ON cl.id=d.client_id WHERE NOT d.is_test AND NOT cl.is_test AND d.first_response_at IS NULL AND d.completed_at IS NULL AND d.canceled_at IS NULL AND d.first_response_due IS NOT NULL
    UNION ALL
    SELECT d.id, d.owner_id, 'resolution_or_forward', d.resolution_due, d.code || ' — ' || d.title,d.classification,coalesce((SELECT version FROM public.sla_policies WHERE category=d.classification),1)
      FROM public.demands d JOIN public.clients cl ON cl.id=d.client_id WHERE NOT d.is_test AND NOT cl.is_test AND d.forwarded_at IS NULL AND d.completed_at IS NULL AND d.canceled_at IS NULL AND d.resolution_due IS NOT NULL
    UNION ALL
    SELECT d.id,d.owner_id,'delivery',coalesce(d.due_date,d.policy_delivery_due),d.code||' — '||d.title,d.classification,coalesce((SELECT version FROM public.sla_policies WHERE category=d.classification),1) FROM public.demands d JOIN public.clients cl ON cl.id=d.client_id WHERE NOT d.is_test AND NOT cl.is_test AND d.completed_at IS NULL AND d.canceled_at IS NULL AND coalesce(d.due_date,d.policy_delivery_due) IS NOT NULL
  ), lvl AS (
    SELECT p.*, CASE WHEN now() > p.due THEN 'overdue' ELSE 'risk' END AS level FROM pending p
    WHERE now() >= public.policy_risk_start(p.due,p.classification,p.obligation)
  ), rcpt AS (
    SELECT l.*, l.owner_id AS rid FROM lvl l WHERE l.owner_id IS NOT NULL AND public.is_operator(l.owner_id)
    UNION
    SELECT l.*, a.user_id FROM lvl l JOIN public.user_roles a ON a.role = 'admin' JOIN public.profiles pr ON pr.id = a.user_id AND pr.active
  )
  INSERT INTO public.notifications(recipient_id, entity_type, entity_id, obligation, deadline, level, title, link,rule_version)
  SELECT rid, 'demand', id, obligation, due, level,
    CASE WHEN level = 'overdue' THEN 'SLA atrasado: ' ELSE 'SLA em risco: ' END || title, '/operacao?tab=crm&pipeline=demands&id=' || id,rule_version
  FROM rcpt ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;

  WITH pending AS (
    SELECT o.id, o.owner_id, 'onboarding_15'::text AS obligation, o.limit15_due AS due, o.code || ' — ' || o.title AS title
      FROM public.onboardings o JOIN public.clients cl ON cl.id=o.client_id WHERE NOT o.is_test AND NOT cl.is_test AND o.completed_at IS NULL AND o.limit15_due IS NOT NULL
  ), lvl AS (
    SELECT p.*, CASE WHEN now() > p.due THEN 'overdue' ELSE 'risk' END AS level FROM pending p
    WHERE now() >= public.sla_sub_business_minutes(p.due, public.sla_risk_minutes())
  ), rcpt AS (
    SELECT l.*, l.owner_id AS rid FROM lvl l WHERE l.owner_id IS NOT NULL AND public.is_operator(l.owner_id)
    UNION
    SELECT l.*, a.user_id FROM lvl l JOIN public.user_roles a ON a.role = 'admin' JOIN public.profiles pr ON pr.id = a.user_id AND pr.active
  )
  INSERT INTO public.notifications(recipient_id, entity_type, entity_id, obligation, deadline, level, title, link)
  SELECT rid, 'onboarding', id, obligation, due, level,
    CASE WHEN level = 'overdue' THEN 'Onboarding atrasado: ' ELSE 'Onboarding em risco: ' END || title, '/operacao?tab=onboardings&id=' || id
  FROM rcpt ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;

  INSERT INTO public.job_runs(job, ok, detail) VALUES ('sla_tick', true, jsonb_build_object('created', n));
  DELETE FROM public.job_runs WHERE job = 'sla_tick' AND ran_at < now() - interval '7 days';
  RETURN n;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.job_runs(job, ok, detail) VALUES ('sla_tick', false, jsonb_build_object('error', SQLERRM));
  RETURN -1;
END $$;
CREATE OR REPLACE FUNCTION public.save_sla_policy(_category text,_version int,_rules jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE oldp public.sla_policies;p public.sla_policies;n int;missing int;
BEGIN
 IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO oldp FROM public.sla_policies WHERE category=_category FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
 IF oldp.version<>_version THEN RAISE EXCEPTION 'conflict: recarregue as regras'; END IF;
 p:=jsonb_populate_record(oldp,_rules);
 IF p.category IS DISTINCT FROM oldp.category OR p.version<>oldp.version OR p.updated_at IS DISTINCT FROM oldp.updated_at THEN RAISE EXCEPTION 'invalid_rules'; END IF;
 IF (_rules - ARRAY['response_value','response_unit','response_basis','resolution_value','resolution_unit','resolution_basis','delivery_value','delivery_unit','delivery_basis'])<>'{}'::jsonb THEN RAISE EXCEPTION 'invalid_rules'; END IF;
 IF to_jsonb(p)=to_jsonb(oldp) THEN RETURN jsonb_build_object('changed',false,'recalculated',0); END IF;
 UPDATE public.sla_policies SET response_value=p.response_value,response_unit=p.response_unit,response_basis=p.response_basis,resolution_value=p.resolution_value,resolution_unit=p.resolution_unit,resolution_basis=p.resolution_basis,delivery_value=p.delivery_value,delivery_unit=p.delivery_unit,delivery_basis=p.delivery_basis,version=version+1,updated_at=now() WHERE category=_category;
 SELECT count(*) INTO missing FROM public.demands WHERE classification=_category AND completed_at IS NULL AND canceled_at IS NULL AND received_at IS NULL;
 UPDATE public.demands SET classification=classification WHERE classification=_category AND completed_at IS NULL AND canceled_at IS NULL AND received_at IS NOT NULL;
 GET DIAGNOSTICS n=ROW_COUNT;
 UPDATE public.notifications SET superseded_at=now() WHERE entity_type='demand' AND superseded_at IS NULL AND entity_id IN(SELECT id FROM public.demands WHERE classification=_category AND completed_at IS NULL AND canceled_at IS NULL AND received_at IS NOT NULL);
 INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('sla_policy',gen_random_uuid(),'configure',auth.uid(),jsonb_build_object('category',_category,'before',to_jsonb(oldp),'after',to_jsonb(p),'recalculated',n));
 IF public.sla_tick()<0 THEN RAISE EXCEPTION 'sla_recalculation_failed'; END IF;
 RETURN jsonb_build_object('changed',true,'recalculated',n,'missingStart',missing);
END $$;
REVOKE ALL ON FUNCTION public.save_sla_policy(text,int,jsonb) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.save_sla_policy(text,int,jsonb) TO authenticated;
