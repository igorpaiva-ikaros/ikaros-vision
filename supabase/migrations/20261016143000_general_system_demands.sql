-- Demandas gerais reais, sem cliente fictício. Preserva os registros e as políticas SLA existentes.
BEGIN;
ALTER TABLE public.demands ADD COLUMN scope text NOT NULL DEFAULT 'client' CHECK(scope IN ('client','system'));
ALTER TABLE public.demands ADD CONSTRAINT demand_scope_client CHECK (
 (scope='system' AND client_id IS NULL) OR
 (scope='client' AND (client_id IS NOT NULL OR notion_id IS NOT NULL))
);
-- A origem é fixada no cadastro para não converter atendimento em trabalho interno e apagar obrigações.
CREATE FUNCTION public.guard_demand_scope() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='UPDATE' AND NEW.scope IS DISTINCT FROM OLD.scope THEN RAISE EXCEPTION 'incomplete: a origem da demanda é definida no cadastro e não pode ser alterada'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_demand_scope BEFORE INSERT OR UPDATE ON public.demands FOR EACH ROW EXECUTE FUNCTION public.guard_demand_scope();
DROP POLICY "CS shared reads" ON public.demands;
DROP POLICY "CS creates own record" ON public.demands;
DROP POLICY "Tests private" ON public.demands;
CREATE POLICY "CS shared reads" ON public.demands FOR SELECT TO authenticated USING(public.is_cs(auth.uid()) AND (client_id IS NOT NULL OR scope='system'));
CREATE POLICY "CS creates own record" ON public.demands FOR INSERT TO authenticated WITH CHECK(public.is_cs(auth.uid()) AND owner_id=auth.uid() AND (client_id IS NOT NULL OR scope='system'));
CREATE POLICY "Tests private" ON public.demands AS RESTRICTIVE FOR ALL TO authenticated USING(public.is_admin(auth.uid()) OR (NOT is_test AND (scope='system' OR public.real_client(client_id)))) WITH CHECK(public.is_admin(auth.uid()) OR (NOT is_test AND (scope='system' OR public.real_client(client_id))));


CREATE OR REPLACE FUNCTION public.guard_operation_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); admin boolean := uid IS NULL OR public.is_admin(uid); tr boolean := coalesce(current_setting('app.transition', true), '') = 'on';
  cowner uuid; general boolean := TG_TABLE_NAME='demands' AND coalesce(to_jsonb(NEW)->>'scope','client')='system';
