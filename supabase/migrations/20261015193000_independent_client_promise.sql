-- Independent corporate SLA and client delivery commitments; no policy values changed.
BEGIN;
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS promise_reason text;
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS promise_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS promise_aligned_at timestamptz;
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS original_promise_due timestamptz;
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS promise_revision integer NOT NULL DEFAULT 1;
CREATE OR REPLACE FUNCTION public.guard_delivery_promise() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE changed boolean; BEGIN
 changed := CASE WHEN TG_OP='INSERT' THEN NEW.due_date IS NOT NULL ELSE NEW.due_date IS DISTINCT FROM OLD.due_date END;
 IF TG_OP='UPDATE' THEN
  NEW.promise_aligned_at:=OLD.promise_aligned_at; NEW.original_promise_due:=OLD.original_promise_due; NEW.promise_revision:=OLD.promise_revision;
 END IF;
 IF changed THEN
  IF TG_OP='UPDATE' AND (OLD.completed_at IS NOT NULL OR OLD.canceled_at IS NOT NULL) THEN RAISE EXCEPTION 'closed: o prazo de uma demanda encerrada é preservado'; END IF;
  IF auth.uid() IS NOT NULL AND NEW.due_date IS NOT NULL AND (NOT NEW.promise_confirmed OR NEW.due_date<=now()) THEN RAISE EXCEPTION 'incomplete: confirme o alinhamento com o cliente e informe uma data futura'; END IF;
  IF TG_OP='UPDATE' AND OLD.due_date IS NOT NULL AND length(btrim(coalesce(NEW.promise_reason,'')))<5 THEN RAISE EXCEPTION 'incomplete: justifique a alteração do prazo combinado'; END IF;
  NEW.promise_aligned_at:=now();
  IF TG_OP='INSERT' THEN NEW.original_promise_due:=NEW.due_date; ELSE NEW.original_promise_due:=coalesce(OLD.original_promise_due,OLD.due_date,NEW.due_date); NEW.promise_revision:=OLD.promise_revision+1; END IF;
  INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('demand',NEW.id,'delivery_promise',auth.uid(),jsonb_build_object('before',CASE WHEN TG_OP='UPDATE' THEN OLD.due_date ELSE NULL END,'after',NEW.due_date,'reason',NEW.promise_reason,'revision',NEW.promise_revision));
  UPDATE public.notifications SET superseded_at=now() WHERE entity_type='demand' AND entity_id=NEW.id AND obligation='client_promise' AND superseded_at IS NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_promise BEFORE INSERT OR UPDATE ON public.demands FOR EACH ROW EXECUTE FUNCTION public.guard_delivery_promise();
CREATE OR REPLACE VIEW public.demand_sla WITH (security_invoker = true) AS
SELECT d.id, d.owner_id, d.client_id, d.is_test,
  public.policy_sla_state(d.first_response_at,d.first_response_due,d.completed_at IS NOT NULL OR d.canceled_at IS NOT NULL,d.classification,'first_response') AS first_response_state,
  public.policy_sla_state(least(d.forwarded_at,d.completed_at),d.resolution_due,d.completed_at IS NOT NULL OR d.canceled_at IS NOT NULL,d.classification,'resolution_or_forward') AS resolution_state,
  public.policy_sla_state(d.completed_at,d.policy_delivery_due,d.completed_at IS NOT NULL OR d.canceled_at IS NOT NULL,d.classification,'delivery') AS delivery_state,
  d.first_response_due, d.resolution_due,d.policy_delivery_due AS delivery_due,
  public.sla_state(d.completed_at,d.due_date,d.completed_at IS NOT NULL OR d.canceled_at IS NOT NULL) AS promise_state,
  d.due_date AS promise_due,
  public.sla_state(d.completed_at,d.original_promise_due,d.completed_at IS NOT NULL OR d.canceled_at IS NOT NULL) AS original_promise_state
FROM public.demands d WHERE d.canceled_at IS NULL;

