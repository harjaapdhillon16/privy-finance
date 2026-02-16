-- Onboarding data table + RLS policies

CREATE TABLE IF NOT EXISTS onboarding_data (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  data_of_user JSONB DEFAULT '{}',
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_onboarding_data_user ON onboarding_data(user_id);

ALTER TABLE onboarding_data ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'onboarding_data' AND policyname = 'Users can view own onboarding data'
  ) THEN
    CREATE POLICY "Users can view own onboarding data"
      ON onboarding_data FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'onboarding_data' AND policyname = 'Users can insert own onboarding data'
  ) THEN
    CREATE POLICY "Users can insert own onboarding data"
      ON onboarding_data FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'onboarding_data' AND policyname = 'Users can update own onboarding data'
  ) THEN
    CREATE POLICY "Users can update own onboarding data"
      ON onboarding_data FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
END $$;
