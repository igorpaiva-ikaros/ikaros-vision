
-- ===== Business-time (SLA) helpers: Mon–Fri 09–18 America/Sao_Paulo, national holidays + Good Friday
CREATE OR REPLACE FUNCTION public.sla_easter(y int) RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mo int; dy int;
BEGIN
  a := y % 19; b := y / 100; c := y % 100; d := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
  h := (19*a + b - d - g + 15) % 30; i := c / 4; k := c % 4; l := (32 + 2*e + 2*i - h - k) % 7;
  m := (a + 11*h + 22*l) / 451; mo := (h + l - 7*m + 114) / 31; dy := ((h + l - 7*m + 114) % 31) + 1;
  RETURN make_date(y, mo, dy);
END $$;

CREATE OR REPLACE FUNCTION public.sla_is_workday(d date) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT extract(isodow from d) < 6
     AND to_char(d, 'MM-DD') NOT IN ('01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25')
     AND d <> public.sla_easter(extract(year from d)::int) - 2
$$;

CREATE OR REPLACE FUNCTION public.sla_next_workday(d date) RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE x date := d + 1; BEGIN WHILE NOT public.sla_is_workday(x) LOOP x := x + 1; END LOOP; RETURN x; END $$;

CREATE OR REPLACE FUNCTION public.sla_prev_workday(d date) RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE x date := d - 1; BEGIN WHILE NOT public.sla_is_workday(x) LOOP x := x - 1; END LOOP; RETURN x; END $$;

CREATE OR REPLACE FUNCTION public.sla_normalize(ts timestamptz) RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE l timestamp := ts AT TIME ZONE 'America/Sao_Paulo'; d date := l::date;
BEGIN
  IF ts IS NULL THEN RETURN NULL; END IF;
  IF public.sla_is_workday(d) AND l::time < time '18:00' THEN
    IF l::time < time '09:00' THEN RETURN (d + time '09:00') AT TIME ZONE 'America/Sao_Paulo'; END IF;
    RETURN ts;
  END IF;
  RETURN (public.sla_next_workday(d) + time '09:00') AT TIME ZONE 'America/Sao_Paulo';
END $$;

CREATE OR REPLACE FUNCTION public.sla_add_business_minutes(ts timestamptz, mins int) RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE l timestamp; d date; lft numeric; rem numeric := mins*60;
BEGIN
  IF ts IS NULL THEN RETURN NULL; END IF;
  IF mins<0 OR mins>5256000 THEN RAISE EXCEPTION 'invalid_minutes'; END IF;
  l := public.sla_normalize(ts) AT TIME ZONE 'America/Sao_Paulo'; d := l::date;
  LOOP
    lft := extract(epoch from ((d + time '18:00') - l));
    IF rem <= lft THEN RETURN (l + make_interval(secs => rem::double precision)) AT TIME ZONE 'America/Sao_Paulo'; END IF;
    rem := rem - lft; d := public.sla_next_workday(d); l := d + time '09:00';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.sla_sub_business_minutes(ts timestamptz, mins int) RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE l timestamp; d date; since numeric; rem numeric := mins*60;
BEGIN
  IF ts IS NULL THEN RETURN NULL; END IF;
  IF mins<0 OR mins>5256000 THEN RAISE EXCEPTION 'invalid_minutes'; END IF;
  l := ts AT TIME ZONE 'America/Sao_Paulo'; d := l::date;
  IF NOT public.sla_is_workday(d) OR l::time > time '18:00' THEN
    IF NOT public.sla_is_workday(d) THEN d := public.sla_prev_workday(d); END IF;
    l := d + time '18:00';
  END IF;
  LOOP
    since := greatest(0, extract(epoch from (l - (d + time '09:00'))));
    IF rem <= since THEN RETURN (l - make_interval(secs => rem::double precision)) AT TIME ZONE 'America/Sao_Paulo'; END IF;
    rem := rem - since; d := public.sla_prev_workday(d); l := d + time '18:00';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.sla_next_business_day(ts timestamptz) RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE s timestamp;
BEGIN
  IF ts IS NULL THEN RETURN NULL; END IF;
  s := public.sla_normalize(ts) AT TIME ZONE 'America/Sao_Paulo';
  RETURN (public.sla_next_workday(s::date) + s::time) AT TIME ZONE 'America/Sao_Paulo';
END $$;

CREATE OR REPLACE FUNCTION public.sla_onboarding_due(ts timestamptz, n int) RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE d date; i int := 0;
BEGIN
  IF ts IS NULL THEN RETURN NULL; END IF;
  d := (public.sla_normalize(ts) AT TIME ZONE 'America/Sao_Paulo')::date;
  WHILE i < n LOOP d := public.sla_next_workday(d); i := i + 1; END LOOP;
  RETURN (d + time '18:00') AT TIME ZONE 'America/Sao_Paulo';
END $$;

-- ===== Settings
CREATE TABLE public.app_settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.app_settings(key, value) VALUES ('sla_risk_minutes', '60'::jsonb);
CREATE OR REPLACE FUNCTION public.sla_risk_minutes() RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT (value)::text::int FROM public.app_settings WHERE key = 'sla_risk_minutes'), 60)
$$;

