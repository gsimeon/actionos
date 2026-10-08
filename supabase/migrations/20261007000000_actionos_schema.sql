-- ACTIONOS PRODUCTION DATABASE SCHEMA
-- Compatible with Supabase PostgreSQL (pgcrypto enabled)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS private;

-- 1. ENUMS
DO $$ BEGIN
  CREATE TYPE organization_type AS ENUM ('insurer', 'broker', 'fleet', 'healthcare', 'government', 'enterprise', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE member_role AS ENUM ('customer', 'agent', 'manager', 'admin', 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE asset_type AS ENUM ('vehicle', 'health_plan', 'business_license', 'subscription', 'document', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE policy_status AS ENUM ('active', 'expiring', 'expired', 'renewed', 'cancelled', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE renewal_status AS ENUM ('scheduled', 'pending', 'contacted', 'awaiting_confirmation', 'payment_pending', 'processing', 'completed', 'failed', 'cancelled', 'escalated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE action_channel AS ENUM ('web', 'voice', 'whatsapp', 'telegram', 'api');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE action_session_status AS ENUM ('received', 'understanding', 'planning', 'validating', 'awaiting_authorization', 'executing', 'verifying', 'completed', 'failed', 'escalated', 'cancelled', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE step_status AS ENUM ('pending', 'executing', 'completed', 'failed', 'skipped', 'awaiting_confirmation');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tool_risk_level AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transaction_status AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. CORE TABLES

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  type organization_type NOT NULL DEFAULT 'insurer',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Profiles (linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Organization Members
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'customer',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, profile_id)
);

-- Providers
CREATE TABLE IF NOT EXISTS providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL DEFAULT 'general_insurance',
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, code)
);

-- Policy Types
CREATE TABLE IF NOT EXISTS policy_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, code)
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  customer_number TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT,
  state TEXT DEFAULT 'Lagos',
  country TEXT NOT NULL DEFAULT 'Nigeria',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Assets (Vehicles, Health plans, Licenses, etc.)
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  asset_type asset_type NOT NULL DEFAULT 'vehicle',
  name TEXT NOT NULL,
  identifier TEXT NOT NULL, -- e.g. ABC-123-XY or VIN
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Policies
CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
  policy_type_id UUID NOT NULL REFERENCES policy_types(id) ON DELETE RESTRICT,
  policy_number TEXT NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  status policy_status NOT NULL DEFAULT 'active',
  premium NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'NGN',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Renewals
CREATE TABLE IF NOT EXISTS renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  scheduled_for DATE NOT NULL,
  days_before_expiry INT NOT NULL DEFAULT 7,
  status renewal_status NOT NULL DEFAULT 'scheduled',
  quote_amount NUMERIC(14, 2),
  currency TEXT NOT NULL DEFAULT 'NGN',
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'processing', 'paid', 'failed')),
  renewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Action Sessions
CREATE TABLE IF NOT EXISTS action_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel action_channel NOT NULL DEFAULT 'web',
  language TEXT NOT NULL DEFAULT 'en-NG',
  input_text TEXT,
  input_audio_url TEXT,
  intent TEXT,
  status action_session_status NOT NULL DEFAULT 'received',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Action Plans
CREATE TABLE IF NOT EXISTS action_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES action_sessions(id) ON DELETE CASCADE,
  intent TEXT NOT NULL,
  goal TEXT NOT NULL,
  risk_level tool_risk_level NOT NULL DEFAULT 'low',
  confidence NUMERIC(4, 3) NOT NULL DEFAULT 1.0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'executing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Action Steps
CREATE TABLE IF NOT EXISTS action_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_plan_id UUID NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  sequence INT NOT NULL,
  action_type TEXT NOT NULL,
  description TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  status step_status NOT NULL DEFAULT 'pending',
  requires_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT
);

-- Tools Catalog
CREATE TABLE IF NOT EXISTS tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'disabled')),
  risk_level tool_risk_level NOT NULL DEFAULT 'low',
  requires_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tool Permissions
CREATE TABLE IF NOT EXISTS tool_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  role member_role NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT TRUE,
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  max_transaction_amount NUMERIC(14, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tool_id, role)
);

