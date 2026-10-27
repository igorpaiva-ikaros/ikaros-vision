-- Projetos da equipe (aba Equipe → Projetos).
-- Pautas internas do time (implementações, ideias, melhorias): título, contexto, responsável, prazo,
-- etapas desenhadas por quem cria o projeto, linha do tempo com conversa e anexos privados.
-- Acesso: administradores e CS ativos (is_operator). Equipe técnica e contas inativas não leem.
-- Tabelas só de leitura para a API; toda gravação passa pelas funções abaixo, com auth.uid(),
-- bloqueio da linha, controle de versão e registro na linha do tempo.
-- Aditiva: não altera demandas, clientes, SLA, carteira nem notificações existentes.
-- Aplicação: conteúdo de supabase/migrations/20261027120000_team_projects.sql sem BEGIN/COMMIT (a ferramenta
-- executa em transação única) e sem o INSERT em storage.buckets (bucket criado pela ferramenta de storage).

CREATE SEQUENCE public.team_project_code_seq;

CREATE TABLE public.team_projects(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code text NOT NULL UNIQUE DEFAULT 'PRJ-'||lpad(nextval('public.team_project_code_seq')::text,5,'0'),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 200),
 context text CHECK(context IS NULL OR length(context)<=20000),
 status text NOT NULL DEFAULT 'ideia' CHECK(status IN('ideia','planejado','em_andamento','em_revisao','concluido','cancelado')),
 priority text NOT NULL DEFAULT 'Normal' CHECK(priority IN('Baixa','Normal','Alta','Crítica')),
 owner_id uuid NOT NULL REFERENCES public.profiles(id),
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 start_date date,
 due_date date,
 completed_at timestamptz,
 canceled_at timestamptz,
 cancel_reason text CHECK(cancel_reason IS NULL OR length(cancel_reason)<=2000),
 version int NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(due_date IS NULL OR start_date IS NULL OR due_date>=start_date)
);
ALTER SEQUENCE public.team_project_code_seq OWNED BY public.team_projects.code;

CREATE TABLE public.team_project_steps(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.team_projects(id),
 position int NOT NULL CHECK(position>0),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 2 AND 200),
 description text CHECK(description IS NULL OR length(description)<=5000),
 assignee_id uuid REFERENCES public.profiles(id),
 due_date date,
 done_at timestamptz,
 done_by uuid REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_project_steps_project_idx ON public.team_project_steps(project_id,position);

CREATE TABLE public.team_project_files(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.team_projects(id),
 path text NOT NULL UNIQUE,
 filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 250),
 mime_type text NOT NULL,
 size_bytes bigint NOT NULL CHECK(size_bytes>0 AND size_bytes<=52428800),
 uploaded_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now()
);

