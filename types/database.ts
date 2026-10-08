export type OrganizationType =
  | "insurer"
  | "broker"
  | "fleet"
  | "healthcare"
  | "government"
  | "enterprise"
  | "other";

export type MemberRole =
  | "customer"
  | "agent"
  | "manager"
  | "admin"
  | "super_admin";

export type AssetType =
  | "vehicle"
  | "health_plan"
  | "business_license"
  | "subscription"
  | "document"
  | "other";

export type PolicyStatus =
  | "active"
  | "expiring"
  | "expired"
  | "renewed"
  | "cancelled"
  | "suspended";

export type RenewalStatus =
  | "scheduled"
  | "pending"
  | "contacted"
  | "awaiting_confirmation"
  | "payment_pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "escalated";

export type ActionSessionChannel =
  | "web"
  | "voice"
  | "whatsapp"
  | "telegram"
  | "api";

export type ActionSessionStatus =
  | "received"
  | "understanding"
  | "planning"
  | "validating"
  | "awaiting_authorization"
  | "executing"
  | "verifying"
  | "completed"
  | "failed"
  | "escalated"
  | "cancelled"
  | "expired";

export type StepStatus =
  | "pending"
  | "executing"
  | "completed"
  | "failed"
  | "skipped"
  | "awaiting_confirmation";

export type ToolRiskLevel = "low" | "medium" | "high";

export type TransactionStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "refunded";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  type: OrganizationType;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  auth_user_id: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  profile_id: string;
  role: MemberRole;
  status: "active" | "invited" | "suspended";
  created_at: string;
  updated_at: string;
}

export interface Provider {
  id: string;
  organization_id: string;
  name: string;
  provider_type: string;
  code: string;
  status: "active" | "inactive";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PolicyType {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  description: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  organization_id: string;
  profile_id: string | null;
  customer_number: string;
  full_name: string;
  phone: string;
  email: string;
  address: string | null;
  state: string | null;
  country: string;
  status: "active" | "inactive";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  customer_id: string;
  asset_type: AssetType;
  name: string;
  identifier: string; // e.g. plate ABC-123-XY or VIN
  metadata: {
    make?: string;
    model?: string;
    year?: number;
    color?: string;
    engine_number?: string;
    chassis_number?: string;
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}

export interface Policy {
  id: string;
  customer_id: string;
  asset_id: string | null;
  provider_id: string;
  policy_type_id: string;
  policy_number: string;
  start_date: string;
  expiry_date: string;
  status: PolicyStatus;
  premium: number;
  currency: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // joined fields
  customer?: Customer;
  asset?: Asset;
  provider?: Provider;
  policy_type?: PolicyType;
}

export interface Renewal {
  id: string;
  policy_id: string;
  customer_id: string;
  scheduled_for: string;
  days_before_expiry: number;
  status: RenewalStatus;
  quote_amount: number | null;
  currency: string;
  payment_status: "unpaid" | "processing" | "paid" | "failed";
  renewed_at: string | null;
  created_at: string;
  updated_at: string;
  // joined fields
  policy?: Policy;
  customer?: Customer;
}

export interface ActionSession {
  id: string;
  customer_id: string | null;
  organization_id: string;
  channel: ActionSessionChannel;
  language: string;
  input_text: string | null;
  input_audio_url: string | null;
  intent: string | null;
  status: ActionSessionStatus;
  started_at: string;
  completed_at: string | null;
  metadata: Record<string, unknown>;
}

export interface ActionPlan {
  id: string;
  session_id: string;
  intent: string;
  goal: string;
  risk_level: ToolRiskLevel;
  confidence: number;
  status: "pending" | "approved" | "executing" | "completed" | "failed";
  created_at: string;
  completed_at: string | null;
}

export interface ActionStep {
  id: string;
  action_plan_id: string;
  sequence: number;
  action_type: string;
  description: string;
  tool_name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  status: StepStatus;
  requires_confirmation: boolean;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

export interface ToolRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  status: "active" | "deprecated" | "disabled";
  risk_level: ToolRiskLevel;
  requires_confirmation: boolean;
  configuration: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ToolPermission {
  id: string;
  tool_id: string;
  role: MemberRole;
  allowed: boolean;
  requires_approval: boolean;
  max_transaction_amount: number | null;
  created_at: string;
}

export interface ToolExecution {
  id: string;
  action_step_id: string | null;
  tool_id: string;
  requested_by: string | null;
  input: Record<string, unknown>;
  validated_input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  status: "success" | "failed";
  execution_time_ms: number;
  error: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  customer_id: string;
  renewal_id: string | null;
  amount: number;
  currency: string;
  provider: string;
  reference: string;
  status: TransactionStatus;
  transaction_type: "renewal_premium" | "refund" | "fee";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  customer_id: string;
  renewal_id: string | null;
  document_type: "certificate" | "receipt" | "policy_schedule" | "invoice";
  file_path: string;
  file_name: string;
  mime_type: string;
  status: "generated" | "archived";
  created_at: string;
}

export interface NotificationRecord {
  id: string;
  customer_id: string;
  type: "renewal_due" | "quote_ready" | "payment_success" | "certificate_issued" | "general";
  channel: "in_app" | "email" | "sms" | "whatsapp" | "telegram" | "voice";
  title: string;
  message: string;
  scheduled_for: string;
  sent_at: string | null;
  status: "pending" | "sent" | "failed";
  metadata: Record<string, unknown>;
}

export interface HumanEscalation {
  id: string;
  session_id: string;
  customer_id: string | null;
  reason: string;
  priority: "low" | "medium" | "high" | "urgent";
  assigned_to: string | null;
  status: "pending" | "in_review" | "resolved" | "dismissed";
  notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface AuditLog {
  id: string;
  organization_id: string;
  user_id: string | null;
  session_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface ActionLedgerEventRecord {
  id: string;
  session_id: string;
  sequence_number: number;
  timestamp: string;
  action: string;
  description: string;
  actor: string;
  status: string;
  tool: string | null;
  reference_id: string | null;
  previous_hash: string;
  event_hash: string;
  signature: string;
  signing_key_version: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

