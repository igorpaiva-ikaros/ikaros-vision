-- Carteira compartilhada; responsáveis pertencem aos registros, nunca aos clientes.
BEGIN;
CREATE OR REPLACE FUNCTION public.is_technical(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.is_active_user(_uid) AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role='technical') $$;
CREATE OR REPLACE FUNCTION public.is_workspace_user(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.is_operator(_uid) OR public.is_technical(_uid) $$;
DROP TRIGGER trg_client_owner ON public.clients;
DROP POLICY "CS reads own clients" ON public.clients;
DROP POLICY "CS creates own clients" ON public.clients;
DROP POLICY "CS updates own clients" ON public.clients;
CREATE POLICY "CS shared clients" ON public.clients FOR SELECT TO authenticated USING(public.is_cs(auth.uid()));
CREATE POLICY "CS creates shared client" ON public.clients FOR INSERT TO authenticated WITH CHECK(public.is_cs(auth.uid()) AND owner_id IS NULL);
CREATE POLICY "CS updates shared client" ON public.clients FOR UPDATE TO authenticated USING(public.is_cs(auth.uid())) WITH CHECK(public.is_cs(auth.uid()) AND owner_id IS NULL);
CREATE OR REPLACE FUNCTION public.guard_client_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 NEW.owner_id:=NULL;
 IF TG_OP='UPDATE' THEN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) AND (NEW.is_test IS DISTINCT FROM OLD.is_test OR NEW.code IS DISTINCT FROM OLD.code OR NEW.notion_id IS DISTINCT FROM OLD.notion_id OR NEW.notion_raw IS DISTINCT FROM OLD.notion_raw OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN RAISE EXCEPTION 'forbidden'; END IF;
  NEW.version:=OLD.version+1; NEW.updated_at:=now();
 END IF;
 RETURN NEW;
END $$;
UPDATE public.clients SET owner_id=NULL WHERE owner_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.assign_client(_id uuid,_owner uuid,_version int) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'shared_portfolio: atribua o responsável à demanda'; END $$;
DROP POLICY "Read own or admin profiles" ON public.profiles;
CREATE POLICY "Workspace member profiles" ON public.profiles FOR SELECT TO authenticated USING(id=auth.uid() OR public.is_admin(auth.uid()) OR (public.is_cs(auth.uid()) AND (public.is_cs(id) OR public.is_admin(id))));
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['demands','onboardings','upgrades','interactions','changelog'] LOOP
 EXECUTE format('DROP POLICY "CS reads own" ON public.%I',t);
 EXECUTE format('DROP POLICY "CS inserts own" ON public.%I',t);
 EXECUTE format('DROP POLICY "CS updates own" ON public.%I',t);
 EXECUTE format('CREATE POLICY "CS shared reads" ON public.%I FOR SELECT TO authenticated USING(public.is_cs(auth.uid()) AND client_id IS NOT NULL)',t);
 EXECUTE format('CREATE POLICY "CS creates own record" ON public.%I FOR INSERT TO authenticated WITH CHECK(public.is_cs(auth.uid()) AND owner_id=auth.uid() AND client_id IS NOT NULL)',t);
 EXECUTE format('CREATE POLICY "CS edits assigned record" ON public.%I FOR UPDATE TO authenticated USING(public.is_cs(auth.uid()) AND owner_id=auth.uid()) WITH CHECK(public.is_cs(auth.uid()) AND (owner_id=auth.uid() OR owner_id IS NULL))',t);
END LOOP; END $$;
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
    NEW.sla_start_at := public.sla_normalize(NEW.received_at);
    NEW.first_response_due := public.sla_add_business_minutes(NEW.received_at, 240);
    NEW.resolution_due := public.sla_next_business_day(NEW.received_at);
    IF NOT admin AND TG_OP = 'UPDATE' AND (NEW.first_response_due IS DISTINCT FROM public.sla_add_business_minutes(OLD.received_at,240) OR NEW.resolution_due IS DISTINCT FROM public.sla_next_business_day(OLD.received_at)) THEN RAISE EXCEPTION 'forbidden'; END IF;
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
CREATE OR REPLACE FUNCTION public.transition_demand(_id uuid, _action text, _version int, _stage text DEFAULT NULL, _reason text DEFAULT NULL)
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
    IF coalesce(btrim(d.solution), '') = '' OR NOT d.client_informed THEN
      RAISE EXCEPTION 'incomplete: informe a solução aplicada e confirme que o cliente foi informado';
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
CREATE OR REPLACE FUNCTION public.transition_onboarding(_id uuid, _action text, _version int, _stage text DEFAULT NULL)
RETURNS public.onboardings LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); o public.onboardings; old_stage text;
BEGIN
  IF uid IS NULL OR NOT public.is_operator(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO o FROM public.onboardings WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR (NOT public.is_admin(uid) AND (o.owner_id IS DISTINCT FROM uid)) THEN RAISE EXCEPTION 'not_found'; END IF;
  IF o.version <> _version THEN RAISE EXCEPTION 'conflict: o onboarding foi alterado por outra pessoa; recarregue'; END IF;
  IF o.completed_at IS NOT NULL THEN
    IF _action='complete' THEN RETURN o; END IF;
    RAISE EXCEPTION 'closed';
  END IF;
  old_stage := o.stage;
  PERFORM set_config('app.transition', 'on', true);
  IF _action = 'info_complete' THEN
    UPDATE public.onboardings SET info_complete_at = coalesce(info_complete_at, now()),started_at=coalesce(started_at,now()), stage = CASE WHEN stage IN ('Aguardando dados','Não iniciado','Aguardando informação') THEN 'Em andamento' ELSE stage END WHERE id = _id RETURNING * INTO o;
  ELSIF _action = 'complete' THEN
    IF o.info_complete_at IS NULL THEN RAISE EXCEPTION 'incomplete: registre o recebimento das informações completas antes de concluir'; END IF;
    UPDATE public.onboardings SET completed_at = coalesce(completed_at, now()), stage = 'Concluído', current_step='10. Conclusão' WHERE id = _id RETURNING * INTO o;
  ELSIF _action = 'move' THEN
    IF o.completed_at IS NOT NULL THEN RAISE EXCEPTION 'closed'; END IF;
    IF _stage NOT IN ('Não iniciado','Em andamento','Aguardando cliente','Aguardando informação','Em validação','Bloqueado') THEN RAISE EXCEPTION 'invalid_stage'; END IF;
    UPDATE public.onboardings SET stage = _stage WHERE id = _id RETURNING * INTO o;
  ELSIF _action='step' THEN
    IF o.completed_at IS NOT NULL OR _stage NOT IN ('1. Recepção e apresentação','2. Dados recebidos','3. Cadastro','4. Configuração','5. Migração','6. Conexão WhatsApp','7. Configuração da IA','8. Treinamento','9. Validação') THEN RAISE EXCEPTION 'invalid_step'; END IF;
    UPDATE public.onboardings SET current_step=_stage WHERE id=_id RETURNING * INTO o;
  ELSE RAISE EXCEPTION 'invalid_action'; END IF;
  PERFORM set_config('app.transition', 'off', true);
  INSERT INTO public.workflow_history(entity_type, entity_id, action, from_value, to_value, actor_id) VALUES ('onboarding', _id, _action, old_stage, o.stage, uid);
  RETURN o;
END $$;
CREATE OR REPLACE FUNCTION public.transition_upgrade(_id uuid, _action text, _version int, _stage text DEFAULT NULL)
RETURNS public.upgrades LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); u public.upgrades; old_stage text;
BEGIN
  IF uid IS NULL OR NOT public.is_operator(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO u FROM public.upgrades WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR (NOT public.is_admin(uid) AND (u.owner_id IS DISTINCT FROM uid)) THEN RAISE EXCEPTION 'not_found'; END IF;
  IF u.version <> _version THEN RAISE EXCEPTION 'conflict: o upgrade foi alterado por outra pessoa; recarregue'; END IF;
  IF u.lost_at IS NOT NULL OR u.effective_at IS NOT NULL THEN RETURN u; END IF;
  old_stage := u.stage;
  PERFORM set_config('app.transition', 'on', true);
  IF _action = 'accept' THEN
    UPDATE public.upgrades SET accepted_at = coalesce(accepted_at, now()), stage = 'Aceito' WHERE id = _id RETURNING * INTO u;
  ELSIF _action = 'effective' THEN
    IF u.accepted_at IS NULL THEN RAISE EXCEPTION 'incomplete: registre o aceite antes da efetivação'; END IF;
    UPDATE public.upgrades SET effective_at = now(), stage = 'Efetivado' WHERE id = _id RETURNING * INTO u;
  ELSIF _action = 'lost' THEN
    UPDATE public.upgrades SET lost_at = now(), stage = 'Perdido' WHERE id = _id RETURNING * INTO u;
  ELSIF _action='move' THEN
    IF _stage NOT IN ('Oportunidade identificada','Em conversa','Proposta apresentada','Aguardando cliente') OR u.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'invalid_stage'; END IF;
    UPDATE public.upgrades SET stage=_stage WHERE id=_id RETURNING * INTO u;
  ELSE RAISE EXCEPTION 'invalid_action'; END IF;
  PERFORM set_config('app.transition', 'off', true);
  INSERT INTO public.workflow_history(entity_type, entity_id, action, from_value, to_value, actor_id) VALUES ('upgrade', _id, _action, old_stage, u.stage, uid);
  RETURN u;
END $$;
CREATE OR REPLACE FUNCTION public.claim_record(_kind text,_id uuid,_version int,_release boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; next_owner uuid; uid uuid:=auth.uid();
BEGIN
 IF NOT public.is_operator(uid) OR _kind NOT IN('demands','onboardings','upgrades') THEN RAISE EXCEPTION 'forbidden'; END IF;
 EXECUTE format('SELECT id,owner_id,version,stage FROM public.%I WHERE id=$1 FOR UPDATE',_kind) INTO r USING _id;
 IF r.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 IF r.version<>_version THEN RAISE EXCEPTION 'conflict'; END IF;
 IF r.stage IN('Concluída','Concluído','Cancelada','Efetivado','Perdido') THEN RAISE EXCEPTION 'closed'; END IF;
 IF r.owner_id IS NOT NULL AND r.owner_id<>uid AND NOT public.is_admin(uid) THEN RAISE EXCEPTION 'already_assigned'; END IF;
 IF NOT _release AND NOT public.is_cs(uid) THEN RAISE EXCEPTION 'incomplete: selecione uma conta de CS para assumir'; END IF;
 next_owner:=CASE WHEN _release THEN NULL ELSE uid END;
 PERFORM set_config('app.assignment','on',true);
 EXECUTE format('UPDATE public.%I SET owner_id=$1 WHERE id=$2',_kind) USING next_owner,_id;
 PERFORM set_config('app.assignment','off',true);
 INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,from_value,to_value) VALUES(_kind,_id,CASE WHEN _release THEN 'release' ELSE 'claim' END,uid,r.owner_id::text,next_owner::text);
 RETURN jsonb_build_object('id',_id,'owner_id',next_owner);
END $$;
REVOKE ALL ON FUNCTION public.claim_record(text,uuid,int,boolean) FROM public,anon; GRANT EXECUTE ON FUNCTION public.claim_record(text,uuid,int,boolean) TO authenticated;
DROP POLICY "CS reads history of own items" ON public.workflow_history;
CREATE POLICY "CS shared history" ON public.workflow_history FOR SELECT TO authenticated USING(public.is_cs(auth.uid()) AND entity_type IN('client','clients','demand','demands','onboarding','onboardings','upgrade','upgrades','interactions','changelog'));
DROP POLICY "Operators read portfolio tasks" ON public.scheduled_tasks;
CREATE POLICY "CS shared tasks" ON public.scheduled_tasks FOR SELECT TO authenticated USING(public.is_operator(auth.uid()));
CREATE OR REPLACE FUNCTION public.save_scheduled_task(_id uuid,_client uuid,_title text,_type text,_due timestamptz,_notes text,_kind text DEFAULT NULL,_record uuid DEFAULT NULL,_version int DEFAULT NULL,_status text DEFAULT 'pending')
RETURNS public.scheduled_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); c public.clients; t public.scheduled_tasks; related uuid; existed boolean;
BEGIN
 IF NOT public.is_operator(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO c FROM public.clients WHERE id=_client FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

 IF (_kind IS NULL) IS DISTINCT FROM (_record IS NULL) THEN RAISE EXCEPTION 'invalid_record'; END IF;
 IF _kind IS NOT NULL THEN
  IF _kind NOT IN ('demands','onboardings','upgrades','interactions','changelog') THEN RAISE EXCEPTION 'invalid_record'; END IF;
  EXECUTE format('SELECT client_id FROM public.%I WHERE id=$1',_kind) INTO related USING _record;
  IF related IS DISTINCT FROM _client THEN RAISE EXCEPTION 'invalid_record'; END IF;
 END IF;
 SELECT * INTO t FROM public.scheduled_tasks WHERE id=_id FOR UPDATE; existed:=FOUND;
 IF existed THEN
  IF NOT public.is_admin(uid) AND t.created_by<>uid THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF t.client_id<>_client THEN RAISE EXCEPTION 'not_found'; END IF;
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
 INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('client',_client,CASE WHEN existed THEN 'task_'||_status ELSE 'task_scheduled' END,uid,jsonb_build_object('task',_id,'title',_title,'due_at',_due));
 RETURN t;
END $$;
CREATE OR REPLACE FUNCTION public.task_reminder_tick() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
 -- Locks serialize rescheduling/cancellation with reminder dispatch; duplicates have a unique constraint.
 WITH pending AS (
 SELECT t.id,t.title,t.due_at,t.created_by AS owner_id,c.name FROM public.scheduled_tasks t JOIN public.clients c ON c.id=t.client_id
 WHERE t.status='pending' AND t.due_at<=now() AND public.is_operator(t.created_by) FOR SHARE OF t,c
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
CREATE OR REPLACE FUNCTION public.admin_update_member(_id uuid,_role text,_active boolean,_commission boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(712503);
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _role NOT IN ('admin','cs','technical') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  IF NOT exists(SELECT 1 FROM public.profiles WHERE id=_id) THEN RAISE EXCEPTION 'not_found'; END IF;
  DELETE FROM public.user_roles WHERE user_id=_id;
  INSERT INTO public.user_roles(user_id,role) VALUES(_id,_role::public.app_role);
  UPDATE public.profiles SET active=_active,commission_eligible=_commission,updated_at=now() WHERE id=_id;
  INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('member',_id,'permissions',auth.uid(),jsonb_build_object('role',_role,'active',_active,'commission',_commission));
END $$;
CREATE OR REPLACE FUNCTION public.provision_member(_id uuid,_name text,_email text,_role text,_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_admin(_actor) OR _role NOT IN ('admin','cs','technical') THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.profiles(id,full_name,email) VALUES(_id,_name,_email);
  INSERT INTO public.user_roles(user_id,role) VALUES(_id,_role::public.app_role);
  INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('member',_id,'create',_actor,jsonb_build_object('role',_role));
END $$;
DO $$ BEGIN
 PERFORM set_config('app.transition','on',true);
 UPDATE public.onboardings SET current_step=CASE current_step WHEN '1. Dados recebidos' THEN '2. Dados recebidos' WHEN '2. Cadastro' THEN '3. Cadastro' WHEN '3. Configuração' THEN '4. Configuração' WHEN '4. Migração' THEN '5. Migração' WHEN '5. Conexão WhatsApp' THEN '6. Conexão WhatsApp' WHEN '6. Configuração da IA' THEN '7. Configuração da IA' WHEN '7. Treinamento' THEN '8. Treinamento' WHEN '8. Validação' THEN '9. Validação' WHEN '9. Conclusão' THEN '10. Conclusão' ELSE current_step END;
 PERFORM set_config('app.transition','off',true);
END $$;
COMMIT;
