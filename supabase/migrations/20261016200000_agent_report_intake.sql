-- Relatórios recebidos são evidências dos cards nativos, não uma carteira paralela.
BEGIN;
ALTER TABLE public.demands ALTER COLUMN priority DROP NOT NULL;

CREATE TABLE public.agent_report_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL CHECK (length(external_id) BETWEEN 8 AND 300),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  demand_id uuid NOT NULL REFERENCES public.demands(id) DEFERRABLE INITIALLY DEFERRED,
  requested_by uuid NOT NULL REFERENCES public.profiles(id),
  payload jsonb NOT NULL,
  demand_version int NOT NULL,
  allow_completion boolean NOT NULL DEFAULT false,
  completion_applied boolean NOT NULL DEFAULT false,
  state text NOT NULL CHECK (state IN ('applying','received','finalized')),
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  UNIQUE(external_id,content_hash)
);
ALTER TABLE public.agent_report_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_report_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.agent_report_receipts TO authenticated;
CREATE POLICY "Operators read accessible report receipts" ON public.agent_report_receipts
  FOR SELECT TO authenticated USING(public.is_operator(auth.uid()) AND public.can_read_case(demand_id,auth.uid()));

CREATE TABLE public.agent_client_aliases (
  normalized_name text PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_client_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_client_aliases FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.agent_client_aliases TO authenticated;
CREATE POLICY "Operators read real client aliases" ON public.agent_client_aliases
  FOR SELECT TO authenticated USING(public.is_operator(auth.uid()) AND public.real_client(client_id));

CREATE FUNCTION public.agent_report_name(_name text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT btrim(regexp_replace(translate(lower(coalesce(_name,'')),
 'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'[^a-z0-9]+',' ','g'))
$$;

-- Only an in-flight receipt, bound to the same actor AND record, enables historical dates.
-- Authenticated users cannot create/update receipts or leave one in this state.
CREATE FUNCTION public.in_agent_report(_demand uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_operator(auth.uid()) AND EXISTS (
  SELECT 1 FROM public.agent_report_receipts r
  WHERE r.id::text=current_setting('app.agent_report',true) AND r.demand_id=_demand
    AND (r.requested_by=auth.uid() OR public.is_admin(auth.uid())) AND r.state='applying'
 )
$$;
REVOKE ALL ON FUNCTION public.in_agent_report(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.agent_report_result(_receipt uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('receipt_id',r.id,'state',r.state,'client',jsonb_build_object('id',c.id,'code',c.code,'name',c.name),
 'demand',jsonb_build_object('id',d.id,'code',d.code,'title',d.title,'classification',d.classification,'stage',d.stage,'version',d.version,'owner_id',d.owner_id),
 'completion_applied',r.completion_applied,
 'card_path','/operacao?tab=crm&pipeline=demands&id='||d.id)
 FROM public.agent_report_receipts r JOIN public.demands d ON d.id=r.demand_id JOIN public.clients c ON c.id=r.client_id WHERE r.id=_receipt
$$;
REVOKE ALL ON FUNCTION public.agent_report_result(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.ingest_agent_report(_report jsonb,_preview boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); ext text; digest text; r public.agent_report_receipts; prior public.agent_report_receipts;
 c public.clients; d public.demands; ids uuid[]; names text[]; title_ids uuid[]; alias text;
 rid uuid:=gen_random_uuid(); did uuid; new_demand boolean:=false; can_complete boolean:=false;
 completion jsonb; file jsonb; previous_context text:=current_setting('app.agent_report',true);
BEGIN
 IF uid IS NULL OR NOT public.is_operator(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _report IS NULL OR jsonb_typeof(_report)<>'object' OR octet_length(_report::text)>200000
  OR (_report - ARRAY['version','external_id','client','demand','source','completion','narrative','missing_files','files'])<>'{}'::jsonb
  OR ((_report->'client') - ARRAY['id','code','erp_id','name','aliases'])<>'{}'::jsonb
  OR ((_report->'demand') - ARRAY['id','version','create_new','title','classification','priority','channel','description','context','impact','solution','received_at'])<>'{}'::jsonb
  OR ((_report->'source') - ARRAY['reference','agent','documented_on','requester'])<>'{}'::jsonb
  OR ((_report->'completion') - ARRAY['confirmed_by_user','source','at','on','publication'])<>'{}'::jsonb
  OR _report->>'version' IS DISTINCT FROM 'ikaros-vision-agent-report-v1'
  OR length(btrim(coalesce(_report->>'external_id',''))) NOT BETWEEN 8 AND 300
  OR length(btrim(coalesce(_report#>>'{client,name}',''))) NOT BETWEEN 2 AND 200
  OR jsonb_typeof(_report#>'{client,aliases}') IS DISTINCT FROM 'array'
  OR jsonb_array_length(_report#>'{client,aliases}')>10
  OR length(btrim(coalesce(_report#>>'{demand,title}',''))) NOT BETWEEN 2 AND 300
  OR length(btrim(coalesce(_report#>>'{demand,description}',''))) NOT BETWEEN 2 AND 10000
  OR length(btrim(coalesce(_report->>'narrative',''))) NOT BETWEEN 2 AND 30000
  OR length(btrim(coalesce(_report#>>'{source,reference}',''))) NOT BETWEEN 2 AND 2000
  OR jsonb_typeof(_report->'files') IS DISTINCT FROM 'array' OR jsonb_array_length(_report->'files')>20
  OR coalesce(_report#>>'{demand,classification}','') NOT IN ('Dúvida','Suporte','Bug','Pequena melhoria','Demanda complexa','Configuração','Onboarding','Upgrade')
  OR (_report#>>'{demand,priority}' IS NOT NULL AND _report#>>'{demand,priority}' NOT IN ('Baixa','Normal','Alta','Crítica'))
 THEN RAISE EXCEPTION 'invalid_report'; END IF;
 completion:=_report->'completion';
 IF jsonb_typeof(completion->'confirmed_by_user') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'invalid_report'; END IF;
 IF (completion->>'confirmed_by_user')::boolean AND (
  _report#>>'{demand,classification}'<>'Dúvida' OR completion->>'publication' IS DISTINCT FROM 'nao_se_aplica'
  OR length(btrim(coalesce(completion->>'source','')))<2 OR length(btrim(coalesce(_report#>>'{demand,solution}','')))<2
  OR (completion->>'at' IS NULL AND completion->>'on' IS NULL)
  OR (completion->>'at' IS NOT NULL AND completion->>'on' IS NOT NULL)
 ) THEN RAISE EXCEPTION 'incomplete: conclusão exige orientação, solução, confirmação do usuário e data comprovada'; END IF;
 IF completion->>'on' IS NOT NULL AND (completion->>'on' !~ '^\d{4}-\d{2}-\d{2}$' OR (completion->>'on')::date>current_date) THEN RAISE EXCEPTION 'invalid_report'; END IF;
 IF completion->>'at' IS NOT NULL AND (completion->>'at' !~ '(Z|[+-]\d{2}:\d{2})$' OR (completion->>'at')::timestamptz>now()) THEN RAISE EXCEPTION 'invalid_report'; END IF;
 IF _report#>>'{demand,received_at}' IS NOT NULL AND (_report#>>'{demand,received_at}' !~ '(Z|[+-]\d{2}:\d{2})$' OR (_report#>>'{demand,received_at}')::timestamptz>now()) THEN RAISE EXCEPTION 'invalid_report'; END IF;
 FOR file IN SELECT value FROM jsonb_array_elements(_report->'files') LOOP
  IF coalesce(file->>'sha256','') !~ '^[a-f0-9]{64}$' OR length(coalesce(file->>'name','')) NOT BETWEEN 1 AND 250
   OR coalesce((file->>'size')::bigint,0) NOT BETWEEN 1 AND 52428800
   OR coalesce(file->>'mime','') NOT IN ('application/pdf','text/plain','text/csv','image/png','image/jpeg','image/webp','video/mp4','video/webm','video/quicktime','audio/mpeg','audio/ogg','audio/wav','audio/mp4','audio/webm','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
   OR file->>'name' !~* '\.(pdf|txt|csv|png|jpe?g|webp|mp4|webm|mov|mp3|ogg|wav|m4a|docx|xlsx)$'
  THEN RAISE EXCEPTION 'invalid_file'; END IF;
  IF file - ARRAY['name','mime','size','sha256']<>'{}'::jsonb OR NOT (
   (file->>'name' ~* '\.(pdf)$' AND file->>'mime'='application/pdf') OR
   (file->>'name' ~* '\.(txt)$' AND file->>'mime'='text/plain') OR
   (file->>'name' ~* '\.(csv)$' AND file->>'mime'='text/csv') OR
   (file->>'name' ~* '\.(png)$' AND file->>'mime'='image/png') OR
   (file->>'name' ~* '\.(jpe?g)$' AND file->>'mime'='image/jpeg') OR
   (file->>'name' ~* '\.(webp)$' AND file->>'mime'='image/webp') OR
   (file->>'name' ~* '\.(mp4)$' AND file->>'mime'='video/mp4') OR
   (file->>'name' ~* '\.(webm)$' AND file->>'mime' IN('video/webm','audio/webm')) OR
   (file->>'name' ~* '\.(mov)$' AND file->>'mime'='video/quicktime') OR
   (file->>'name' ~* '\.(mp3)$' AND file->>'mime'='audio/mpeg') OR
   (file->>'name' ~* '\.(ogg)$' AND file->>'mime'='audio/ogg') OR
   (file->>'name' ~* '\.(wav)$' AND file->>'mime'='audio/wav') OR
   (file->>'name' ~* '\.(m4a)$' AND file->>'mime'='audio/mp4') OR
   (file->>'name' ~* '\.(docx)$' AND file->>'mime'='application/vnd.openxmlformats-officedocument.wordprocessingml.document') OR
   (file->>'name' ~* '\.(xlsx)$' AND file->>'mime'='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  ) THEN RAISE EXCEPTION 'invalid_file'; END IF;
 END LOOP;
 IF (SELECT count(*)<>count(DISTINCT value->>'sha256') FROM jsonb_array_elements(_report->'files')) THEN RAISE EXCEPTION 'invalid_file'; END IF;
 ext:=_report->>'external_id'; digest:=encode(sha256(convert_to(_report::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('agent-report:'||ext,0));
 SELECT * INTO r FROM public.agent_report_receipts WHERE external_id=ext AND content_hash=digest;
 IF FOUND THEN
  IF NOT public.can_read_case(r.demand_id,uid) THEN RAISE EXCEPTION 'not_found'; END IF;
  RETURN public.agent_report_result(r.id)||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO prior FROM public.agent_report_receipts WHERE external_id=ext ORDER BY created_at DESC,id DESC LIMIT 1;
 -- Serialize alias lookup and minimal registration: overlapping aliases cannot create duplicates.
 PERFORM pg_advisory_xact_lock(hashtextextended('agent-report-client-resolution',0));
 SELECT array_agg(DISTINCT public.agent_report_name(n)) INTO names FROM (
  SELECT _report#>>'{client,name}' AS n UNION ALL SELECT jsonb_array_elements_text(_report#>'{client,aliases}')
 ) x;
 IF EXISTS(SELECT 1 FROM unnest(names) n WHERE length(n)<2 OR length(n)>200) THEN RAISE EXCEPTION 'invalid_report'; END IF;
 SELECT array_agg(DISTINCT x.id) INTO ids FROM (
  SELECT cl.id FROM public.clients cl WHERE NOT cl.is_test AND (
   cl.id=prior.client_id OR cl.id=nullif(_report#>>'{client,id}','')::uuid
   OR cl.code=nullif(_report#>>'{client,code}','') OR cl.erp_id=nullif(_report#>>'{client,erp_id}','')
   OR public.agent_report_name(cl.name)=ANY(names) OR public.agent_report_name(cl.empresa)=ANY(names))
  UNION SELECT a.client_id FROM public.agent_client_aliases a JOIN public.clients cl ON cl.id=a.client_id WHERE NOT cl.is_test AND a.normalized_name=ANY(names)
 ) x;
 IF cardinality(ids)>1 THEN
  IF _preview THEN RETURN jsonb_build_object('requires_review',true,'reason','ambiguous_client','client_candidates',(SELECT jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name)) FROM public.clients WHERE id=ANY(ids))); END IF;
  RAISE EXCEPTION 'ambiguous_client: confira os identificadores na carteira';
 END IF;
 IF cardinality(ids)=1 THEN
  SELECT * INTO c FROM public.clients WHERE id=ids[1];
  IF (_report#>>'{client,id}' IS NOT NULL AND c.id<>(_report#>>'{client,id}')::uuid)
   OR (_report#>>'{client,code}' IS NOT NULL AND c.code IS DISTINCT FROM _report#>>'{client,code}')
   OR (_report#>>'{client,erp_id}' IS NOT NULL AND c.erp_id IS DISTINCT FROM _report#>>'{client,erp_id}')
   OR (prior.id IS NOT NULL AND c.id<>prior.client_id) THEN RAISE EXCEPTION 'client_conflict'; END IF;
 ELSE
  IF _report#>>'{client,id}' IS NOT NULL OR _report#>>'{client,code}' IS NOT NULL OR _report#>>'{client,erp_id}' IS NOT NULL OR prior.id IS NOT NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 END IF;
 IF prior.id IS NOT NULL AND _report#>>'{client,id}' IS NULL AND NOT (public.agent_report_name(c.name)=ANY(names) OR public.agent_report_name(c.empresa)=ANY(names) OR EXISTS(SELECT 1 FROM public.agent_client_aliases a WHERE a.client_id=c.id AND a.normalized_name=ANY(names))) THEN RAISE EXCEPTION 'client_conflict'; END IF;
 IF _preview THEN
  RETURN jsonb_build_object('client',CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id',c.id,'code',c.code,'name',c.name) END,
    'will_create_client',c.id IS NULL,'demand_candidates',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d0.id,'code',d0.code,'title',d0.title,'stage',d0.stage,'version',d0.version,'owner_id',d0.owner_id) ORDER BY d0.created_at DESC) FROM public.demands d0 WHERE d0.client_id=c.id AND NOT d0.is_test),'[]'::jsonb));
 END IF;
 IF c.id IS NULL THEN
  INSERT INTO public.clients(name,empresa,owner_id,plan,contact_name,contact_email,contact_phone) VALUES(_report#>>'{client,name}',_report#>>'{client,name}',NULL,NULL,NULL,NULL,NULL) RETURNING * INTO c;
 END IF;
 FOREACH alias IN ARRAY names LOOP
  INSERT INTO public.agent_client_aliases(normalized_name,client_id,created_by) VALUES(alias,c.id,uid) ON CONFLICT(normalized_name) DO NOTHING;
  IF EXISTS(SELECT 1 FROM public.agent_client_aliases WHERE normalized_name=alias AND client_id<>c.id) THEN RAISE EXCEPTION 'client_conflict'; END IF;
 END LOOP;
 did:=coalesce(nullif(_report#>>'{demand,id}','')::uuid,prior.demand_id);
 IF prior.id IS NOT NULL AND did<>prior.demand_id THEN RAISE EXCEPTION 'report_conflict'; END IF;
 IF did IS NULL THEN
  SELECT array_agg(id) INTO title_ids FROM public.demands WHERE client_id=c.id AND NOT is_test AND public.agent_report_name(title)=public.agent_report_name(_report#>>'{demand,title}');
  IF cardinality(title_ids)>1 THEN RAISE EXCEPTION 'ambiguous_demand: informe o card já consultado'; END IF;
  IF cardinality(title_ids)=1 THEN did:=title_ids[1]; END IF;
 END IF;
 IF did IS NOT NULL THEN
  SELECT * INTO d FROM public.demands WHERE id=did AND client_id=c.id AND NOT is_test FOR UPDATE;
  IF NOT FOUND OR NOT public.can_read_case(d.id,uid) THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _report#>>'{demand,id}' IS NOT NULL THEN
   IF (_report#>>'{demand,version}')::int IS NULL OR d.version<>(_report#>>'{demand,version}')::int THEN RAISE EXCEPTION 'conflict: a demanda foi alterada'; END IF;
   can_complete:=d.owner_id=uid OR public.is_admin(uid);
  END IF;
 ELSE
  IF NOT coalesce((_report#>>'{demand,create_new}')::boolean,false) AND EXISTS(SELECT 1 FROM public.demands WHERE client_id=c.id AND NOT is_test) THEN RAISE EXCEPTION 'review_required: consulte as demandas existentes antes de criar'; END IF;
  did:=gen_random_uuid();new_demand:=true;can_complete:=true;
 END IF;
 INSERT INTO public.agent_report_receipts(id,external_id,content_hash,client_id,demand_id,requested_by,payload,demand_version,allow_completion,state)
 VALUES(rid,ext,digest,c.id,did,uid,_report,coalesce(d.version,1),can_complete,'applying');
 PERFORM set_config('app.agent_report',rid::text,true);
 IF new_demand THEN
  INSERT INTO public.demands(id,client_id,owner_id,title,description,priority,classification,channel,context,impact,solution,received_at)
  VALUES(did,c.id,CASE WHEN public.is_admin(uid) THEN NULL ELSE uid END,_report#>>'{demand,title}',_report#>>'{demand,description}',_report#>>'{demand,priority}',_report#>>'{demand,classification}',_report#>>'{demand,channel}',_report#>>'{demand,context}',_report#>>'{demand,impact}',_report#>>'{demand,solution}',(_report#>>'{demand,received_at}')::timestamptz) RETURNING * INTO d;
 END IF;
 -- New material complements the case without replacing native edits, ownership or stages.
 PERFORM public.post_case_message(did,'Relatório recebido: '||ext||E'\nOrigem: '||(_report#>>'{source,reference}')||E'\n'||left(_report->>'narrative',7000)||CASE WHEN length(_report->>'narrative')>7000 THEN E'\n[Relatório integral preservado no recebimento e no anexo privado.]' ELSE '' END);
 INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('demand',did,'agent_report_received',uid,jsonb_build_object('receipt_id',rid,'external_id',ext,'source',_report->'source','new_demand',new_demand));
 UPDATE public.agent_report_receipts SET state='received',demand_version=d.version WHERE id=rid;
 PERFORM set_config('app.agent_report',coalesce(previous_context,''),true);
 RETURN public.agent_report_result(rid)||jsonb_build_object('replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.ingest_agent_report(jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ingest_agent_report(jsonb,boolean) TO authenticated;

CREATE FUNCTION public.finalize_agent_report(_receipt uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid();r public.agent_report_receipts;d public.demands;f jsonb;p text;v int;
 completion jsonb;previous_context text:=current_setting('app.agent_report',true);previous_transition text:=current_setting('app.transition',true);
BEGIN
 IF uid IS NULL OR NOT public.is_operator(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO r FROM public.agent_report_receipts WHERE id=_receipt FOR UPDATE;
 IF NOT FOUND OR (r.requested_by<>uid AND NOT public.is_admin(uid)) OR NOT public.can_read_case(r.demand_id,uid) THEN RAISE EXCEPTION 'not_found'; END IF;
 IF r.state='finalized' THEN RETURN public.agent_report_result(r.id); END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(r.payload->'files') LOOP
  p:=r.demand_id||'/agent-reports/'||(f->>'sha256')||'.'||lower(substring(f->>'name' from '\.([^.]+)$'));
  IF NOT EXISTS(SELECT 1 FROM public.case_attachments a JOIN storage.objects o ON o.bucket_id='case-evidence' AND o.name=a.path
    WHERE a.demand_id=r.demand_id AND a.path=p AND a.size_bytes=(f->>'size')::bigint AND a.mime_type=f->>'mime'
    AND (o.metadata->>'size')::bigint=a.size_bytes AND o.metadata->>'mimetype'=a.mime_type)
  THEN RAISE EXCEPTION 'missing_evidence: envie e registre todos os anexos disponíveis'; END IF;
 END LOOP;
 SELECT * INTO d FROM public.demands WHERE id=r.demand_id FOR UPDATE;
 completion:=r.payload->'completion';
 IF r.allow_completion AND (completion->>'confirmed_by_user')::boolean AND d.completed_at IS NULL THEN
  IF d.version<>r.demand_version THEN RAISE EXCEPTION 'conflict: houve edição manual após o recebimento; confira o card'; END IF;
  IF d.owner_id IS DISTINCT FROM uid AND NOT public.is_admin(uid) THEN RAISE EXCEPTION 'not_found'; END IF;
  IF d.classification<>'Dúvida' OR EXISTS(SELECT 1 FROM public.delivery_requests WHERE demand_id=d.id) THEN RAISE EXCEPTION 'approval_required: use o fluxo de entrega do card'; END IF;
  IF completion->>'at' IS NULL AND d.received_at IS NOT NULL THEN RAISE EXCEPTION 'incomplete: conclusão sem horário com recebimento conhecido exige conferência para não afirmar SLA histórico'; END IF;
  UPDATE public.agent_report_receipts SET state='applying' WHERE id=r.id;
  -- Only the authenticated operator's receipt can open the narrow historical guard.
  PERFORM set_config('app.agent_report',r.id::text,true);
  UPDATE public.demands SET solution=r.payload#>>'{demand,solution}',client_informed=true WHERE id=d.id RETURNING version INTO v;
  SELECT * INTO d FROM public.transition_demand(d.id,'complete',v,NULL,'Confirmação do usuário: '||(completion->>'source'));
  PERFORM set_config('app.transition','on',true);
  UPDATE public.demands SET completed_at=coalesce((completion->>'at')::timestamptz,((completion->>'on')::date+time '00:00') AT TIME ZONE 'America/Sao_Paulo'),
   source_date_precision=CASE WHEN completion->>'at' IS NULL THEN source_date_precision||'"completed_at"'::jsonb ELSE source_date_precision END
   WHERE id=d.id RETURNING * INTO d;
  UPDATE public.agent_report_receipts SET completion_applied=true WHERE id=r.id;
  PERFORM set_config('app.transition',coalesce(previous_transition,''),true);
  INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('demand',d.id,'agent_report_completed',uid,jsonb_build_object('receipt_id',r.id,'source',completion->>'source','occurred_at',completion->>'at','documented_on',completion->>'on','precision',CASE WHEN completion->>'at' IS NULL THEN 'date' ELSE 'timestamp' END,'client_acceptance','not_asserted','publication','nao_se_aplica'));
 END IF;
 UPDATE public.agent_report_receipts SET state='finalized',finalized_at=now() WHERE id=r.id;
 PERFORM set_config('app.agent_report',coalesce(previous_context,''),true);
 RETURN public.agent_report_result(r.id);
END $$;
REVOKE ALL ON FUNCTION public.finalize_agent_report(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finalize_agent_report(uuid) TO authenticated;

-- Preserve all native guards; only receipt-bound historical fields get an exception.
CREATE OR REPLACE FUNCTION public.guard_operation_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); admin boolean := uid IS NULL OR public.is_admin(uid); tr boolean := coalesce(current_setting('app.transition', true), '') = 'on';
  report_ingest boolean:=false; cowner uuid; general boolean := TG_TABLE_NAME='demands' AND coalesce(to_jsonb(NEW)->>'scope','client')='system';
BEGIN
  report_ingest:=TG_TABLE_NAME='demands' AND public.in_agent_report(NEW.id);
  IF NEW.client_id IS NOT NULL THEN SELECT owner_id INTO cowner FROM public.clients WHERE id = NEW.client_id; END IF;
  IF uid IS NOT NULL AND NOT public.is_operator(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF TG_TABLE_NAME IN ('interactions','changelog') AND uid IS NOT NULL THEN
    IF NEW.demand_id IS NOT NULL AND NOT exists(SELECT 1 FROM public.demands WHERE id=NEW.demand_id AND client_id=NEW.client_id) THEN RAISE EXCEPTION 'invalid_demand_relation'; END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF uid IS NOT NULL AND NOT admin THEN
      NEW.notion_id:=NULL; NEW.notion_raw:=NULL; IF NOT report_ingest THEN NEW.source_date_precision:='[]'::jsonb; END IF;
      NEW.is_test:=coalesce((SELECT is_test FROM public.clients WHERE id=NEW.client_id),false);
      NEW.code:=CASE TG_TABLE_NAME WHEN 'demands' THEN 'DEM-'||lpad(nextval('public.dem_code_seq')::text,5,'0') WHEN 'onboardings' THEN 'ONB-'||lpad(nextval('public.onb_code_seq')::text,5,'0') WHEN 'upgrades' THEN 'UPG-'||lpad(nextval('public.upg_code_seq')::text,5,'0') WHEN 'interactions' THEN 'INT-'||lpad(nextval('public.int_code_seq')::text,5,'0') ELSE 'CHG-'||lpad(nextval('public.chg_code_seq')::text,5,'0') END;
      IF TG_TABLE_NAME='upgrades' THEN NEW.commission_eligible_at_effective:=NULL;NEW.commission_owner_id:=NULL;NEW.commission_paid:=false; END IF;
      IF TG_TABLE_NAME='demands' THEN NEW.stage:='Nova'; IF NOT report_ingest THEN NEW.received_at:=now(); END IF;
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
    IF TG_OP = 'INSERT' AND NEW.received_at IS NULL AND NEW.notion_id IS NULL AND NOT report_ingest THEN NEW.received_at := now(); END IF;
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
  IF TG_OP='UPDATE' AND uid IS NOT NULL AND NOT admin AND (NEW.code IS DISTINCT FROM OLD.code OR NEW.notion_id IS DISTINCT FROM OLD.notion_id OR NEW.notion_raw IS DISTINCT FROM OLD.notion_raw OR NEW.is_test IS DISTINCT FROM OLD.is_test OR NEW.created_at IS DISTINCT FROM OLD.created_at OR (NEW.source_date_precision IS DISTINCT FROM OLD.source_date_precision AND NOT report_ingest)) THEN RAISE EXCEPTION 'forbidden: origem e identidade protegidas'; END IF;
  IF TG_TABLE_NAME='upgrades' THEN
    IF TG_OP='UPDATE' AND uid IS NOT NULL AND NOT admin AND NEW.commission_paid IS DISTINCT FROM OLD.commission_paid THEN RAISE EXCEPTION 'forbidden: comissão paga é conferida pelo administrador'; END IF;
  END IF;
  IF TG_OP='INSERT' AND uid IS NOT NULL AND NOT admin THEN NEW.created_at:=now(); NEW.notion_id:=NULL; NEW.notion_raw:=NULL; END IF;
  RETURN NEW;
END $$;


COMMIT;
