-- ACTIONOS SYNTHETIC DEMO SEED DATA (COMPETITION BENCHMARK)
-- Strictly synthetic test doubles for NITDA 2026 AI Innovation Challenge

-- 1. Organizations
INSERT INTO organizations (id, name, slug, type, status)
VALUES 
  ('a0000000-0000-0000-0000-000000000001', 'ActionOS Demo Insurance', 'actionos-demo-insurance', 'insurer', 'active')
ON CONFLICT (id) DO NOTHING;

-- 2. Profiles (Staff & Demo Customer)
INSERT INTO profiles (id, full_name, phone, avatar_url, status)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Demo Admin', '+234 800 000 0001', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', 'active'),
  ('b0000000-0000-0000-0000-000000000002', 'Demo Agent', '+234 800 000 0002', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', 'active'),
  ('b0000000-0000-0000-0000-000000000003', 'Demo Customer User', '+234 800 000 0003', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150', 'active')
ON CONFLICT (id) DO NOTHING;

-- 3. Organization Members
INSERT INTO organization_members (id, organization_id, profile_id, role, status)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'admin', 'active'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'agent', 'active'),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'customer', 'active')
ON CONFLICT (id) DO NOTHING;

-- 4. Providers
INSERT INTO providers (id, organization_id, name, provider_type, code, status, metadata)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Demo Insurance Ltd.', 'motor_insurance', 'DEMO-INS', 'active', '{"license": "NAICOM/RIC/2026/041"}'::jsonb),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Leadway Assurance Co.', 'general_insurance', 'LEADWAY', 'active', '{"license": "NAICOM/RIC/2024/002"}'::jsonb),
  ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'AIICO Insurance Plc', 'general_insurance', 'AIICO', 'active', '{"license": "NAICOM/RIC/2024/009"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 5. Policy Types
INSERT INTO policy_types (id, organization_id, name, code, description, status)
VALUES
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Comprehensive Motor Insurance', 'AUTO-COMP', 'Full accidental damage, theft, fire, and third-party property damage coverage', 'active'),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Third-Party Motor Insurance', 'AUTO-TP', 'Mandatory statutory third-party bodily injury and property damage cover', 'active'),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Executive Health HMO Plan', 'HEALTH-EXEC', 'Comprehensive in-patient and out-patient private clinic cover across Nigeria', 'active')
ON CONFLICT (id) DO NOTHING;

