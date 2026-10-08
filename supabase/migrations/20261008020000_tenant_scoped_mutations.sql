-- TENANT-SCOPED MUTATION HARDENING & RLS POLICIES
-- Ensures organization ownership is verified at the database level for all mutations

-- 1. Add organization_id to transactions if missing
ALTER TABLE transactions 
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Backfill organization_id from customers table
UPDATE transactions t
SET organization_id = c.organization_id
FROM customers c
WHERE t.customer_id = c.id AND t.organization_id IS NULL;

-- 2. Add organization_id to action_steps if missing
ALTER TABLE action_steps 
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Backfill organization_id from action_plans -> action_sessions
UPDATE action_steps s
SET organization_id = sess.organization_id
FROM action_plans p
JOIN action_sessions sess ON p.session_id = sess.id
WHERE s.action_plan_id = p.id AND s.organization_id IS NULL;

-- 3. High-performance composite indexes for tenant-scoped updates
CREATE INDEX IF NOT EXISTS idx_transactions_id_org ON transactions (id, organization_id);
CREATE INDEX IF NOT EXISTS idx_action_steps_id_org ON action_steps (id, organization_id);
CREATE INDEX IF NOT EXISTS idx_quotes_id_org_status ON quotes (id, organization_id, status);
CREATE INDEX IF NOT EXISTS idx_action_sessions_id_org_status ON action_sessions (id, organization_id, status);

-- 4. Enable RLS on newly hardened tables
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_steps ENABLE ROW LEVEL SECURITY;

-- 5. Restrictive RLS Policies
DROP POLICY IF EXISTS transactions_tenant_isolation ON transactions;
CREATE POLICY transactions_tenant_isolation ON transactions
  FOR ALL
  USING (
    organization_id = (SELECT organization_id FROM organization_members WHERE profile_id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS action_steps_tenant_isolation ON action_steps;
CREATE POLICY action_steps_tenant_isolation ON action_steps
  FOR ALL
  USING (
    organization_id = (SELECT organization_id FROM organization_members WHERE profile_id = auth.uid() LIMIT 1)
  );
