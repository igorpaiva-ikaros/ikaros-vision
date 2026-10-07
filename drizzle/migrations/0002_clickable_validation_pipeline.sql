BEGIN;
ALTER TABLE public.demands ADD COLUMN approval_repository_url text;
ALTER FUNCTION public.transition_demand(uuid,text,int,text,text) RENAME TO transition_demand_core;
REVOKE ALL ON FUNCTION public.transition_demand_core(uuid,text,int,text,text) FROM public,anon,authenticated;
ALTER FUNCTION public.delivery_action(uuid,text,int,jsonb) RENAME TO delivery_action_core;
REVOKE ALL ON FUNCTION public.delivery_action_core(uuid,text,int,jsonb) FROM public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.guard_delivery_closure() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF coalesce(current_setting('app.review',true),'')<>'on' AND EXISTS(SELECT 1 FROM public.delivery_requests WHERE demand_id=OLD.id AND approval_state IN('aguardando','aprovada')) AND (NEW.stage IS DISTINCT FROM OLD.stage OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.priority IS DISTINCT FROM OLD.priority OR NEW.classification IS DISTINCT FROM OLD.classification OR NEW.impact IS DISTINCT FROM OLD.impact OR NEW.channel IS DISTINCT FROM OLD.channel OR NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description OR NEW.solution IS DISTINCT FROM OLD.solution OR NEW.tests_run IS DISTINCT FROM OLD.tests_run OR NEW.test_result IS DISTINCT FROM OLD.test_result OR NEW.context IS DISTINCT FROM OLD.context OR NEW.approval_repository_url IS DISTINCT FROM OLD.approval_repository_url OR NEW.client_informed IS DISTINCT FROM OLD.client_informed OR NEW.client_validated IS DISTINCT FROM OLD.client_validated OR NEW.completed_at IS DISTINCT FROM OLD.completed_at OR NEW.canceled_at IS DISTINCT FROM OLD.canceled_at) THEN RAISE EXCEPTION 'validation_locked: aguarde a decisão do administrador'; END IF;
 IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL AND EXISTS(SELECT 1 FROM public.delivery_requests WHERE demand_id=NEW.id AND (approval_state<>'publicada' OR NOT NEW.client_informed OR coalesce(btrim(NEW.solution),'')='')) THEN RAISE EXCEPTION 'incomplete: confirme publicação, solução e aviso ao cliente'; END IF;
 IF coalesce(current_setting('app.review',true),'')<>'on' AND NEW.stage IS DISTINCT FROM OLD.stage AND NEW.stage IN('Aguardando aprovação','Aguardando validação','Aprovada para publicação','Publicada','Publicada / avisar cliente') THEN RAISE EXCEPTION 'approval_required'; END IF;
 RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.submit_demand_validation(_id uuid,_version int) RETURNS public.demands LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.demands;r public.delivery_requests; BEGIN
 SELECT * INTO d FROM public.demands WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR NOT public.can_manage_case(_id,auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF d.version<>_version THEN RAISE EXCEPTION 'conflict'; END IF;
 IF d.completed_at IS NOT NULL OR d.canceled_at IS NOT NULL THEN RAISE EXCEPTION 'closed'; END IF;
 SELECT * INTO r FROM public.delivery_requests WHERE demand_id=_id FOR UPDATE;
 IF r.approval_state IN('aguardando','aprovada') THEN RETURN d; END IF;
 IF r.approval_state='publicada' THEN RAISE EXCEPTION 'closed: mudança já publicada'; END IF;
 IF r.technical AND r.technical_stage<>'Pronta para validação' THEN RAISE EXCEPTION 'incomplete: aguarde o resultado técnico antes de validar'; END IF;
 IF length(btrim(coalesce(d.title,'')))<2 OR length(btrim(coalesce(d.description,'')))<2 THEN RAISE EXCEPTION 'incomplete: salve o nome e o contexto da demanda'; END IF;
 IF d.approval_repository_url IS NOT NULL AND d.approval_repository_url !~ '^https://github[.]com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/(pull/[0-9]+|commit/[a-fA-F0-9]{7,40})/?$' THEN RAISE EXCEPTION 'incomplete: confira o link do GitHub'; END IF;
 IF r.id IS NULL THEN INSERT INTO public.delivery_requests(demand_id,requested_by) VALUES(_id,auth.uid()) RETURNING * INTO r; END IF;
 UPDATE public.delivery_requests SET approval_state='aguardando',change_summary=concat_ws(E'\n\n',d.title,d.description,nullif(d.solution,'')),context=coalesce(nullif(d.context,''),d.description),tests_result=coalesce(nullif(concat_ws(E'\n',nullif(d.tests_run,''),nullif(d.test_result,'')),''),r.tests_result),repository_url=coalesce(d.approval_repository_url,r.repository_url),requested_by=auth.uid(),approved_at=NULL,approved_by=NULL,rejection_reason=NULL,version=version+1,updated_at=now() WHERE id=r.id;
 PERFORM set_config('app.review','on',true);PERFORM set_config('app.transition','on',true);
 UPDATE public.demands SET stage='Aguardando validação' WHERE id=_id;
 PERFORM set_config('app.transition','off',true);PERFORM set_config('app.review','off',true);
 INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,from_value,to_value,details) VALUES('demand',_id,'submit_validation',auth.uid(),d.stage,'Aguardando validação',jsonb_build_object('delivery_request',r.id));
 PERFORM public.case_notice(_id,'Demanda aguardando validação do administrador · '||d.code,false);
 SELECT * INTO d FROM public.demands WHERE id=_id;RETURN d;
