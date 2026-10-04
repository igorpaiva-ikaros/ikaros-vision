-- Only the authenticated server handler can reserve a Notion write.
-- Unique request IDs prevent concurrent/repeated submissions from creating duplicates.
CREATE TABLE IF NOT EXISTS public.client_registration_requests (
  request_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  payload_hash text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'complete')),
  notion_page_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_registration_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_registration_requests FROM anon, authenticated;
GRANT ALL ON public.client_registration_requests TO service_role;
