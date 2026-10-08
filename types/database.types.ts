import type {
  Organization,
  Profile,
  OrganizationMember,
  Provider,
  PolicyType,
  Customer,
  Asset,
  Policy,
  Renewal,
  ActionSession,
  ActionPlan,
  ActionStep,
  ToolRecord,
  ToolPermission,
  ToolExecution,
  Transaction,
  Document,
  NotificationRecord,
  HumanEscalation,
  AuditLog,
  ActionLedgerEventRecord,
} from "./database";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: Organization;
        Insert: Partial<Organization> & { name: string; slug: string; type: Organization["type"] };
        Update: Partial<Organization>;
      };
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { auth_user_id: string; full_name: string };
        Update: Partial<Profile>;
      };
      organization_members: {
        Row: OrganizationMember;
        Insert: Partial<OrganizationMember> & { organization_id: string; profile_id: string; role: OrganizationMember["role"] };
        Update: Partial<OrganizationMember>;
      };
      providers: {
        Row: Provider;
        Insert: Partial<Provider> & { organization_id: string; name: string; provider_type: string; code: string };
        Update: Partial<Provider>;
      };
      policy_types: {
        Row: PolicyType;
        Insert: Partial<PolicyType> & { organization_id: string; name: string; code: string };
        Update: Partial<PolicyType>;
      };
      customers: {
        Row: Customer;
        Insert: Partial<Customer> & { organization_id: string; customer_number: string; full_name: string; phone: string; email: string };
        Update: Partial<Customer>;
      };
      assets: {
        Row: Asset;
        Insert: Partial<Asset> & { customer_id: string; asset_type: Asset["asset_type"]; name: string; identifier: string };
        Update: Partial<Asset>;
      };
      policies: {
        Row: Policy;
        Insert: Partial<Policy> & { customer_id: string; provider_id: string; policy_type_id: string; policy_number: string; start_date: string; expiry_date: string; premium: number };
        Update: Partial<Policy>;
      };
      renewals: {
        Row: Renewal;
        Insert: Partial<Renewal> & { policy_id: string; customer_id: string; scheduled_for: string; days_before_expiry: number };
        Update: Partial<Renewal>;
      };
      action_sessions: {
        Row: ActionSession;
        Insert: Partial<ActionSession> & { organization_id: string; channel: ActionSession["channel"] };
        Update: Partial<ActionSession>;
      };
      action_plans: {
        Row: ActionPlan;
        Insert: Partial<ActionPlan> & { session_id: string; intent: string; goal: string };
        Update: Partial<ActionPlan>;
      };
      action_steps: {
        Row: ActionStep;
        Insert: Partial<ActionStep> & { action_plan_id: string; sequence: number; action_type: string; description: string; tool_name: string; input: Record<string, unknown> };
        Update: Partial<ActionStep>;
      };
      tools: {
        Row: ToolRecord;
        Insert: Partial<ToolRecord> & { name: string; description: string; category: string; version: string };
        Update: Partial<ToolRecord>;
      };
      tool_permissions: {
        Row: ToolPermission;
        Insert: Partial<ToolPermission> & { tool_id: string; role: ToolPermission["role"]; allowed: boolean };
        Update: Partial<ToolPermission>;
      };
      tool_executions: {
        Row: ToolExecution;
        Insert: Partial<ToolExecution> & { tool_id: string; input: Record<string, unknown>; validated_input: Record<string, unknown>; status: "success" | "failed"; execution_time_ms: number };
        Update: Partial<ToolExecution>;
      };
      transactions: {
        Row: Transaction;
        Insert: Partial<Transaction> & { customer_id: string; amount: number; currency: string; provider: string; reference: string; status: Transaction["status"]; transaction_type: Transaction["transaction_type"] };
        Update: Partial<Transaction>;
      };
      documents: {
        Row: Document;
        Insert: Partial<Document> & { customer_id: string; document_type: Document["document_type"]; file_path: string; file_name: string; mime_type: string };
        Update: Partial<Document>;
      };
      notifications: {
        Row: NotificationRecord;
        Insert: Partial<NotificationRecord> & { customer_id: string; type: NotificationRecord["type"]; channel: NotificationRecord["channel"]; title: string; message: string; scheduled_for: string };
        Update: Partial<NotificationRecord>;
      };
      human_escalations: {
        Row: HumanEscalation;
        Insert: Partial<HumanEscalation> & { session_id: string; reason: string };
        Update: Partial<HumanEscalation>;
      };
      audit_logs: {
        Row: AuditLog;
        Insert: Partial<AuditLog> & { organization_id: string; action: string; resource_type: string };
        Update: Partial<AuditLog>;
      };
      action_ledger_events: {
        Row: ActionLedgerEventRecord;
        Insert: Partial<ActionLedgerEventRecord> & {
          session_id: string;
          sequence_number: number;
          action: string;
          description: string;
          actor: string;
          status: string;
          previous_hash: string;
          event_hash: string;
          signature: string;
        };
        Update: Partial<ActionLedgerEventRecord>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_profile_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      is_org_member: {
        Args: { target_org: string };
        Returns: boolean;
      };
      has_org_role: {
        Args: { target_org: string; allowed_roles: string[] };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
  };
}
