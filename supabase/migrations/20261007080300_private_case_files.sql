BEGIN;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('case-evidence','case-evidence',false,52428800,ARRAY['application/pdf','image/png','image/jpeg','image/webp','video/mp4','video/webm','video/quicktime','audio/mpeg','audio/ogg','audio/wav','audio/mp4','audio/webm','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']) ON CONFLICT(id) DO NOTHING;
CREATE OR REPLACE FUNCTION public.case_object_demand(_path text) RETURNS uuid LANGUAGE plpgsql IMMUTABLE AS $$ BEGIN RETURN split_part(_path,'/',1)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN NULL; END $$;
CREATE POLICY "Private evidence reads" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='case-evidence' AND public.can_read_case(public.case_object_demand(name),auth.uid()));
CREATE POLICY "Private evidence uploads" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='case-evidence' AND public.can_read_case(public.case_object_demand(name),auth.uid()) AND owner_id=auth.uid()::text);
CREATE TABLE public.case_attachments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),demand_id uuid NOT NULL REFERENCES public.demands(id),path text NOT NULL UNIQUE,filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 250),mime_type text NOT NULL,size_bytes bigint NOT NULL CHECK(size_bytes>0 AND size_bytes<=52428800),uploaded_by uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE POLICY "Own orphan uploads" ON storage.objects FOR DELETE TO authenticated USING(bucket_id='case-evidence' AND owner_id=auth.uid()::text AND public.can_read_case(public.case_object_demand(name),auth.uid()) AND NOT EXISTS(SELECT 1 FROM public.case_attachments a WHERE a.path=storage.objects.name));
ALTER TABLE public.case_attachments ENABLE ROW LEVEL SECURITY; GRANT SELECT ON public.case_attachments TO authenticated; GRANT ALL ON public.case_attachments TO service_role;
CREATE POLICY "Private evidence metadata" ON public.case_attachments FOR SELECT TO authenticated USING(public.can_read_case(demand_id,auth.uid()));
CREATE OR REPLACE FUNCTION public.register_case_file(_demand uuid,_path text,_filename text,_mime text,_size bigint) RETURNS public.case_attachments LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o storage.objects; r public.case_attachments; BEGIN
 IF NOT public.can_read_case(_demand,auth.uid()) OR public.case_object_demand(_path) IS DISTINCT FROM _demand THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO o FROM storage.objects WHERE bucket_id='case-evidence' AND name=_path AND owner_id=auth.uid()::text;
 IF NOT FOUND OR (o.metadata->>'size')::bigint IS DISTINCT FROM _size OR o.metadata->>'mimetype' IS DISTINCT FROM _mime THEN RAISE EXCEPTION 'invalid_file: o arquivo enviado não confere'; END IF;
 SELECT * INTO r FROM public.case_attachments WHERE path=_path;
 IF r.id IS NOT NULL THEN RETURN r; END IF;
 INSERT INTO public.case_attachments(demand_id,path,filename,mime_type,size_bytes,uploaded_by) VALUES(_demand,_path,_filename,_mime,_size,auth.uid()) RETURNING * INTO r;
 INSERT INTO public.workflow_history(entity_type,entity_id,action,actor_id,details) VALUES('demand',_demand,'attachment',auth.uid(),jsonb_build_object('attachment_id',r.id,'filename',r.filename));
 PERFORM public.case_notice(_demand,'Novo anexo na demanda',true); RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.register_case_file(uuid,text,text,text,bigint) FROM public,anon; GRANT EXECUTE ON FUNCTION public.register_case_file(uuid,text,text,text,bigint) TO authenticated;
COMMIT;