END $$;
REVOKE ALL ON FUNCTION public.submit_demand_validation(uuid,int) FROM public,anon;GRANT EXECUTE ON FUNCTION public.submit_demand_validation(uuid,int) TO authenticated;
CREATE OR REPLACE FUNCTION public.transition_demand(_id uuid,_action text,_version int,_stage text DEFAULT NULL,_reason text DEFAULT NULL) RETURNS public.demands LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF _action='move' AND _stage IN('Aguardando validação','Aguardando aprovação') THEN RETURN public.submit_demand_validation(_id,_version); END IF;
 IF _action='publish' OR (_action='move' AND _stage IN('Publicada','Publicada / avisar cliente','Aprovada para publicação')) THEN RAISE EXCEPTION 'approval_required'; END IF;
 IF EXISTS(SELECT 1 FROM public.delivery_requests WHERE demand_id=_id AND approval_state IN('aguardando','aprovada')) THEN RAISE EXCEPTION 'validation_locked: aguarde a decisão do administrador'; END IF;
 RETURN public.transition_demand_core(_id,_action,_version,_stage,_reason);
END $$;
REVOKE ALL ON FUNCTION public.transition_demand(uuid,text,int,text,text) FROM public,anon;GRANT EXECUTE ON FUNCTION public.transition_demand(uuid,text,int,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.delivery_action(_demand uuid,_action text,_version int,_data jsonb DEFAULT '{}') RETURNS public.delivery_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.delivery_requests;d public.demands;oldstage text; BEGIN
 SELECT * INTO d FROM public.demands WHERE id=_demand FOR UPDATE;oldstage:=d.stage;
 IF NOT FOUND OR NOT public.can_read_case(_demand,auth.uid()) THEN RAISE EXCEPTION 'not_found'; END IF;
 SELECT * INTO r FROM public.delivery_requests WHERE demand_id=_demand FOR UPDATE;
 IF r.approval_state IN('aguardando','aprovada') AND _action NOT IN('approve','reject','published','validate_publish') THEN RAISE EXCEPTION 'validation_locked'; END IF;
 PERFORM set_config('app.review','on',true);
 IF _action='validate_publish' THEN
  IF NOT public.is_admin(auth.uid()) OR r.approval_state<>'aguardando' THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF coalesce((_data->>'confirmed')::boolean,false)=false OR length(btrim(coalesce(_data->>'deployment_ref','')))<5 THEN RAISE EXCEPTION 'incomplete: confirme a publicação realizada e sua referência'; END IF;
  r:=public.delivery_action_core(_demand,'approve',_version,'{}');
  r:=public.delivery_action_core(_demand,'published',r.version,_data);
 ELSE r:=public.delivery_action_core(_demand,_action,_version,_data); END IF;
 IF r.approval_state IN('aguardando','publicada') THEN
  PERFORM set_config('app.transition','on',true);
  UPDATE public.demands SET stage=CASE WHEN r.approval_state='aguardando' THEN 'Aguardando validação' ELSE 'Publicada' END WHERE id=_demand;
  PERFORM set_config('app.transition','off',true);
 END IF;
 INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,from_value,to_value) SELECT 'demand',_demand,'review_'||_action,auth.uid(),oldstage,stage FROM public.demands WHERE id=_demand;
 PERFORM set_config('app.review','off',true);RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.delivery_action(uuid,text,int,jsonb) FROM public,anon;GRANT EXECUTE ON FUNCTION public.delivery_action(uuid,text,int,jsonb) TO authenticated;