BEGIN
  IF NEW.client_id IS NOT NULL THEN SELECT owner_id INTO cowner FROM public.clients WHERE id = NEW.client_id; END IF;
  IF uid IS NOT NULL AND NOT public.is_operator(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF TG_TABLE_NAME IN ('interactions','changelog') AND uid IS NOT NULL THEN
    IF NEW.demand_id IS NOT NULL AND NOT exists(SELECT 1 FROM public.demands WHERE id=NEW.demand_id AND client_id=NEW.client_id) THEN RAISE EXCEPTION 'invalid_demand_relation'; END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF uid IS NOT NULL AND NOT admin THEN
      NEW.notion_id:=NULL; NEW.notion_raw:=NULL; NEW.source_date_precision:='[]'::jsonb;
      NEW.is_test:=coalesce((SELECT is_test FROM public.clients WHERE id=NEW.client_id),false);
      NEW.code:=CASE TG_TABLE_NAME WHEN 'demands' THEN 'DEM-'||lpad(nextval('public.dem_code_seq')::text,5,'0') WHEN 'onboardings' THEN 'ONB-'||lpad(nextval('public.onb_code_seq')::text,5,'0') WHEN 'upgrades' THEN 'UPG-'||lpad(nextval('public.upg_code_seq')::text,5,'0') WHEN 'interactions' THEN 'INT-'||lpad(nextval('public.int_code_seq')::text,5,'0') ELSE 'CHG-'||lpad(nextval('public.chg_code_seq')::text,5,'0') END;
      IF TG_TABLE_NAME='upgrades' THEN NEW.commission_eligible_at_effective:=NULL;NEW.commission_owner_id:=NULL;NEW.commission_paid:=false; END IF;
      IF TG_TABLE_NAME='demands' THEN NEW.stage:='Nova'; NEW.received_at:=now();
      ELSIF TG_TABLE_NAME='onboardings' THEN NEW.stage:='Não iniciado'; NEW.current_step:='1. Recepção e apresentação';
      ELSIF TG_TABLE_NAME='upgrades' THEN NEW.stage:='Oportunidade identificada'; END IF;
    END IF;
    IF uid IS NOT NULL AND NOT admin THEN NEW.owner_id:=uid; END IF;
    IF NEW.notion_id IS NULL AND NEW.client_id IS NULL AND NOT general THEN RAISE EXCEPTION 'client_required'; END IF;
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
      NEW.first_response_due := CASE WHEN general THEN NULL ELSE public.policy_due(NEW.received_at, NEW.classification, 'response') END;
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

CREATE OR REPLACE FUNCTION public.transition_demand_core(_id uuid, _action text, _version int, _stage text DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS public.demands LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); d public.demands; old_stage text;
BEGIN
  IF uid IS NULL OR NOT public.is_operator(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO d FROM public.demands WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR (NOT public.is_admin(uid) AND (d.owner_id IS DISTINCT FROM uid)) THEN RAISE EXCEPTION 'not_found'; END IF;
  IF d.version <> _version THEN RAISE EXCEPTION 'conflict: a demanda foi alterada por outra pessoa; recarregue'; END IF;
  IF d.completed_at IS NOT NULL OR d.canceled_at IS NOT NULL THEN
    IF _action IN ('complete','cancel') THEN RETURN d; END IF;
    RAISE EXCEPTION 'closed: demanda encerrada';
  END IF;
  old_stage := d.stage;
  PERFORM set_config('app.transition', 'on', true);
  IF d.scope='system' AND _action IN ('first_response','validate') THEN RAISE EXCEPTION 'incomplete: esta demanda é interna e não possui atendimento ou validação de cliente'; END IF;
  IF _action = 'first_response' THEN
    UPDATE public.demands SET first_response_at = coalesce(first_response_at, now()),
      stage = CASE WHEN stage = 'Nova' THEN 'Em triagem' ELSE stage END WHERE id = _id RETURNING * INTO d;
  ELSIF _action = 'forward' THEN
    RAISE EXCEPTION 'handoff_required';
  ELSIF _action = 'publish' THEN
    RAISE EXCEPTION 'approval_required: registre a publicação na fila de aprovações';
  ELSIF _action = 'validate' THEN
    UPDATE public.demands SET validated_at = coalesce(validated_at, now()), client_validated = true WHERE id = _id RETURNING * INTO d;
  ELSIF _action = 'complete' THEN
    IF coalesce(btrim(d.solution), '') = '' OR (d.scope='client' AND NOT d.client_informed) THEN
      RAISE EXCEPTION 'incomplete: informe a solução aplicada e, em atendimentos de cliente, confirme a comunicação';
    END IF;
    UPDATE public.demands SET completed_at = now(), stage = 'Concluída' WHERE id = _id RETURNING * INTO d;
  ELSIF _action = 'cancel' THEN
    IF coalesce(btrim(_reason), '') = '' THEN RAISE EXCEPTION 'incomplete: informe o motivo do cancelamento'; END IF;
    UPDATE public.demands SET canceled_at = now(), cancel_reason = _reason, stage = 'Cancelada' WHERE id = _id RETURNING * INTO d;
  ELSIF _action = 'move' THEN
    IF _stage='Publicada' THEN RAISE EXCEPTION 'approval_required'; END IF;
    IF _stage='Encaminhada para desenvolvimento' THEN RAISE EXCEPTION 'handoff_required'; END IF;
    IF _stage NOT IN ('Nova','Em triagem','Aguardando informação','Em execução','Aguardando validação','Encaminhada para desenvolvimento','Publicada','Aguardando cliente','Bloqueada') THEN
      RAISE EXCEPTION 'invalid_stage: use Concluir ou Cancelar para encerrar';
    END IF;
    UPDATE public.demands SET stage = _stage WHERE id = _id RETURNING * INTO d;
  ELSE RAISE EXCEPTION 'invalid_action';
  END IF;
  PERFORM set_config('app.transition', 'off', true);
  INSERT INTO public.workflow_history(entity_type, entity_id, action, from_value, to_value, actor_id, details)
    VALUES ('demand', _id, _action, old_stage, d.stage, uid, CASE WHEN _reason IS NULL THEN NULL ELSE jsonb_build_object('reason', _reason) END);
  RETURN d;
END $$;

CREATE OR REPLACE FUNCTION public.guard_delivery_closure() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF coalesce(current_setting('app.review',true),'')<>'on' AND EXISTS(SELECT 1 FROM public.delivery_requests WHERE demand_id=OLD.id AND approval_state IN('aguardando','aprovada')) AND (NEW.stage IS DISTINCT FROM OLD.stage OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.priority IS DISTINCT FROM OLD.priority OR NEW.classification IS DISTINCT FROM OLD.classification OR NEW.impact IS DISTINCT FROM OLD.impact OR NEW.channel IS DISTINCT FROM OLD.channel OR NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description OR NEW.solution IS DISTINCT FROM OLD.solution OR NEW.tests_run IS DISTINCT FROM OLD.tests_run OR NEW.test_result IS DISTINCT FROM OLD.test_result OR NEW.context IS DISTINCT FROM OLD.context OR NEW.approval_repository_url IS DISTINCT FROM OLD.approval_repository_url OR NEW.client_informed IS DISTINCT FROM OLD.client_informed OR NEW.client_validated IS DISTINCT FROM OLD.client_validated OR NEW.completed_at IS DISTINCT FROM OLD.completed_at OR NEW.canceled_at IS DISTINCT FROM OLD.canceled_at) THEN RAISE EXCEPTION 'validation_locked: aguarde a decisão do administrador'; END IF;
 IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL AND EXISTS(SELECT 1 FROM public.delivery_requests WHERE demand_id=NEW.id AND (approval_state<>'publicada' OR (NEW.scope='client' AND NOT NEW.client_informed) OR coalesce(btrim(NEW.solution),'')='')) THEN RAISE EXCEPTION 'incomplete: confirme publicação, solução e, em atendimentos de cliente, a comunicação'; END IF;
 IF coalesce(current_setting('app.review',true),'')<>'on' AND NEW.stage IS DISTINCT FROM OLD.stage AND NEW.stage IN('Aguardando aprovação','Aguardando validação','Aprovada para publicação','Publicada','Publicada / avisar cliente') THEN RAISE EXCEPTION 'approval_required'; END IF;
 RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.guard_delivery_promise() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE changed boolean; BEGIN
 changed := CASE WHEN TG_OP='INSERT' THEN NEW.due_date IS NOT NULL ELSE NEW.due_date IS DISTINCT FROM OLD.due_date END;
 IF TG_OP='UPDATE' THEN
  NEW.promise_aligned_at:=OLD.promise_aligned_at; NEW.original_promise_due:=OLD.original_promise_due; NEW.promise_revision:=OLD.promise_revision;
 END IF;
 IF changed THEN
  IF TG_OP='UPDATE' AND (OLD.completed_at IS NOT NULL OR OLD.canceled_at IS NOT NULL) THEN RAISE EXCEPTION 'closed: o prazo de uma demanda encerrada é preservado'; END IF;
  IF auth.uid() IS NOT NULL AND NEW.due_date IS NOT NULL AND ((NEW.scope='client' AND NOT NEW.promise_confirmed) OR NEW.due_date<=now()) THEN RAISE EXCEPTION 'incomplete: informe uma data futura e, em atendimentos de cliente, confirme o alinhamento'; END IF;
  IF TG_OP='UPDATE' AND OLD.due_date IS NOT NULL AND length(btrim(coalesce(NEW.promise_reason,'')))<5 THEN RAISE EXCEPTION 'incomplete: justifique a alteração do prazo combinado'; END IF;
  NEW.promise_aligned_at:=now();
  IF TG_OP='INSERT' THEN NEW.original_promise_due:=NEW.due_date; ELSE NEW.original_promise_due:=coalesce(OLD.original_promise_due,OLD.due_date,NEW.due_date); NEW.promise_revision:=OLD.promise_revision+1; END IF;
  INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('demand',NEW.id,'delivery_promise',auth.uid(),jsonb_build_object('before',CASE WHEN TG_OP='UPDATE' THEN OLD.due_date ELSE NULL END,'after',NEW.due_date,'reason',NEW.promise_reason,'revision',NEW.promise_revision));
  UPDATE public.notifications SET superseded_at=now() WHERE entity_type='demand' AND entity_id=NEW.id AND obligation IN ('client_promise','internal_plan') AND superseded_at IS NULL;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.real_operation_record(_kind text,_id uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE ok boolean; BEGIN
 IF _kind='client' OR _kind='clients' THEN RETURN public.real_client(_id); END IF;
 IF _kind='task' OR _kind='tasks' THEN
  SELECT (t.client_id IS NOT NULL AND public.real_client(t.client_id) AND (t.record_id IS NULL OR public.real_operation_record(t.record_kind,t.record_id))) OR (t.client_id IS NULL AND t.record_kind='demands' AND public.real_operation_record('demands',t.record_id)) INTO ok FROM scheduled_tasks t WHERE t.id=_id;
  RETURN coalesce(ok,false);
 END IF;
 _kind:=CASE _kind WHEN 'demand' THEN 'demands' WHEN 'onboarding' THEN 'onboardings' WHEN 'upgrade' THEN 'upgrades' WHEN 'interaction' THEN 'interactions' ELSE _kind END;
 IF _kind='demands' THEN
  SELECT NOT is_test AND (scope='system' OR public.real_client(client_id)) INTO ok FROM demands WHERE id=_id; RETURN coalesce(ok,false);
 END IF;
 IF _kind NOT IN('demands','onboardings','upgrades','interactions','changelog') THEN RETURN false; END IF;
 EXECUTE format('SELECT NOT is_test AND public.real_client(client_id) FROM public.%I WHERE id=$1',_kind) INTO ok USING _id; RETURN coalesce(ok,false);
END $$;

CREATE OR REPLACE FUNCTION public.guard_private_test() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) AND (NEW.is_test OR (TG_TABLE_NAME<>'clients' AND NOT (TG_TABLE_NAME='demands' AND coalesce(to_jsonb(NEW)->>'scope','client')='system') AND NOT public.real_client((to_jsonb(NEW)->>'client_id')::uuid))) THEN RAISE EXCEPTION 'forbidden'; END IF; RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.can_read_case(_demand uuid,_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT (public.is_admin(_uid) OR public.real_operation_record('demand',_demand)) AND
 (public.is_operator(_uid) AND EXISTS(SELECT 1 FROM demands WHERE id=_demand AND (client_id IS NOT NULL OR scope='system'))
 OR public.is_technical(_uid) AND EXISTS(SELECT 1 FROM delivery_requests WHERE demand_id=_demand AND technical))
$$;

CREATE OR REPLACE FUNCTION public.technical_queue() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('request',to_jsonb(r),'demand',jsonb_build_object('id',d.id,'code',d.code,'title',d.title,'description',d.description,'classification',d.classification,'scope',d.scope,'priority',d.priority,'context',d.context,'owner_id',d.owner_id,'cs_name',p.full_name,'completed_at',d.completed_at,'canceled_at',d.canceled_at,'stage',d.stage),'client_name',CASE WHEN d.scope='system' THEN 'Sistema geral · Ikaros' ELSE c.name END,'client_code',CASE WHEN d.scope='system' THEN 'INTERNO' ELSE c.code END) ORDER BY r.created_at),'[]')
 FROM public.delivery_requests r JOIN public.demands d ON d.id=r.demand_id LEFT JOIN public.clients c ON c.id=d.client_id LEFT JOIN public.profiles p ON p.id=d.owner_id
 WHERE public.is_workspace_user(auth.uid()) AND (public.is_operator(auth.uid()) OR r.technical) AND NOT d.is_test AND (d.scope='system' OR NOT c.is_test)
$$;

CREATE OR REPLACE FUNCTION public.sla_tick() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int := 0; c int;
BEGIN
  WITH pending AS (
    SELECT d.id, d.owner_id, 'first_response'::text AS obligation, d.first_response_due AS due, d.code || ' — ' || d.title AS title,d.classification,coalesce((SELECT version FROM public.sla_policies WHERE category=d.classification),1) AS rule_version
      FROM public.demands d LEFT JOIN public.clients cl ON cl.id=d.client_id WHERE NOT d.is_test AND (d.scope='system' OR NOT cl.is_test) AND d.first_response_at IS NULL AND d.completed_at IS NULL AND d.canceled_at IS NULL AND d.first_response_due IS NOT NULL
    UNION ALL
    SELECT d.id, d.owner_id, 'resolution_or_forward', d.resolution_due, d.code || ' — ' || d.title,d.classification,coalesce((SELECT version FROM public.sla_policies WHERE category=d.classification),1)
      FROM public.demands d LEFT JOIN public.clients cl ON cl.id=d.client_id WHERE NOT d.is_test AND (d.scope='system' OR NOT cl.is_test) AND d.forwarded_at IS NULL AND d.completed_at IS NULL AND d.canceled_at IS NULL AND d.resolution_due IS NOT NULL
    UNION ALL
    SELECT d.id,d.owner_id,'delivery',d.policy_delivery_due,d.code||' — '||d.title,d.classification,coalesce((SELECT version FROM public.sla_policies WHERE category=d.classification),1) FROM public.demands d LEFT JOIN public.clients cl ON cl.id=d.client_id WHERE NOT d.is_test AND (d.scope='system' OR NOT cl.is_test) AND d.completed_at IS NULL AND d.canceled_at IS NULL AND d.policy_delivery_due IS NOT NULL
    UNION ALL
    SELECT d.id,d.owner_id,CASE WHEN d.scope='system' THEN 'internal_plan' ELSE 'client_promise' END,d.due_date,d.code||' — '||d.title,d.classification,d.promise_revision FROM public.demands d LEFT JOIN public.clients cl ON cl.id=d.client_id WHERE NOT d.is_test AND (d.scope='system' OR NOT cl.is_test) AND d.completed_at IS NULL AND d.canceled_at IS NULL AND d.due_date IS NOT NULL

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
    CASE WHEN obligation='internal_plan' THEN 'Prazo planejado interno: ' WHEN obligation='client_promise' THEN 'Prazo combinado com cliente: ' ELSE 'SLA da empresa: ' END || CASE WHEN level='overdue' THEN 'atrasado · ' ELSE 'em risco · ' END || title, '/operacao?tab=crm&pipeline=demands&id=' || id,rule_version
  FROM rcpt ON CONFLICT(recipient_id,entity_type,entity_id,obligation,deadline,level,rule_version) DO UPDATE SET superseded_at=NULL WHERE notifications.superseded_at IS NOT NULL;
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

CREATE OR REPLACE FUNCTION public.delivery_deadline_tick() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int; BEGIN
 INSERT INTO public.notifications(recipient_id,entity_type,entity_id,obligation,deadline,level,title,link)
 SELECT p.id,'demand',r.demand_id,x.obligation,x.deadline,CASE WHEN x.deadline<now() THEN 'overdue' ELSE 'risk' END,CASE WHEN x.deadline<now() THEN 'Previsão / retorno técnico atrasado · ' ELSE 'Previsão / retorno técnico em risco · ' END||d.code,CASE WHEN public.is_technical(p.id) THEN '/tecnico' ELSE '/operacao?tab=crm&pipeline=demands&id='||d.id END
 FROM public.delivery_requests r JOIN public.demands d ON d.id=r.demand_id LEFT JOIN public.clients c ON c.id=d.client_id CROSS JOIN LATERAL(VALUES('technical_return',r.next_update_at),('technical_delivery',r.delivery_eta)) x(obligation,deadline)
 JOIN public.profiles p ON p.active AND (public.is_admin(p.id) OR p.id=d.owner_id OR p.id=r.technician_id OR (r.technician_id IS NULL AND public.is_technical(p.id)))
 WHERE x.deadline<=now()+make_interval(mins=>coalesce((SELECT value::int FROM public.app_settings WHERE key='sla_risk_minutes'),60)) AND r.technical AND r.technical_stage<>'Pronta para validação' AND r.approval_state<>'publicada' AND d.completed_at IS NULL AND d.canceled_at IS NULL AND NOT d.is_test AND (d.scope='system' OR NOT c.is_test) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n; END $$;

CREATE OR REPLACE FUNCTION public.cs_team_stats() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT has_cs_capability(auth.uid(),'view_team') THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM (SELECT d.owner_id,p.full_name,count(*) FILTER(WHERE d.completed_at IS NULL AND d.canceled_at IS NULL) AS open,count(*) FILTER(WHERE d.completed_at IS NOT NULL) AS completed,count(*) FILTER(WHERE s.first_response_state='atrasado' OR s.resolution_state='atrasado' OR s.delivery_state='atrasado') AS overdue FROM demands d LEFT JOIN clients c ON c.id=d.client_id LEFT JOIN profiles p ON p.id=d.owner_id LEFT JOIN demand_sla s ON s.id=d.id WHERE NOT d.is_test AND (d.scope='system' OR NOT c.is_test) GROUP BY d.owner_id,p.full_name) t);
END $$;

ALTER TABLE public.scheduled_tasks ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE public.scheduled_tasks ADD CONSTRAINT task_requires_target CHECK(client_id IS NOT NULL OR (record_kind IS NOT DISTINCT FROM 'demands' AND record_id IS NOT NULL));
DROP POLICY "Test tasks private" ON public.scheduled_tasks;
CREATE POLICY "Test tasks private" ON public.scheduled_tasks AS RESTRICTIVE FOR SELECT TO authenticated USING(public.is_admin(auth.uid()) OR public.real_operation_record('task',id));
CREATE OR REPLACE FUNCTION public.guard_private_task() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.client_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.demands WHERE id=NEW.record_id AND scope='system') THEN RAISE EXCEPTION 'invalid_record'; END IF;
 IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) AND
 ((NEW.client_id IS NOT NULL AND NOT public.real_client(NEW.client_id)) OR (NEW.record_id IS NOT NULL AND NOT public.real_operation_record(NEW.record_kind,NEW.record_id))) THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.save_scheduled_task(_id uuid,_client uuid,_title text,_type text,_due timestamptz,_notes text,_kind text DEFAULT NULL,_record uuid DEFAULT NULL,_version int DEFAULT NULL,_status text DEFAULT 'pending')
