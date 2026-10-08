-- ============================================================================
-- ActionOS Versioned Migration: First-Class Verifiable Quotes & Tenant Hardening
-- ============================================================================

-- 1. Add direct organization_id to renewals for defense-in-depth tenant scoping
ALTER TABLE renewals 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Backfill renewals.organization_id from customers
UPDATE renewals r
SET organization_id = c.organization_id
FROM customers c
WHERE r.customer_id = c.id AND r.organization_id IS NULL;

-- Index renewals.organization_id
CREATE INDEX IF NOT EXISTS idx_renewals_organization_id ON renewals(organization_id);

-- 2. First-class Quotes Table
CREATE TABLE IF NOT EXISTS quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES action_sessions(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    underwriter_id UUID REFERENCES providers(id) ON DELETE SET NULL,
    provider_name TEXT NOT NULL,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
    status VARCHAR(20) NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'accepted', 'rejected', 'expired')),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL,
    quote_hash VARCHAR(64) NOT NULL,
    provider_reference TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for performant lookup
CREATE INDEX IF NOT EXISTS idx_quotes_session_id ON quotes(session_id);
CREATE INDEX IF NOT EXISTS idx_quotes_organization_id ON quotes(organization_id);
CREATE INDEX IF NOT EXISTS idx_quotes_customer_id ON quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_policy_id ON quotes(policy_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);

-- 3. Row Level Security for Quotes
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for quotes" ON quotes
    FOR ALL
    USING (
        organization_id = (SELECT organization_id FROM profiles WHERE auth_user_id = auth.uid())
    );
