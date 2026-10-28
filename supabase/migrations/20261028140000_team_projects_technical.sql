-- Projetos da equipe também para a equipe técnica (pedido do Igor, 28/10/2026).
-- Quem participa de Projetos passa a ser definido num lugar só: public.team_project_member(uid),
-- que aceita administradores, CS e equipe técnica ativos (is_workspace_user). A equipe técnica lê,
-- cria, comenta, anexa, pode ser responsável por projeto ou etapa e recebe os avisos de projeto.
-- As regras de gerência não mudam: administrador, quem criou ou o responsável gerenciam; responsável
-- pela etapa conclui a própria etapa e move o projeto só entre situações abertas.
-- Contas inativas continuam fora. Demandas, carteira, BI e demais áreas da equipe técnica não mudam.
-- Funções recriadas com o mesmo corpo da 20261027120000_team_projects, trocando is_operator pelo helper.
BEGIN;

CREATE OR REPLACE FUNCTION public.team_project_member(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_workspace_user(_uid)
$$;
REVOKE ALL ON FUNCTION public.team_project_member(uuid) FROM public,anon; GRANT EXECUTE ON FUNCTION public.team_project_member(uuid) TO authenticated;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['team_projects','team_project_steps','team_project_files','team_project_activity'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS "Team reads projects" ON public.%I',t);
  EXECUTE format('CREATE POLICY "Team reads projects" ON public.%I FOR SELECT TO authenticated USING(public.team_project_member(auth.uid()))',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.team_project_can_manage(_project uuid,_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.team_project_member(_uid) AND (public.is_admin(_uid) OR EXISTS(SELECT 1 FROM public.team_projects p WHERE p.id=_project AND _uid IN(p.created_by,p.owner_id)))
$$;
REVOKE ALL ON FUNCTION public.team_project_can_manage(uuid,uuid) FROM public,anon; GRANT EXECUTE ON FUNCTION public.team_project_can_manage(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.team_project_members() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name) ORDER BY p.full_name),'[]'::jsonb)
 FROM public.profiles p WHERE public.team_project_member(auth.uid()) AND public.team_project_member(p.id)
$$;
REVOKE ALL ON FUNCTION public.team_project_members() FROM public,anon; GRANT EXECUTE ON FUNCTION public.team_project_members() TO authenticated;

CREATE OR REPLACE FUNCTION public.team_project_notice(_project uuid,_title text,_recipients uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.team_projects; BEGIN
 SELECT * INTO p FROM public.team_projects WHERE id=_project;
 INSERT INTO public.notifications(recipient_id,entity_type,entity_id,obligation,deadline,level,title,link)
 SELECT DISTINCT r,'project',_project,'project_event',clock_timestamp(),'reminder',left(_title||' · '||p.code||' · '||p.title,300),'/projetos?id='||_project
 FROM unnest(_recipients) r WHERE r IS NOT NULL AND r IS DISTINCT FROM auth.uid() AND public.team_project_member(r)
 ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.team_project_notice(uuid,text,uuid[]) FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.team_project_step_values(_data jsonb) RETURNS TABLE(title text,description text,assignee uuid,due date) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF jsonb_typeof(_data)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(_data) k WHERE k NOT IN('title','description','assignee_id','due_date')) THEN RAISE EXCEPTION 'invalid_project_data'; END IF;
 title:=btrim(_data->>'title'); description:=nullif(btrim(coalesce(_data->>'description','')),'');
 assignee:=nullif(_data->>'assignee_id','')::uuid; due:=nullif(_data->>'due_date','')::date;
 IF title IS NULL OR length(title)<2 THEN RAISE EXCEPTION 'incomplete: informe o nome de cada etapa'; END IF;
 IF assignee IS NOT NULL AND NOT public.team_project_member(assignee) THEN RAISE EXCEPTION 'project_member_required'; END IF;
 RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.team_project_step_values(jsonb) FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.save_team_project(_id uuid,_version int,_data jsonb) RETURNS public.team_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); p public.team_projects; old public.team_projects; s jsonb; v record; n int:=0; who text; BEGIN
 IF NOT public.team_project_member(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF jsonb_typeof(_data)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(_data) k WHERE k NOT IN('title','context','priority','owner_id','start_date','due_date','steps')) THEN RAISE EXCEPTION 'invalid_project_data'; END IF;
 IF _data ? 'owner_id' AND (nullif(_data->>'owner_id','') IS NULL OR NOT public.team_project_member((_data->>'owner_id')::uuid)) THEN RAISE EXCEPTION 'project_member_required'; END IF;
 IF (_id IS NULL OR _data ? 'title') AND length(btrim(coalesce(_data->>'title','')))<3 THEN RAISE EXCEPTION 'incomplete: informe o título do projeto (mínimo de 3 caracteres)'; END IF;
 IF _data ? 'priority' AND _data->>'priority' NOT IN('Baixa','Normal','Alta','Crítica') THEN RAISE EXCEPTION 'invalid_project_data'; END IF;
 IF _id IS NULL THEN
  IF _data ? 'steps' AND jsonb_typeof(_data->'steps')<>'array' THEN RAISE EXCEPTION 'invalid_project_data'; END IF;
  IF jsonb_array_length(coalesce(_data->'steps','[]'))>50 THEN RAISE EXCEPTION 'incomplete: um projeto pode ter até 50 etapas'; END IF;
  INSERT INTO public.team_projects(title,context,priority,owner_id,created_by,start_date,due_date)
  VALUES(btrim(_data->>'title'),nullif(btrim(coalesce(_data->>'context','')),''),coalesce(_data->>'priority','Normal'),coalesce(nullif(_data->>'owner_id','')::uuid,uid),uid,nullif(_data->>'start_date','')::date,nullif(_data->>'due_date','')::date)
  RETURNING * INTO p;
  PERFORM public.team_project_log(p.id,'created','Projeto criado');
  FOR s IN SELECT value FROM jsonb_array_elements(coalesce(_data->'steps','[]')) LOOP
   SELECT * INTO v FROM public.team_project_step_values(s); n:=n+1;
   INSERT INTO public.team_project_steps(project_id,position,title,description,assignee_id,due_date) VALUES(p.id,n,v.title,v.description,v.assignee,v.due);
  END LOOP;
  IF n>0 THEN PERFORM public.team_project_log(p.id,'step',n||CASE WHEN n=1 THEN ' etapa definida' ELSE ' etapas definidas' END); END IF;
  PERFORM public.team_project_notice(p.id,'Novo projeto com você',public.team_project_people(p.id));
  RETURN p;
 END IF;
 SELECT * INTO old FROM public.team_projects WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR NOT public.team_project_can_manage(_id,uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF old.version<>_version THEN RAISE EXCEPTION 'conflict'; END IF;
 IF old.status IN('concluido','cancelado') THEN RAISE EXCEPTION 'project_closed'; END IF;
 IF _data ? 'steps' THEN RAISE EXCEPTION 'invalid_project_data'; END IF;
 UPDATE public.team_projects SET
  title=CASE WHEN _data ? 'title' THEN btrim(_data->>'title') ELSE title END,
  context=CASE WHEN _data ? 'context' THEN nullif(btrim(coalesce(_data->>'context','')),'') ELSE context END,
  priority=CASE WHEN _data ? 'priority' THEN _data->>'priority' ELSE priority END,
  owner_id=CASE WHEN _data ? 'owner_id' THEN (_data->>'owner_id')::uuid ELSE owner_id END,
  start_date=CASE WHEN _data ? 'start_date' THEN nullif(_data->>'start_date','')::date ELSE start_date END,
  due_date=CASE WHEN _data ? 'due_date' THEN nullif(_data->>'due_date','')::date ELSE due_date END,
  version=version+1,updated_at=now()
 WHERE id=_id RETURNING * INTO p;
 IF p.due_date IS DISTINCT FROM old.due_date THEN
  PERFORM public.team_project_log(_id,'deadline','Prazo de entrega: '||coalesce(to_char(old.due_date,'DD/MM/YYYY'),'sem prazo')||' → '||coalesce(to_char(p.due_date,'DD/MM/YYYY'),'sem prazo'));
 END IF;
 IF p.owner_id IS DISTINCT FROM old.owner_id THEN
  SELECT full_name INTO who FROM public.profiles WHERE id=p.owner_id;
  PERFORM public.team_project_log(_id,'owner','Responsável: '||coalesce(who,'—'));
  PERFORM public.team_project_notice(_id,'Você é o responsável pelo projeto',ARRAY[p.owner_id]);
 END IF;
 IF (p.title,p.context,p.priority,p.start_date) IS DISTINCT FROM (old.title,old.context,old.priority,old.start_date) THEN
  PERFORM public.team_project_log(_id,'edit','Dados do projeto atualizados');
 END IF;
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.save_team_project(uuid,int,jsonb) FROM public,anon; GRANT EXECUTE ON FUNCTION public.save_team_project(uuid,int,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.move_team_project(_id uuid,_version int,_status text,_reason text DEFAULT NULL) RETURNS public.team_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); p public.team_projects; old public.team_projects; manager boolean; BEGIN
 IF NOT public.team_project_member(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _status NOT IN('ideia','planejado','em_andamento','em_revisao','concluido','cancelado') THEN RAISE EXCEPTION 'invalid_project_data'; END IF;
 SELECT * INTO old FROM public.team_projects WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
 manager:=public.team_project_can_manage(_id,uid);
 IF NOT manager AND (NOT EXISTS(SELECT 1 FROM public.team_project_steps WHERE project_id=_id AND assignee_id=uid)
    OR _status IN('concluido','cancelado') OR old.status IN('concluido','cancelado')) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF old.version<>_version THEN RAISE EXCEPTION 'conflict'; END IF;
 IF old.status=_status THEN RETURN old; END IF;
 IF _status='concluido' AND EXISTS(SELECT 1 FROM public.team_project_steps WHERE project_id=_id AND done_at IS NULL) THEN
  RAISE EXCEPTION 'incomplete: conclua ou remova as etapas pendentes antes de concluir o projeto';
 END IF;
 IF _status='cancelado' AND length(btrim(coalesce(_reason,'')))<3 THEN RAISE EXCEPTION 'incomplete: informe o motivo do cancelamento'; END IF;
 UPDATE public.team_projects SET status=_status,
  completed_at=CASE WHEN _status='concluido' THEN now() END,
  canceled_at=CASE WHEN _status='cancelado' THEN now() END,
  cancel_reason=CASE WHEN _status='cancelado' THEN left(btrim(_reason),2000) END,
  version=version+1,updated_at=now()
 WHERE id=_id RETURNING * INTO p;
 PERFORM public.team_project_log(_id,'status',public.team_project_status_label(old.status)||' → '||public.team_project_status_label(_status)||CASE WHEN _status='cancelado' THEN ' · Motivo: '||btrim(_reason) ELSE '' END);
 PERFORM public.team_project_notice(_id,'Situação: '||public.team_project_status_label(_status),public.team_project_people(_id));
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.move_team_project(uuid,int,text,text) FROM public,anon; GRANT EXECUTE ON FUNCTION public.move_team_project(uuid,int,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.team_project_lock(_id uuid,_version int,_manage boolean) RETURNS public.team_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.team_projects; BEGIN
 IF NOT public.team_project_member(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO p FROM public.team_projects WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR (_manage AND NOT public.team_project_can_manage(_id,auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p.version<>_version THEN RAISE EXCEPTION 'conflict'; END IF;
 IF p.status IN('concluido','cancelado') THEN RAISE EXCEPTION 'project_closed'; END IF;
 UPDATE public.team_projects SET version=version+1,updated_at=now() WHERE id=_id RETURNING * INTO p;
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.team_project_lock(uuid,int,boolean) FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.post_team_project_message(_project uuid,_body text) RETURNS public.team_project_activity LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); a public.team_project_activity; BEGIN
 IF NOT public.team_project_member(uid) OR NOT EXISTS(SELECT 1 FROM public.team_projects WHERE id=_project) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF length(btrim(coalesce(_body,''))) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'incomplete: escreva a mensagem (até 10.000 caracteres)'; END IF;
 INSERT INTO public.team_project_activity(project_id,kind,actor_id,actor_name,body)
 SELECT _project,'message',p.id,coalesce(nullif(btrim(p.full_name),''),'Equipe'),btrim(_body) FROM public.profiles p WHERE p.id=uid RETURNING * INTO a;
 PERFORM public.team_project_notice(_project,'Nova mensagem',public.team_project_people(_project));
 RETURN a;
END $$;
REVOKE ALL ON FUNCTION public.post_team_project_message(uuid,text) FROM public,anon; GRANT EXECUTE ON FUNCTION public.post_team_project_message(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_team_project_file(_project uuid,_path text,_filename text,_mime text,_size bigint,_note text DEFAULT NULL) RETURNS public.team_project_files LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); o storage.objects; f public.team_project_files; BEGIN
 IF NOT public.team_project_member(uid) OR NOT EXISTS(SELECT 1 FROM public.team_projects WHERE id=_project) OR public.team_project_of_path(_path) IS DISTINCT FROM _project THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO o FROM storage.objects WHERE bucket_id='team-projects' AND name=_path AND owner_id=uid::text;
 IF NOT FOUND OR (o.metadata->>'size')::bigint IS DISTINCT FROM _size OR o.metadata->>'mimetype' IS DISTINCT FROM _mime THEN RAISE EXCEPTION 'invalid_file: o arquivo enviado não confere'; END IF;
 SELECT * INTO f FROM public.team_project_files WHERE path=_path;
 IF f.id IS NOT NULL THEN RETURN f; END IF;
 INSERT INTO public.team_project_files(project_id,path,filename,mime_type,size_bytes,uploaded_by) VALUES(_project,_path,left(_filename,250),_mime,_size,uid) RETURNING * INTO f;
 PERFORM public.team_project_log(_project,'file',nullif(left(btrim(coalesce(_note,'')),10000),''),f.id);
 PERFORM public.team_project_notice(_project,CASE WHEN _mime LIKE 'audio/%' THEN 'Novo áudio' ELSE 'Novo anexo' END,public.team_project_people(_project));
 RETURN f;
END $$;
REVOKE ALL ON FUNCTION public.register_team_project_file(uuid,text,text,text,bigint,text) FROM public,anon; GRANT EXECUTE ON FUNCTION public.register_team_project_file(uuid,text,text,text,bigint,text) TO authenticated;

DROP POLICY IF EXISTS "Team project files read" ON storage.objects;
DROP POLICY IF EXISTS "Team project files upload" ON storage.objects;
DROP POLICY IF EXISTS "Team project own orphan uploads" ON storage.objects;
CREATE POLICY "Team project files read" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='team-projects' AND public.team_project_member(auth.uid()) AND EXISTS(SELECT 1 FROM public.team_projects p WHERE p.id=public.team_project_of_path(name)));
CREATE POLICY "Team project files upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='team-projects' AND public.team_project_member(auth.uid()) AND owner_id=auth.uid()::text AND EXISTS(SELECT 1 FROM public.team_projects p WHERE p.id=public.team_project_of_path(name)));
CREATE POLICY "Team project own orphan uploads" ON storage.objects FOR DELETE TO authenticated USING(bucket_id='team-projects' AND owner_id=auth.uid()::text AND public.team_project_member(auth.uid()) AND NOT EXISTS(SELECT 1 FROM public.team_project_files f WHERE f.path=storage.objects.name));

-- Avisos: a equipe técnica lê os avisos de projeto; os demais avisos seguem só os casos encaminhados.
-- Mesma política da 20261007080200_delivery_workspace, com o ramo de projeto.
DROP POLICY IF EXISTS "Workspace notifications" ON public.notifications;
CREATE POLICY "Workspace notifications" ON public.notifications FOR SELECT TO authenticated USING(recipient_id=auth.uid() AND public.is_workspace_user(auth.uid()) AND (public.is_operator(auth.uid()) OR (entity_type='project' AND public.team_project_member(auth.uid())) OR public.can_read_case(entity_id,auth.uid())));

COMMIT;