RETURNS public.scheduled_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); c public.clients; t public.scheduled_tasks; related uuid; existed boolean; general boolean := _client IS NULL; related_found boolean;
BEGIN
 IF NOT public.is_operator(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF general THEN
  IF _kind IS DISTINCT FROM 'demands' OR _record IS NULL OR NOT EXISTS(SELECT 1 FROM demands WHERE id=_record AND scope='system') OR NOT public.can_manage_case(_record,uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
 ELSE
  SELECT * INTO c FROM public.clients WHERE id=_client FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
 END IF;

 IF (_kind IS NULL) IS DISTINCT FROM (_record IS NULL) THEN RAISE EXCEPTION 'invalid_record'; END IF;
 IF _kind IS NOT NULL THEN
  IF _kind NOT IN ('demands','onboardings','upgrades','interactions','changelog') THEN RAISE EXCEPTION 'invalid_record'; END IF;
  EXECUTE format('SELECT client_id, true FROM public.%I WHERE id=$1',_kind) INTO related, related_found USING _record;
  IF coalesce(related_found,false)=false OR related IS DISTINCT FROM _client THEN RAISE EXCEPTION 'invalid_record'; END IF;
 END IF;
 SELECT * INTO t FROM public.scheduled_tasks WHERE id=_id FOR UPDATE; existed:=FOUND;
 IF existed THEN
  IF NOT public.is_admin(uid) AND t.created_by<>uid THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF t.client_id IS DISTINCT FROM _client OR t.record_kind IS DISTINCT FROM _kind OR t.record_id IS DISTINCT FROM _record THEN RAISE EXCEPTION 'not_found'; END IF;
  -- A network retry of the same creation returns the already-created row.
  IF _version IS NULL AND t.created_by=uid THEN RETURN t; END IF;
  IF _version IS NULL OR t.version<>_version THEN RAISE EXCEPTION 'conflict'; END IF;
  IF t.status<>'pending' THEN RAISE EXCEPTION 'closed'; END IF;
 ELSE
  IF _version IS NOT NULL OR _status<>'pending' THEN RAISE EXCEPTION 'not_found'; END IF;
 END IF;
 IF _status NOT IN ('pending','completed','canceled') THEN RAISE EXCEPTION 'invalid_status'; END IF;
 IF _status='pending' AND _due<=now() THEN RAISE EXCEPTION 'incomplete: escolha uma data e horário futuros'; END IF;
 IF existed THEN
  UPDATE public.scheduled_tasks SET title=btrim(_title),task_type=_type,due_at=_due,notes=_notes,record_kind=_kind,record_id=_record,status=_status,
   completed_at=CASE WHEN _status='completed' THEN now() ELSE NULL END,version=version+1,updated_at=now() WHERE id=_id RETURNING * INTO t;
 ELSE
  INSERT INTO public.scheduled_tasks(id,client_id,title,task_type,due_at,notes,record_kind,record_id,created_by)
   VALUES(_id,_client,btrim(_title),_type,_due,_notes,_kind,_record,uid) RETURNING * INTO t;
 END IF;
 INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES(CASE WHEN general THEN 'demand' ELSE 'client' END,coalesce(_client,_record),CASE WHEN existed THEN 'task_'||_status ELSE 'task_scheduled' END,uid,jsonb_build_object('task',_id,'title',_title,'due_at',_due));
 RETURN t;
END $$;

CREATE OR REPLACE FUNCTION public.task_reminder_tick() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
 -- Locks serialize rescheduling/cancellation with reminder dispatch; duplicates have a unique constraint.
 WITH pending AS (
 SELECT t.id,t.title,t.due_at,t.created_by AS owner_id,coalesce(c.name,'Sistema geral · Ikaros') AS name FROM public.scheduled_tasks t LEFT JOIN public.clients c ON c.id=t.client_id
 WHERE t.status='pending' AND t.due_at<=now() AND public.is_operator(t.created_by) AND (public.is_admin(t.created_by) OR public.real_operation_record('task',t.id)) FOR SHARE OF t
 )
 INSERT INTO public.notifications(recipient_id,entity_type,entity_id,obligation,deadline,level,title,link)
 SELECT owner_id,'task',id,'scheduled_task',due_at,'reminder','Tarefa: '||title||' · '||name,'/operacao?tab=tasks&id='||id FROM pending ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 INSERT INTO public.job_runs(job,ok,detail) VALUES('task_reminder_tick',true,jsonb_build_object('created',n));
 DELETE FROM public.job_runs WHERE job='task_reminder_tick' AND ran_at<now()-interval '7 days';
 RETURN n;
EXCEPTION WHEN OTHERS THEN
 INSERT INTO public.job_runs(job,ok,detail) VALUES('task_reminder_tick',false,jsonb_build_object('error',SQLERRM)); RETURN -1;
END $$;

COMMIT;
