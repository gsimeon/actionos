import type {
  ICustomerRepository,
  IPolicyRepository,
  IRenewalRepository,
  IActionSessionRepository,
  IActionPlanRepository,
  IActionStepRepository,
  ITransactionRepository,
  IDocumentRepository,
  INotificationRepository,
  IAuditRepository,
  ILedgerRepository,
  RepositoryContainer,
  TenantContext,
} from "../interfaces";
import type {
  Customer,
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
import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";
import { DatabaseError } from "@/lib/repositories/errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSupabaseClient(): SupabaseClient<any> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://demo.supabase.co";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "demo-key";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createSupabaseClient<any>(url, key, {
    auth: { persistSession: false },
  });
}

export class SupabaseCustomerRepository implements ICustomerRepository {
  private client = getSupabaseClient();

  async findAll(tenant?: TenantContext): Promise<Customer[]> {
    let query = this.client
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });

    if (tenant?.organizationId) {
      query = query.eq("organization_id", tenant.organizationId);
    }
    if (tenant?.customerId) {
      query = query.eq("id", tenant.customerId);
    }

    const { data, error } = await query;
    if (error) {
      throw new DatabaseError(`Customer query failed: ${error.message}`, error.code, error);
    }
    return (data || []) as Customer[];
  }

  async findById(id: string, tenant?: TenantContext): Promise<Customer | null> {
    let query = this.client
      .from("customers")
      .select("*")
      .eq("id", id);

    if (tenant?.organizationId) {
      query = query.eq("organization_id", tenant.organizationId);
    }
    if (tenant?.customerId && tenant.customerId !== id) {
      return null;
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new DatabaseError(`Customer lookup by ID failed: ${error.message}`, error.code, error);
    }
    return (data || null) as Customer | null;
  }

  async findByNumber(customerNumber: string, tenant?: TenantContext): Promise<Customer | null> {
    let query = this.client
      .from("customers")
      .select("*")
      .ilike("customer_number", customerNumber);

    if (tenant?.organizationId) {
      query = query.eq("organization_id", tenant.organizationId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new DatabaseError(`Customer lookup by number failed: ${error.message}`, error.code, error);
    }
    return (data || null) as Customer | null;
  }

  async findByOrganization(orgId: string): Promise<Customer[]> {
    const { data, error } = await this.client
      .from("customers")
      .select("*")
      .eq("organization_id", orgId);
    if (error) {
      throw new DatabaseError(`Customer lookup by organization failed: ${error.message}`, error.code, error);
    }
    return (data || []) as Customer[];
  }

  async create(data: Partial<Customer> & { customer_number: string; full_name: string; phone: string; email: string; organization_id: string }): Promise<Customer> {
    const { data: created, error } = await this.client
      .from("customers")
      .insert({
        customer_number: data.customer_number,
        full_name: data.full_name,
        phone: data.phone,
        email: data.email,
        organization_id: data.organization_id,
        address: data.address ?? null,
        state: data.state ?? "Lagos",
        country: data.country ?? "Nigeria",
        status: data.status ?? "active",
        metadata: data.metadata ?? {},
      })
      .select("*")
      .single();
    if (error || !created) throw new DatabaseError(`Failed to create customer: ${error?.message}`, error?.code, error);
    return created as Customer;
  }
}

export class SupabasePolicyRepository implements IPolicyRepository {
  private client = getSupabaseClient();

  async findAll(options?: { status?: string; tenant?: TenantContext }): Promise<Policy[]> {
    let query = this.client.from("policies").select("*");
    if (options?.status && options.status !== "all") {
      query = query.eq("status", options.status);
    }
    if (options?.tenant?.customerId) {
      query = query.eq("customer_id", options.tenant.customerId);
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) {
      throw new DatabaseError(`Policy query failed: ${error.message}`, error.code, error);
    }
    return (data || []) as Policy[];
  }

