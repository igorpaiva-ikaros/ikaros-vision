-- Transferência de demandas entre colaboradores CS (aditiva).
-- Colaborador responsável solicita; administrador ou líder com delegação explícita decide ou transfere diretamente.
-- Só o responsável muda (version/updated_at são técnicos). Etapa, SLA, entrega e validação são preservados.

ALTER TABLE public.member_access ADD COLUMN IF NOT EXISTS manage_demand_transfers boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.member_access.manage_demand_transfers IS 'Delegação concedida só pelo administrador; vale apenas com is_lead ativo e role=cs.';

CREATE OR REPLACE FUNCTION public.has_cs_capability(_uid uuid,_cap text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_admin(_uid) OR (public.is_cs(_uid) AND EXISTS(SELECT 1 FROM member_access a WHERE a.user_id=_uid AND a.is_lead AND CASE _cap WHEN 'view_team' THEN a.view_team WHEN 'manage_cs' THEN a.manage_cs WHEN 'promote_cs' THEN a.promote_cs WHEN 'manage_demand_transfers' THEN a.manage_demand_transfers ELSE false END))
$$;

CREATE OR REPLACE FUNCTION public.can_manage_demand_transfers(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.has_cs_capability(_uid,'manage_demand_transfers')
$$;

-- Destino elegível: conta ativa com papel CS e sem papel técnico.
CREATE OR REPLACE FUNCTION public.demand_transfer_target_ok(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT _uid IS NOT NULL AND public.is_cs(_uid) AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role='technical')
$$;

CREATE OR REPLACE FUNCTION public.save_member_access(_id uuid,_access jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.member_access; hidden text[]; lead boolean; BEGIN
 IF NOT public.is_admin(auth.uid()) OR NOT public.is_cs(_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF jsonb_typeof(_access)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(_access) k WHERE k NOT IN('is_lead','view_team','manage_cs','promote_cs','manage_demand_transfers','hidden_areas')) THEN RAISE EXCEPTION 'invalid_access'; END IF;
 SELECT array_agg(value) INTO hidden FROM jsonb_array_elements_text(_access->'hidden_areas'); hidden:=coalesce(hidden,'{}');
 IF NOT hidden <@ ARRAY['crm','clients','tasks','changelog','interactions','technical'] THEN RAISE EXCEPTION 'invalid_access'; END IF;
 SELECT * INTO a FROM member_access WHERE user_id=_id;
 lead:=coalesce((_access->>'is_lead')::boolean,false);
 INSERT INTO member_access(user_id,is_lead,view_team,manage_cs,promote_cs,manage_demand_transfers,hidden_areas) VALUES(_id,lead,(_access->>'view_team')::boolean,(_access->>'manage_cs')::boolean,(_access->>'promote_cs')::boolean,
  CASE WHEN lead THEN coalesce((_access->>'manage_demand_transfers')::boolean,a.manage_demand_transfers,false) ELSE false END,hidden)
 ON CONFLICT(user_id) DO UPDATE SET is_lead=excluded.is_lead,view_team=excluded.view_team,manage_cs=excluded.manage_cs,promote_cs=excluded.promote_cs,manage_demand_transfers=excluded.manage_demand_transfers,hidden_areas=excluded.hidden_areas,updated_at=now();
 INSERT INTO workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('member',_id,'delegation',auth.uid(),jsonb_build_object('before',to_jsonb(a),'after',_access));
END $$;

-- Líder com promote_cs continua promovendo/removendo líderes, mas remover a liderança zera a delegação de transferências
-- (uma nova promoção não reativa uma concessão antiga; só o administrador concede de novo).
CREATE OR REPLACE FUNCTION public.set_cs_leader(_id uuid,_leader boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_cs_capability(auth.uid(),'promote_cs') OR _id=auth.uid() OR NOT public.is_cs(_id) OR public.is_admin(_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
 INSERT INTO member_access(user_id,is_lead) VALUES(_id,_leader) ON CONFLICT(user_id) DO UPDATE SET is_lead=_leader,manage_demand_transfers=CASE WHEN _leader THEN member_access.manage_demand_transfers ELSE false END,updated_at=now();
 INSERT INTO workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('member',_id,'leadership',auth.uid(),jsonb_build_object('is_lead',_leader));
END $$;

CREATE TABLE public.demand_transfer_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 demand_id uuid NOT NULL REFERENCES public.demands(id) ON DELETE CASCADE,
 kind text NOT NULL DEFAULT 'request' CHECK (kind IN ('request','direct')),
 status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','rejeitada','cancelada')),
 from_owner_id uuid REFERENCES public.profiles(id),
 to_owner_id uuid NOT NULL REFERENCES public.profiles(id),
 requested_by uuid NOT NULL REFERENCES public.profiles(id),
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 2000),
 decided_by uuid REFERENCES public.profiles(id),
 decided_at timestamptz,
 decision_reason text CHECK (decision_reason IS NULL OR length(decision_reason)<=2000),
 demand_version integer NOT NULL,
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT demand_transfer_distinct_owner CHECK (from_owner_id IS DISTINCT FROM to_owner_id),
 CONSTRAINT demand_transfer_decision_time CHECK ((status='pendente') = (decided_at IS NULL))
);
CREATE UNIQUE INDEX demand_transfer_one_pending ON public.demand_transfer_requests(demand_id) WHERE status='pendente';
CREATE INDEX demand_transfer_requests_status_idx ON public.demand_transfer_requests(status, created_at DESC);
GRANT SELECT ON public.demand_transfer_requests TO authenticated;
GRANT ALL ON public.demand_transfer_requests TO service_role;
ALTER TABLE public.demand_transfer_requests ENABLE ROW LEVEL SECURITY;
-- Leitura: envolvidos (solicitante, origem, destino) e quem decide. Escrita só pelas funções auditadas abaixo.
CREATE POLICY "Transfer parties and deciders read" ON public.demand_transfer_requests FOR SELECT TO authenticated USING (
 public.is_operator(auth.uid())
 AND (public.can_manage_demand_transfers(auth.uid()) OR requested_by=auth.uid() OR from_owner_id=auth.uid() OR to_owner_id=auth.uid())
 AND (public.is_admin(auth.uid()) OR public.real_operation_record('demands',demand_id))
);

-- Permite que a transferência troque o responsável mesmo durante a validação; os demais campos seguem travados.
CREATE OR REPLACE FUNCTION public.guard_delivery_closure()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN
 IF coalesce(current_setting('app.review',true),'')<>'on' AND EXISTS(SELECT 1 FROM public.delivery_requests WHERE demand_id=OLD.id AND approval_state IN('aguardando','aprovada')) AND (NEW.stage IS DISTINCT FROM OLD.stage OR (NEW.owner_id IS DISTINCT FROM OLD.owner_id AND coalesce(current_setting('app.transfer',true),'')<>'on') OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.priority IS DISTINCT FROM OLD.priority OR NEW.classification IS DISTINCT FROM OLD.classification OR NEW.impact IS DISTINCT FROM OLD.impact OR NEW.channel IS DISTINCT FROM OLD.channel OR NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description OR NEW.solution IS DISTINCT FROM OLD.solution OR NEW.tests_run IS DISTINCT FROM OLD.tests_run OR NEW.test_result IS DISTINCT FROM OLD.test_result OR NEW.context IS DISTINCT FROM OLD.context OR NEW.approval_repository_url IS DISTINCT FROM OLD.approval_repository_url OR NEW.client_informed IS DISTINCT FROM OLD.client_informed OR NEW.client_validated IS DISTINCT FROM OLD.client_validated OR NEW.completed_at IS DISTINCT FROM OLD.completed_at OR NEW.canceled_at IS DISTINCT FROM OLD.canceled_at) THEN RAISE EXCEPTION 'validation_locked: aguarde a decisão do administrador'; END IF;
 IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL AND EXISTS(SELECT 1 FROM public.delivery_requests WHERE demand_id=NEW.id AND (approval_state<>'publicada' OR (NEW.scope='client' AND NOT NEW.client_informed) OR coalesce(btrim(NEW.solution),'')='')) THEN RAISE EXCEPTION 'incomplete: confirme publicação, solução e, em atendimentos de cliente, a comunicação'; END IF;
 IF coalesce(current_setting('app.review',true),'')<>'on' AND NEW.stage IS DISTINCT FROM OLD.stage AND NEW.stage IN('Aguardando aprovação','Aguardando validação','Aprovada para publicação','Publicada','Publicada / avisar cliente') THEN RAISE EXCEPTION 'approval_required'; END IF;
 RETURN NEW; END $function$;

-- Liberar demanda (própria ou alheia) agora exige administrador ou líder com delegação; assumir demanda sem responsável segue igual.
-- Onboardings e upgrades mantêm as regras anteriores.
CREATE OR REPLACE FUNCTION public.claim_record(_kind text, _id uuid, _version integer, _release boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; next_owner uuid; uid uuid:=auth.uid(); manager boolean;
BEGIN
 IF NOT public.is_operator(uid) OR _kind NOT IN('demands','onboardings','upgrades') THEN RAISE EXCEPTION 'forbidden'; END IF;
 EXECUTE format('SELECT id,owner_id,version,stage FROM public.%I WHERE id=$1 FOR UPDATE',_kind) INTO r USING _id;
 IF r.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 IF r.version<>_version THEN RAISE EXCEPTION 'conflict'; END IF;
 IF r.stage IN('Concluída','Concluído','Cancelada','Efetivado','Perdido') THEN RAISE EXCEPTION 'closed'; END IF;
 manager := _kind='demands' AND public.can_manage_demand_transfers(uid);
 IF _kind='demands' AND _release AND NOT manager THEN RAISE EXCEPTION 'transfer_required'; END IF;
 IF r.owner_id IS NOT NULL AND r.owner_id<>uid AND NOT public.is_admin(uid) AND NOT (manager AND _release) THEN RAISE EXCEPTION 'already_assigned'; END IF;
 IF _kind='demands' AND r.owner_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.demand_transfer_requests WHERE demand_id=_id AND status='pendente') THEN RAISE EXCEPTION 'transfer_pending'; END IF;
 IF NOT _release AND NOT public.is_cs(uid) THEN RAISE EXCEPTION 'incomplete: selecione uma conta de CS para assumir'; END IF;
 next_owner:=CASE WHEN _release THEN NULL ELSE uid END;
 PERFORM set_config('app.assignment','on',true);
 EXECUTE format('UPDATE public.%I SET owner_id=$1 WHERE id=$2',_kind) USING next_owner,_id;
 PERFORM set_config('app.assignment','off',true);
 INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,from_value,to_value) VALUES(_kind,_id,CASE WHEN _release THEN 'release' ELSE 'claim' END,uid,r.owner_id::text,next_owner::text);
 RETURN jsonb_build_object('id',_id,'owner_id',next_owner);
END $function$;

-- Interno: troca somente o responsável. Não exposto à API.
CREATE OR REPLACE FUNCTION public.apply_demand_owner_transfer(_demand uuid,_to uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v integer; BEGIN
 PERFORM set_config('app.assignment','on',true);
 PERFORM set_config('app.transfer','on',true);
 UPDATE public.demands SET owner_id=_to WHERE id=_demand RETURNING version INTO v;
 PERFORM set_config('app.transfer','off',true);
 PERFORM set_config('app.assignment','off',true);
 RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.notify_demand_transfer(_demand uuid,_recipients uuid[],_obligation text,_title text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p uuid; BEGIN
 FOR p IN SELECT DISTINCT x FROM unnest(_recipients) x WHERE x IS NOT NULL AND x IS DISTINCT FROM auth.uid() AND public.is_operator(x) LOOP
  INSERT INTO public.notifications(recipient_id,entity_type,entity_id,obligation,deadline,level,title,link)
  VALUES(p,'demand',_demand,_obligation,clock_timestamp(),'reminder',_title,'/operacao?tab=crm&pipeline=demands&id='||_demand) ON CONFLICT DO NOTHING;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.demand_transfer_deciders() RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(array_agg(id),'{}') FROM public.profiles WHERE active AND public.can_manage_demand_transfers(id)
$$;

CREATE OR REPLACE FUNCTION public.demand_transfer_targets() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_operator(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name) ORDER BY p.full_name),'[]'::jsonb) FROM public.profiles p WHERE public.demand_transfer_target_ok(p.id));
END $$;

CREATE OR REPLACE FUNCTION public.request_demand_transfer(_demand uuid,_version integer,_to uuid,_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); d record; r public.demand_transfer_requests; BEGIN
 IF NOT public.is_cs(uid) THEN RAISE EXCEPTION 'transfer_forbidden'; END IF;
 SELECT id,owner_id,version,stage,completed_at,canceled_at,code INTO d FROM public.demands WHERE id=_demand FOR UPDATE;
 IF d.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 IF NOT public.is_admin(uid) AND NOT public.real_operation_record('demands',_demand) THEN RAISE EXCEPTION 'transfer_forbidden'; END IF;
 IF d.owner_id IS DISTINCT FROM uid THEN RAISE EXCEPTION 'transfer_not_owner'; END IF;
 IF d.version<>_version THEN RAISE EXCEPTION 'conflict'; END IF;
 IF d.stage IN('Concluída','Cancelada') OR d.completed_at IS NOT NULL OR d.canceled_at IS NOT NULL THEN RAISE EXCEPTION 'closed'; END IF;
 IF length(btrim(coalesce(_reason,'')))<5 THEN RAISE EXCEPTION 'transfer_reason_required'; END IF;
 IF _to=uid THEN RAISE EXCEPTION 'transfer_same_owner'; END IF;
 IF NOT public.demand_transfer_target_ok(_to) THEN RAISE EXCEPTION 'transfer_target_invalid'; END IF;
 IF EXISTS(SELECT 1 FROM public.demand_transfer_requests WHERE demand_id=_demand AND status='pendente') THEN RAISE EXCEPTION 'transfer_pending'; END IF;
 INSERT INTO public.demand_transfer_requests(demand_id,kind,status,from_owner_id,to_owner_id,requested_by,reason,demand_version)
 VALUES(_demand,'request','pendente',uid,_to,uid,btrim(_reason),d.version) RETURNING * INTO r;
 INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,from_value,to_value,details)
 VALUES('demands',_demand,'transfer_requested',uid,(SELECT full_name FROM profiles WHERE id=uid),(SELECT full_name FROM profiles WHERE id=_to),jsonb_build_object('request_id',r.id,'from_owner_id',uid,'to_owner_id',_to,'reason',r.reason));
 PERFORM public.notify_demand_transfer(_demand,public.demand_transfer_deciders(),'transfer_request','Transferência solicitada · '||d.code);
 RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_demand_transfer(_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); did uuid; r public.demand_transfer_requests; BEGIN
 IF NOT public.is_operator(uid) THEN RAISE EXCEPTION 'transfer_forbidden'; END IF;
 SELECT demand_id INTO did FROM public.demand_transfer_requests WHERE id=_request;
 IF did IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 PERFORM 1 FROM public.demands WHERE id=did FOR UPDATE;
 SELECT * INTO r FROM public.demand_transfer_requests WHERE id=_request FOR UPDATE;
 IF r.requested_by<>uid THEN RAISE EXCEPTION 'transfer_forbidden'; END IF;
 IF r.status<>'pendente' THEN RAISE EXCEPTION 'transfer_not_pending'; END IF;
 UPDATE public.demand_transfer_requests SET status='cancelada',decided_by=uid,decided_at=now(),version=version+1,updated_at=now() WHERE id=_request RETURNING * INTO r;
 INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('demands',did,'transfer_canceled',uid,jsonb_build_object('request_id',r.id,'to_owner_id',r.to_owner_id));
 UPDATE public.notifications SET superseded_at=now() WHERE entity_type='demand' AND entity_id=did AND obligation='transfer_request' AND superseded_at IS NULL;
 RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.decide_demand_transfer(_request uuid,_approve boolean,_version integer,_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); did uuid; d record; r public.demand_transfer_requests; v integer; BEGIN
 IF NOT public.can_manage_demand_transfers(uid) THEN RAISE EXCEPTION 'transfer_forbidden'; END IF;
 SELECT demand_id INTO did FROM public.demand_transfer_requests WHERE id=_request;
 IF did IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 SELECT id,owner_id,version,stage,completed_at,canceled_at,code INTO d FROM public.demands WHERE id=did FOR UPDATE;
 SELECT * INTO r FROM public.demand_transfer_requests WHERE id=_request FOR UPDATE;
 IF r.status<>'pendente' THEN RAISE EXCEPTION 'transfer_not_pending'; END IF;
 IF NOT public.is_admin(uid) AND NOT public.real_operation_record('demands',did) THEN RAISE EXCEPTION 'transfer_forbidden'; END IF;
 IF r.requested_by=uid AND NOT public.is_admin(uid) THEN RAISE EXCEPTION 'transfer_self_decision'; END IF;
 IF NOT _approve THEN
  IF length(btrim(coalesce(_reason,'')))<5 THEN RAISE EXCEPTION 'transfer_reason_required'; END IF;
  UPDATE public.demand_transfer_requests SET status='rejeitada',decided_by=uid,decided_at=now(),decision_reason=btrim(_reason),version=version+1,updated_at=now() WHERE id=_request RETURNING * INTO r;
  INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('demands',did,'transfer_rejected',uid,jsonb_build_object('request_id',r.id,'requested_by',r.requested_by,'to_owner_id',r.to_owner_id,'reason',r.reason,'decision_reason',r.decision_reason));
  UPDATE public.notifications SET superseded_at=now() WHERE entity_type='demand' AND entity_id=did AND obligation='transfer_request' AND superseded_at IS NULL;
  PERFORM public.notify_demand_transfer(did,ARRAY[r.requested_by],'transfer_decision','Transferência recusada · '||d.code);
  RETURN jsonb_build_object('request',to_jsonb(r),'demand_version',d.version);
 END IF;
 IF d.version<>_version THEN RAISE EXCEPTION 'conflict'; END IF;
 IF d.stage IN('Concluída','Cancelada') OR d.completed_at IS NOT NULL OR d.canceled_at IS NOT NULL THEN RAISE EXCEPTION 'closed'; END IF;
 IF d.owner_id IS DISTINCT FROM r.from_owner_id THEN RAISE EXCEPTION 'transfer_owner_changed'; END IF;
 IF NOT public.demand_transfer_target_ok(r.to_owner_id) THEN RAISE EXCEPTION 'transfer_target_invalid'; END IF;
 v:=public.apply_demand_owner_transfer(did,r.to_owner_id);
 UPDATE public.demand_transfer_requests SET status='aprovada',decided_by=uid,decided_at=now(),decision_reason=nullif(btrim(coalesce(_reason,'')),''),version=version+1,updated_at=now() WHERE id=_request RETURNING * INTO r;
 INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,from_value,to_value,details)
 VALUES('demands',did,'transfer_approved',uid,(SELECT full_name FROM profiles WHERE id=r.from_owner_id),(SELECT full_name FROM profiles WHERE id=r.to_owner_id),jsonb_build_object('request_id',r.id,'requested_by',r.requested_by,'from_owner_id',r.from_owner_id,'to_owner_id',r.to_owner_id,'reason',r.reason,'decision_reason',r.decision_reason));
 UPDATE public.notifications SET superseded_at=now() WHERE entity_type='demand' AND entity_id=did AND obligation='transfer_request' AND superseded_at IS NULL;
 PERFORM public.notify_demand_transfer(did,ARRAY[r.requested_by,r.to_owner_id],'transfer_decision','Transferência aprovada · '||d.code);
 RETURN jsonb_build_object('request',to_jsonb(r),'demand_version',v);
