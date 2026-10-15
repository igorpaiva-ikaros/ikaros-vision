BEGIN;
CREATE TABLE public.member_access (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 is_lead boolean NOT NULL DEFAULT false, view_team boolean NOT NULL DEFAULT false,
 manage_cs boolean NOT NULL DEFAULT false, promote_cs boolean NOT NULL DEFAULT false,
 hidden_areas text[] NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.member_access ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.member_access TO authenticated;
GRANT ALL ON public.member_access TO service_role;
CREATE FUNCTION public.has_cs_capability(_uid uuid,_cap text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_admin(_uid) OR (public.is_cs(_uid) AND EXISTS(SELECT 1 FROM member_access a WHERE a.user_id=_uid AND a.is_lead AND CASE _cap WHEN 'view_team' THEN a.view_team WHEN 'manage_cs' THEN a.manage_cs WHEN 'promote_cs' THEN a.promote_cs ELSE false END))
$$;
CREATE POLICY "Own or admin access settings" ON public.member_access FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_admin(auth.uid()) OR public.has_cs_capability(auth.uid(),'manage_cs') OR public.has_cs_capability(auth.uid(),'promote_cs'));
CREATE FUNCTION public.save_member_access(_id uuid,_access jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.member_access; hidden text[]; BEGIN
 IF NOT public.is_admin(auth.uid()) OR NOT public.is_cs(_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF jsonb_typeof(_access)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(_access) k WHERE k NOT IN('is_lead','view_team','manage_cs','promote_cs','hidden_areas')) THEN RAISE EXCEPTION 'invalid_access'; END IF;
 SELECT array_agg(value) INTO hidden FROM jsonb_array_elements_text(_access->'hidden_areas'); hidden:=coalesce(hidden,'{}');
 IF NOT hidden <@ ARRAY['crm','clients','tasks','changelog','interactions','technical'] THEN RAISE EXCEPTION 'invalid_access'; END IF;
 SELECT * INTO a FROM member_access WHERE user_id=_id;
 INSERT INTO member_access(user_id,is_lead,view_team,manage_cs,promote_cs,hidden_areas) VALUES(_id,(_access->>'is_lead')::boolean,(_access->>'view_team')::boolean,(_access->>'manage_cs')::boolean,(_access->>'promote_cs')::boolean,hidden)
 ON CONFLICT(user_id) DO UPDATE SET is_lead=excluded.is_lead,view_team=excluded.view_team,manage_cs=excluded.manage_cs,promote_cs=excluded.promote_cs,hidden_areas=excluded.hidden_areas,updated_at=now();
 INSERT INTO workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('member',_id,'delegation',auth.uid(),jsonb_build_object('before',to_jsonb(a),'after',_access));
END $$;
CREATE FUNCTION public.set_cs_leader(_id uuid,_leader boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_cs_capability(auth.uid(),'promote_cs') OR _id=auth.uid() OR NOT public.is_cs(_id) OR public.is_admin(_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
 INSERT INTO member_access(user_id,is_lead) VALUES(_id,_leader) ON CONFLICT(user_id) DO UPDATE SET is_lead=_leader,updated_at=now();
 INSERT INTO workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('member',_id,'leadership',auth.uid(),jsonb_build_object('is_lead',_leader));
END $$;
CREATE OR REPLACE FUNCTION public.provision_member(_id uuid,_name text,_email text,_role text,_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_admin(_actor) AND NOT (public.has_cs_capability(_actor,'manage_cs') AND _role='cs') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _role NOT IN('admin','cs','technical') THEN RAISE EXCEPTION 'invalid_role'; END IF;
 INSERT INTO profiles(id,full_name,email) VALUES(_id,_name,_email);
 INSERT INTO user_roles(user_id,role) VALUES(_id,_role::app_role);
 INSERT INTO workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('member',_id,'create',_actor,jsonb_build_object('role',_role));
END $$;
CREATE TABLE public.workspace_presentation (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), version integer NOT NULL DEFAULT 1,
 published jsonb NOT NULL DEFAULT '{"labels":{},"order":{},"views":[]}',
 draft jsonb NOT NULL DEFAULT '{"labels":{},"order":{},"views":[]}',
 updated_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz
);
INSERT INTO workspace_presentation(singleton) VALUES(true);
ALTER TABLE workspace_presentation ENABLE ROW LEVEL SECURITY;
GRANT ALL ON workspace_presentation TO service_role;
CREATE FUNCTION public.get_workspace_presentation() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r workspace_presentation; BEGIN
 IF NOT public.is_workspace_user(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO r FROM workspace_presentation WHERE singleton;
 RETURN jsonb_build_object('version',r.version,'published',r.published,'published_at',r.published_at) || CASE WHEN public.is_admin(auth.uid()) THEN jsonb_build_object('draft',r.draft) ELSE '{}'::jsonb END;
END $$;
CREATE FUNCTION public.validate_presentation(_config jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE k text; v jsonb; item jsonb; catalogue jsonb := '{"demands": ["Nova", "Em triagem", "Aguardando informação", "Em execução", "Encaminhada para desenvolvimento", "Aguardando validação", "Publicada", "Aguardando cliente", "Bloqueada", "Concluída", "Cancelada"], "onboardings": ["1. Recepção e apresentação", "2. Dados recebidos", "3. Cadastro", "4. Configuração", "5. Migração", "6. Conexão WhatsApp", "7. Configuração da IA", "8. Treinamento", "9. Validação", "10. Conclusão"], "onboarding_status": ["Não iniciado", "Em andamento", "Aguardando cliente", "Aguardando informação", "Em validação", "Bloqueado", "Concluído"], "upgrades": ["Oportunidade identificada", "Em conversa", "Proposta apresentada", "Aguardando cliente", "Aceito", "Efetivado", "Perdido"]}'::jsonb; allowed_keys jsonb := '["category:Dúvida", "category:Bug", "category:Pequena melhoria", "category:Demanda complexa", "category:Configuração", "category:Onboarding", "category:Upgrade", "pipeline:demands", "pipeline:onboardings", "pipeline:upgrades", "demands:Nova", "demands:Em triagem", "demands:Aguardando informação", "demands:Em execução", "demands:Encaminhada para desenvolvimento", "demands:Aguardando validação", "demands:Publicada", "demands:Aguardando cliente", "demands:Bloqueada", "demands:Concluída", "demands:Cancelada", "onboardings:1. Recepção e apresentação", "onboardings:2. Dados recebidos", "onboardings:3. Cadastro", "onboardings:4. Configuração", "onboardings:5. Migração", "onboardings:6. Conexão WhatsApp", "onboardings:7. Configuração da IA", "onboardings:8. Treinamento", "onboardings:9. Validação", "onboardings:10. Conclusão", "onboarding_status:Não iniciado", "onboarding_status:Em andamento", "onboarding_status:Aguardando cliente", "onboarding_status:Aguardando informação", "onboarding_status:Em validação", "onboarding_status:Bloqueado", "onboarding_status:Concluído", "upgrades:Oportunidade identificada", "upgrades:Em conversa", "upgrades:Proposta apresentada", "upgrades:Aguardando cliente", "upgrades:Aceito", "upgrades:Efetivado", "upgrades:Perdido"]'::jsonb; categories jsonb := '["Dúvida", "Bug", "Pequena melhoria", "Demanda complexa", "Configuração", "Onboarding", "Upgrade"]'::jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(_config) x WHERE x NOT IN('labels','order','views')) THEN RAISE EXCEPTION 'invalid_config'; END IF;
 FOR k,v IN SELECT * FROM jsonb_each(_config->'labels') LOOP
  IF NOT allowed_keys ? k OR jsonb_typeof(v)<>'string' OR length(btrim(v#>>'{}')) NOT BETWEEN 2 AND 60 THEN RAISE EXCEPTION 'invalid_config'; END IF;
 END LOOP;
 FOR k,v IN SELECT * FROM jsonb_each(_config->'order') LOOP
  IF NOT catalogue ? k OR jsonb_typeof(v)<>'array' THEN RAISE EXCEPTION 'invalid_config'; END IF;
  IF jsonb_array_length(v)<>(SELECT count(DISTINCT value) FROM jsonb_array_elements_text(v)) THEN RAISE EXCEPTION 'invalid_config'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(v) LOOP IF jsonb_typeof(item)<>'string' OR NOT (catalogue->k) ? (item#>>'{}') THEN RAISE EXCEPTION 'invalid_config'; END IF; END LOOP;
 END LOOP;
 IF jsonb_array_length(_config->'views')<>(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(_config->'views')) THEN RAISE EXCEPTION 'invalid_config'; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(_config->'views') LOOP
  IF jsonb_typeof(v)<>'object' OR (v->>'kind') NOT IN('demands','onboardings','upgrades') OR v->>'kind' IS NULL OR jsonb_typeof(v->'label') IS DISTINCT FROM 'string' OR length(btrim(v->>'label')) NOT BETWEEN 2 AND 60 OR jsonb_typeof(v->'stages') IS DISTINCT FROM 'array' OR jsonb_typeof(v->'categories') IS DISTINCT FROM 'array' OR coalesce(v->>'id','') !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION 'invalid_config'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(v->'stages') LOOP IF jsonb_typeof(item)<>'string' OR NOT (catalogue->(v->>'kind')) ? (item#>>'{}') THEN RAISE EXCEPTION 'invalid_config'; END IF; END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(v->'categories') LOOP IF jsonb_typeof(item)<>'string' OR NOT categories ? (item#>>'{}') THEN RAISE EXCEPTION 'invalid_config'; END IF; END LOOP;
 END LOOP;
END $$;
CREATE FUNCTION public.save_workspace_presentation(_version int,_config jsonb,_publish boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r workspace_presentation; BEGIN
 IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _config IS NULL OR jsonb_typeof(_config)<>'object' OR jsonb_typeof(_config->'labels') IS DISTINCT FROM 'object' OR jsonb_typeof(_config->'order') IS DISTINCT FROM 'object' OR jsonb_typeof(_config->'views') IS DISTINCT FROM 'array' OR octet_length(_config::text)>50000 OR jsonb_array_length(_config->'views')>20 THEN RAISE EXCEPTION 'invalid_config'; END IF;
 PERFORM public.validate_presentation(_config);
 SELECT * INTO r FROM workspace_presentation WHERE singleton FOR UPDATE;
 IF r.version<>_version THEN RAISE EXCEPTION 'conflict'; END IF;
 UPDATE workspace_presentation SET draft=_config,published=CASE WHEN _publish THEN _config ELSE published END,version=version+1,updated_at=now(),published_at=CASE WHEN _publish THEN now() ELSE published_at END WHERE singleton;
 INSERT INTO workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('settings',gen_random_uuid(),CASE WHEN _publish THEN 'publish_presentation' ELSE 'draft_presentation' END,auth.uid(),jsonb_build_object('before',CASE WHEN _publish THEN r.published ELSE r.draft END,'after',_config));
 RETURN public.get_workspace_presentation();
END $$;
-- Test records stay private even when a non-admin calls the database directly.
CREATE FUNCTION public.real_client(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM clients WHERE id=_id AND NOT is_test) $$;
CREATE POLICY "Tests private" ON clients AS RESTRICTIVE FOR ALL TO authenticated USING(public.is_admin(auth.uid()) OR NOT is_test) WITH CHECK(public.is_admin(auth.uid()) OR NOT is_test);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['demands','onboardings','upgrades','interactions','changelog'] LOOP
 EXECUTE format('CREATE POLICY "Tests private" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(public.is_admin(auth.uid()) OR (NOT is_test AND public.real_client(client_id))) WITH CHECK(public.is_admin(auth.uid()) OR (NOT is_test AND public.real_client(client_id)))',t);
END LOOP; END $$;
CREATE FUNCTION public.real_operation_record(_kind text,_id uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE ok boolean; BEGIN
 IF _kind='client' OR _kind='clients' THEN RETURN public.real_client(_id); END IF;
 IF _kind='task' OR _kind='tasks' THEN
  SELECT public.real_client(t.client_id) AND (t.record_id IS NULL OR public.real_operation_record(t.record_kind,t.record_id)) INTO ok FROM scheduled_tasks t WHERE t.id=_id;
  RETURN coalesce(ok,false);
 END IF;
 _kind:=CASE _kind WHEN 'demand' THEN 'demands' WHEN 'onboarding' THEN 'onboardings' WHEN 'upgrade' THEN 'upgrades' WHEN 'interaction' THEN 'interactions' ELSE _kind END;
 IF _kind NOT IN('demands','onboardings','upgrades','interactions','changelog') THEN RETURN false; END IF;
 EXECUTE format('SELECT NOT is_test AND public.real_client(client_id) FROM public.%I WHERE id=$1',_kind) INTO ok USING _id; RETURN coalesce(ok,false);
END $$;
CREATE POLICY "Test history private" ON workflow_history AS RESTRICTIVE FOR SELECT TO authenticated USING(public.is_admin(auth.uid()) OR public.real_operation_record(entity_type,entity_id));
CREATE POLICY "Test tasks private" ON scheduled_tasks AS RESTRICTIVE FOR SELECT TO authenticated USING(public.is_admin(auth.uid()) OR (public.real_client(client_id) AND (record_id IS NULL OR public.real_operation_record(record_kind,record_id))));
CREATE POLICY "Test notifications private" ON notifications AS RESTRICTIVE FOR ALL TO authenticated USING(public.is_admin(auth.uid()) OR public.real_operation_record(entity_type,entity_id)) WITH CHECK(public.is_admin(auth.uid()) OR public.real_operation_record(entity_type,entity_id));
CREATE OR REPLACE FUNCTION public.can_read_case(_demand uuid,_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT (public.is_admin(_uid) OR public.real_operation_record('demand',_demand)) AND (public.is_operator(_uid) AND EXISTS(SELECT 1 FROM demands WHERE id=_demand AND client_id IS NOT NULL) OR public.is_technical(_uid) AND EXISTS(SELECT 1 FROM delivery_requests WHERE demand_id=_demand AND technical))
$$;
CREATE FUNCTION public.guard_private_test() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) AND (NEW.is_test OR (TG_TABLE_NAME<>'clients' AND NOT public.real_client((to_jsonb(NEW)->>'client_id')::uuid))) THEN RAISE EXCEPTION 'forbidden'; END IF; RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['clients','demands','onboardings','upgrades','interactions','changelog'] LOOP
 EXECUTE format('CREATE TRIGGER z_private_test BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_private_test()',t);
END LOOP; END $$;
CREATE FUNCTION public.guard_private_task() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) AND (NOT public.real_client(NEW.client_id) OR (NEW.record_id IS NOT NULL AND NOT public.real_operation_record(NEW.record_kind,NEW.record_id))) THEN RAISE EXCEPTION 'forbidden'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER z_private_task BEFORE INSERT OR UPDATE ON scheduled_tasks FOR EACH ROW EXECUTE FUNCTION public.guard_private_task();
-- These functions expose no secrets. Restrict invocation to authenticated internal sessions.
REVOKE ALL ON FUNCTION has_cs_capability(uuid,text),save_member_access(uuid,jsonb),set_cs_leader(uuid,boolean),get_workspace_presentation(),save_workspace_presentation(int,jsonb,boolean),real_client(uuid),real_operation_record(text,uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION has_cs_capability(uuid,text),save_member_access(uuid,jsonb),set_cs_leader(uuid,boolean),get_workspace_presentation(),save_workspace_presentation(int,jsonb,boolean),real_client(uuid),real_operation_record(text,uuid) TO authenticated,service_role;
CREATE FUNCTION public.cs_team_members() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT(has_cs_capability(auth.uid(),'manage_cs') OR has_cs_capability(auth.uid(),'promote_cs') OR has_cs_capability(auth.uid(),'view_team')) THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(p.id),'[]') FROM profiles p WHERE EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=p.id AND r.role='cs') AND NOT EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=p.id AND r.role='admin'));
END $$;
CREATE FUNCTION public.cs_team_stats() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT has_cs_capability(auth.uid(),'view_team') THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM (SELECT d.owner_id,p.full_name,count(*) FILTER(WHERE d.completed_at IS NULL AND d.canceled_at IS NULL) AS open,count(*) FILTER(WHERE d.completed_at IS NOT NULL) AS completed,count(*) FILTER(WHERE s.first_response_state='atrasado' OR s.resolution_state='atrasado' OR s.delivery_state='atrasado') AS overdue FROM demands d JOIN clients c ON c.id=d.client_id LEFT JOIN profiles p ON p.id=d.owner_id LEFT JOIN demand_sla s ON s.id=d.id WHERE NOT d.is_test AND NOT c.is_test GROUP BY d.owner_id,p.full_name) t);
END $$;
REVOKE ALL ON FUNCTION cs_team_members(),cs_team_stats() FROM public,anon;
GRANT EXECUTE ON FUNCTION cs_team_members(),cs_team_stats() TO authenticated;
COMMIT;