-- ===== Profiles & access
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  commission_eligible boolean NOT NULL DEFAULT false,
  notion_user_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_active_user(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT exists (SELECT 1 FROM public.profiles WHERE id = _uid AND active)
$$;
CREATE OR REPLACE FUNCTION public.is_admin(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_active_user(_uid) AND exists (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'admin')
$$;
CREATE OR REPLACE FUNCTION public.is_cs(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_active_user(_uid) AND exists (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'cs')
$$;
CREATE OR REPLACE FUNCTION public.is_operator(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(_uid) OR public.is_cs(_uid)
$$;
-- BI is global/admin-level; deactivated accounts lose access even with an old session.
CREATE OR REPLACE FUNCTION public.is_internal(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(_user_id)
$$;

CREATE POLICY "Read own or admin profiles" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Operators read settings" ON public.app_settings FOR SELECT TO authenticated USING (public.is_operator(auth.uid()));
CREATE POLICY "Admins read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- Last active admin protection
CREATE OR REPLACE FUNCTION public.guard_last_admin() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id WHERE r.role = 'admin' AND p.active) = 0 THEN
    RAISE EXCEPTION 'last_admin: é necessário manter ao menos um administrador ativo';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_last_admin_roles AFTER DELETE OR UPDATE ON public.user_roles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_last_admin();
CREATE CONSTRAINT TRIGGER trg_last_admin_profiles AFTER UPDATE OF active ON public.profiles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_last_admin();

-- ===== Codes
CREATE SEQUENCE public.cli_code_seq; CREATE SEQUENCE public.dem_code_seq; CREATE SEQUENCE public.onb_code_seq; CREATE SEQUENCE public.upg_code_seq;

-- ===== Clients
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT ('CLI-' || lpad(nextval('public.cli_code_seq')::text, 5, '0')),
  notion_id text UNIQUE, notion_code text,
  name text NOT NULL, empresa text, erp_id text, erp_slug text,
  contact_name text, company_email text, company_phone text, contact_email text, contact_phone text, whatsapp text,
  segments text[] NOT NULL DEFAULT '{}', plan text, status text,
  owner_id uuid REFERENCES public.profiles(id),
  is_test boolean NOT NULL DEFAULT false,
  notion_raw jsonb,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.clients(owner_id);
GRANT SELECT, INSERT, UPDATE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage clients" ON public.clients FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "CS reads own clients" ON public.clients FOR SELECT TO authenticated USING (public.is_cs(auth.uid()) AND owner_id = auth.uid());
CREATE POLICY "CS creates own clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (public.is_cs(auth.uid()) AND owner_id=auth.uid());
CREATE POLICY "CS updates own clients" ON public.clients FOR UPDATE TO authenticated
  USING (public.is_cs(auth.uid()) AND owner_id = auth.uid()) WITH CHECK (public.is_cs(auth.uid()) AND owner_id = auth.uid());

-- ===== Demands
ALTER TABLE public.clients ADD COLUMN notes text;

CREATE TABLE public.demands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT ('DEM-' || lpad(nextval('public.dem_code_seq')::text, 5, '0')),
  notion_id text UNIQUE, notion_code text,
  client_id uuid REFERENCES public.clients(id),
  owner_id uuid REFERENCES public.profiles(id),
  title text NOT NULL, description text, priority text NOT NULL DEFAULT 'Normal', classification text,
  channel text, impact text, context text, technical_type text, complexity text,
  solution text, tests_run text, test_result text,
  client_informed boolean NOT NULL DEFAULT false, client_validated boolean NOT NULL DEFAULT false,
  stage text NOT NULL DEFAULT 'Nova',
  received_at timestamptz,
  sla_start_at timestamptz, first_response_due timestamptz, resolution_due timestamptz,
  first_response_at timestamptz, forwarded_at timestamptz, published_at timestamptz, validated_at timestamptz,
  completed_at timestamptz, canceled_at timestamptz, cancel_reason text,
  due_date timestamptz,
  is_test boolean NOT NULL DEFAULT false,
  notion_raw jsonb,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.demands(owner_id); CREATE INDEX ON public.demands(client_id);

-- ===== Onboardings
CREATE TABLE public.onboardings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT ('ONB-' || lpad(nextval('public.onb_code_seq')::text, 5, '0')),
  notion_id text UNIQUE, notion_code text,
  client_id uuid REFERENCES public.clients(id), owner_id uuid REFERENCES public.profiles(id),
  title text NOT NULL, stage text NOT NULL DEFAULT 'Aguardando dados',
  current_step text NOT NULL DEFAULT '1. Dados recebidos', progress numeric,
  started_at timestamptz, info_complete_at timestamptz, milestone5_due timestamptz, limit15_due timestamptz,
  expected_date date, completed_at timestamptz, notes text,
  is_test boolean NOT NULL DEFAULT false, notion_raw jsonb, version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===== Upgrades
CREATE TABLE public.upgrades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT ('UPG-' || lpad(nextval('public.upg_code_seq')::text, 5, '0')),
  notion_id text UNIQUE, notion_code text,
  client_id uuid REFERENCES public.clients(id), owner_id uuid REFERENCES public.profiles(id),
  title text NOT NULL, current_plan text, new_plan text,
  current_value numeric(12,2), new_value numeric(12,2),
  stage text NOT NULL DEFAULT 'Em negociação',
  opportunity_at timestamptz, accepted_at timestamptz, effective_at timestamptz, lost_at timestamptz, notes text, need text,
  commission_eligible_at_effective boolean, commission_owner_id uuid REFERENCES public.profiles(id), commission_paid boolean NOT NULL DEFAULT false,
  is_test boolean NOT NULL DEFAULT false, notion_raw jsonb, version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===== Interactions & changelog
CREATE TABLE public.interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id text UNIQUE,
  client_id uuid REFERENCES public.clients(id), demand_id uuid REFERENCES public.demands(id), owner_id uuid REFERENCES public.profiles(id),
  code text UNIQUE, channel text, summary text NOT NULL, occurred_at timestamptz, problem text, decision text, next_action text,
  is_test boolean NOT NULL DEFAULT false, notion_raw jsonb, version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.changelog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id text UNIQUE,
  client_id uuid REFERENCES public.clients(id), demand_id uuid REFERENCES public.demands(id), owner_id uuid REFERENCES public.profiles(id),
  code text UNIQUE, title text NOT NULL, description text, kind text, published_at timestamptz, occurred_at timestamptz,
  approved boolean NOT NULL DEFAULT false, result text, tests_run text, files text, tool text, release_version text, notes text,
  is_test boolean NOT NULL DEFAULT false, notion_raw jsonb, version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- Shared grants + RLS for operation tables (owner-scoped for CS, global for admin)
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['demands','onboardings','upgrades','interactions','changelog'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Admins manage" ON public.%I FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "CS reads own" ON public.%I FOR SELECT TO authenticated USING (public.is_cs(auth.uid()) AND owner_id = auth.uid() AND exists (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.owner_id = auth.uid()))', t);
    EXECUTE format('CREATE POLICY "CS inserts own" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_cs(auth.uid()) AND owner_id = auth.uid() AND exists (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.owner_id = auth.uid()))', t);
    EXECUTE format('CREATE POLICY "CS updates own" ON public.%I FOR UPDATE TO authenticated USING (public.is_cs(auth.uid()) AND owner_id = auth.uid() AND exists (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.owner_id = auth.uid())) WITH CHECK (public.is_cs(auth.uid()) AND owner_id = auth.uid() AND exists (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.owner_id = auth.uid()))', t);
  END LOOP;
END $$;

-- ===== History, notifications, imports, job runs
CREATE TABLE public.workflow_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL, entity_id uuid NOT NULL, action text NOT NULL,
  from_value text, to_value text, actor_id uuid, details jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.workflow_history(entity_type, entity_id);
GRANT SELECT ON public.workflow_history TO authenticated; GRANT ALL ON public.workflow_history TO service_role;
ALTER TABLE public.workflow_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read history" ON public.workflow_history FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "CS reads history of own items" ON public.workflow_history FOR SELECT TO authenticated USING (
  public.is_cs(auth.uid()) AND (
    (entity_type IN ('demand','demands') AND exists (SELECT 1 FROM public.demands x WHERE x.id = entity_id AND x.owner_id = auth.uid())) OR
    (entity_type IN ('onboarding','onboardings') AND exists (SELECT 1 FROM public.onboardings x WHERE x.id = entity_id AND x.owner_id = auth.uid())) OR
    (entity_type IN ('upgrade','upgrades') AND exists (SELECT 1 FROM public.upgrades x WHERE x.id = entity_id AND x.owner_id = auth.uid())) OR
    (entity_type IN ('client','clients') AND exists (SELECT 1 FROM public.clients x WHERE x.id = entity_id AND x.owner_id = auth.uid())) OR
    (entity_type='interactions' AND exists(SELECT 1 FROM public.interactions x WHERE x.id=entity_id AND x.owner_id=auth.uid())) OR
    (entity_type='changelog' AND exists(SELECT 1 FROM public.changelog x WHERE x.id=entity_id AND x.owner_id=auth.uid()))));

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id),
  entity_type text NOT NULL, entity_id uuid NOT NULL, obligation text NOT NULL,
  deadline timestamptz NOT NULL, level text NOT NULL CHECK (level IN ('risk','overdue')),
  title text NOT NULL, link text NOT NULL,
  read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipient_id, entity_type, entity_id, obligation, deadline, level)
);
GRANT SELECT ON public.notifications TO authenticated; GRANT UPDATE(read_at) ON public.notifications TO authenticated; GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own notifications" ON public.notifications FOR SELECT TO authenticated USING (recipient_id = auth.uid() AND public.is_operator(auth.uid()) AND (public.is_admin(auth.uid()) OR (entity_type='demand' AND exists(SELECT 1 FROM public.demands d WHERE d.id=entity_id)) OR (entity_type='onboarding' AND exists(SELECT 1 FROM public.onboardings o WHERE o.id=entity_id))));
CREATE POLICY "Mark own notifications" ON public.notifications FOR UPDATE TO authenticated USING (recipient_id = auth.uid() AND public.is_operator(auth.uid()) AND (public.is_admin(auth.uid()) OR (entity_type='demand' AND exists(SELECT 1 FROM public.demands d WHERE d.id=entity_id)) OR (entity_type='onboarding' AND exists(SELECT 1 FROM public.onboardings o WHERE o.id=entity_id)))) WITH CHECK (recipient_id = auth.uid());

CREATE TABLE public.import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid, status text NOT NULL,
  report jsonb, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE TABLE public.import_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid REFERENCES public.import_runs(id),
  source text NOT NULL, notion_id text, kind text NOT NULL, detail text, resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.job_runs (
  id bigserial PRIMARY KEY, job text NOT NULL, ran_at timestamptz NOT NULL DEFAULT now(), ok boolean NOT NULL, detail jsonb
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['import_runs','import_issues','job_runs'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Admins read" ON public.%I FOR SELECT TO authenticated USING (public.is_admin(auth.uid()))', t);
  END LOOP;
END $$;
GRANT USAGE ON SEQUENCE public.job_runs_id_seq TO service_role;

-- ===== Write guards
-- Owner/client changes are admin-only; event timestamps change only through transition RPCs.
CREATE OR REPLACE FUNCTION public.guard_operation_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); admin boolean := uid IS NULL OR public.is_admin(uid); tr boolean := coalesce(current_setting('app.transition', true), '') = 'on';
  cowner uuid;
BEGIN
  IF NEW.client_id IS NOT NULL THEN SELECT owner_id INTO cowner FROM public.clients WHERE id = NEW.client_id; END IF;
  IF NOT admin AND cowner IS DISTINCT FROM uid THEN RAISE EXCEPTION 'forbidden: cliente fora da carteira'; END IF;
  IF TG_TABLE_NAME IN ('interactions','changelog') AND uid IS NOT NULL THEN
    IF NEW.demand_id IS NOT NULL AND NOT exists(SELECT 1 FROM public.demands WHERE id=NEW.demand_id AND client_id=NEW.client_id) THEN RAISE EXCEPTION 'invalid_demand_relation'; END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF uid IS NOT NULL AND NOT admin THEN
      NEW.notion_id:=NULL; NEW.notion_raw:=NULL; NEW.source_date_precision:='[]'::jsonb;
      NEW.is_test:=(SELECT is_test FROM public.clients WHERE id=NEW.client_id);
      NEW.code:=CASE TG_TABLE_NAME WHEN 'demands' THEN 'DEM-'||lpad(nextval('public.dem_code_seq')::text,5,'0') WHEN 'onboardings' THEN 'ONB-'||lpad(nextval('public.onb_code_seq')::text,5,'0') WHEN 'upgrades' THEN 'UPG-'||lpad(nextval('public.upg_code_seq')::text,5,'0') WHEN 'interactions' THEN 'INT-'||lpad(nextval('public.int_code_seq')::text,5,'0') ELSE 'CHG-'||lpad(nextval('public.chg_code_seq')::text,5,'0') END;
      IF TG_TABLE_NAME='upgrades' THEN NEW.commission_eligible_at_effective:=NULL;NEW.commission_owner_id:=NULL;NEW.commission_paid:=false; END IF;
      IF TG_TABLE_NAME='demands' THEN NEW.stage:='Nova'; NEW.received_at:=now();
      ELSIF TG_TABLE_NAME='onboardings' THEN NEW.stage:='Não iniciado'; NEW.current_step:='1. Dados recebidos';
      ELSIF TG_TABLE_NAME='upgrades' THEN NEW.stage:='Oportunidade identificada'; END IF;
    END IF;
    IF NEW.notion_id IS NULL THEN NEW.owner_id := cowner; ELSIF NEW.owner_id IS NULL THEN NEW.owner_id := cowner; END IF;
    IF NEW.notion_id IS NULL AND NEW.client_id IS NULL THEN RAISE EXCEPTION 'client_required'; END IF;
    IF NOT admin AND (NEW.owner_id IS DISTINCT FROM uid OR cowner IS DISTINCT FROM uid) THEN
      RAISE EXCEPTION 'forbidden: só é possível registrar itens da própria carteira';
    END IF;
  ELSE
    IF NOT admin AND (NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.client_id IS DISTINCT FROM OLD.client_id) THEN
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
    IF TG_OP = 'INSERT' AND NEW.received_at IS NULL AND NEW.notion_id IS NULL THEN NEW.received_at := now(); END IF;
    NEW.sla_start_at := public.sla_normalize(NEW.received_at);
    NEW.first_response_due := public.sla_add_business_minutes(NEW.received_at, 240);
    NEW.resolution_due := public.sla_next_business_day(NEW.received_at);
    IF NOT admin AND TG_OP = 'UPDATE' AND (NEW.first_response_due IS DISTINCT FROM public.sla_add_business_minutes(OLD.received_at,240) OR NEW.resolution_due IS DISTINCT FROM public.sla_next_business_day(OLD.received_at)) THEN RAISE EXCEPTION 'forbidden'; END IF;
  ELSIF TG_TABLE_NAME = 'onboardings' THEN
    IF NOT tr AND uid IS NOT NULL AND ((TG_OP = 'INSERT' AND (NEW.info_complete_at IS NOT NULL OR NEW.completed_at IS NOT NULL)) OR (TG_OP = 'UPDATE' AND (NEW.info_complete_at IS DISTINCT FROM OLD.info_complete_at OR NEW.completed_at IS DISTINCT FROM OLD.completed_at OR NEW.stage IS DISTINCT FROM OLD.stage OR NEW.current_step IS DISTINCT FROM OLD.current_step))) THEN
      RAISE EXCEPTION 'forbidden: eventos do onboarding só mudam pelas ações registradas';
    END IF;
    IF NEW.notion_id IS NULL OR (TG_OP='UPDATE' AND NEW.current_step IS DISTINCT FROM OLD.current_step) THEN NEW.progress:=coalesce(substring(NEW.current_step from '^([0-9]+)')::numeric,0)/9; END IF;
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
  IF TG_OP='UPDATE' AND uid IS NOT NULL AND NOT admin AND (NEW.code IS DISTINCT FROM OLD.code OR NEW.notion_id IS DISTINCT FROM OLD.notion_id OR NEW.notion_raw IS DISTINCT FROM OLD.notion_raw OR NEW.is_test IS DISTINCT FROM OLD.is_test OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.source_date_precision IS DISTINCT FROM OLD.source_date_precision) THEN RAISE EXCEPTION 'forbidden: origem e identidade protegidas'; END IF;
  IF TG_TABLE_NAME='upgrades' THEN
    IF TG_OP='UPDATE' AND uid IS NOT NULL AND NOT admin AND NEW.commission_paid IS DISTINCT FROM OLD.commission_paid THEN RAISE EXCEPTION 'forbidden: comissão paga é conferida pelo administrador'; END IF;
  END IF;
  IF TG_OP='INSERT' AND uid IS NOT NULL AND NOT admin THEN NEW.created_at:=now(); NEW.notion_id:=NULL; NEW.notion_raw:=NULL; END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['demands','onboardings','upgrades','interactions','changelog'] LOOP
    EXECUTE format('CREATE TRIGGER trg_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_operation_row()', t);
  END LOOP;
END $$;

-- Clients: owner must be an active operator; reassignment cascades to open items and is audited.
CREATE OR REPLACE FUNCTION public.guard_client_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); imp boolean := coalesce(current_setting('app.import', true), '') = 'on';
BEGIN
  IF TG_OP='INSERT' AND uid IS NOT NULL AND NOT public.is_admin(uid) THEN
    NEW.notion_id:=NULL;NEW.notion_code:=NULL;NEW.notion_raw:=NULL;NEW.created_at:=now();NEW.code:='CLI-'||lpad(nextval('public.cli_code_seq')::text,5,'0');
  END IF;
  IF NOT imp AND NEW.owner_id IS NULL THEN RAISE EXCEPTION 'owner_required: selecione um responsável de CS ativo'; END IF;
  IF NOT imp AND (TG_OP = 'INSERT' OR NEW.owner_id IS DISTINCT FROM OLD.owner_id) AND NOT public.is_cs(NEW.owner_id) THEN
    RAISE EXCEPTION 'owner_inactive: o responsável precisa ser um usuário ativo da operação';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF uid IS NOT NULL AND NOT public.is_admin(uid) AND (NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.is_test IS DISTINCT FROM OLD.is_test OR NEW.code IS DISTINCT FROM OLD.code OR NEW.notion_id IS DISTINCT FROM OLD.notion_id OR NEW.notion_raw IS DISTINCT FROM OLD.notion_raw OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
      RAISE EXCEPTION 'forbidden: só o administrador redistribui clientes';
    END IF;
    NEW.version := OLD.version + 1; NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_client BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.guard_client_row();

CREATE OR REPLACE FUNCTION public.after_client_owner() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    INSERT INTO public.workflow_history(entity_type, entity_id, action, from_value, to_value, actor_id)
      VALUES ('client', NEW.id, 'assign', OLD.owner_id::text, NEW.owner_id::text, auth.uid());
    UPDATE public.demands SET owner_id = NEW.owner_id WHERE client_id = NEW.id;
    UPDATE public.onboardings SET owner_id = NEW.owner_id WHERE client_id = NEW.id;
    UPDATE public.upgrades SET owner_id = NEW.owner_id WHERE client_id = NEW.id;
    UPDATE public.interactions SET owner_id=NEW.owner_id WHERE client_id=NEW.id;
    UPDATE public.changelog SET owner_id=NEW.owner_id WHERE client_id=NEW.id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_client_owner AFTER UPDATE OF owner_id ON public.clients FOR EACH ROW EXECUTE FUNCTION public.after_client_owner();

-- ===== Transitions (idempotent server-side now(), optimistic version, history)
CREATE OR REPLACE FUNCTION public.transition_demand(_id uuid, _action text, _version int, _stage text DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS public.demands LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); d public.demands; old_stage text;
BEGIN
  IF uid IS NULL OR NOT public.is_operator(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO d FROM public.demands WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR (NOT public.is_admin(uid) AND (d.owner_id IS DISTINCT FROM uid OR NOT exists (SELECT 1 FROM public.clients WHERE id=d.client_id AND owner_id=uid))) THEN RAISE EXCEPTION 'not_found'; END IF;
  IF d.version <> _version THEN RAISE EXCEPTION 'conflict: a demanda foi alterada por outra pessoa; recarregue'; END IF;
  IF d.completed_at IS NOT NULL OR d.canceled_at IS NOT NULL THEN
    IF _action IN ('complete','cancel') THEN RETURN d; END IF;
    RAISE EXCEPTION 'closed: demanda encerrada';
  END IF;
  old_stage := d.stage;
  PERFORM set_config('app.transition', 'on', true);
  IF _action = 'first_response' THEN
    UPDATE public.demands SET first_response_at = coalesce(first_response_at, now()),
      stage = CASE WHEN stage = 'Nova' THEN 'Em triagem' ELSE stage END WHERE id = _id RETURNING * INTO d;
  ELSIF _action = 'forward' THEN
    UPDATE public.demands SET forwarded_at = coalesce(forwarded_at, now()), stage = 'Encaminhada para desenvolvimento' WHERE id = _id RETURNING * INTO d;
  ELSIF _action = 'publish' THEN
    UPDATE public.demands SET published_at = coalesce(published_at, now()), stage = 'Publicada' WHERE id = _id RETURNING * INTO d;
  ELSIF _action = 'validate' THEN
    UPDATE public.demands SET validated_at = coalesce(validated_at, now()), client_validated = true WHERE id = _id RETURNING * INTO d;
  ELSIF _action = 'complete' THEN
    IF coalesce(btrim(d.solution), '') = '' OR NOT d.client_informed THEN
      RAISE EXCEPTION 'incomplete: informe a solução aplicada e confirme que o cliente foi informado';
    END IF;
    UPDATE public.demands SET completed_at = now(), stage = 'Concluída' WHERE id = _id RETURNING * INTO d;
  ELSIF _action = 'cancel' THEN
    IF coalesce(btrim(_reason), '') = '' THEN RAISE EXCEPTION 'incomplete: informe o motivo do cancelamento'; END IF;
    UPDATE public.demands SET canceled_at = now(), cancel_reason = _reason, stage = 'Cancelada' WHERE id = _id RETURNING * INTO d;
  ELSIF _action = 'move' THEN
    IF _stage NOT IN ('Nova','Em triagem','Aguardando informação','Em execução','Aguardando validação','Encaminhada para desenvolvimento','Publicada','Aguardando cliente','Bloqueada') THEN
      RAISE EXCEPTION 'invalid_stage: use Concluir ou Cancelar para encerrar';
    END IF;
    UPDATE public.demands SET stage = _stage WHERE id = _id RETURNING * INTO d;
  ELSE RAISE EXCEPTION 'invalid_action';
  END IF;
  PERFORM set_config('app.transition', 'off', true);
  INSERT INTO public.workflow_history(entity_type, entity_id, action, from_value, to_value, actor_id, details)
    VALUES ('demand', _id, _action, old_stage, d.stage, uid, CASE WHEN _reason IS NULL THEN NULL ELSE jsonb_build_object('reason', _reason) END);
  RETURN d;
END $$;

CREATE OR REPLACE FUNCTION public.transition_onboarding(_id uuid, _action text, _version int, _stage text DEFAULT NULL)
RETURNS public.onboardings LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); o public.onboardings; old_stage text;
BEGIN
  IF uid IS NULL OR NOT public.is_operator(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO o FROM public.onboardings WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR (NOT public.is_admin(uid) AND (o.owner_id IS DISTINCT FROM uid OR NOT exists (SELECT 1 FROM public.clients WHERE id=o.client_id AND owner_id=uid))) THEN RAISE EXCEPTION 'not_found'; END IF;
  IF o.version <> _version THEN RAISE EXCEPTION 'conflict: o onboarding foi alterado por outra pessoa; recarregue'; END IF;
  IF o.completed_at IS NOT NULL THEN
    IF _action='complete' THEN RETURN o; END IF;
    RAISE EXCEPTION 'closed';
  END IF;
  old_stage := o.stage;
  PERFORM set_config('app.transition', 'on', true);
  IF _action = 'info_complete' THEN
    UPDATE public.onboardings SET info_complete_at = coalesce(info_complete_at, now()),started_at=coalesce(started_at,now()), stage = CASE WHEN stage IN ('Aguardando dados','Não iniciado','Aguardando informação') THEN 'Em andamento' ELSE stage END WHERE id = _id RETURNING * INTO o;
  ELSIF _action = 'complete' THEN
    IF o.info_complete_at IS NULL THEN RAISE EXCEPTION 'incomplete: registre o recebimento das informações completas antes de concluir'; END IF;
    UPDATE public.onboardings SET completed_at = coalesce(completed_at, now()), stage = 'Concluído', current_step='9. Conclusão' WHERE id = _id RETURNING * INTO o;
  ELSIF _action = 'move' THEN
    IF o.completed_at IS NOT NULL THEN RAISE EXCEPTION 'closed'; END IF;
    IF _stage NOT IN ('Não iniciado','Em andamento','Aguardando cliente','Aguardando informação','Em validação','Bloqueado') THEN RAISE EXCEPTION 'invalid_stage'; END IF;
    UPDATE public.onboardings SET stage = _stage WHERE id = _id RETURNING * INTO o;
  ELSIF _action='step' THEN
    IF o.completed_at IS NOT NULL OR _stage NOT IN ('1. Dados recebidos','2. Cadastro','3. Configuração','4. Migração','5. Conexão WhatsApp','6. Configuração da IA','7. Treinamento','8. Validação') THEN RAISE EXCEPTION 'invalid_step'; END IF;
    UPDATE public.onboardings SET current_step=_stage WHERE id=_id RETURNING * INTO o;
  ELSE RAISE EXCEPTION 'invalid_action'; END IF;
  PERFORM set_config('app.transition', 'off', true);
  INSERT INTO public.workflow_history(entity_type, entity_id, action, from_value, to_value, actor_id) VALUES ('onboarding', _id, _action, old_stage, o.stage, uid);
  RETURN o;
END $$;

CREATE OR REPLACE FUNCTION public.transition_upgrade(_id uuid, _action text, _version int, _stage text DEFAULT NULL)
RETURNS public.upgrades LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); u public.upgrades; old_stage text;
BEGIN
  IF uid IS NULL OR NOT public.is_operator(uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO u FROM public.upgrades WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR (NOT public.is_admin(uid) AND (u.owner_id IS DISTINCT FROM uid OR NOT exists (SELECT 1 FROM public.clients WHERE id=u.client_id AND owner_id=uid))) THEN RAISE EXCEPTION 'not_found'; END IF;
  IF u.version <> _version THEN RAISE EXCEPTION 'conflict: o upgrade foi alterado por outra pessoa; recarregue'; END IF;
  IF u.lost_at IS NOT NULL OR u.effective_at IS NOT NULL THEN RETURN u; END IF;
  old_stage := u.stage;
  PERFORM set_config('app.transition', 'on', true);
  IF _action = 'accept' THEN
    UPDATE public.upgrades SET accepted_at = coalesce(accepted_at, now()), stage = 'Aceito' WHERE id = _id RETURNING * INTO u;
  ELSIF _action = 'effective' THEN
    IF u.accepted_at IS NULL THEN RAISE EXCEPTION 'incomplete: registre o aceite antes da efetivação'; END IF;
    UPDATE public.upgrades SET effective_at = now(), stage = 'Efetivado' WHERE id = _id RETURNING * INTO u;
  ELSIF _action = 'lost' THEN
    UPDATE public.upgrades SET lost_at = now(), stage = 'Perdido' WHERE id = _id RETURNING * INTO u;
  ELSIF _action='move' THEN
    IF _stage NOT IN ('Oportunidade identificada','Em conversa','Proposta apresentada','Aguardando cliente') OR u.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'invalid_stage'; END IF;
    UPDATE public.upgrades SET stage=_stage WHERE id=_id RETURNING * INTO u;
  ELSE RAISE EXCEPTION 'invalid_action'; END IF;
  PERFORM set_config('app.transition', 'off', true);
  INSERT INTO public.workflow_history(entity_type, entity_id, action, from_value, to_value, actor_id) VALUES ('upgrade', _id, _action, old_stage, u.stage, uid);
  RETURN u;
END $$;
REVOKE ALL ON FUNCTION public.transition_demand(uuid, text, int, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.transition_onboarding(uuid, text, int, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.transition_upgrade(uuid, text, int, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.transition_demand(uuid, text, int, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_onboarding(uuid, text, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_upgrade(uuid, text, int, text) TO authenticated;

-- ===== SLA views (dimension separate from stage; computed at read time, never frozen)
CREATE OR REPLACE FUNCTION public.sla_state(done_at timestamptz, due timestamptz, closed boolean) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN due IS NULL THEN 'sem_dados'
    WHEN done_at IS NOT NULL THEN CASE WHEN done_at <= due THEN 'cumprido' ELSE 'cumprido_atrasado' END
    WHEN closed THEN 'sem_registro'
    WHEN now() > due THEN 'atrasado'
    WHEN now() >= public.sla_sub_business_minutes(due, public.sla_risk_minutes()) THEN 'em_risco'
    ELSE 'no_prazo' END
$$;
CREATE VIEW public.demand_sla WITH (security_invoker = true) AS
SELECT d.id, d.owner_id, d.client_id, d.is_test,
  public.sla_state(d.first_response_at, d.first_response_due, d.completed_at IS NOT NULL OR d.canceled_at IS NOT NULL) AS first_response_state,
  public.sla_state(least(d.forwarded_at, d.completed_at), d.resolution_due, d.completed_at IS NOT NULL OR d.canceled_at IS NOT NULL) AS resolution_state,
  public.sla_state(d.completed_at,d.due_date,d.completed_at IS NOT NULL OR d.canceled_at IS NOT NULL) AS delivery_state,
  d.first_response_due, d.resolution_due
FROM public.demands d WHERE d.canceled_at IS NULL;
GRANT SELECT ON public.demand_sla TO authenticated;

CREATE VIEW public.upgrade_commission WITH (security_invoker = true) AS
SELECT u.id, u.owner_id,
  CASE WHEN coalesce(u.commission_eligible_at_effective,p.commission_eligible) AND u.new_value > coalesce(u.current_value, 0) AND u.lost_at IS NULL THEN u.new_value ELSE 0 END AS commission_expected,
  CASE WHEN u.commission_eligible_at_effective AND u.new_value > coalesce(u.current_value, 0) AND u.accepted_at IS NOT NULL AND u.effective_at IS NOT NULL AND u.lost_at IS NULL THEN u.new_value ELSE 0 END AS commission_due,
  CASE WHEN u.commission_eligible_at_effective AND u.new_value > coalesce(u.current_value, 0) AND u.accepted_at IS NOT NULL AND u.effective_at IS NOT NULL AND u.lost_at IS NULL
    THEN (date_trunc('month', u.effective_at AT TIME ZONE 'America/Sao_Paulo') + interval '1 month' + interval '9 days')::date END AS payment_expected
FROM public.upgrades u LEFT JOIN public.profiles p ON p.id = u.owner_id;
GRANT SELECT ON public.upgrade_commission TO authenticated;

-- ===== Notification job (SQL-only, runs without any browser)
CREATE OR REPLACE FUNCTION public.sla_tick() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int := 0; c int;
BEGIN
  WITH pending AS (
    SELECT d.id, d.owner_id, 'first_response'::text AS obligation, d.first_response_due AS due, d.code || ' — ' || d.title AS title
      FROM public.demands d JOIN public.clients cl ON cl.id=d.client_id WHERE NOT d.is_test AND NOT cl.is_test AND d.first_response_at IS NULL AND d.completed_at IS NULL AND d.canceled_at IS NULL AND d.first_response_due IS NOT NULL
    UNION ALL
    SELECT d.id, d.owner_id, 'resolution_or_forward', d.resolution_due, d.code || ' — ' || d.title
      FROM public.demands d JOIN public.clients cl ON cl.id=d.client_id WHERE NOT d.is_test AND NOT cl.is_test AND d.forwarded_at IS NULL AND d.completed_at IS NULL AND d.canceled_at IS NULL AND d.resolution_due IS NOT NULL
    UNION ALL
    SELECT d.id,d.owner_id,'delivery',d.due_date,d.code||' — '||d.title FROM public.demands d JOIN public.clients cl ON cl.id=d.client_id WHERE NOT d.is_test AND NOT cl.is_test AND d.completed_at IS NULL AND d.canceled_at IS NULL AND d.due_date IS NOT NULL
  ), lvl AS (
    SELECT p.*, CASE WHEN now() > p.due THEN 'overdue' ELSE 'risk' END AS level FROM pending p
    WHERE now() >= public.sla_sub_business_minutes(p.due, public.sla_risk_minutes())
  ), rcpt AS (
    SELECT l.*, l.owner_id AS rid FROM lvl l WHERE l.owner_id IS NOT NULL AND public.is_operator(l.owner_id)
    UNION
    SELECT l.*, a.user_id FROM lvl l JOIN public.user_roles a ON a.role = 'admin' JOIN public.profiles pr ON pr.id = a.user_id AND pr.active
  )
  INSERT INTO public.notifications(recipient_id, entity_type, entity_id, obligation, deadline, level, title, link)
  SELECT rid, 'demand', id, obligation, due, level,
    CASE WHEN level = 'overdue' THEN 'SLA atrasado: ' ELSE 'SLA em risco: ' END || title, '/operacao?tab=demands&id=' || id
  FROM rcpt ON CONFLICT DO NOTHING;
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
REVOKE ALL ON FUNCTION public.sla_tick() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sla_tick() TO service_role;

-- Provision existing members without duplicating authentication identities.
INSERT INTO public.profiles(id,full_name,email,commission_eligible,notion_user_id) VALUES
 ('2d31f8a5-afeb-4e12-9a64-a91432bdab61','Pedro Manhães','pedro@ikaros.com.br',false,'3edd872b-594c-81a9-bafa-0002ad0bb855'),
 ('041b0196-008a-4edc-ae60-cbb8aac105ca','Igor Paiva','igor.paiva@ikaros.com.br',true,'3edd872b-594c-8177-85dc-00022369482c');
UPDATE public.user_roles SET role='cs' WHERE user_id='041b0196-008a-4edc-ae60-cbb8aac105ca' AND role='admin';

CREATE OR REPLACE FUNCTION public.admin_update_member(_id uuid,_role text,_active boolean,_commission boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(712503);
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _role NOT IN ('admin','cs') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  IF NOT exists(SELECT 1 FROM public.profiles WHERE id=_id) THEN RAISE EXCEPTION 'not_found'; END IF;
  DELETE FROM public.user_roles WHERE user_id=_id;
  INSERT INTO public.user_roles(user_id,role) VALUES(_id,_role::public.app_role);
  UPDATE public.profiles SET active=_active,commission_eligible=_commission,updated_at=now() WHERE id=_id;
  INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('member',_id,'permissions',auth.uid(),jsonb_build_object('role',_role,'active',_active,'commission',_commission));
END $$;
REVOKE ALL ON FUNCTION public.admin_update_member(uuid,text,boolean,boolean) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.admin_update_member(uuid,text,boolean,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.provision_member(_id uuid,_name text,_email text,_role text,_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_admin(_actor) OR _role NOT IN ('admin','cs') THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.profiles(id,full_name,email) VALUES(_id,_name,_email);
  INSERT INTO public.user_roles(user_id,role) VALUES(_id,_role::public.app_role);
  INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('member',_id,'create',_actor,jsonb_build_object('role',_role));
END $$;
REVOKE ALL ON FUNCTION public.provision_member(uuid,text,text,text,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.provision_member(uuid,text,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.assign_client(_id uuid,_owner uuid,_version int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v int;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.is_cs(_owner) THEN RAISE EXCEPTION 'owner_inactive'; END IF;
  SELECT version INTO v FROM public.clients WHERE id=_id FOR UPDATE;
  IF v IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v<>_version THEN RAISE EXCEPTION 'conflict: recarregue a carteira'; END IF;
  UPDATE public.clients SET owner_id=_owner WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.assign_client(uuid,uuid,int) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.assign_client(uuid,uuid,int) TO authenticated;

-- Settings updates are validated and tracked. Deadlines remain contractual.
CREATE OR REPLACE FUNCTION public.set_sla_risk_window(_minutes int) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _minutes<5 OR _minutes>240 THEN RAISE EXCEPTION 'invalid_window'; END IF;
  UPDATE public.app_settings SET value=to_jsonb(_minutes),updated_at=now() WHERE key='sla_risk_minutes';
  INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('settings',gen_random_uuid(),'risk_window',auth.uid(),jsonb_build_object('minutes',_minutes));
END $$;
REVOKE ALL ON FUNCTION public.set_sla_risk_window(int) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.set_sla_risk_window(int) TO authenticated;

CREATE UNIQUE INDEX import_issue_identity ON public.import_issues(source,notion_id,kind);
CREATE SEQUENCE public.int_code_seq; CREATE SEQUENCE public.chg_code_seq;
ALTER TABLE public.interactions ALTER COLUMN code SET DEFAULT ('INT-'||lpad(nextval('public.int_code_seq')::text,5,'0'));
ALTER TABLE public.changelog ALTER COLUMN code SET DEFAULT ('CHG-'||lpad(nextval('public.chg_code_seq')::text,5,'0'));
GRANT USAGE ON SEQUENCE public.cli_code_seq,public.dem_code_seq,public.onb_code_seq,public.upg_code_seq,public.int_code_seq,public.chg_code_seq TO authenticated,service_role;

-- One transaction across all six sources; repeats preserve native edits.
CREATE OR REPLACE FUNCTION public.import_notion_bundle(_bundle jsonb,_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE run uuid:=gen_random_uuid(); t text; item jsonb; defaults jsonb; count_insert int; n int; import_report jsonb:='{}'; prefix text; owner uuid; cl uuid;
BEGIN
  IF NOT public.is_admin(_actor) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.import_runs(id,actor_id,status) VALUES(run,_actor,'running');
  PERFORM set_config('app.import','on',true);
  PERFORM set_config('app.transition','on',true);
  FOREACH t IN ARRAY ARRAY['clients','demands','onboardings','upgrades','interactions','changelog'] LOOP
    n:=0;
    prefix:=CASE t WHEN 'clients' THEN 'cli' WHEN 'demands' THEN 'dem' WHEN 'onboardings' THEN 'onb' WHEN 'upgrades' THEN 'upg' WHEN 'interactions' THEN 'int' ELSE 'chg' END;
    IF jsonb_typeof(_bundle->t) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'missing_source: %',t; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(_bundle->t) LOOP
      IF coalesce(item->>'notion_id','')='' THEN RAISE EXCEPTION 'invalid_source_id'; END IF;
      defaults:=jsonb_build_object('id',gen_random_uuid(),'code',upper(prefix)||'-'||lpad(nextval(('public.'||prefix||'_code_seq')::regclass)::text,5,'0'),'version',1,'is_test',false,'created_at',now(),'updated_at',now());
      IF t<>'clients' THEN defaults:=defaults||jsonb_build_object('source_date_precision',jsonb_build_array()); END IF;
      IF t='clients' THEN defaults:=defaults||jsonb_build_object('status','Ativo','segments',jsonb_build_array()); END IF;
      IF t='demands' THEN defaults:=defaults||jsonb_build_object('stage','Nova','priority','Normal','client_informed',false,'client_validated',false); END IF;
      IF t='onboardings' THEN defaults:=defaults||jsonb_build_object('stage','Não iniciado','current_step','1. Dados recebidos'); END IF;
      IF t='upgrades' THEN defaults:=defaults||jsonb_build_object('stage','Oportunidade identificada','commission_paid',false); END IF;
      IF t='changelog' THEN defaults:=defaults||jsonb_build_object('approved',false); END IF;
      item:=defaults||item;
      owner:=(item->>'owner_id')::uuid;
      IF owner IS NOT NULL AND NOT exists(SELECT 1 FROM public.profiles WHERE id=owner) THEN item:=item||jsonb_build_object('owner_id',NULL); owner:=NULL; END IF;
      IF t<>'clients' THEN
        cl:=(item->>'client_id')::uuid;
        IF cl IS NOT NULL AND NOT exists(SELECT 1 FROM public.clients WHERE id=cl) THEN item:=item||jsonb_build_object('client_id',NULL); cl:=NULL; END IF;
        IF (item->>'demand_id') IS NOT NULL AND NOT exists(SELECT 1 FROM public.demands WHERE id=(item->>'demand_id')::uuid) THEN item:=item||jsonb_build_object('demand_id',NULL); END IF;
        IF cl IS NULL OR owner IS NULL OR NOT exists(SELECT 1 FROM public.clients WHERE id=cl AND owner_id=owner) THEN
          INSERT INTO public.import_issues(run_id,source,notion_id,kind,detail) VALUES(run,t,item->>'notion_id','client_owner','Cliente ausente ou responsável diferente da carteira. Revisar antes de operar.') ON CONFLICT DO NOTHING;
        END IF;
      ELSIF owner IS NULL THEN
        INSERT INTO public.import_issues(run_id,source,notion_id,kind,detail) VALUES(run,t,item->>'notion_id','owner','Responsável não mapeado.') ON CONFLICT DO NOTHING;
      END IF;
      EXECUTE format('INSERT INTO public.%I SELECT (jsonb_populate_record(NULL::public.%I,$1)).* ON CONFLICT(notion_id) DO NOTHING',t,t) USING item;
      GET DIAGNOSTICS count_insert=ROW_COUNT; n:=n+count_insert;
    END LOOP;
    import_report:=import_report||jsonb_build_object(t,jsonb_build_object('read',jsonb_array_length(_bundle->t),'inserted',n));
  END LOOP;
  PERFORM set_config('app.import','off',true); PERFORM set_config('app.transition','off',true);
  UPDATE public.import_runs SET status='completed',report=import_report,finished_at=now() WHERE id=run;
  RETURN jsonb_build_object('run_id',run,'counts',import_report,'pending',(SELECT count(*) FROM public.import_issues WHERE resolved_at IS NULL));
END $$;
REVOKE ALL ON FUNCTION public.import_notion_bundle(jsonb,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_notion_bundle(jsonb,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_import_issue(_issue uuid,_client uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.import_issues; owner uuid; entity uuid; t text;
BEGIN
 IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO i FROM public.import_issues WHERE id=_issue FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
 IF i.source NOT IN ('demands','onboardings','upgrades','interactions','changelog') THEN RAISE EXCEPTION 'assign_client_instead'; END IF;
 SELECT owner_id INTO owner FROM public.clients WHERE id=_client;
 IF owner IS NULL OR NOT public.is_operator(owner) THEN RAISE EXCEPTION 'owner_required'; END IF;
 EXECUTE format('UPDATE public.%I SET client_id=$1,owner_id=$2 WHERE notion_id=$3 RETURNING id',i.source) INTO entity USING _client,owner,i.notion_id;
 INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES(i.source,entity,'resolve_import',auth.uid(),jsonb_build_object('client',_client,'owner',owner));
 UPDATE public.import_issues SET resolved_at=now() WHERE id=_issue;
END $$;
REVOKE ALL ON FUNCTION public.resolve_import_issue(uuid,uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.resolve_import_issue(uuid,uuid) TO authenticated;

CREATE INDEX ON public.demands(first_response_due) WHERE first_response_at IS NULL AND completed_at IS NULL AND canceled_at IS NULL;
CREATE INDEX ON public.demands(resolution_due) WHERE forwarded_at IS NULL AND completed_at IS NULL AND canceled_at IS NULL;
CREATE INDEX ON public.notifications(recipient_id,created_at DESC);
CREATE INDEX ON public.onboardings(owner_id); CREATE INDEX ON public.upgrades(owner_id);
CREATE INDEX ON public.interactions(owner_id); CREATE INDEX ON public.changelog(owner_id);
CREATE INDEX ON public.job_runs(job,ran_at DESC);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['demands','onboardings','upgrades','interactions','changelog'] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN source_date_precision jsonb NOT NULL DEFAULT ''[]''::jsonb',t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.audit_operation_edit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE changed jsonb; BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES(TG_TABLE_NAME,NEW.id,'created',auth.uid(),jsonb_build_object('source',CASE WHEN NEW.notion_id IS NULL THEN 'native' ELSE 'notion' END));
 ELSIF coalesce(current_setting('app.transition',true),'')<>'on' THEN
  SELECT jsonb_agg(n.key) INTO changed FROM jsonb_each(to_jsonb(NEW)) n WHERE n.key NOT IN ('version','updated_at','notion_raw') AND n.value IS DISTINCT FROM to_jsonb(OLD)->n.key;
  IF changed IS NOT NULL THEN INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES(TG_TABLE_NAME,NEW.id,'edited',auth.uid(),jsonb_build_object('fields',changed)); END IF;
 END IF; RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['clients','demands','onboardings','upgrades','interactions','changelog'] LOOP
  EXECUTE format('CREATE TRIGGER trg_audit_edit AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_operation_edit()',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.contract_calendar() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE month_start date:=date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo')::date;
 report_due date:=month_start; invoice_due date:=(month_start+interval '1 month'-interval '1 day')::date; counted int:=0;
BEGIN
 IF NOT public.is_operator(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
 WHILE counted<5 LOOP
  IF public.sla_is_workday(report_due) THEN counted:=counted+1; END IF;
  IF counted<5 THEN report_due:=report_due+1; END IF;
 END LOOP;
 WHILE NOT public.sla_is_workday(invoice_due) LOOP invoice_due:=invoice_due-1; END LOOP;
 RETURN jsonb_build_object('report_month',to_char(month_start-interval '1 month','YYYY-MM'),'report_due',report_due,'invoice_due',invoice_due,'payment_expected',(month_start+interval '1 month'+interval '9 days')::date);
END $$;
REVOKE ALL ON FUNCTION public.contract_calendar() FROM public,anon;
GRANT EXECUTE ON FUNCTION public.contract_calendar() TO authenticated;