-- 6. Customers
INSERT INTO customers (id, organization_id, profile_id, customer_number, full_name, phone, email, address, state, country, status, metadata)
VALUES
  ('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'CUS-000001', 'Demo Customer', '+234 800 000 0001', 'demo.customer@actionos.ng', '101 Demo Innovation Avenue, Victoria Island', 'Lagos', 'Nigeria', 'active', '{"nin": "DEMO-NIN-000001", "preferred_language": "en-NG"}'::jsonb),
  ('f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', NULL, 'CUS-000002', 'Demo Customer Two', '+234 800 000 0002', 'demo.customer2@actionos.ng', '202 Demo Synthetic Boulevard, Lagos Island', 'Lagos', 'Nigeria', 'active', '{"nin": "DEMO-NIN-000002"}'::jsonb),
  ('f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', NULL, 'CUS-000003', 'Demo Customer Three', '+234 800 000 0003', 'demo.customer3@actionos.ng', '303 Demo Sandbox Avenue, Central District', 'Abuja', 'Nigeria', 'active', '{"nin": "DEMO-NIN-000003"}'::jsonb),
  ('f0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', NULL, 'CUS-000004', 'Demo Customer Four', '+234 800 000 0004', 'demo.customer4@actionos.ng', '404 Demo Commercial Way, Industrial Zone', 'Kano', 'Nigeria', 'active', '{"nin": "DEMO-NIN-000004"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 7. Assets
INSERT INTO assets (id, customer_id, asset_type, name, identifier, metadata)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'vehicle', 'Toyota Camry', 'ABC-123-XY', '{"year": 2022, "color": "Midnight Black", "chassis": "DEMO-VIN-000001", "engine": "DEMO-ENGINE-000001"}'::jsonb),
  ('10000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', 'vehicle', 'Honda Accord', 'KJA-882-AB', '{"year": 2021, "color": "Silver Metallic"}'::jsonb),
  ('10000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000003', 'vehicle', 'Mercedes-Benz GLE 450', 'ABJ-501-LG', '{"year": 2024, "color": "Polar White"}'::jsonb),
  ('10000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000004', 'vehicle', 'Toyota Hilux 4x4', 'KN-990-TR', '{"year": 2023, "color": "Army Green"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 8. Policies
-- Key benchmark policy: AUTO-2026-00182 expiring in 7 days (14 Oct 2026)
INSERT INTO policies (id, customer_id, asset_id, provider_id, policy_type_id, policy_number, start_date, expiry_date, status, premium, currency, metadata)
VALUES
  ('20000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'AUTO-2026-00182', '2025-10-14', '2026-10-14', 'expiring', 87500.00, 'NGN', '{"inspection_passed": true, "no_claim_discount": 0.15}'::jsonb),
  ('20000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'AUTO-2026-00140', '2025-10-01', '2026-10-01', 'expired', 15000.00, 'NGN', '{}'::jsonb),
  ('20000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', 'AUTO-2026-00195', '2025-11-20', '2026-11-20', 'active', 320000.00, 'NGN', '{}'::jsonb),
  ('20000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'AUTO-2026-00175', '2025-10-21', '2026-10-21', 'expiring', 145000.00, 'NGN', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 9. Renewals
INSERT INTO renewals (id, policy_id, customer_id, scheduled_for, days_before_expiry, status, quote_amount, currency, payment_status)
VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', '2026-10-07', 7, 'awaiting_confirmation', 87500.00, 'NGN', 'pending'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', '2026-09-24', 7, 'failed', 15000.00, 'NGN', 'failed'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000004', '2026-10-14', 7, 'scheduled', 145000.00, 'NGN', 'pending')
ON CONFLICT (id) DO NOTHING;

-- 10. Tools Catalog
INSERT INTO tools (id, name, description, category, version, status, risk_level, requires_confirmation, configuration)
VALUES
  ('40000000-0000-0000-0000-000000000001', 'get_customer', 'Retrieve customer profile, contact details, and organization membership', 'customer', '1.0.0', 'active', 'low', false, '{}'::jsonb),
  ('40000000-0000-0000-0000-000000000002', 'get_policy', 'Find active, expiring, or historical policy for a customer asset', 'policy', '1.0.0', 'active', 'low', false, '{}'::jsonb),
  ('40000000-0000-0000-0000-000000000003', 'check_renewal_eligibility', 'Deterministic validation of renewal window, suspension status, and underwriting rules', 'policy', '1.0.0', 'active', 'low', false, '{"max_days_before_expiry": 30}'::jsonb),
  ('40000000-0000-0000-0000-000000000004', 'get_quote', 'Compute actuarial renewal quote including discounts and taxes', 'billing', '1.0.0', 'active', 'medium', false, '{"vat_rate": 0.075}'::jsonb),
  ('40000000-0000-0000-0000-000000000005', 'request_payment', 'Initialize secure payment through designated payment rail (Paystack/Flutterwave)', 'payment', '1.0.0', 'active', 'high', true, '{"gateway": "mock_paystack"}'::jsonb),
  ('40000000-0000-0000-0000-000000000006', 'verify_payment', 'Independently query payment rail to confirm settlement and amount match', 'payment', '1.0.0', 'active', 'medium', false, '{}'::jsonb),
  ('40000000-0000-0000-0000-000000000007', 'renew_policy', 'Execute policy renewal state transition and roll forward expiry date', 'policy', '1.0.0', 'active', 'high', true, '{}'::jsonb),
  ('40000000-0000-0000-0000-000000000008', 'generate_certificate', 'Produce digitally signed official insurance certificate document', 'document', '1.0.0', 'active', 'medium', false, '{}'::jsonb),
  ('40000000-0000-0000-0000-000000000009', 'send_notification', 'Dispatch multi-channel notification (in-app, SMS, email, WhatsApp)', 'communication', '1.0.0', 'active', 'low', false, '{}'::jsonb),
  ('40000000-0000-0000-0000-000000000010', 'schedule_reminder', 'Set up automated reminder cascade (30d, 14d, 7d, 1d before next expiry)', 'scheduler', '1.0.0', 'active', 'low', false, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 11. Tool Permissions (RBAC defaults)
INSERT INTO tool_permissions (tool_id, role, allowed, requires_approval, max_transaction_amount)
SELECT id, 'customer'::member_role, true, (requires_confirmation), 500000.00 FROM tools
ON CONFLICT (tool_id, role) DO NOTHING;

INSERT INTO tool_permissions (tool_id, role, allowed, requires_approval, max_transaction_amount)
SELECT id, 'agent'::member_role, true, false, 2000000.00 FROM tools
ON CONFLICT (tool_id, role) DO NOTHING;

INSERT INTO tool_permissions (tool_id, role, allowed, requires_approval, max_transaction_amount)
SELECT id, 'manager'::member_role, true, false, 10000000.00 FROM tools
ON CONFLICT (tool_id, role) DO NOTHING;

INSERT INTO tool_permissions (tool_id, role, allowed, requires_approval, max_transaction_amount)
SELECT id, 'admin'::member_role, true, false, NULL FROM tools
ON CONFLICT (tool_id, role) DO NOTHING;