  async findById(id: string, tenant?: TenantContext): Promise<Policy | null> {
    let query = this.client
      .from("policies")
      .select("*")
      .eq("id", id);

    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new DatabaseError(`Policy lookup by ID failed: ${error.message}`, error.code, error);
    }
    return (data || null) as Policy | null;
  }

  async findByNumber(policyNumber: string, tenant?: TenantContext): Promise<Policy | null> {
    let query = this.client
      .from("policies")
      .select("*")
      .ilike("policy_number", policyNumber);

    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new DatabaseError(`Policy lookup by number failed: ${error.message}`, error.code, error);
    }
    return (data || null) as Policy | null;
  }

  async findByCustomerId(customerId: string, tenant?: TenantContext): Promise<Policy[]> {
    if (tenant?.customerId && customerId !== tenant.customerId) {
      return [];
    }

    const { data, error } = await this.client
      .from("policies")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error) {
      throw new DatabaseError(`Policy query by customer ID failed: ${error.message}`, error.code, error);
    }
    return (data || []) as Policy[];
  }

  async create(data: Partial<Policy> & { customer_id: string; provider_id: string; policy_type_id: string; policy_number: string; start_date: string; expiry_date: string; premium: number }): Promise<Policy> {
    const { data: created, error } = await this.client
      .from("policies")
      .insert({
        customer_id: data.customer_id,
        asset_id: data.asset_id ?? null,
        provider_id: data.provider_id,
        policy_type_id: data.policy_type_id,
        policy_number: data.policy_number,
        start_date: data.start_date,
        expiry_date: data.expiry_date,
        premium: data.premium,
        currency: data.currency ?? "NGN",
        status: data.status ?? "active",
        metadata: data.metadata ?? {},
      })
      .select("*")
      .single();
    if (error || !created) throw new DatabaseError(`Failed to create policy: ${error?.message}`, error?.code, error);
    return created as Policy;
  }

  async updateStatusAndExpiry(id: string, status: Policy["status"], newExpiryDate: string, tenant?: TenantContext): Promise<Policy> {
    let query = this.client
      .from("policies")
      .update({
        status,
        expiry_date: newExpiryDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query.select("*").single();
    if (error || !data) throw new DatabaseError(`Failed to update policy: ${error?.message}`, error?.code, error);
    return data as Policy;
  }
}

export class SupabaseRenewalRepository implements IRenewalRepository {
  private client = getSupabaseClient();

  async findAll(options?: { status?: string; tenant?: TenantContext }): Promise<Renewal[]> {
    let query = this.client
      .from("renewals")
      .select("*, policy:policies(*), customer:customers(*)");

    if (options?.status && options.status !== "all") {
      query = query.eq("status", options.status);
    }
    if (options?.tenant?.customerId) {
      query = query.eq("customer_id", options.tenant.customerId);
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) {
      throw new DatabaseError(`Renewal query failed: ${error.message}`, error.code, error);
    }
    return (data || []) as Renewal[];
  }

  async findById(id: string, tenant?: TenantContext): Promise<Renewal | null> {
    let query = this.client
      .from("renewals")
      .select("*, policy:policies(*), customer:customers(*)")
      .eq("id", id);

    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new DatabaseError(`Renewal lookup failed: ${error.message}`, error.code, error);
    }
    return (data || null) as Renewal | null;
  }

  async findByPolicyId(policyId: string, tenant?: TenantContext): Promise<Renewal | null> {
    let query = this.client
      .from("renewals")
      .select("*, policy:policies(*), customer:customers(*)")
      .eq("policy_id", policyId);

    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new DatabaseError(`Renewal lookup by policy ID failed: ${error.message}`, error.code, error);
    }
    return (data || null) as Renewal | null;
  }

  async create(data: Partial<Renewal> & { policy_id: string; customer_id: string; scheduled_for: string }): Promise<Renewal> {
    const { data: created, error } = await this.client
      .from("renewals")
      .insert({
        policy_id: data.policy_id,
        customer_id: data.customer_id,
        scheduled_for: data.scheduled_for,
        days_before_expiry: data.days_before_expiry ?? 7,
        status: data.status ?? "scheduled",
        quote_amount: data.quote_amount ?? null,
        currency: data.currency ?? "NGN",
        payment_status: data.payment_status ?? "pending",
      })
      .select("*")
      .single();
    if (error || !created) throw new DatabaseError(`Failed to create renewal: ${error?.message}`, error?.code, error);
    return created as Renewal;
  }

  async updateStatus(id: string, status: Renewal["status"], renewedAt?: string, tenant?: TenantContext): Promise<Renewal> {
    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (renewedAt) updatePayload.renewed_at = renewedAt;

    let query = this.client
      .from("renewals")
      .update(updatePayload)
      .eq("id", id);

    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query.select("*").single();
    if (error || !data) throw new DatabaseError(`Failed to update renewal status: ${error?.message}`, error?.code, error);
    return data as Renewal;
  }

  async updatePaymentStatus(id: string, paymentStatus: Renewal["payment_status"], tenant?: TenantContext): Promise<Renewal> {
    let query = this.client
      .from("renewals")
      .update({
        payment_status: paymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query.select("*").single();
    if (error || !data) throw new DatabaseError(`Failed to update renewal payment status: ${error?.message}`, error?.code, error);
    return data as Renewal;
  }
}

export class SupabaseActionSessionRepository implements IActionSessionRepository {
  private client = getSupabaseClient();

  async findById(id: string, tenant?: TenantContext): Promise<ActionSession | null> {
    let query = this.client
      .from("action_sessions")
      .select("*")
      .eq("id", id);

    if (tenant?.organizationId) {
      query = query.eq("organization_id", tenant.organizationId);
    }
    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new DatabaseError(`Session lookup failed: ${error.message}`, error.code, error);
    }
    return (data || null) as ActionSession | null;
  }

  async create(data: Partial<ActionSession> & { organization_id: string; channel: ActionSession["channel"] }): Promise<ActionSession> {
    const { data: created, error } = await this.client
      .from("action_sessions")
      .insert({
        organization_id: data.organization_id,
        customer_id: data.customer_id ?? null,
        channel: data.channel,
        language: data.language ?? "en-NG",
        input_text: data.input_text ?? null,
        input_audio_url: data.input_audio_url ?? null,
        intent: data.intent ?? null,
        status: data.status ?? "received",
        metadata: data.metadata ?? {},
      })
      .select("*")
      .single();
    if (error || !created) throw new DatabaseError(`Failed to create action session: ${error?.message}`, error?.code, error);
    return created as ActionSession;
  }

  async updateStatus(id: string, status: ActionSession["status"], completedAt?: string, tenant?: TenantContext): Promise<ActionSession> {
    const payload: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (completedAt) payload.completed_at = completedAt;

    let query = this.client
      .from("action_sessions")
      .update(payload)
      .eq("id", id);

    if (tenant?.organizationId) {
      query = query.eq("organization_id", tenant.organizationId);
    }

    const { data, error } = await query.select("*").single();
    if (error || !data) throw new DatabaseError(`Failed to update action session status: ${error?.message}`, error?.code, error);
    return data as ActionSession;
  }

  async updateMetadata(id: string, metadata: Record<string, unknown>, tenant?: TenantContext): Promise<ActionSession> {
    let query = this.client
      .from("action_sessions")
      .update({
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (tenant?.organizationId) {
      query = query.eq("organization_id", tenant.organizationId);
    }

    const { data, error } = await query.select("*").single();
    if (error || !data) throw new DatabaseError(`Failed to update session metadata: ${error?.message}`, error?.code, error);
    return data as ActionSession;
  }
}

export class SupabaseActionPlanRepository implements IActionPlanRepository {
  private client = getSupabaseClient();

  async create(data: Partial<ActionPlan> & { session_id: string; intent: string; goal: string }): Promise<ActionPlan> {
    const { data: created, error } = await this.client
      .from("action_plans")
      .insert({
        session_id: data.session_id,
        intent: data.intent,
        goal: data.goal,
        risk_level: data.risk_level ?? "medium",
        confidence: data.confidence ?? 0.9,
        status: data.status ?? "pending",
      })
      .select("*")
      .single();
    if (error || !created) throw new DatabaseError(`Failed to create action plan: ${error?.message}`, error?.code, error);
    return created as ActionPlan;
  }

  async findBySessionId(sessionId: string): Promise<ActionPlan | null> {
    const { data, error } = await this.client
      .from("action_plans")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (error) throw new DatabaseError(`Plan lookup failed: ${error.message}`, error.code, error);
    return (data || null) as ActionPlan | null;
  }

  async updateStatus(id: string, status: ActionPlan["status"]): Promise<ActionPlan> {
    const { data, error } = await this.client
      .from("action_plans")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) throw new DatabaseError(`Failed to update plan status: ${error?.message}`, error?.code, error);
    return data as ActionPlan;
  }
}

export class SupabaseActionStepRepository implements IActionStepRepository {
  private client = getSupabaseClient();

  async createMany(steps: Array<Partial<ActionStep> & { action_plan_id: string; sequence: number; action_type: string; description: string; tool_name: string }>): Promise<ActionStep[]> {
    const records = steps.map((s) => ({
      action_plan_id: s.action_plan_id,
      sequence: s.sequence,
      action_type: s.action_type,
      description: s.description,
      tool_name: s.tool_name,
      status: s.status ?? "pending",
      input: s.input ?? {},
    }));
    const { data, error } = await this.client
      .from("action_steps")
      .insert(records)
      .select("*");
    if (error || !data) throw new DatabaseError(`Failed to create action steps: ${error?.message}`, error?.code, error);
    return data as ActionStep[];
  }

  async findByPlanId(planId: string): Promise<ActionStep[]> {
    const { data, error } = await this.client
      .from("action_steps")
      .select("*")
      .eq("action_plan_id", planId)
      .order("sequence", { ascending: true });
    if (error) throw new DatabaseError(`Action steps lookup failed: ${error.message}`, error.code, error);
    return (data || []) as ActionStep[];
  }

  async updateStep(id: string, update: Partial<ActionStep>): Promise<ActionStep> {
    const { data, error } = await this.client
      .from("action_steps")
      .update({
        ...update,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) throw new DatabaseError(`Failed to update step: ${error?.message}`, error?.code, error);
    return data as ActionStep;
  }
}

export class SupabaseTransactionRepository implements ITransactionRepository {
  private client = getSupabaseClient();

  async create(data: Partial<Transaction> & { customer_id: string; amount: number; reference: string }): Promise<Transaction> {
    const { data: created, error } = await this.client
      .from("transactions")
      .insert({
        customer_id: data.customer_id,
        renewal_id: data.renewal_id ?? null,
        amount: data.amount,
        currency: data.currency ?? "NGN",
        provider: data.provider ?? "paystack",
        reference: data.reference,
        status: data.status ?? "pending",
        transaction_type: data.transaction_type ?? "renewal_premium",
        metadata: data.metadata ?? {},
      })
      .select("*")
      .single();
    if (error || !created) throw new DatabaseError(`Failed to create transaction: ${error?.message}`, error?.code, error);
    return created as Transaction;
  }

  async findByReference(reference: string, tenant?: TenantContext): Promise<Transaction | null> {
    let query = this.client
      .from("transactions")
      .select("*")
      .eq("reference", reference);

    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw new DatabaseError(`Transaction lookup by reference failed: ${error.message}`, error.code, error);
    return (data || null) as Transaction | null;
  }

  async updateStatus(id: string, status: Transaction["status"]): Promise<Transaction> {
    const { data, error } = await this.client
      .from("transactions")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) throw new DatabaseError(`Failed to update transaction status: ${error?.message}`, error?.code, error);
    return data as Transaction;
  }
}

export class SupabaseDocumentRepository implements IDocumentRepository {
  private client = getSupabaseClient();

  async create(data: Partial<Document> & { customer_id: string; document_type: Document["document_type"]; file_path: string; file_name: string }): Promise<Document> {
    const { data: created, error } = await this.client
      .from("documents")
      .insert({
        customer_id: data.customer_id,
        renewal_id: data.renewal_id ?? null,
        document_type: data.document_type,
        file_path: data.file_path,
        file_name: data.file_name,
        mime_type: data.mime_type ?? "application/pdf",
        status: data.status ?? "generated",
      })
      .select("*")
      .single();
    if (error || !created) throw new DatabaseError(`Failed to create document: ${error?.message}`, error?.code, error);
    return created as Document;
  }

  async findByCustomerId(customerId: string, tenant?: TenantContext): Promise<Document[]> {
    if (tenant?.customerId && customerId !== tenant.customerId) return [];

    const { data, error } = await this.client
      .from("documents")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error) throw new DatabaseError(`Document query failed: ${error.message}`, error.code, error);
    return (data || []) as Document[];
  }

  async findByRenewalId(renewalId: string, tenant?: TenantContext): Promise<Document[]> {
    let query = this.client
      .from("documents")
      .select("*")
      .eq("renewal_id", renewalId);

    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw new DatabaseError(`Document lookup by renewal failed: ${error.message}`, error.code, error);
    return (data || []) as Document[];
  }
}