-- Linha do tempo: mensagens, anexos e eventos (criação, etapa, prazo, responsável, situação).
CREATE TABLE public.team_project_activity(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.team_projects(id),
 kind text NOT NULL CHECK(kind IN('created','message','file','status','step','deadline','owner','edit')),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 actor_name text NOT NULL,
 body text CHECK(body IS NULL OR length(body)<=10000),
 file_id uuid REFERENCES public.team_project_files(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX team_project_activity_project_idx ON public.team_project_activity(project_id,created_at);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['team_projects','team_project_steps','team_project_files','team_project_activity'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY "Team reads projects" ON public.%I FOR SELECT TO authenticated USING(public.is_operator(auth.uid()))',t);
 END LOOP;
END $$;

-- Quem gerencia o projeto: administrador, quem criou ou o responsável (contas ativas de CS/administrador).
CREATE FUNCTION public.team_project_can_manage(_project uuid,_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_operator(_uid) AND (public.is_admin(_uid) OR EXISTS(SELECT 1 FROM public.team_projects p WHERE p.id=_project AND _uid IN(p.created_by,p.owner_id)))
$$;
REVOKE ALL ON FUNCTION public.team_project_can_manage(uuid,uuid) FROM public,anon; GRANT EXECUTE ON FUNCTION public.team_project_can_manage(uuid,uuid) TO authenticated;

-- Pessoas que podem ser responsáveis por projeto ou etapa.
CREATE FUNCTION public.team_project_members() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name) ORDER BY p.full_name),'[]'::jsonb)
 FROM public.profiles p WHERE public.is_operator(auth.uid()) AND public.is_operator(p.id)
$$;
REVOKE ALL ON FUNCTION public.team_project_members() FROM public,anon; GRANT EXECUTE ON FUNCTION public.team_project_members() TO authenticated;

-- Uso interno: registro na linha do tempo e aviso às pessoas envolvidas (exceto quem agiu).
CREATE FUNCTION public.team_project_log(_project uuid,_kind text,_body text,_file uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.team_project_activity(project_id,kind,actor_id,actor_name,body,file_id)
 SELECT _project,_kind,p.id,coalesce(nullif(btrim(p.full_name),''),'Equipe'),_body,_file FROM public.profiles p WHERE p.id=auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.team_project_log(uuid,text,text,uuid) FROM public,anon,authenticated;

CREATE FUNCTION public.team_project_notice(_project uuid,_title text,_recipients uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.team_projects; BEGIN
 SELECT * INTO p FROM public.team_projects WHERE id=_project;
 INSERT INTO public.notifications(recipient_id,entity_type,entity_id,obligation,deadline,level,title,link)
 SELECT DISTINCT r,'project',_project,'project_event',clock_timestamp(),'reminder',left(_title||' · '||p.code||' · '||p.title,300),'/projetos?id='||_project
 FROM unnest(_recipients) r WHERE r IS NOT NULL AND r IS DISTINCT FROM auth.uid() AND public.is_operator(r)
 ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.team_project_notice(uuid,text,uuid[]) FROM public,anon,authenticated;

-- Envolvidos: quem criou, responsável e responsáveis pelas etapas.
CREATE FUNCTION public.team_project_people(_project uuid) RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT array_remove(array_agg(DISTINCT x),NULL) FROM(
  SELECT created_by x FROM public.team_projects WHERE id=_project UNION ALL
  SELECT owner_id FROM public.team_projects WHERE id=_project UNION ALL
  SELECT assignee_id FROM public.team_project_steps WHERE project_id=_project) s
$$;
REVOKE ALL ON FUNCTION public.team_project_people(uuid) FROM public,anon,authenticated;

CREATE FUNCTION public.team_project_status_label(_status text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE _status WHEN 'ideia' THEN 'Ideia' WHEN 'planejado' THEN 'Planejado' WHEN 'em_andamento' THEN 'Em andamento' WHEN 'em_revisao' THEN 'Em revisão' WHEN 'concluido' THEN 'Concluído' WHEN 'cancelado' THEN 'Cancelado' ELSE _status END
$$;

-- Etapas iniciais ou nova etapa: título obrigatório; responsável, se informado, precisa estar ativo na equipe.
CREATE FUNCTION public.team_project_step_values(_data jsonb) RETURNS TABLE(title text,description text,assignee uuid,due date) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF jsonb_typeof(_data)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(_data) k WHERE k NOT IN('title','description','assignee_id','due_date')) THEN RAISE EXCEPTION 'invalid_project_data'; END IF;
 title:=btrim(_data->>'title'); description:=nullif(btrim(coalesce(_data->>'description','')),'');
 assignee:=nullif(_data->>'assignee_id','')::uuid; due:=nullif(_data->>'due_date','')::date;
 IF title IS NULL OR length(title)<2 THEN RAISE EXCEPTION 'incomplete: informe o nome de cada etapa'; END IF;
 IF assignee IS NOT NULL AND NOT public.is_operator(assignee) THEN RAISE EXCEPTION 'project_member_required'; END IF;
 RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.team_project_step_values(jsonb) FROM public,anon,authenticated;

-- Cria (_id NULL) ou edita os dados do projeto. Etapas iniciais vão em _data.steps na criação.
CREATE FUNCTION public.save_team_project(_id uuid,_version int,_data jsonb) RETURNS public.team_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); p public.team_projects; old public.team_projects; s jsonb; v record; n int:=0; who text; BEGIN
 IF NOT public.is_operator(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF jsonb_typeof(_data)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(_data) k WHERE k NOT IN('title','context','priority','owner_id','start_date','due_date','steps')) THEN RAISE EXCEPTION 'invalid_project_data'; END IF;
 IF _data ? 'owner_id' AND (nullif(_data->>'owner_id','') IS NULL OR NOT public.is_operator((_data->>'owner_id')::uuid)) THEN RAISE EXCEPTION 'project_member_required'; END IF;
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

-- Situação no quadro. Gerentes movem livremente; responsáveis por etapa só entre as situações abertas.
-- Concluir exige todas as etapas concluídas; cancelar exige motivo e é exclusivo de quem gerencia.
CREATE FUNCTION public.move_team_project(_id uuid,_version int,_status text,_reason text DEFAULT NULL) RETURNS public.team_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); p public.team_projects; old public.team_projects; manager boolean; BEGIN
 IF NOT public.is_operator(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
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

-- Lê o projeto para alteração de etapas: bloqueio, versão, gerência e projeto aberto.
CREATE FUNCTION public.team_project_lock(_id uuid,_version int,_manage boolean) RETURNS public.team_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.team_projects; BEGIN
 IF NOT public.is_operator(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO p FROM public.team_projects WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR (_manage AND NOT public.team_project_can_manage(_id,auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p.version<>_version THEN RAISE EXCEPTION 'conflict'; END IF;
 IF p.status IN('concluido','cancelado') THEN RAISE EXCEPTION 'project_closed'; END IF;
 UPDATE public.team_projects SET version=version+1,updated_at=now() WHERE id=_id RETURNING * INTO p;
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.team_project_lock(uuid,int,boolean) FROM public,anon,authenticated;

-- Adiciona (_step NULL) ou edita uma etapa.
CREATE FUNCTION public.save_team_project_step(_project uuid,_version int,_step uuid,_data jsonb) RETURNS public.team_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.team_projects; v record; s public.team_project_steps; BEGIN
 p:=public.team_project_lock(_project,_version,true);
 SELECT * INTO v FROM public.team_project_step_values(_data);
 IF _step IS NULL THEN
  IF (SELECT count(*) FROM public.team_project_steps WHERE project_id=_project)>=50 THEN RAISE EXCEPTION 'incomplete: um projeto pode ter até 50 etapas'; END IF;
  INSERT INTO public.team_project_steps(project_id,position,title,description,assignee_id,due_date)
  VALUES(_project,coalesce((SELECT max(position) FROM public.team_project_steps WHERE project_id=_project),0)+1,v.title,v.description,v.assignee,v.due) RETURNING * INTO s;
  PERFORM public.team_project_log(_project,'step','Etapa adicionada: '||s.title);
  PERFORM public.team_project_notice(_project,'Nova etapa com você',ARRAY[s.assignee_id]);
 ELSE
  SELECT * INTO s FROM public.team_project_steps WHERE id=_step AND project_id=_project FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.team_project_steps SET title=v.title,description=v.description,assignee_id=v.assignee,due_date=v.due,updated_at=now() WHERE id=_step;
  PERFORM public.team_project_log(_project,CASE WHEN v.due IS DISTINCT FROM s.due_date THEN 'deadline' ELSE 'step' END,
   'Etapa atualizada: '||v.title||CASE WHEN v.due IS DISTINCT FROM s.due_date THEN ' · prazo '||coalesce(to_char(s.due_date,'DD/MM/YYYY'),'sem prazo')||' → '||coalesce(to_char(v.due,'DD/MM/YYYY'),'sem prazo') ELSE '' END);
  IF v.assignee IS DISTINCT FROM s.assignee_id THEN PERFORM public.team_project_notice(_project,'Etapa com você',ARRAY[v.assignee]); END IF;
 END IF;
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.save_team_project_step(uuid,int,uuid,jsonb) FROM public,anon; GRANT EXECUTE ON FUNCTION public.save_team_project_step(uuid,int,uuid,jsonb) TO authenticated;

CREATE FUNCTION public.remove_team_project_step(_project uuid,_version int,_step uuid) RETURNS public.team_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.team_projects; s public.team_project_steps; BEGIN
 p:=public.team_project_lock(_project,_version,true);
 DELETE FROM public.team_project_steps WHERE id=_step AND project_id=_project RETURNING * INTO s;
 IF s.id IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 UPDATE public.team_project_steps t SET position=o.n FROM(SELECT id,row_number() OVER(ORDER BY position,created_at) n FROM public.team_project_steps WHERE project_id=_project) o WHERE t.id=o.id AND t.position<>o.n;
 PERFORM public.team_project_log(_project,'step','Etapa removida: '||s.title);
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.remove_team_project_step(uuid,int,uuid) FROM public,anon; GRANT EXECUTE ON FUNCTION public.remove_team_project_step(uuid,int,uuid) TO authenticated;

-- Nova ordem das etapas: precisa conter exatamente as etapas do projeto.
CREATE FUNCTION public.reorder_team_project_steps(_project uuid,_version int,_order uuid[]) RETURNS public.team_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.team_projects; BEGIN
 p:=public.team_project_lock(_project,_version,true);
 IF coalesce(array_length(_order,1),0)<>(SELECT count(*) FROM public.team_project_steps WHERE project_id=_project)
    OR (SELECT count(DISTINCT x) FROM unnest(_order) x)<>coalesce(array_length(_order,1),0)
    OR EXISTS(SELECT 1 FROM unnest(_order) x WHERE NOT EXISTS(SELECT 1 FROM public.team_project_steps WHERE id=x AND project_id=_project)) THEN
  RAISE EXCEPTION 'invalid_project_data';
 END IF;
 UPDATE public.team_project_steps t SET position=o.n,updated_at=now() FROM unnest(_order) WITH ORDINALITY o(id,n) WHERE t.id=o.id AND t.position<>o.n;
 PERFORM public.team_project_log(_project,'step','Ordem das etapas atualizada');
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.reorder_team_project_steps(uuid,int,uuid[]) FROM public,anon; GRANT EXECUTE ON FUNCTION public.reorder_team_project_steps(uuid,int,uuid[]) TO authenticated;

-- Concluir ou reabrir etapa: quem gerencia, o responsável pela etapa ou, sem responsável, qualquer pessoa da equipe.
CREATE FUNCTION public.set_team_project_step_done(_project uuid,_version int,_step uuid,_done boolean) RETURNS public.team_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); p public.team_projects; s public.team_project_steps; BEGIN
 p:=public.team_project_lock(_project,_version,false);
 SELECT * INTO s FROM public.team_project_steps WHERE id=_step AND project_id=_project FOR UPDATE;
 IF NOT FOUND OR NOT(public.team_project_can_manage(_project,uid) OR s.assignee_id=uid OR s.assignee_id IS NULL) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF (s.done_at IS NOT NULL)=_done THEN RETURN p; END IF;
 UPDATE public.team_project_steps SET done_at=CASE WHEN _done THEN now() END,done_by=CASE WHEN _done THEN uid END,updated_at=now() WHERE id=_step;
 PERFORM public.team_project_log(_project,'step',CASE WHEN _done THEN 'Etapa concluída: ' ELSE 'Etapa reaberta: ' END||s.title);
 IF _done AND NOT EXISTS(SELECT 1 FROM public.team_project_steps WHERE project_id=_project AND done_at IS NULL) THEN
  PERFORM public.team_project_notice(_project,'Todas as etapas concluídas — revise e conclua',ARRAY[p.owner_id,p.created_by]);
 ELSE
  PERFORM public.team_project_notice(_project,CASE WHEN _done THEN 'Etapa concluída' ELSE 'Etapa reaberta' END,ARRAY[p.owner_id]);
 END IF;
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.set_team_project_step_done(uuid,int,uuid,boolean) FROM public,anon; GRANT EXECUTE ON FUNCTION public.set_team_project_step_done(uuid,int,uuid,boolean) TO authenticated;

-- Conversa: qualquer pessoa da equipe comenta, inclusive em projeto encerrado (registro histórico).
CREATE FUNCTION public.post_team_project_message(_project uuid,_body text) RETURNS public.team_project_activity LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); a public.team_project_activity; BEGIN
 IF NOT public.is_operator(uid) OR NOT EXISTS(SELECT 1 FROM public.team_projects WHERE id=_project) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF length(btrim(coalesce(_body,''))) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'incomplete: escreva a mensagem (até 10.000 caracteres)'; END IF;
 INSERT INTO public.team_project_activity(project_id,kind,actor_id,actor_name,body)
 SELECT _project,'message',p.id,coalesce(nullif(btrim(p.full_name),''),'Equipe'),btrim(_body) FROM public.profiles p WHERE p.id=uid RETURNING * INTO a;
 PERFORM public.team_project_notice(_project,'Nova mensagem',public.team_project_people(_project));
 RETURN a;
END $$;
REVOKE ALL ON FUNCTION public.post_team_project_message(uuid,text) FROM public,anon; GRANT EXECUTE ON FUNCTION public.post_team_project_message(uuid,text) TO authenticated;

-- Avisos de projeto passam pela trava de dados de teste das notificações (projetos não são dado de teste).
-- Mesma função da 20261016143000_general_system_demands, com o ramo 'project' antes dos demais.
CREATE OR REPLACE FUNCTION public.real_operation_record(_kind text,_id uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE ok boolean; BEGIN
 IF _kind='project' THEN RETURN EXISTS(SELECT 1 FROM public.team_projects WHERE id=_id); END IF;
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

-- Anexos privados: <projeto>/<uuid>/<arquivo>. O registro confere o objeto enviado pela própria pessoa.
-- Bucket privado 'team-projects' (50 MB) criado pela ferramenta de storage, não por INSERT em storage.buckets.
CREATE FUNCTION public.team_project_of_path(_path text) RETURNS uuid LANGUAGE plpgsql IMMUTABLE AS $$ BEGIN RETURN split_part(_path,'/',1)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN NULL; END $$;
CREATE POLICY "Team project files read" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='team-projects' AND public.is_operator(auth.uid()) AND EXISTS(SELECT 1 FROM public.team_projects p WHERE p.id=public.team_project_of_path(name)));
CREATE POLICY "Team project files upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='team-projects' AND public.is_operator(auth.uid()) AND owner_id=auth.uid()::text AND EXISTS(SELECT 1 FROM public.team_projects p WHERE p.id=public.team_project_of_path(name)));
CREATE POLICY "Team project own orphan uploads" ON storage.objects FOR DELETE TO authenticated USING(bucket_id='team-projects' AND owner_id=auth.uid()::text AND public.is_operator(auth.uid()) AND NOT EXISTS(SELECT 1 FROM public.team_project_files f WHERE f.path=storage.objects.name));

CREATE FUNCTION public.register_team_project_file(_project uuid,_path text,_filename text,_mime text,_size bigint,_note text DEFAULT NULL) RETURNS public.team_project_files LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); o storage.objects; f public.team_project_files; BEGIN
 IF NOT public.is_operator(uid) OR NOT EXISTS(SELECT 1 FROM public.team_projects WHERE id=_project) OR public.team_project_of_path(_path) IS DISTINCT FROM _project THEN RAISE EXCEPTION 'forbidden'; END IF;
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