CREATE OR REPLACE FUNCTION public.sla_tick() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int := 0; c int;
BEGIN
  WITH pending AS (
    SELECT d.id, d.owner_id, 'first_response'::text AS obligation, d.first_response_due AS due, d.code || ' — ' || d.title AS title,d.classification,coalesce((SELECT version FROM public.sla_policies WHERE category=d.classification),1) AS rule_version
      FROM public.demands d JOIN public.clients cl ON cl.id=d.client_id WHERE NOT d.is_test AND NOT cl.is_test AND d.first_response_at IS NULL AND d.completed_at IS NULL AND d.canceled_at IS NULL AND d.first_response_due IS NOT NULL
    UNION ALL
    SELECT d.id, d.owner_id, 'resolution_or_forward', d.resolution_due, d.code || ' — ' || d.title,d.classification,coalesce((SELECT version FROM public.sla_policies WHERE category=d.classification),1)
      FROM public.demands d JOIN public.clients cl ON cl.id=d.client_id WHERE NOT d.is_test AND NOT cl.is_test AND d.forwarded_at IS NULL AND d.completed_at IS NULL AND d.canceled_at IS NULL AND d.resolution_due IS NOT NULL
    UNION ALL
    SELECT d.id,d.owner_id,'delivery',d.policy_delivery_due,d.code||' — '||d.title,d.classification,coalesce((SELECT version FROM public.sla_policies WHERE category=d.classification),1) FROM public.demands d JOIN public.clients cl ON cl.id=d.client_id WHERE NOT d.is_test AND NOT cl.is_test AND d.completed_at IS NULL AND d.canceled_at IS NULL AND d.policy_delivery_due IS NOT NULL
    UNION ALL
    SELECT d.id,d.owner_id,'client_promise',d.due_date,d.code||' — '||d.title,d.classification,d.promise_revision FROM public.demands d JOIN public.clients cl ON cl.id=d.client_id WHERE NOT d.is_test AND NOT cl.is_test AND d.completed_at IS NULL AND d.canceled_at IS NULL AND d.due_date IS NOT NULL

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
    CASE WHEN obligation='client_promise' THEN 'Prazo combinado com cliente: ' ELSE 'SLA da empresa: ' END || CASE WHEN level='overdue' THEN 'atrasado · ' ELSE 'em risco · ' END || title, '/operacao?tab=crm&pipeline=demands&id=' || id,rule_version
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
CREATE OR REPLACE FUNCTION public.save_sla_policy(_category text,_version int,_rules jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE oldp public.sla_policies;p public.sla_policies;n int;missing int;
BEGIN
 IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO oldp FROM public.sla_policies WHERE category=_category FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
 IF oldp.version<>_version THEN RAISE EXCEPTION 'conflict: recarregue as regras'; END IF;
 p:=jsonb_populate_record(oldp,_rules);
 IF p.category IS DISTINCT FROM oldp.category OR p.version<>oldp.version OR p.updated_at IS DISTINCT FROM oldp.updated_at THEN RAISE EXCEPTION 'invalid_rules'; END IF;
 IF (_rules - ARRAY['response_value','response_unit','response_basis','resolution_value','resolution_unit','resolution_basis','delivery_value','delivery_unit','delivery_basis'])<>'{}'::jsonb THEN RAISE EXCEPTION 'invalid_rules'; END IF;
 IF to_jsonb(p)=to_jsonb(oldp) THEN RETURN jsonb_build_object('changed',false,'recalculated',0); END IF;
 UPDATE public.sla_policies SET response_value=p.response_value,response_unit=p.response_unit,response_basis=p.response_basis,resolution_value=p.resolution_value,resolution_unit=p.resolution_unit,resolution_basis=p.resolution_basis,delivery_value=p.delivery_value,delivery_unit=p.delivery_unit,delivery_basis=p.delivery_basis,version=version+1,updated_at=now() WHERE category=_category;
 SELECT count(*) INTO missing FROM public.demands WHERE classification=_category AND completed_at IS NULL AND canceled_at IS NULL AND received_at IS NULL;
 UPDATE public.demands SET classification=classification WHERE classification=_category AND completed_at IS NULL AND canceled_at IS NULL AND received_at IS NOT NULL;
 GET DIAGNOSTICS n=ROW_COUNT;
 UPDATE public.notifications SET superseded_at=now() WHERE entity_type='demand' AND obligation IN('first_response','resolution_or_forward','delivery') AND superseded_at IS NULL AND (deadline IS DISTINCT FROM (SELECT CASE notifications.obligation WHEN 'first_response' THEN d.first_response_due WHEN 'resolution_or_forward' THEN d.resolution_due ELSE d.policy_delivery_due END FROM public.demands d WHERE d.id=notifications.entity_id) OR rule_version <> (SELECT version FROM public.sla_policies WHERE category=_category)) AND entity_id IN(SELECT id FROM public.demands WHERE classification=_category AND completed_at IS NULL AND canceled_at IS NULL AND received_at IS NOT NULL);
 INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('sla_policy',gen_random_uuid(),'configure',auth.uid(),jsonb_build_object('category',_category,'before',to_jsonb(oldp),'after',to_jsonb(p),'recalculated',n));
 IF public.sla_tick()<0 THEN RAISE EXCEPTION 'sla_recalculation_failed'; END IF;
 RETURN jsonb_build_object('changed',true,'recalculated',n,'missingStart',missing);
END $$;
REVOKE ALL ON FUNCTION public.save_sla_policy(text,int,jsonb) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.save_sla_policy(text,int,jsonb) TO authenticated;

-- Retire only obsolete corporate delivery alerts, keeping review and technical events.
UPDATE public.notifications n SET superseded_at=now() FROM public.demands d WHERE n.entity_id=d.id AND n.entity_type='demand' AND n.obligation='delivery' AND n.superseded_at IS NULL AND n.deadline IS DISTINCT FROM d.policy_delivery_due;
COMMIT;