export class SupabaseNotificationRepository implements INotificationRepository {
  private client = getSupabaseClient();

  async create(data: Partial<NotificationRecord> & { customer_id: string; type: NotificationRecord["type"]; channel: NotificationRecord["channel"]; title: string; message: string; scheduled_for: string }): Promise<NotificationRecord> {
    const { data: created, error } = await this.client
      .from("notifications")
      .insert({
        customer_id: data.customer_id,
        type: data.type,
        channel: data.channel,
        title: data.title,
        message: data.message,
        scheduled_for: data.scheduled_for,
        status: data.status ?? "pending",
        metadata: data.metadata ?? {},
      })
      .select("*")
      .single();
    if (error || !created) throw new DatabaseError(`Failed to schedule notification: ${error?.message}`, error?.code, error);
    return created as NotificationRecord;
  }

  async findByCustomerId(customerId: string, tenant?: TenantContext): Promise<NotificationRecord[]> {
    if (tenant?.customerId && customerId !== tenant.customerId) return [];

    const { data, error } = await this.client
      .from("notifications")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error) throw new DatabaseError(`Notification query failed: ${error.message}`, error.code, error);
    return (data || []) as NotificationRecord[];
  }
}

export class SupabaseAuditRepository implements IAuditRepository {
  private client = getSupabaseClient();

