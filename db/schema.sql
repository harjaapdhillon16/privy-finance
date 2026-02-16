CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE,
    near_wallet_address TEXT UNIQUE,
    auth_type TEXT NOT NULL CHECK (auth_type IN ('email', 'wallet')),
    full_name TEXT,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    country_code TEXT NOT NULL,
    currency TEXT NOT NULL,
    date_of_birth DATE,
    employment_type TEXT,
    annual_income_range TEXT,
    risk_tolerance INTEGER CHECK (risk_tolerance BETWEEN 1 AND 10),
    time_horizon TEXT,
    primary_goals TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE TABLE financial_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    monthly_income DECIMAL(12,2) DEFAULT 0,
    income_sources JSONB DEFAULT '{}',
    cash_savings DECIMAL(12,2) DEFAULT 0,
    investments DECIMAL(12,2) DEFAULT 0,
    retirement_accounts DECIMAL(12,2) DEFAULT 0,
    crypto DECIMAL(12,2) DEFAULT 0,
    real_estate DECIMAL(12,2) DEFAULT 0,
    other_assets DECIMAL(12,2) DEFAULT 0,
    total_assets DECIMAL(12,2) GENERATED ALWAYS AS (
        cash_savings + investments + retirement_accounts +
        crypto + real_estate + other_assets
    ) STORED,
    mortgage DECIMAL(12,2) DEFAULT 0,
    student_loans DECIMAL(12,2) DEFAULT 0,
    auto_loans DECIMAL(12,2) DEFAULT 0,
    credit_cards DECIMAL(12,2) DEFAULT 0,
    personal_loans DECIMAL(12,2) DEFAULT 0,
    other_debt DECIMAL(12,2) DEFAULT 0,
    total_liabilities DECIMAL(12,2) GENERATED ALWAYS AS (
        mortgage + student_loans + auto_loans +
        credit_cards + personal_loans + other_debt
    ) STORED,
    net_worth DECIMAL(12,2) GENERATED ALWAYS AS (
        total_assets - total_liabilities
    ) STORED,
    monthly_expenses JSONB DEFAULT '{}',
    total_monthly_expenses DECIMAL(12,2) DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE TABLE onboarding_data (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    data_of_user JSONB DEFAULT '{}',
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_onboarding_data_user ON onboarding_data(user_id);

CREATE TABLE nova_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nova_document_id TEXT NOT NULL UNIQUE,
    nova_encryption_key_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_type TEXT NOT NULL,
    mime_type TEXT,
    document_type TEXT NOT NULL,
    account_name TEXT,
    statement_period_start DATE,
    statement_period_end DATE,
    processing_status TEXT DEFAULT 'pending',
    processing_error TEXT,
    processed_at TIMESTAMPTZ,
    transaction_count INTEGER DEFAULT 0,
    date_range_start DATE,
    date_range_end DATE,
    total_income DECIMAL(12,2),
    total_expenses DECIMAL(12,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_nova_documents_user ON nova_documents(user_id);
CREATE INDEX idx_nova_documents_status ON nova_documents(user_id, processing_status);
CREATE INDEX idx_nova_documents_nova_id ON nova_documents(nova_document_id);

CREATE TABLE transaction_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id UUID REFERENCES nova_documents(id) ON DELETE SET NULL,
    summary_month DATE NOT NULL,
    total_income DECIMAL(12,2) DEFAULT 0,
    income_count INTEGER DEFAULT 0,
    income_by_source JSONB DEFAULT '{}',
    total_expenses DECIMAL(12,2) DEFAULT 0,
    expense_count INTEGER DEFAULT 0,
    expenses_by_category JSONB DEFAULT '{}',
    top_merchants JSONB DEFAULT '[]',
    all_transactions JSONB DEFAULT '[]',
    net_cashflow DECIMAL(12,2) GENERATED ALWAYS AS (
        total_income - total_expenses
    ) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, summary_month)
);

CREATE INDEX idx_transaction_summaries_user ON transaction_summaries(user_id);
CREATE INDEX idx_transaction_summaries_month ON transaction_summaries(user_id, summary_month DESC);

CREATE TABLE ai_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tee_attestation_id TEXT NOT NULL,
    near_ai_request_id TEXT,
    processed_in_tee BOOLEAN DEFAULT TRUE,
    attestation_verified BOOLEAN DEFAULT FALSE,
    analysis_type TEXT NOT NULL,
    analysis_summary TEXT NOT NULL,
    detailed_breakdown JSONB NOT NULL,
    model_used TEXT DEFAULT 'claude-sonnet-4-20250514',
    confidence_score DECIMAL(3,2),
    processing_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_analyses_user ON ai_analyses(user_id);
CREATE INDEX idx_ai_analyses_created ON ai_analyses(user_id, created_at DESC);
CREATE INDEX idx_ai_analyses_attestation ON ai_analyses(tee_attestation_id);

CREATE TABLE insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    analysis_id UUID REFERENCES ai_analyses(id) ON DELETE SET NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    potential_savings DECIMAL(12,2),
    potential_earnings DECIMAL(12,2),
    impact_level TEXT DEFAULT 'medium',
    action_required TEXT,
    complexity TEXT DEFAULT 'medium',
    estimated_time TEXT,
    status TEXT DEFAULT 'new',
    viewed_at TIMESTAMPTZ,
    acted_on_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_insights_user ON insights(user_id);
CREATE INDEX idx_insights_status ON insights(user_id, status);

CREATE TABLE goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    target_amount DECIMAL(12,2) NOT NULL,
    current_amount DECIMAL(12,2) DEFAULT 0,
    target_date DATE,
    progress_percentage DECIMAL(5,2) GENERATED ALWAYS AS (
        CASE
            WHEN target_amount > 0 THEN (current_amount / target_amount * 100)
            ELSE 0
        END
    ) STORED,
    monthly_contribution DECIMAL(12,2),
    status TEXT DEFAULT 'active',
    priority INTEGER DEFAULT 3,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_goals_user ON goals(user_id);

CREATE TABLE goal_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    note TEXT,
    progress_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE nova_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own data" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own financial data" ON financial_data FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own financial data" ON financial_data FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own financial data" ON financial_data FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own onboarding data" ON onboarding_data FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own onboarding data" ON onboarding_data FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own onboarding data" ON onboarding_data FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own documents" ON nova_documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own documents" ON nova_documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own documents" ON nova_documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own documents" ON nova_documents FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own summaries" ON transaction_summaries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own summaries" ON transaction_summaries FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own analyses" ON ai_analyses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own analyses" ON ai_analyses FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own insights" ON insights FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own insights" ON insights FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own insights" ON insights FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own goals" ON goals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own progress" ON goal_progress
    FOR ALL USING (
        EXISTS (SELECT 1 FROM goals WHERE goals.id = goal_progress.goal_id AND goals.user_id = auth.uid())
    );

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_financial_data_updated_at BEFORE UPDATE ON financial_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_nova_documents_updated_at BEFORE UPDATE ON nova_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_transaction_summaries_updated_at BEFORE UPDATE ON transaction_summaries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_insights_updated_at BEFORE UPDATE ON insights
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON goals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
