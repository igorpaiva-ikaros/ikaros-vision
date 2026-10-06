-- Optional private group link; name-only registrations do not invent contact or plan.
ALTER TABLE public.clients ADD COLUMN whatsapp_group_url text;
ALTER TABLE public.clients ADD CONSTRAINT clients_whatsapp_group_valid CHECK(whatsapp_group_url IS NULL OR whatsapp_group_url='' OR whatsapp_group_url ~ '^https://chat[.]whatsapp[.]com/[A-Za-z0-9_-]{10,100}/?([?#].*)?$' AND length(whatsapp_group_url)<=500);
CREATE UNIQUE INDEX clients_erp_id_unique ON public.clients(erp_id) WHERE erp_id IS NOT NULL AND erp_id<>'' AND NOT is_test;
CREATE OR REPLACE FUNCTION public.guard_client_product() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products; changed boolean;
BEGIN
 IF coalesce(current_setting('app.import',true),'')='on' THEN RETURN NEW; END IF;
 changed:=TG_OP='INSERT';
 IF TG_OP='UPDATE' THEN changed:=NEW.product_id IS DISTINCT FROM OLD.product_id; END IF;
 IF changed AND NEW.product_id IS NOT NULL THEN
  SELECT * INTO p FROM public.products WHERE id=NEW.product_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'inactive_product: selecione um plano ativo'; END IF;
  NEW.plan:=p.name;
 ELSIF auth.uid() IS NOT NULL THEN
  IF TG_OP='INSERT' THEN
   IF coalesce(NEW.plan,'')<>'' THEN RAISE EXCEPTION 'catalog_required: selecione um plano do catálogo'; END IF;
   NEW.plan:=NULL;
  ELSE
   IF changed THEN RAISE EXCEPTION 'catalog_required: selecione um plano do catálogo'; END IF;
   IF NEW.plan IS DISTINCT FROM OLD.plan THEN RAISE EXCEPTION 'catalog_required: selecione um plano do catálogo'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
