BEGIN;
ALTER TABLE public.clients ADD COLUMN sales_customer_ref text UNIQUE;
CREATE TABLE public.sales_intake_receipts(source_company_id text NOT NULL,sale_id text NOT NULL,payload_hash text NOT NULL,client_id uuid NOT NULL REFERENCES public.clients(id),onboarding_id uuid NOT NULL REFERENCES public.onboardings(id),received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(source_company_id,sale_id));
ALTER TABLE public.sales_intake_receipts ENABLE ROW LEVEL SECURITY; GRANT SELECT ON public.sales_intake_receipts TO authenticated; GRANT ALL ON public.sales_intake_receipts TO service_role;
CREATE POLICY "Admin intake audit" ON public.sales_intake_receipts FOR SELECT TO authenticated USING(public.is_admin(auth.uid()));
CREATE OR REPLACE FUNCTION public.receive_ikaros_sale(_company text,_sale text,_hash text,_customer text,_name text,_sold_at timestamptz,_contact_name text DEFAULT NULL,_email text DEFAULT NULL,_phone text DEFAULT NULL,_erp_id text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE receipt public.sales_intake_receipts; c public.clients; o public.onboardings; p record; BEGIN
 IF length(btrim(_name))<2 OR length(_customer)<1 OR length(_sale)<1 OR _sold_at IS NULL THEN RAISE EXCEPTION 'incomplete'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(_company||':'||_sale));
 SELECT * INTO receipt FROM public.sales_intake_receipts WHERE source_company_id=_company AND sale_id=_sale;
 IF receipt.sale_id IS NOT NULL THEN
  IF receipt.payload_hash<>_hash THEN RAISE EXCEPTION 'conflict: venda já recebida com outros dados'; END IF;
  RETURN jsonb_build_object('client_id',receipt.client_id,'onboarding_id',receipt.onboarding_id,'duplicate',true);
 END IF;
 -- Customer creation serializes across different sales as well.
 PERFORM pg_advisory_xact_lock(hashtext('erp-customer:'||_customer));
 IF _erp_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext('erp-tenant:'||_erp_id)); END IF;
 IF (SELECT count(*) FROM public.clients WHERE NOT is_test AND (sales_customer_ref=_company||':'||_customer OR (_erp_id IS NOT NULL AND erp_id=_erp_id)))>1 THEN RAISE EXCEPTION 'conflict: identidade comercial duplicada'; END IF;
 SELECT * INTO c FROM public.clients WHERE NOT is_test AND (sales_customer_ref=_company||':'||_customer OR (_erp_id IS NOT NULL AND erp_id=_erp_id));
 IF c.id IS NOT NULL AND c.sales_customer_ref IS NOT NULL AND c.sales_customer_ref<>_company||':'||_customer THEN RAISE EXCEPTION 'conflict: outro cadastro comercial já vinculado'; END IF;
 IF c.id IS NULL THEN
  INSERT INTO public.clients(name,empresa,erp_id,sales_customer_ref,status,owner_id,contact_name,contact_email,contact_phone,is_test) VALUES(_name,_name,_erp_id,_company||':'||_customer,'Ativo',NULL,nullif(_contact_name,''),nullif(_email,''),nullif(_phone,''),false) RETURNING * INTO c;
 ELSE UPDATE public.clients SET sales_customer_ref=_company||':'||_customer WHERE id=c.id; END IF;
 -- Each distinct acquisition is audited; an already-existing open onboarding is reused.
 SELECT * INTO o FROM public.onboardings WHERE client_id=c.id AND completed_at IS NULL ORDER BY created_at LIMIT 1 FOR UPDATE;
 IF o.id IS NULL THEN INSERT INTO public.onboardings(client_id,owner_id,title,notes,stage,current_step) VALUES(c.id,NULL,'Recepcionar e implantar · '||c.name,'Venda confirmada em '||_sold_at::text,'Não iniciado','1. Recepção e apresentação') RETURNING * INTO o; END IF;
 INSERT INTO public.sales_intake_receipts VALUES(_company,_sale,_hash,c.id,o.id,now());
 INSERT INTO public.workflow_history(entity_type,entity_id,action,details) VALUES('onboarding',o.id,'commercial_intake',jsonb_build_object('source_company',_company,'sale_id',_sale,'sale_confirmed_at',_sold_at));
 FOR p IN SELECT id FROM public.profiles WHERE active AND public.is_operator(id) LOOP
 INSERT INTO public.notifications(recipient_id,entity_type,entity_id,obligation,deadline,level,title,link) VALUES(p.id,'onboarding',o.id,'new_sale',now(),'reminder','Novo cliente para recepção · '||c.name,'/operacao?tab=crm&pipeline=onboardings&id='||o.id) ON CONFLICT DO NOTHING; END LOOP;
 RETURN jsonb_build_object('client_id',c.id,'onboarding_id',o.id,'duplicate',false);
END $$;
REVOKE ALL ON FUNCTION public.receive_ikaros_sale(text,text,text,text,text,timestamptz,text,text,text,text) FROM public,anon,authenticated; GRANT EXECUTE ON FUNCTION public.receive_ikaros_sale(text,text,text,text,text,timestamptz,text,text,text,text) TO service_role;
COMMIT;
