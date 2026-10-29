-- Projetos: quem vê cada projeto (pedido do Igor, 28/10/2026).
-- Cada projeto escolhe a visibilidade:
--   'team'         → toda a equipe (administradores, CS e equipe técnica ativos) — padrão, como hoje;
--   'participants' → só participantes: quem criou, o responsável, os responsáveis por etapa e as
--                    pessoas adicionadas em team_project_participants. Administradores sempre veem.
-- Quem gerencia o projeto (administrador, quem criou ou o responsável) escolhe a visibilidade e os
-- participantes ao criar ou em Editar dados. Participantes também recebem os avisos do projeto.
-- Leitura de projeto, etapas, anexos, linha do tempo, arquivos do bucket e avisos de projeto passa a
-- seguir public.team_project_can_view. Projetos existentes ficam 'team' (nenhum dado muda de acesso).
-- Depende da 20261028140000_team_projects_technical (team_project_member).

ALTER TABLE public.team_projects ADD COLUMN visibility text NOT NULL DEFAULT 'team'
 CHECK(visibility IN('team','participants'));

CREATE TABLE public.team_project_participants(
 project_id uuid NOT NULL REFERENCES public.team_projects(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 added_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,user_id)
);
CREATE INDEX team_project_participants_user_idx ON public.team_project_participants(user_id);
ALTER TABLE public.team_project_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_project_participants FROM anon,authenticated;
GRANT SELECT ON public.team_project_participants TO authenticated;
GRANT ALL ON public.team_project_participants TO service_role;

