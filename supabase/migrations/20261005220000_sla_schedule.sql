-- Database scheduler: no service key, HTTP call, browser or external recipient.
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$ DECLARE existing bigint; BEGIN
 FOR existing IN SELECT jobid FROM cron.job WHERE jobname='ikaros-vision-sla' LOOP
  PERFORM cron.unschedule(existing);
 END LOOP;
 PERFORM cron.schedule('ikaros-vision-sla','*/5 * * * *','SELECT public.sla_tick();');
END $$;
SELECT public.sla_tick();