  async log(data: Partial<AuditLog> & { organization_id: string; action: string; resource_type: string }): Promise<AuditLog> {
    const { data: created, error } = await this.client
      .from("audit_logs")
      .insert({
        organization_id: data.organization_id,
        user_id: data.user_id ?? null,
        session_id: data.session_id ?? null,
        action: data.action,
        resource_type: data.resource_type,
        resource_id: data.resource_id ?? null,
        old_value: data.old_value ?? null,
        new_value: data.new_value ?? null,
        ip_address: data.ip_address ?? "127.0.0.1",
        user_agent: data.user_agent ?? "ActionOS Supabase Orchestrator",
      })
      .select("*")
      .single();
    if (error || !created) throw new DatabaseError(`Failed to log audit event: ${error?.message}`, error?.code, error);
    return created as AuditLog;
  }
}

export class SupabaseLedgerRepository implements ILedgerRepository {
  private client = getSupabaseClient();

  async appendEvent(event: ActionLedgerEvent): Promise<ActionLedgerEvent> {
    const { error } = await this.client
      .from("action_ledger_events")
      .insert({
        session_id: event.sessionId,
        sequence_number: event.sequenceNumber ?? 1,
        timestamp: event.timestamp,
        action: event.action,
        description: event.description,
        actor: event.actor,
        status: event.status,
        tool: event.tool ?? null,
        reference_id: event.referenceId ?? null,
        previous_hash: event.previousHash ?? "",
        event_hash: event.hash ?? "",
        signature: event.signature ?? "",
        signing_key_version: event.signingKeyVersion ?? "v1",
        metadata: event.metadata ?? {},
      });
    if (error) {
      throw new DatabaseError(`Ledger append failed: ${error.message}`, error.code, error);
    }
    return event;
  }

