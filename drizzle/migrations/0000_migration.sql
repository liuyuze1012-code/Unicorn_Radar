CREATE TABLE public.saved_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  search jsonb NOT NULL,
  stories text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_companies TO anon, authenticated;
GRANT ALL ON public.saved_companies TO service_role;
ALTER TABLE public.saved_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team can read" ON public.saved_companies FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Team can add" ON public.saved_companies FOR INSERT TO anon, authenticated WITH CHECK (length(name) BETWEEN 1 AND 200);
CREATE POLICY "Team can update" ON public.saved_companies FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (length(name) BETWEEN 1 AND 200);
CREATE POLICY "Team can remove" ON public.saved_companies FOR DELETE TO anon, authenticated USING (true);