-- Conclusão pelo CS com confirmação do cliente.
-- O responsável pela demanda (ou o administrador) conclui a demanda quando o cliente confirma que está
-- funcionando, mesmo que a entrega ainda esteja na fila de validação ou sem publicação registrada.
-- Exige a solução aplicada e o registro de como o cliente confirmou. A solicitação de entrega pendente
-- passa ao estado 'confirmada_cliente' (sai da fila de aprovações e da equipe técnica), o histórico
-- registra a confirmação e o estado anterior, e o administrador recebe aviso.
-- Demandas internas (scope = system) continuam encerrando por Concluir demanda.
BEGIN;

ALTER TABLE public.delivery_requests DROP CONSTRAINT IF EXISTS delivery_requests_approval_state_check;
ALTER TABLE public.delivery_requests ADD CONSTRAINT delivery_requests_approval_state_check
 CHECK(approval_state IN('não solicitado','aguardando','aprovada','rejeitada','publicada','confirmada_cliente'));

-- Mesma função da drizzle/migrations/0003_demand_transfers.sql; a conclusão aceita também 'confirmada_cliente'.
CREATE OR REPLACE FUNCTION public.guard_delivery_closure()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN
 IF coalesce(current_setting('app.review',true),'')<>'on' AND EXISTS(SELECT 1 FROM public.delivery_requests WHERE demand_id=OLD.id AND approval_state IN('aguardando','aprovada')) AND (NEW.stage IS DISTINCT FROM OLD.stage OR (NEW.owner_id IS DISTINCT FROM OLD.owner_id AND coalesce(current_setting('app.transfer',true),'')<>'on') OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.priority IS DISTINCT FROM OLD.priority OR NEW.classification IS DISTINCT FROM OLD.classification OR NEW.impact IS DISTINCT FROM OLD.impact OR NEW.channel IS DISTINCT FROM OLD.channel OR NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description OR NEW.solution IS DISTINCT FROM OLD.solution OR NEW.tests_run IS DISTINCT FROM OLD.tests_run OR NEW.test_result IS DISTINCT FROM OLD.test_result OR NEW.context IS DISTINCT FROM OLD.context OR NEW.approval_repository_url IS DISTINCT FROM OLD.approval_repository_url OR NEW.client_informed IS DISTINCT FROM OLD.client_informed OR NEW.client_validated IS DISTINCT FROM OLD.client_validated OR NEW.completed_at IS DISTINCT FROM OLD.completed_at OR NEW.canceled_at IS DISTINCT FROM OLD.canceled_at) THEN RAISE EXCEPTION 'validation_locked: aguarde a decisão do administrador'; END IF;
 IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL AND EXISTS(SELECT 1 FROM public.delivery_requests WHERE demand_id=NEW.id AND (approval_state NOT IN('publicada','confirmada_cliente') OR (NEW.scope='client' AND NOT NEW.client_informed) OR coalesce(btrim(NEW.solution),'')='')) THEN RAISE EXCEPTION 'incomplete: confirme publicação, solução e, em atendimentos de cliente, a comunicação'; END IF;
 IF coalesce(current_setting('app.review',true),'')<>'on' AND NEW.stage IS DISTINCT FROM OLD.stage AND NEW.stage IN('Aguardando aprovação','Aguardando validação','Aprovada para publicação','Publicada','Publicada / avisar cliente') THEN RAISE EXCEPTION 'approval_required'; END IF;
 RETURN NEW; END $function$;

CREATE FUNCTION public.complete_demand_confirmed(_id uuid,_version int,_solution text,_confirmation text) RETURNS public.demands LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); d public.demands; r public.delivery_requests; old_stage text;
 sol text:=btrim(coalesce(_solution,'')); conf text:=btrim(coalesce(_confirmation,'')); pending boolean;
BEGIN
 IF uid IS NULL OR NOT public.is_operator(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO d FROM public.demands WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR (NOT public.is_admin(uid) AND d.owner_id IS DISTINCT FROM uid) THEN RAISE EXCEPTION 'not_found'; END IF;
 IF d.version<>_version THEN RAISE EXCEPTION 'conflict: a demanda foi alterada por outra pessoa; recarregue'; END IF;
 IF d.completed_at IS NOT NULL THEN RETURN d; END IF;
 IF d.canceled_at IS NOT NULL THEN RAISE EXCEPTION 'closed: demanda encerrada'; END IF;
 IF d.scope='system' THEN RAISE EXCEPTION 'incomplete: demandas internas do sistema são concluídas por Concluir demanda'; END IF;
 IF length(sol)<2 THEN RAISE EXCEPTION 'incomplete: informe a solução aplicada'; END IF;
 IF length(conf)<5 THEN RAISE EXCEPTION 'incomplete: informe como o cliente confirmou que está funcionando'; END IF;
 old_stage:=d.stage;
 SELECT * INTO r FROM public.delivery_requests WHERE demand_id=_id FOR UPDATE;
 pending:=r.id IS NOT NULL AND r.approval_state<>'publicada';
 PERFORM set_config('app.review','on',true); PERFORM set_config('app.transition','on',true);
 IF pending THEN
  UPDATE public.delivery_requests SET approval_state='confirmada_cliente',version=version+1,updated_at=now() WHERE id=r.id;
 END IF;
 UPDATE public.demands SET solution=left(sol,10000),client_informed=true,client_validated=true,
  validated_at=coalesce(validated_at,now()),completed_at=now(),stage='Concluída'
 WHERE id=_id RETURNING * INTO d;
 PERFORM set_config('app.transition','off',true); PERFORM set_config('app.review','off',true);
 INSERT INTO public.workflow_history(entity_type,entity_id,action,from_value,to_value,actor_id,details)
 VALUES('demand',_id,'complete',old_stage,d.stage,uid,jsonb_build_object('client_confirmation',left(conf,2000),'approval_state_before',r.approval_state));
 -- Aviso aos administradores (e à equipe técnica do caso), sem avisar quem concluiu.
 IF pending THEN
  INSERT INTO public.notifications(recipient_id,entity_type,entity_id,obligation,deadline,level,title,link)
  SELECT p.id,'demand',_id,'delivery_event',clock_timestamp(),'reminder','Concluída com confirmação do cliente, sem publicação registrada · '||d.code,
   CASE WHEN public.is_technical(p.id) THEN '/tecnico' ELSE '/operacao?tab=crm&pipeline=demands&id='||_id END
  FROM public.profiles p
  WHERE p.active AND p.id<>uid AND (public.is_admin(p.id) OR (r.technical AND public.is_technical(p.id) AND public.can_read_case(_id,p.id)))
  ON CONFLICT DO NOTHING;
 END IF;
 RETURN d;
END $$;
REVOKE ALL ON FUNCTION public.complete_demand_confirmed(uuid,int,text,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.complete_demand_confirmed(uuid,int,text,text) TO authenticated;

COMMIT;