  async getEventsBySessionId(sessionId: string, tenant?: TenantContext): Promise<ActionLedgerEvent[]> {
    let query = this.client
      .from("action_ledger_events")
      .select("*")
      .eq("session_id", sessionId);

    const { data, error } = await query.order("sequence_number", { ascending: true });
    if (error) throw new DatabaseError(`Ledger query failed: ${error.message}`, error.code, error);
    return (data || []).map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      sequenceNumber: row.sequence_number,
      timestamp: row.timestamp,
      action: row.action,
      description: row.description,
      actor: row.actor as ActionLedgerEvent["actor"],
      status: row.status as ActionLedgerEvent["status"],
      tool: row.tool ?? undefined,
      referenceId: row.reference_id ?? undefined,
      previousHash: row.previous_hash,
      hash: row.event_hash,
      signature: row.signature,
      signingKeyVersion: row.signing_key_version,
      metadata: row.metadata as Record<string, unknown>,
    }));
  }
}

export class SupabaseRepositoryContainer implements RepositoryContainer {
  public readonly isDemo = false;
  public readonly customers = new SupabaseCustomerRepository();
  public readonly policies = new SupabasePolicyRepository();
  public readonly renewals = new SupabaseRenewalRepository();
  public readonly sessions = new SupabaseActionSessionRepository();
  public readonly plans = new SupabaseActionPlanRepository();
  public readonly steps = new SupabaseActionStepRepository();
  public readonly transactions = new SupabaseTransactionRepository();
  public readonly documents = new SupabaseDocumentRepository();
  public readonly notifications = new SupabaseNotificationRepository();
  public readonly audit = new SupabaseAuditRepository();
  public readonly ledger = new SupabaseLedgerRepository();
}
