import type {
  Customer,
  Asset,
  Policy,
  Renewal,
  ActionSession,
  ActionPlan,
  ActionStep,
  Transaction,
  Document,
  NotificationRecord,
  AuditLog,
} from "@/types/database";
import type { ActionLedgerEvent } from "@/types/actionos";

export interface ActionOSDataStore {
  customers: Customer[];
  assets: Asset[];
  policies: Policy[];
  renewals: Renewal[];
  sessions: ActionSession[];
  plans: ActionPlan[];
  steps: ActionStep[];
  transactions: Transaction[];
  documents: Document[];
  notifications: NotificationRecord[];
  auditLogs: AuditLog[];
  ledgerEvents: Record<string, ActionLedgerEvent[]>; // keyed by sessionId
}

function initializeDefaultData(): ActionOSDataStore {
  const customerId = "f0000000-0000-0000-0000-000000000001";
  const orgId = "a0000000-0000-0000-0000-000000000001";
  const vehicleId = "10000000-0000-0000-0000-000000000001";
  const policyId = "20000000-0000-0000-0000-000000000001";
  const renewalId = "30000000-0000-0000-0000-000000000001";

  const customers: Customer[] = [
    {
      id: customerId,
      organization_id: orgId,
      profile_id: "b0000000-0000-0000-0000-000000000003",
      customer_number: "CUS-000001",
      full_name: "Demo Customer",
      phone: "+234 803 123 4567",
      email: "demo.customer@actionos.ng",
      address: "14 Adeola Odeku St, Victoria Island",
      state: "Lagos",
      country: "Nigeria",
      status: "active",
      metadata: { nin: "12345678901", preferred_language: "en-NG" },
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "f0000000-0000-0000-0000-000000000002",
      organization_id: orgId,
      profile_id: null,
      customer_number: "CUS-000002",
      full_name: "Babajide Adeleke",
      phone: "+234 802 333 1122",
      email: "babajide.adeleke@gmail.com",
      address: "12 Marina Road, Lagos Island",
      state: "Lagos",
      country: "Nigeria",
      status: "active",
      metadata: {},
      created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "f0000000-0000-0000-0000-000000000003",
      organization_id: orgId,
      profile_id: null,
      customer_number: "CUS-000003",
      full_name: "Ngozi Okonjo",
      phone: "+234 809 444 8877",
      email: "ngozi.okonjo@fintech.ng",
      address: "Plot 412, Maitama District",
      state: "Abuja",
      country: "Nigeria",
      status: "active",
      metadata: {},
      created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "f0000000-0000-0000-0000-000000000004",
      organization_id: orgId,
      profile_id: null,
      customer_number: "CUS-000004",
      full_name: "Tariq Al-Mansur",
      phone: "+234 807 111 2233",
      email: "tariq.mansur@logistics.ng",
      address: "Bompai Industrial Area",
      state: "Kano",
      country: "Nigeria",
      status: "active",
      metadata: {},
      created_at: new Date(Date.now() - 90 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const assets: Asset[] = [
    {
      id: vehicleId,
      customer_id: customerId,
      asset_type: "vehicle",
      name: "Toyota Camry",
      identifier: "ABC-123-XY",
      metadata: {
        year: 2022,
        color: "Midnight Black",
        engine_number: "2AR-FE-99412",
        chassis_number: "4T1BF1FK8CU128941",
      },
      created_at: new Date(Date.now() - 365 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "10000000-0000-0000-0000-000000000002",
      customer_id: "f0000000-0000-0000-0000-000000000002",
      asset_type: "vehicle",
      name: "Honda Accord",
      identifier: "KJA-882-AB",
      metadata: { year: 2021, color: "Silver Metallic" },
      created_at: new Date(Date.now() - 400 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "10000000-0000-0000-0000-000000000003",
      customer_id: "f0000000-0000-0000-0000-000000000003",
      asset_type: "vehicle",
      name: "Mercedes-Benz GLE 450",
      identifier: "ABJ-501-LG",
      metadata: { year: 2024, color: "Polar White" },
      created_at: new Date(Date.now() - 100 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "10000000-0000-0000-0000-000000000004",
      customer_id: "f0000000-0000-0000-0000-000000000004",
      asset_type: "vehicle",
      name: "Toyota Hilux 4x4",
      identifier: "KN-990-TR",
      metadata: { year: 2023, color: "Army Green" },
      created_at: new Date(Date.now() - 200 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  // Benchmark Policy AUTO-2026-00182 expires 14 Oct 2026 (7 days from Oct 7, 2026)
  const policies: Policy[] = [
    {
      id: policyId,
      customer_id: customerId,
      asset_id: vehicleId,
      provider_id: "d0000000-0000-0000-0000-000000000001",
      policy_type_id: "e0000000-0000-0000-0000-000000000001",
      policy_number: "AUTO-2026-00182",
      start_date: "2025-10-14",
      expiry_date: "2026-10-14",
      status: "expiring",
      premium: 87500.0,
      currency: "NGN",
      metadata: {
        provider_name: "Demo Insurance Ltd.",
        policy_type_name: "Comprehensive Motor Insurance",
        vehicle_name: "Toyota Camry",
        vehicle_reg: "ABC-123-XY",
        inspection_status: "PASSED",
      },
      created_at: "2025-10-14T08:00:00Z",
      updated_at: new Date().toISOString(),
    },
    {
      id: "20000000-0000-0000-0000-000000000002",
      customer_id: "f0000000-0000-0000-0000-000000000002",
      asset_id: "10000000-0000-0000-0000-000000000002",
      provider_id: "d0000000-0000-0000-0000-000000000002",
      policy_type_id: "e0000000-0000-0000-0000-000000000002",
      policy_number: "AUTO-2026-00140",
      start_date: "2025-10-01",
      expiry_date: "2026-10-01",
      status: "expired",
      premium: 15000.0,
      currency: "NGN",
      metadata: {
        provider_name: "Leadway Assurance Co.",
        policy_type_name: "Third-Party Motor Insurance",
        vehicle_name: "Honda Accord",
        vehicle_reg: "KJA-882-AB",
      },
      created_at: "2025-10-01T09:00:00Z",
      updated_at: new Date().toISOString(),
    },
    {
      id: "20000000-0000-0000-0000-000000000003",
      customer_id: "f0000000-0000-0000-0000-000000000003",
      asset_id: "10000000-0000-0000-0000-000000000003",
      provider_id: "d0000000-0000-0000-0000-000000000003",
      policy_type_id: "e0000000-0000-0000-0000-000000000001",
      policy_number: "AUTO-2026-00195",
      start_date: "2025-11-20",
      expiry_date: "2026-11-20",
      status: "active",
      premium: 320000.0,
      currency: "NGN",
      metadata: {
        provider_name: "AIICO Insurance Plc",
        policy_type_name: "Comprehensive Motor Insurance",
        vehicle_name: "Mercedes-Benz GLE 450",
        vehicle_reg: "ABJ-501-LG",
      },
      created_at: "2025-11-20T10:00:00Z",
      updated_at: new Date().toISOString(),
    },
    {
      id: "20000000-0000-0000-0000-000000000004",
      customer_id: "f0000000-0000-0000-0000-000000000004",
      asset_id: "10000000-0000-0000-0000-000000000004",
      provider_id: "d0000000-0000-0000-0000-000000000002",
      policy_type_id: "e0000000-0000-0000-0000-000000000001",
      policy_number: "AUTO-2026-00175",
      start_date: "2025-10-21",
      expiry_date: "2026-10-21",
      status: "expiring",
      premium: 145000.0,
      currency: "NGN",
      metadata: {
        provider_name: "Leadway Assurance Co.",
        policy_type_name: "Comprehensive Motor Insurance",
        vehicle_name: "Toyota Hilux 4x4",
        vehicle_reg: "KN-990-TR",
      },
      created_at: "2025-10-21T11:00:00Z",
      updated_at: new Date().toISOString(),
    },
  ];

  const renewals: Renewal[] = [
    {
      id: renewalId,
      policy_id: policyId,
      customer_id: customerId,
      scheduled_for: "2026-10-07",
      days_before_expiry: 7,
      status: "awaiting_confirmation",
      quote_amount: 87500.0,
      currency: "NGN",
      payment_status: "unpaid",
      renewed_at: null,
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "30000000-0000-0000-0000-000000000002",
      policy_id: "20000000-0000-0000-0000-000000000002",
      customer_id: "f0000000-0000-0000-0000-000000000002",
      scheduled_for: "2026-09-24",
      days_before_expiry: 7,
      status: "failed",
      quote_amount: 15000.0,
      currency: "NGN",
      payment_status: "failed",
      renewed_at: null,
      created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "30000000-0000-0000-0000-000000000003",
      policy_id: "20000000-0000-0000-0000-000000000004",
      customer_id: "f0000000-0000-0000-0000-000000000004",
      scheduled_for: "2026-10-14",
      days_before_expiry: 7,
      status: "scheduled",
      quote_amount: 145000.0,
      currency: "NGN",
      payment_status: "unpaid",
      renewed_at: null,
      created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  return {
    customers,
    assets,
    policies,
    renewals,
    sessions: [],
    plans: [],
    steps: [],
    transactions: [],
    documents: [],
    notifications: [],
    auditLogs: [],
    ledgerEvents: {},
  };
}

// Global in-memory singleton for development / demo persistence across requests
declare global {
  // eslint-disable-next-line no-var
  var __actionOSStore: ActionOSDataStore | undefined;
}

export function getStore(): ActionOSDataStore {
  if (!global.__actionOSStore) {
    global.__actionOSStore = initializeDefaultData();
  }
  return global.__actionOSStore;
}

export function resetStore(): ActionOSDataStore {
  global.__actionOSStore = initializeDefaultData();
  return global.__actionOSStore;
}
