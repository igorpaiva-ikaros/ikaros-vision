-- Uma demanda, com etapas técnicas e de aprovação auditadas; sem automação de deploy.
BEGIN;
CREATE TABLE public.delivery_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), demand_id uuid NOT NULL UNIQUE REFERENCES public.demands(id),
 technical boolean NOT NULL DEFAULT false, technical_stage text NOT NULL DEFAULT 'Recebida' CHECK(technical_stage IN('Recebida','Em análise','Em desenvolvimento','Bloqueada','Pronta para validação')),
 technician_id uuid REFERENCES public.profiles(id), context text NOT NULL DEFAULT '',
 next_update_at timestamptz, delivery_eta timestamptz, forecast_reason text,
 technical_result text, tests_result text,
 approval_state text NOT NULL DEFAULT 'não solicitado' CHECK(approval_state IN('não solicitado','aguardando','aprovada','rejeitada','publicada')),
 change_summary text, repository_url text, deployment_ref text, rejection_reason text,
 requested_by uuid REFERENCES public.profiles(id), approved_by uuid REFERENCES public.profiles(id), approved_at timestamptz,
 published_at timestamptz, version int NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.can_read_case(_demand uuid,_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_operator(_uid) AND EXISTS(SELECT 1 FROM public.demands WHERE id=_demand AND client_id IS NOT NULL)
 OR public.is_technical(_uid) AND EXISTS(SELECT 1 FROM public.delivery_requests WHERE demand_id=_demand AND technical)
$$;
CREATE OR REPLACE FUNCTION public.can_manage_case(_demand uuid,_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_admin(_uid) OR public.is_cs(_uid) AND EXISTS(SELECT 1 FROM public.demands WHERE id=_demand AND owner_id=_uid)
$$;
ALTER TABLE public.delivery_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.delivery_requests TO authenticated; GRANT ALL ON public.delivery_requests TO service_role;
CREATE POLICY "Read delivery cases" ON public.delivery_requests FOR SELECT TO authenticated USING(public.can_read_case(demand_id,auth.uid()));
CREATE OR REPLACE FUNCTION public.case_notice(_demand uuid,_message text,_technical boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record; BEGIN
 FOR p IN SELECT id FROM public.profiles WHERE active AND (public.is_admin(id) OR id=(SELECT owner_id FROM public.demands WHERE id=_demand) OR (_technical AND public.is_technical(id) AND public.can_read_case(_demand,id))) LOOP
 INSERT INTO public.notifications(recipient_id,entity_type,entity_id,obligation,deadline,level,title,link)
 VALUES(p.id,'demand',_demand,'delivery_event',clock_timestamp(),'reminder',_message,CASE WHEN public.is_technical(p.id) THEN '/tecnico' ELSE '/operacao?tab=crm&pipeline=demands&id='||_demand END) ON CONFLICT DO NOTHING;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.case_notice(uuid,text,boolean) FROM public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.delivery_action(_demand uuid,_action text,_version int,_data jsonb DEFAULT '{}') RETURNS public.delivery_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); d public.demands; r public.delivery_requests; before_value jsonb; istech boolean; stage text; eta timestamptz; nextdate timestamptz; reason text;
BEGIN
 IF NOT public.is_workspace_user(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO d FROM public.demands WHERE id=_demand FOR UPDATE;
 IF NOT FOUND OR NOT public.can_read_case(_demand,uid) THEN RAISE EXCEPTION 'not_found'; END IF;
 IF d.completed_at IS NOT NULL OR d.canceled_at IS NOT NULL THEN RAISE EXCEPTION 'closed'; END IF;
 SELECT * INTO r FROM public.delivery_requests WHERE demand_id=_demand FOR UPDATE;
 IF r.id IS NULL THEN
  IF _version<>0 OR _action NOT IN('forward','request_approval') OR NOT public.can_manage_case(_demand,uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.delivery_requests(demand_id,requested_by) VALUES(_demand,uid) RETURNING * INTO r;
 ELSIF r.version<>_version THEN RAISE EXCEPTION 'conflict'; END IF;
 before_value:=to_jsonb(r); istech:=public.is_technical(uid);
 IF _action='forward' THEN
  IF NOT public.can_manage_case(_demand,uid) OR r.approval_state IN('aprovada','publicada') THEN RAISE EXCEPTION 'forbidden'; END IF;
  nextdate:=(_data->>'next_update_at')::timestamptz;
  IF length(btrim(coalesce(_data->>'context','')))<5 OR nextdate IS NULL OR nextdate<=now() THEN RAISE EXCEPTION 'incomplete: informe contexto e data do próximo retorno'; END IF;
  UPDATE public.delivery_requests SET technical=true,context=_data->>'context',next_update_at=nextdate,technical_stage='Recebida',approval_state='não solicitado',approved_at=NULL,approved_by=NULL WHERE id=r.id;
  PERFORM set_config('app.transition','on',true);
  UPDATE public.demands SET forwarded_at=coalesce(forwarded_at,now()),stage='Encaminhada para desenvolvimento' WHERE id=_demand;
  PERFORM set_config('app.transition','off',true);
 ELSIF _action='technical_update' THEN
  IF NOT r.technical OR (NOT istech AND NOT public.is_admin(uid)) OR r.approval_state IN('aprovada','publicada','aguardando') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF r.technician_id IS NOT NULL AND r.technician_id<>uid AND NOT public.is_admin(uid) THEN RAISE EXCEPTION 'already_assigned'; END IF;
  stage:=_data->>'stage'; eta:=nullif(_data->>'delivery_eta','')::timestamptz; nextdate:=nullif(_data->>'next_update_at','')::timestamptz; reason:=btrim(coalesce(_data->>'reason',''));
  IF stage NOT IN('Em análise','Em desenvolvimento','Bloqueada','Pronta para validação') OR nextdate IS NULL OR nextdate<=now() THEN RAISE EXCEPTION 'incomplete: informe etapa e próximo retorno'; END IF;
  IF stage='Em desenvolvimento' AND (eta IS NULL OR eta<=now()) THEN RAISE EXCEPTION 'incomplete: informe previsão de entrega futura'; END IF;
  IF r.delivery_eta IS DISTINCT FROM eta AND r.delivery_eta IS NOT NULL AND length(reason)<5 THEN RAISE EXCEPTION 'incomplete: explique a mudança de previsão'; END IF;
  IF stage='Bloqueada' AND length(reason)<5 THEN RAISE EXCEPTION 'incomplete: explique o bloqueio'; END IF;
  IF stage='Pronta para validação' AND (length(btrim(coalesce(_data->>'result','')))<5 OR length(btrim(coalesce(_data->>'tests','')))<5) THEN RAISE EXCEPTION 'incomplete: informe solução e testes'; END IF;
  UPDATE public.delivery_requests SET technician_id=CASE WHEN istech THEN uid ELSE technician_id END,technical_stage=stage,delivery_eta=eta,next_update_at=nextdate,forecast_reason=reason,technical_result=_data->>'result',tests_result=_data->>'tests' WHERE id=r.id;
 ELSIF _action='request_approval' THEN
  IF NOT public.can_manage_case(_demand,uid) OR r.approval_state IN('aprovada','publicada','aguardando') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF r.technical AND r.technical_stage<>'Pronta para validação' THEN RAISE EXCEPTION 'incomplete: aguarde a validação técnica'; END IF;
  IF length(btrim(coalesce(_data->>'summary','')))<5 OR length(btrim(coalesce(_data->>'tests','')))<5 OR coalesce(_data->>'repository_url','') !~ '^https://github[.]com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/(pull/[0-9]+|commit/[a-fA-F0-9]{7,40})/?$' THEN RAISE EXCEPTION 'incomplete: informe mudança, testes e link do PR ou commit'; END IF;
  UPDATE public.delivery_requests SET approval_state='aguardando',change_summary=_data->>'summary',tests_result=_data->>'tests',repository_url=_data->>'repository_url',requested_by=uid,approved_at=NULL,approved_by=NULL,rejection_reason=NULL WHERE id=r.id;
  PERFORM set_config('app.transition','on',true); UPDATE public.demands SET stage='Aguardando aprovação' WHERE id=_demand; PERFORM set_config('app.transition','off',true);
 ELSIF _action IN('approve','reject') THEN
  IF NOT public.is_admin(uid) OR r.approval_state<>'aguardando' THEN RAISE EXCEPTION 'forbidden'; END IF;
  reason:=btrim(coalesce(_data->>'reason',''));
  IF _action='reject' AND length(reason)<5 THEN RAISE EXCEPTION 'incomplete: explique o ajuste solicitado'; END IF;
  UPDATE public.delivery_requests SET approval_state=CASE WHEN _action='approve' THEN 'aprovada' ELSE 'rejeitada' END,approved_by=uid,approved_at=CASE WHEN _action='approve' THEN now() ELSE NULL END,rejection_reason=reason WHERE id=r.id;
  PERFORM set_config('app.transition','on',true); UPDATE public.demands SET stage=CASE WHEN _action='approve' THEN 'Aprovada para publicação' ELSE 'Em execução' END WHERE id=_demand; PERFORM set_config('app.transition','off',true);
 ELSIF _action='published' THEN
  IF NOT public.is_admin(uid) OR r.approval_state<>'aprovada' THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF coalesce((_data->>'confirmed')::boolean,false)=false OR length(btrim(coalesce(_data->>'deployment_ref','')))<5 THEN RAISE EXCEPTION 'incomplete: confirme a publicação e informe sua referência'; END IF;
  UPDATE public.delivery_requests SET approval_state='publicada',deployment_ref=_data->>'deployment_ref',published_at=now() WHERE id=r.id;
  PERFORM set_config('app.transition','on',true); UPDATE public.demands SET stage='Publicada / avisar cliente',published_at=coalesce(published_at,now()) WHERE id=_demand; PERFORM set_config('app.transition','off',true);
 ELSE RAISE EXCEPTION 'invalid_action'; END IF;
 UPDATE public.delivery_requests SET version=version+1,updated_at=now() WHERE id=r.id RETURNING * INTO r;
 INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('demand',_demand,'delivery_'||_action,uid,jsonb_build_object('before',before_value,'after',to_jsonb(r)));
 PERFORM public.case_notice(_demand,CASE _action WHEN 'forward' THEN 'Nova demanda para a equipe técnica' WHEN 'technical_update' THEN 'Atualização técnica / previsão' WHEN 'request_approval' THEN 'Mudança aguardando aprovação' WHEN 'approve' THEN 'Mudança aprovada para o lote de publicação' WHEN 'reject' THEN 'Mudança precisa de ajustes' ELSE 'Publicada: confirmar entrega e avisar o cliente' END||' · '||d.code,_action IN('forward','technical_update'));
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.delivery_action(uuid,text,int,jsonb) FROM public,anon; GRANT EXECUTE ON FUNCTION public.delivery_action(uuid,text,int,jsonb) TO authenticated;
CREATE TABLE public.case_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),demand_id uuid NOT NULL REFERENCES public.demands(id),author_id uuid NOT NULL REFERENCES public.profiles(id),author_name text NOT NULL,body text NOT NULL CHECK(length(btrim(body)) BETWEEN 2 AND 10000),created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.case_messages ENABLE ROW LEVEL SECURITY; GRANT SELECT ON public.case_messages TO authenticated; GRANT ALL ON public.case_messages TO service_role;
CREATE POLICY "Read case conversation" ON public.case_messages FOR SELECT TO authenticated USING(public.can_read_case(demand_id,auth.uid()));
CREATE OR REPLACE FUNCTION public.post_case_message(_demand uuid,_body text) RETURNS public.case_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.case_messages; name text; BEGIN
 IF NOT public.can_read_case(_demand,auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT full_name INTO name FROM public.profiles WHERE id=auth.uid();
 INSERT INTO public.case_messages(demand_id,author_id,author_name,body) VALUES(_demand,auth.uid(),name,btrim(_body)) RETURNING * INTO r;
 INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('demand',_demand,'comment',auth.uid(),jsonb_build_object('message_id',r.id));
 PERFORM public.case_notice(_demand,'Nova observação · '||(SELECT code FROM public.demands WHERE id=_demand),true);
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.post_case_message(uuid,text) FROM public,anon; GRANT EXECUTE ON FUNCTION public.post_case_message(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.technical_queue() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('request',to_jsonb(r),'demand',jsonb_build_object('id',d.id,'code',d.code,'title',d.title,'description',d.description,'classification',d.classification,'priority',d.priority,'context',d.context,'owner_id',d.owner_id,'cs_name',p.full_name,'completed_at',d.completed_at,'canceled_at',d.canceled_at,'stage',d.stage),'client_name',c.name,'client_code',c.code) ORDER BY r.created_at),'[]')
 FROM public.delivery_requests r JOIN public.demands d ON d.id=r.demand_id JOIN public.clients c ON c.id=d.client_id LEFT JOIN public.profiles p ON p.id=d.owner_id
 WHERE public.is_workspace_user(auth.uid()) AND (public.is_operator(auth.uid()) OR r.technical) AND NOT d.is_test AND NOT c.is_test
$$;
REVOKE ALL ON FUNCTION public.technical_queue() FROM public,anon; GRANT EXECUTE ON FUNCTION public.technical_queue() TO authenticated;
DROP POLICY "Read own notifications" ON public.notifications; DROP POLICY "Mark own notifications" ON public.notifications;
CREATE POLICY "Workspace notifications" ON public.notifications FOR SELECT TO authenticated USING(recipient_id=auth.uid() AND public.is_workspace_user(auth.uid()) AND (public.is_operator(auth.uid()) OR public.can_read_case(entity_id,auth.uid())));
CREATE POLICY "Read receipt workspace" ON public.notifications FOR UPDATE TO authenticated USING(recipient_id=auth.uid() AND public.is_workspace_user(auth.uid())) WITH CHECK(recipient_id=auth.uid());
-- Completion requires publication for approval-controlled work. Sending it away never marks it completed.
CREATE OR REPLACE FUNCTION public.guard_delivery_closure() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL AND EXISTS(SELECT 1 FROM public.delivery_requests WHERE demand_id=NEW.id AND (approval_state<>'publicada' OR NOT NEW.client_informed OR coalesce(btrim(NEW.solution),'')='')) THEN RAISE EXCEPTION 'incomplete: publique a mudança, registre a solução e avise o cliente antes de concluir'; END IF;
 IF NEW.stage IS DISTINCT FROM OLD.stage AND EXISTS(SELECT 1 FROM public.delivery_requests WHERE demand_id=NEW.id AND approval_state IN('aguardando','aprovada','publicada')) AND NEW.stage NOT IN('Aguardando aprovação','Aprovada para publicação','Publicada / avisar cliente','Concluída','Cancelada') THEN RAISE EXCEPTION 'approval_required'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER trg_delivery_closure BEFORE UPDATE ON public.demands FOR EACH ROW EXECUTE FUNCTION public.guard_delivery_closure();
CREATE OR REPLACE FUNCTION public.delivery_deadline_tick() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int; BEGIN
 INSERT INTO public.notifications(recipient_id,entity_type,entity_id,obligation,deadline,level,title,link)
 SELECT p.id,'demand',r.demand_id,x.obligation,x.deadline,CASE WHEN x.deadline<now() THEN 'overdue' ELSE 'risk' END,CASE WHEN x.deadline<now() THEN 'Previsão / retorno técnico atrasado · ' ELSE 'Previsão / retorno técnico em risco · ' END||d.code,CASE WHEN public.is_technical(p.id) THEN '/tecnico' ELSE '/operacao?tab=crm&pipeline=demands&id='||d.id END
 FROM public.delivery_requests r JOIN public.demands d ON d.id=r.demand_id JOIN public.clients c ON c.id=d.client_id CROSS JOIN LATERAL(VALUES('technical_return',r.next_update_at),('technical_delivery',r.delivery_eta)) x(obligation,deadline)
 JOIN public.profiles p ON p.active AND (public.is_admin(p.id) OR p.id=d.owner_id OR p.id=r.technician_id OR (r.technician_id IS NULL AND public.is_technical(p.id)))
 WHERE x.deadline<=now()+make_interval(mins=>coalesce((SELECT value::int FROM public.app_settings WHERE key='sla_risk_minutes'),60)) AND r.technical AND r.technical_stage<>'Pronta para validação' AND r.approval_state<>'publicada' AND d.completed_at IS NULL AND d.canceled_at IS NULL AND NOT d.is_test AND NOT c.is_test ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n; END $$;
REVOKE ALL ON FUNCTION public.delivery_deadline_tick() FROM public,anon,authenticated; GRANT EXECUTE ON FUNCTION public.delivery_deadline_tick() TO service_role;
COMMIT;