-- Tool Executions
CREATE TABLE IF NOT EXISTS tool_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_step_id UUID REFERENCES action_steps(id) ON DELETE SET NULL,
  tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE RESTRICT,
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  input JSONB NOT NULL,
  validated_input JSONB NOT NULL,
  output JSONB,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  execution_time_ms INT NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  renewal_id UUID REFERENCES renewals(id) ON DELETE SET NULL,
  amount NUMERIC(14, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  provider TEXT NOT NULL DEFAULT 'mock_paystack',
  reference TEXT NOT NULL UNIQUE,
  status transaction_status NOT NULL DEFAULT 'pending',
  transaction_type TEXT NOT NULL DEFAULT 'renewal_premium' CHECK (transaction_type IN ('renewal_premium', 'refund', 'fee')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Documents
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  renewal_id UUID REFERENCES renewals(id) ON DELETE SET NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('certificate', 'receipt', 'policy_schedule', 'invoice')),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('renewal_due', 'quote_ready', 'payment_success', 'certificate_issued', 'general')),
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'sms', 'whatsapp', 'telegram', 'voice')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Human Escalations
CREATE TABLE IF NOT EXISTS human_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES action_sessions(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'resolved', 'dismissed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  session_id UUID REFERENCES action_sessions(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_org_members_lookup ON organization_members(organization_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_profile ON customers(profile_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone_email ON customers(phone, email);
CREATE INDEX IF NOT EXISTS idx_assets_customer ON assets(customer_id);
CREATE INDEX IF NOT EXISTS idx_assets_identifier ON assets(identifier);
CREATE INDEX IF NOT EXISTS idx_policies_customer ON policies(customer_id);
CREATE INDEX IF NOT EXISTS idx_policies_expiry ON policies(expiry_date);
CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
CREATE INDEX IF NOT EXISTS idx_renewals_policy ON renewals(policy_id);
CREATE INDEX IF NOT EXISTS idx_renewals_customer ON renewals(customer_id);
CREATE INDEX IF NOT EXISTS idx_renewals_status ON renewals(status);
CREATE INDEX IF NOT EXISTS idx_renewals_scheduled ON renewals(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_action_sessions_org ON action_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_action_sessions_status ON action_sessions(status);
CREATE INDEX IF NOT EXISTS idx_action_sessions_customer ON action_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_action_steps_plan ON action_steps(action_plan_id, sequence);
CREATE INDEX IF NOT EXISTS idx_tool_executions_tool ON tool_executions(tool_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_ref ON transactions(reference);
CREATE INDEX IF NOT EXISTS idx_notifications_customer ON notifications(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs(organization_id, created_at DESC);

-- 4. PRIVATE HELPER FUNCTIONS FOR RLS
CREATE OR REPLACE FUNCTION private.current_profile_id()
RETURNS UUID AS $$
  SELECT id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION private.is_org_member(target_org UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members om
    JOIN profiles p ON om.profile_id = p.id
    WHERE om.organization_id = target_org
      AND p.auth_user_id = auth.uid()
      AND om.status = 'active'
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION private.has_org_role(target_org UUID, allowed_roles member_role[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members om
    JOIN profiles p ON om.profile_id = p.id
    WHERE om.organization_id = target_org
      AND p.auth_user_id = auth.uid()
      AND om.status = 'active'
      AND om.role = ANY(allowed_roles)
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE human_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: users can view and update their own profile
CREATE POLICY profiles_select_self ON profiles FOR SELECT USING (auth_user_id = auth.uid());
CREATE POLICY profiles_update_self ON profiles FOR UPDATE USING (auth_user_id = auth.uid());

-- Organization Members: viewable by org members
CREATE POLICY org_members_select ON organization_members FOR SELECT USING (private.is_org_member(organization_id));

-- Organizations: viewable by their members
CREATE POLICY orgs_select ON organizations FOR SELECT USING (private.is_org_member(id));

-- Customers: viewable if customer themselves or org staff
CREATE POLICY customers_select ON customers FOR SELECT USING (
  profile_id = private.current_profile_id() OR
  private.has_org_role(organization_id, ARRAY['agent', 'manager', 'admin', 'super_admin']::member_role[])
);

-- Policies: viewable if customer owns or org staff
CREATE POLICY policies_select ON policies FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = policies.customer_id
      AND (c.profile_id = private.current_profile_id() OR private.is_org_member(c.organization_id))
  )
);

-- Renewals: viewable if customer owns or org staff
CREATE POLICY renewals_select ON renewals FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = renewals.customer_id
      AND (c.profile_id = private.current_profile_id() OR private.is_org_member(c.organization_id))
  )
);

-- Action Sessions: viewable by customer or org staff
CREATE POLICY sessions_select ON action_sessions FOR SELECT USING (
  (customer_id IS NOT NULL AND customer_id IN (SELECT id FROM customers WHERE profile_id = private.current_profile_id()))
  OR private.is_org_member(organization_id)
);

-- Sensitive tables: tool_executions, transactions, documents, notifications, audit_logs
-- Readable by authorized staff / owner; strictly NO direct browser inserts or updates (Server / service_role only)
CREATE POLICY transactions_select ON transactions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = transactions.customer_id
      AND (c.profile_id = private.current_profile_id() OR private.is_org_member(c.organization_id))
  )
);

CREATE POLICY documents_select ON documents FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = documents.customer_id
      AND (c.profile_id = private.current_profile_id() OR private.is_org_member(c.organization_id))
  )
);

CREATE POLICY notifications_select ON notifications FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = notifications.customer_id
      AND (c.profile_id = private.current_profile_id() OR private.is_org_member(c.organization_id))
  )
);

CREATE POLICY audit_logs_select ON audit_logs FOR SELECT USING (
  private.has_org_role(organization_id, ARRAY['manager', 'admin', 'super_admin']::member_role[])
);
