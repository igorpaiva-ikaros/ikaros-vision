-- Internal Vision database only. No changes to the ERP or Notion.
BEGIN;
ALTER TABLE public.profiles ADD COLUMN avatar_url text;
ALTER TABLE public.profiles ADD CONSTRAINT profile_avatar_safe CHECK (avatar_url IS NULL OR (length(avatar_url)<=350000 AND avatar_url ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'));
CREATE OR REPLACE FUNCTION public.provision_member_profile(_id uuid,_name text,_email text,_role text,_actor uuid,_avatar text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.provision_member(_id,_name,_email,_role,_actor);
  UPDATE public.profiles SET avatar_url=nullif(_avatar,'') WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.provision_member_profile(uuid,text,text,text,uuid,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.provision_member_profile(uuid,text,text,text,uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.admin_edit_member_profile(_id uuid,_name text,_avatar text,_role text,_active boolean,_commission boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF length(btrim(_name)) < 2 OR length(_name)>200 THEN RAISE EXCEPTION 'incomplete: informe o nome'; END IF;
  PERFORM public.admin_update_member(_id,_role,_active,_commission);
  UPDATE public.profiles SET full_name=btrim(_name),avatar_url=nullif(_avatar,''),updated_at=now() WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_edit_member_profile(uuid,text,text,text,boolean,boolean) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.admin_edit_member_profile(uuid,text,text,text,boolean,boolean) TO authenticated;

CREATE TABLE public.scheduled_tasks (
 id uuid PRIMARY KEY,
 client_id uuid NOT NULL REFERENCES public.clients(id),
 record_kind text CHECK(record_kind IN ('demands','onboardings','upgrades','interactions','changelog')),
 record_id uuid,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 2 AND 300),
 task_type text NOT NULL CHECK(task_type IN ('Retorno','Ligação','Reunião','Treinamento','Validação','Outro')),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 due_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','canceled')),
 completed_at timestamptz,
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 version int NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((record_kind IS NULL)=(record_id IS NULL))
);
CREATE INDEX scheduled_tasks_pending_due ON public.scheduled_tasks(due_at) WHERE status='pending';
CREATE INDEX scheduled_tasks_client ON public.scheduled_tasks(client_id);
ALTER TABLE public.scheduled_tasks ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.scheduled_tasks TO authenticated;
GRANT ALL ON public.scheduled_tasks TO service_role;
CREATE POLICY "Operators read portfolio tasks" ON public.scheduled_tasks FOR SELECT TO authenticated USING (
 public.is_operator(auth.uid()) AND (public.is_admin(auth.uid()) OR exists(SELECT 1 FROM public.clients c WHERE c.id=client_id AND c.owner_id=auth.uid()))
);
CREATE OR REPLACE FUNCTION public.save_scheduled_task(_id uuid,_client uuid,_title text,_type text,_due timestamptz,_notes text,_kind text DEFAULT NULL,_record uuid DEFAULT NULL,_version int DEFAULT NULL,_status text DEFAULT 'pending')
RETURNS public.scheduled_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); c public.clients; t public.scheduled_tasks; related uuid; existed boolean;
BEGIN
 IF NOT public.is_operator(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO c FROM public.clients WHERE id=_client FOR SHARE;
 IF NOT FOUND OR c.owner_id IS NULL OR (NOT public.is_admin(uid) AND c.owner_id IS DISTINCT FROM uid) THEN RAISE EXCEPTION 'not_found'; END IF;
 IF NOT public.is_cs(c.owner_id) THEN RAISE EXCEPTION 'owner_inactive'; END IF;
 IF (_kind IS NULL) IS DISTINCT FROM (_record IS NULL) THEN RAISE EXCEPTION 'invalid_record'; END IF;
 IF _kind IS NOT NULL THEN
  IF _kind NOT IN ('demands','onboardings','upgrades','interactions','changelog') THEN RAISE EXCEPTION 'invalid_record'; END IF;
  EXECUTE format('SELECT client_id FROM public.%I WHERE id=$1',_kind) INTO related USING _record;
  IF related IS DISTINCT FROM _client THEN RAISE EXCEPTION 'invalid_record'; END IF;
 END IF;
 SELECT * INTO t FROM public.scheduled_tasks WHERE id=_id FOR UPDATE; existed:=FOUND;
 IF existed THEN
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
REVOKE ALL ON FUNCTION public.save_scheduled_task(uuid,uuid,text,text,timestamptz,text,text,uuid,int,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.save_scheduled_task(uuid,uuid,text,text,timestamptz,text,text,uuid,int,text) TO authenticated;

ALTER TABLE public.notifications DROP CONSTRAINT notifications_level_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_level_check CHECK(level IN ('risk','overdue','reminder'));
DROP POLICY "Read own notifications" ON public.notifications;
DROP POLICY "Mark own notifications" ON public.notifications;
CREATE POLICY "Read own notifications" ON public.notifications FOR SELECT TO authenticated USING (
 recipient_id=auth.uid() AND public.is_operator(auth.uid()) AND (public.is_admin(auth.uid()) OR
 (entity_type='demand' AND exists(SELECT 1 FROM public.demands WHERE id=entity_id)) OR
 (entity_type='onboarding' AND exists(SELECT 1 FROM public.onboardings WHERE id=entity_id)) OR
 (entity_type='task' AND exists(SELECT 1 FROM public.scheduled_tasks WHERE id=entity_id)))
);
CREATE POLICY "Mark own notifications" ON public.notifications FOR UPDATE TO authenticated USING (
 recipient_id=auth.uid() AND public.is_operator(auth.uid()) AND (public.is_admin(auth.uid()) OR
 (entity_type='demand' AND exists(SELECT 1 FROM public.demands WHERE id=entity_id)) OR
 (entity_type='onboarding' AND exists(SELECT 1 FROM public.onboardings WHERE id=entity_id)) OR
 (entity_type='task' AND exists(SELECT 1 FROM public.scheduled_tasks WHERE id=entity_id)))
) WITH CHECK(recipient_id=auth.uid());
CREATE OR REPLACE FUNCTION public.task_reminder_tick() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
 -- Locks serialize rescheduling/cancellation with reminder dispatch; duplicates have a unique constraint.
 WITH pending AS (
 SELECT t.id,t.title,t.due_at,c.owner_id,c.name FROM public.scheduled_tasks t JOIN public.clients c ON c.id=t.client_id
 WHERE t.status='pending' AND t.due_at<=now() AND public.is_cs(c.owner_id) FOR SHARE OF t,c
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
REVOKE ALL ON FUNCTION public.task_reminder_tick() FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.task_reminder_tick() TO service_role;
COMMIT;