SELECT set_config('app.review','on',true),set_config('app.transition','on',true);
UPDATE public.demands SET stage=CASE stage WHEN 'Aguardando aprovação' THEN 'Aguardando validação' WHEN 'Publicada / avisar cliente' THEN 'Publicada' ELSE stage END WHERE stage IN('Aguardando aprovação','Publicada / avisar cliente');
SELECT set_config('app.review','off',true),set_config('app.transition','off',true);
CREATE OR REPLACE FUNCTION public.record_demand_initial_stage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,to_value) VALUES('demand',NEW.id,'stage_entered',auth.uid(),NEW.stage);RETURN NEW;END $$;
CREATE TRIGGER trg_demand_stage_created AFTER INSERT ON public.demands FOR EACH ROW EXECUTE FUNCTION public.record_demand_initial_stage();
CREATE OR REPLACE FUNCTION public.demand_stage_trace(_demand uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;BEGIN
 IF NOT public.is_operator(auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.demands WHERE id=_demand) THEN RAISE EXCEPTION 'forbidden'; END IF;
 WITH visits AS (
 SELECT h.at,v.stage FROM public.workflow_history h CROSS JOIN LATERAL(VALUES(h.from_value),(h.to_value),(CASE WHEN h.action='created' THEN h.details->>'stage' END),(CASE WHEN h.action='delivery_forward' THEN 'Encaminhada para desenvolvimento' WHEN h.action='delivery_request_approval' THEN 'Aguardando validação' WHEN h.action='delivery_published' THEN 'Publicada' END)) v(stage)
 WHERE h.entity_id=_demand AND h.entity_type IN('demand','demands') AND (h.action IN('created','stage_entered','move','first_response','forward','publish','complete','cancel','submit_validation') OR h.action LIKE 'review_%' OR h.action LIKE 'delivery_%')
 ),normalized AS (SELECT CASE stage WHEN 'Aguardando aprovação' THEN 'Aguardando validação' WHEN 'Publicada / avisar cliente' THEN 'Publicada' ELSE stage END stage,min(at) first_at,max(at) last_at FROM visits WHERE stage IS NOT NULL GROUP BY 1)
 SELECT coalesce(jsonb_agg(jsonb_build_object('stage',stage,'first_at',first_at,'last_at',last_at) ORDER BY first_at),'[]') INTO r FROM normalized;RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.demand_stage_trace(uuid) FROM public,anon;GRANT EXECUTE ON FUNCTION public.demand_stage_trace(uuid) TO authenticated;
COMMIT;