END $$;

CREATE OR REPLACE FUNCTION public.transfer_demand(_demand uuid,_version integer,_to uuid,_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); d record; r public.demand_transfer_requests; v integer; BEGIN
 IF NOT public.can_manage_demand_transfers(uid) THEN RAISE EXCEPTION 'transfer_forbidden'; END IF;
 SELECT id,owner_id,version,stage,completed_at,canceled_at,code INTO d FROM public.demands WHERE id=_demand FOR UPDATE;
 IF d.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 IF NOT public.is_admin(uid) AND NOT public.real_operation_record('demands',_demand) THEN RAISE EXCEPTION 'transfer_forbidden'; END IF;
 IF d.version<>_version THEN RAISE EXCEPTION 'conflict'; END IF;
 IF d.stage IN('Concluída','Cancelada') OR d.completed_at IS NOT NULL OR d.canceled_at IS NOT NULL THEN RAISE EXCEPTION 'closed'; END IF;
 IF length(btrim(coalesce(_reason,'')))<5 THEN RAISE EXCEPTION 'transfer_reason_required'; END IF;
 IF _to IS NOT DISTINCT FROM d.owner_id THEN RAISE EXCEPTION 'transfer_same_owner'; END IF;
 IF NOT public.demand_transfer_target_ok(_to) THEN RAISE EXCEPTION 'transfer_target_invalid'; END IF;
 IF EXISTS(SELECT 1 FROM public.demand_transfer_requests WHERE demand_id=_demand AND status='pendente') THEN RAISE EXCEPTION 'transfer_pending'; END IF;
 v:=public.apply_demand_owner_transfer(_demand,_to);
 INSERT INTO public.demand_transfer_requests(demand_id,kind,status,from_owner_id,to_owner_id,requested_by,reason,decided_by,decided_at,demand_version)
 VALUES(_demand,'direct','aprovada',d.owner_id,_to,uid,btrim(_reason),uid,now(),d.version) RETURNING * INTO r;
 INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,from_value,to_value,details)
 VALUES('demands',_demand,'transfer_direct',uid,(SELECT full_name FROM profiles WHERE id=d.owner_id),(SELECT full_name FROM profiles WHERE id=_to),jsonb_build_object('request_id',r.id,'from_owner_id',d.owner_id,'to_owner_id',_to,'reason',r.reason));
 PERFORM public.notify_demand_transfer(_demand,ARRAY[d.owner_id,_to],'transfer_decision','Demanda transferida · '||d.code);
 RETURN jsonb_build_object('request',to_jsonb(r),'demand_version',v);
END $$;

REVOKE ALL ON FUNCTION public.apply_demand_owner_transfer(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_demand_transfer(uuid,uuid[],text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demand_transfer_deciders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demand_transfer_target_ok(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_demand_transfers(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.demand_transfer_targets() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_demand_transfer(uuid,integer,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_demand_transfer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_demand_transfer(uuid,boolean,integer,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transfer_demand(uuid,integer,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_demand_owner_transfer(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_demand_transfer(uuid,uuid[],text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.demand_transfer_deciders() TO service_role;
GRANT EXECUTE ON FUNCTION public.demand_transfer_target_ok(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_demand_transfers(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.demand_transfer_targets() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_demand_transfer(uuid,integer,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_demand_transfer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decide_demand_transfer(uuid,boolean,integer,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_demand(uuid,integer,uuid,text) TO authenticated, service_role;
