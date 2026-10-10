-- ============================================================================
-- ActionOS Migration: Assets RLS Policies and High-Performance Query Indexes
-- ============================================================================

-- Ensure Row Level Security is explicitly enabled on assets
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

-- Assets SELECT policy:
-- Customer can inspect their own assets; authorized organization members can inspect assets in their tenant org
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'assets' AND policyname = 'assets_select'
  ) THEN
    CREATE POLICY assets_select ON public.assets FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = assets.customer_id
          AND (c.profile_id = private.current_profile_id() OR private.is_org_member(c.organization_id))
      )
    );
  END IF;
END $$;

-- Assets INSERT policy:
-- Customers can register assets under their customer record; agents and staff can create assets for org customers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'assets' AND policyname = 'assets_insert'
  ) THEN
    CREATE POLICY assets_insert ON public.assets FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = assets.customer_id
          AND (c.profile_id = private.current_profile_id() OR private.has_org_role(c.organization_id, ARRAY['agent', 'manager', 'admin', 'super_admin']::member_role[]))
      )
    );
  END IF;
END $$;

-- Assets UPDATE policy:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'assets' AND policyname = 'assets_update'
  ) THEN
    CREATE POLICY assets_update ON public.assets FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = assets.customer_id
          AND (c.profile_id = private.current_profile_id() OR private.has_org_role(c.organization_id, ARRAY['agent', 'manager', 'admin', 'super_admin']::member_role[]))
      )
    );
  END IF;
END $$;

-- High-performance query indexes for vehicle lookups
CREATE INDEX IF NOT EXISTS idx_assets_metadata_gin ON public.assets USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_assets_vin ON public.assets ((metadata->>'vin'));
CREATE INDEX IF NOT EXISTS idx_assets_chassis ON public.assets ((metadata->>'chassis_number'));
CREATE INDEX IF NOT EXISTS idx_assets_engine ON public.assets ((metadata->>'engine_number'));
