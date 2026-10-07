DO $$ DECLARE t text; BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
 FOREACH t IN ARRAY ARRAY['demands','onboardings','upgrades','clients','delivery_requests','case_messages','case_attachments'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',t); END IF;
 END LOOP; END IF;
END $$;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='vision-delivery-deadlines') THEN
 PERFORM cron.schedule('vision-delivery-deadlines','*/5 * * * *','SELECT public.delivery_deadline_tick();'); END IF; END IF;
END $$;
REVOKE ALL ON FUNCTION public.can_read_case(uuid,uuid),public.can_manage_case(uuid,uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.can_read_case(uuid,uuid),public.can_manage_case(uuid,uuid) TO authenticated,service_role;