-- Quem vê o projeto: pessoa ativa da equipe e (projeto aberto à equipe, administrador, quem criou,
-- responsável, responsável por etapa ou participante adicionado).
CREATE OR REPLACE FUNCTION public.team_project_can_view(_project uuid,_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.team_project_member(_uid) AND EXISTS(
  SELECT 1 FROM public.team_projects p WHERE p.id=_project AND (
   p.visibility='team' OR public.is_admin(_uid) OR _uid IN(p.created_by,p.owner_id)
   OR EXISTS(SELECT 1 FROM public.team_project_steps s WHERE s.project_id=p.id AND s.assignee_id=_uid)
   OR EXISTS(SELECT 1 FROM public.team_project_participants x WHERE x.project_id=p.id AND x.user_id=_uid)))
$$;
REVOKE ALL ON FUNCTION public.team_project_can_view(uuid,uuid) FROM public,anon; GRANT EXECUTE ON FUNCTION public.team_project_can_view(uuid,uuid) TO authenticated;

DROP POLICY IF EXISTS "Team reads projects" ON public.team_projects;
CREATE POLICY "Team reads projects" ON public.team_projects FOR SELECT TO authenticated USING(public.team_project_can_view(id,auth.uid()));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['team_project_steps','team_project_files','team_project_activity','team_project_participants'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS "Team reads projects" ON public.%I',t);
  EXECUTE format('CREATE POLICY "Team reads projects" ON public.%I FOR SELECT TO authenticated USING(public.team_project_can_view(project_id,auth.uid()))',t);
 END LOOP;
END $$;

-- Envolvidos (avisos): quem criou, responsável, responsáveis pelas etapas e participantes adicionados.
CREATE OR REPLACE FUNCTION public.team_project_people(_project uuid) RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT array_remove(array_agg(DISTINCT x),NULL) FROM(
  SELECT created_by x FROM public.team_projects WHERE id=_project UNION ALL
  SELECT owner_id FROM public.team_projects WHERE id=_project UNION ALL
  SELECT assignee_id FROM public.team_project_steps WHERE project_id=_project UNION ALL
  SELECT user_id FROM public.team_project_participants WHERE project_id=_project) s
$$;
REVOKE ALL ON FUNCTION public.team_project_people(uuid) FROM public,anon,authenticated;

-- Aviso só para quem vê o projeto.
CREATE OR REPLACE FUNCTION public.team_project_notice(_project uuid,_title text,_recipients uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.team_projects; BEGIN
 SELECT * INTO p FROM public.team_projects WHERE id=_project;
 INSERT INTO public.notifications(recipient_id,entity_type,entity_id,obligation,deadline,level,title,link)
 SELECT DISTINCT r,'project',_project,'project_event',clock_timestamp(),'reminder',left(_title||' · '||p.code||' · '||p.title,300),'/projetos?id='||_project
 FROM unnest(_recipients) r WHERE r IS NOT NULL AND r IS DISTINCT FROM auth.uid() AND public.team_project_member(r) AND public.team_project_can_view(_project,r)
 ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.team_project_notice(uuid,text,uuid[]) FROM public,anon,authenticated;

-- Substitui a lista de participantes adicionados; devolve quem entrou agora. Uso interno.
CREATE OR REPLACE FUNCTION public.team_project_set_participants(_project uuid,_list jsonb) RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wanted uuid[]; added uuid[]; BEGIN
 IF jsonb_typeof(_list)<>'array' OR jsonb_array_length(_list)>100 THEN RAISE EXCEPTION 'invalid_project_data'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_list) e WHERE jsonb_typeof(e)<>'string' OR e#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN RAISE EXCEPTION 'invalid_project_data'; END IF;
 SELECT coalesce(array_agg(DISTINCT (e#>>'{}')::uuid),'{}') INTO wanted FROM jsonb_array_elements(_list) e;
 IF EXISTS(SELECT 1 FROM unnest(wanted) w WHERE NOT public.team_project_member(w)) THEN RAISE EXCEPTION 'project_member_required'; END IF;
 DELETE FROM public.team_project_participants WHERE project_id=_project AND NOT(user_id=ANY(wanted));
 WITH ins AS(
  INSERT INTO public.team_project_participants(project_id,user_id,added_by)
  SELECT _project,w,auth.uid() FROM unnest(wanted) w ON CONFLICT DO NOTHING RETURNING user_id)
 SELECT coalesce(array_agg(user_id),'{}') INTO added FROM ins;
 RETURN added;
END $$;
REVOKE ALL ON FUNCTION public.team_project_set_participants(uuid,jsonb) FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.team_project_participant_names(_project uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(string_agg(coalesce(nullif(btrim(pr.full_name),''),'—'),', ' ORDER BY pr.full_name),'nenhum')
 FROM public.team_project_participants x JOIN public.profiles pr ON pr.id=x.user_id WHERE x.project_id=_project
$$;
REVOKE ALL ON FUNCTION public.team_project_participant_names(uuid) FROM public,anon,authenticated;

-- Cria (_id NULL) ou edita o projeto. Novidades: 'visibility' ('team' | 'participants') e
-- 'participants' (lista de pessoas adicionadas), na criação e na edição por quem gerencia.
CREATE OR REPLACE FUNCTION public.save_team_project(_id uuid,_version int,_data jsonb) RETURNS public.team_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); p public.team_projects; old public.team_projects; s jsonb; v record; n int:=0; who text; added uuid[]:='{}'; before_names text; BEGIN
 IF NOT public.team_project_member(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF jsonb_typeof(_data)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(_data) k WHERE k NOT IN('title','context','priority','owner_id','start_date','due_date','steps','visibility','participants')) THEN RAISE EXCEPTION 'invalid_project_data'; END IF;
 IF _data ? 'owner_id' AND (nullif(_data->>'owner_id','') IS NULL OR NOT public.team_project_member((_data->>'owner_id')::uuid)) THEN RAISE EXCEPTION 'project_member_required'; END IF;
 IF (_id IS NULL OR _data ? 'title') AND length(btrim(coalesce(_data->>'title','')))<3 THEN RAISE EXCEPTION 'incomplete: informe o título do projeto (mínimo de 3 caracteres)'; END IF;
 IF _data ? 'priority' AND _data->>'priority' NOT IN('Baixa','Normal','Alta','Crítica') THEN RAISE EXCEPTION 'invalid_project_data'; END IF;
 IF _data ? 'visibility' AND coalesce(_data->>'visibility','') NOT IN('team','participants') THEN RAISE EXCEPTION 'invalid_project_data'; END IF;
 IF _id IS NULL THEN
  IF _data ? 'steps' AND jsonb_typeof(_data->'steps')<>'array' THEN RAISE EXCEPTION 'invalid_project_data'; END IF;
  IF jsonb_array_length(coalesce(_data->'steps','[]'))>50 THEN RAISE EXCEPTION 'incomplete: um projeto pode ter até 50 etapas'; END IF;
  INSERT INTO public.team_projects(title,context,priority,owner_id,created_by,start_date,due_date,visibility)
  VALUES(btrim(_data->>'title'),nullif(btrim(coalesce(_data->>'context','')),''),coalesce(_data->>'priority','Normal'),coalesce(nullif(_data->>'owner_id','')::uuid,uid),uid,nullif(_data->>'start_date','')::date,nullif(_data->>'due_date','')::date,coalesce(_data->>'visibility','team'))
  RETURNING * INTO p;
  PERFORM public.team_project_log(p.id,'created',CASE WHEN p.visibility='participants' THEN 'Projeto criado · visível só para participantes' ELSE 'Projeto criado' END);
  FOR s IN SELECT value FROM jsonb_array_elements(coalesce(_data->'steps','[]')) LOOP
   SELECT * INTO v FROM public.team_project_step_values(s); n:=n+1;
   INSERT INTO public.team_project_steps(project_id,position,title,description,assignee_id,due_date) VALUES(p.id,n,v.title,v.description,v.assignee,v.due);
  END LOOP;
  IF n>0 THEN PERFORM public.team_project_log(p.id,'step',n||CASE WHEN n=1 THEN ' etapa definida' ELSE ' etapas definidas' END); END IF;
  IF _data ? 'participants' THEN
   PERFORM public.team_project_set_participants(p.id,_data->'participants');
   IF EXISTS(SELECT 1 FROM public.team_project_participants WHERE project_id=p.id) THEN
    PERFORM public.team_project_log(p.id,'edit','Participantes: '||public.team_project_participant_names(p.id));
   END IF;
  END IF;
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
  visibility=CASE WHEN _data ? 'visibility' THEN _data->>'visibility' ELSE visibility END,
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
 IF p.visibility IS DISTINCT FROM old.visibility THEN
  PERFORM public.team_project_log(_id,'edit','Quem vê: '||CASE WHEN p.visibility='participants' THEN 'só participantes' ELSE 'toda a equipe' END);
 END IF;
 IF _data ? 'participants' THEN
  before_names:=public.team_project_participant_names(_id);
  added:=public.team_project_set_participants(_id,_data->'participants');
  IF public.team_project_participant_names(_id) IS DISTINCT FROM before_names THEN
   PERFORM public.team_project_log(_id,'edit','Participantes: '||public.team_project_participant_names(_id));
  END IF;
  PERFORM public.team_project_notice(_id,'Você foi incluído no projeto',added);
 END IF;
 IF (p.title,p.context,p.priority,p.start_date) IS DISTINCT FROM (old.title,old.context,old.priority,old.start_date) THEN
  PERFORM public.team_project_log(_id,'edit','Dados do projeto atualizados');
 END IF;
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.save_team_project(uuid,int,jsonb) FROM public,anon; GRANT EXECUTE ON FUNCTION public.save_team_project(uuid,int,jsonb) TO authenticated;

-- Alteração de etapas e conclusão de etapa exigem ver o projeto.
CREATE OR REPLACE FUNCTION public.team_project_lock(_id uuid,_version int,_manage boolean) RETURNS public.team_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.team_projects; BEGIN
 IF NOT public.team_project_member(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO p FROM public.team_projects WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR NOT public.team_project_can_view(_id,auth.uid()) OR (_manage AND NOT public.team_project_can_manage(_id,auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p.version<>_version THEN RAISE EXCEPTION 'conflict'; END IF;
 IF p.status IN('concluido','cancelado') THEN RAISE EXCEPTION 'project_closed'; END IF;
 UPDATE public.team_projects SET version=version+1,updated_at=now() WHERE id=_id RETURNING * INTO p;
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.team_project_lock(uuid,int,boolean) FROM public,anon,authenticated;

-- Conversa e anexos: só quem vê o projeto.
CREATE OR REPLACE FUNCTION public.post_team_project_message(_project uuid,_body text) RETURNS public.team_project_activity LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); a public.team_project_activity; BEGIN
 IF NOT public.team_project_can_view(_project,uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF length(btrim(coalesce(_body,''))) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'incomplete: escreva a mensagem (até 10.000 caracteres)'; END IF;
 INSERT INTO public.team_project_activity(project_id,kind,actor_id,actor_name,body)
 SELECT _project,'message',p.id,coalesce(nullif(btrim(p.full_name),''),'Equipe'),btrim(_body) FROM public.profiles p WHERE p.id=uid RETURNING * INTO a;
 PERFORM public.team_project_notice(_project,'Nova mensagem',public.team_project_people(_project));
 RETURN a;
END $$;
REVOKE ALL ON FUNCTION public.post_team_project_message(uuid,text) FROM public,anon; GRANT EXECUTE ON FUNCTION public.post_team_project_message(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_team_project_file(_project uuid,_path text,_filename text,_mime text,_size bigint,_note text DEFAULT NULL) RETURNS public.team_project_files LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); o storage.objects; f public.team_project_files; BEGIN
 IF NOT public.team_project_can_view(_project,uid) OR public.team_project_of_path(_path) IS DISTINCT FROM _project THEN RAISE EXCEPTION 'forbidden'; END IF;
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

-- Arquivos do bucket: ler e enviar só em projeto que a pessoa vê.
DROP POLICY IF EXISTS "Team project files read" ON storage.objects;
DROP POLICY IF EXISTS "Team project files upload" ON storage.objects;
CREATE POLICY "Team project files read" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='team-projects' AND public.team_project_can_view(public.team_project_of_path(name),auth.uid()));
CREATE POLICY "Team project files upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='team-projects' AND owner_id=auth.uid()::text AND public.team_project_can_view(public.team_project_of_path(name),auth.uid()));

-- Avisos de projeto: só para quem vê o projeto; os demais avisos não mudam.
DROP POLICY IF EXISTS "Workspace notifications" ON public.notifications;
CREATE POLICY "Workspace notifications" ON public.notifications FOR SELECT TO authenticated USING(recipient_id=auth.uid() AND public.is_workspace_user(auth.uid()) AND CASE WHEN entity_type='project' THEN public.team_project_can_view(entity_id,auth.uid()) ELSE (public.is_operator(auth.uid()) OR public.can_read_case(entity_id,auth.uid())) END);
