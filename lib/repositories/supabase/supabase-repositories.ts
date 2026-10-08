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
import type { Database } from "@/types/database.types";

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

  async findById(id: string): Promise<Customer | null> {
    const { data, error } = await this.client
      .from("customers")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return data as Customer;
  }

  async findByNumber(customerNumber: string): Promise<Customer | null> {
    const { data, error } = await this.client
      .from("customers")
      .select("*")
      .ilike("customer_number", customerNumber)
      .maybeSingle();
    if (error || !data) return null;
    return data as Customer;
  }

  async findByOrganization(orgId: string): Promise<Customer[]> {
    const { data, error } = await this.client
      .from("customers")
      .select("*")
      .eq("organization_id", orgId);
    if (error || !data) return [];
    return data as Customer[];
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
    if (error || !created) throw new Error(`Failed to create customer: ${error?.message}`);
    return created as Customer;
  }
}

export class SupabasePolicyRepository implements IPolicyRepository {
  private client = getSupabaseClient();

  async findById(id: string): Promise<Policy | null> {
    const { data, error } = await this.client
      .from("policies")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return data as Policy;
  }

  async findByNumber(policyNumber: string): Promise<Policy | null> {
    const { data, error } = await this.client
      .from("policies")
      .select("*")
      .ilike("policy_number", policyNumber)
      .maybeSingle();
    if (error || !data) return null;
    return data as Policy;
  }

  async findByCustomerId(customerId: string): Promise<Policy[]> {
    const { data, error } = await this.client
      .from("policies")
      .select("*")
      .eq("customer_id", customerId);
    if (error || !data) return [];
    return data as Policy[];
  }

  async updateStatusAndExpiry(id: string, status: Policy["status"], newExpiryDate: string): Promise<Policy> {
    const { data, error } = await this.client
      .from("policies")
      .update({
        status,
        expiry_date: newExpiryDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) throw new Error(`Failed to update policy: ${error?.message}`);
    return data as Policy;
  }
}

export class SupabaseRenewalRepository implements IRenewalRepository {
  private client = getSupabaseClient();

  async findById(id: string): Promise<Renewal | null> {
    const { data, error } = await this.client
      .from("renewals")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return data as Renewal;
  }

  async findByPolicyId(policyId: string): Promise<Renewal | null> {
    const { data, error } = await this.client
      .from("renewals")
      .select("*")
      .eq("policy_id", policyId)
      .maybeSingle();
    if (error || !data) return null;
    return data as Renewal;
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
        payment_status: data.payment_status ?? "unpaid",
      })
      .select("*")
      .single();
    if (error || !created) throw new Error(`Failed to create renewal: ${error?.message}`);
    return created as Renewal;
  }

  async updateStatus(id: string, status: Renewal["status"], renewedAt?: string): Promise<Renewal> {
    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (renewedAt) updatePayload.renewed_at = renewedAt;

    const { data, error } = await this.client
      .from("renewals")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) throw new Error(`Failed to update renewal status: ${error?.message}`);
    return data as Renewal;
  }

  async updatePaymentStatus(id: string, paymentStatus: Renewal["payment_status"]): Promise<Renewal> {
    const { data, error } = await this.client
      .from("renewals")
      .update({
        payment_status: paymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) throw new Error(`Failed to update renewal payment status: ${error?.message}`);
    return data as Renewal;
  }
}

export class SupabaseActionSessionRepository implements IActionSessionRepository {
  private client = getSupabaseClient();

  async findById(id: string): Promise<ActionSession | null> {
    const { data, error } = await this.client
      .from("action_sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return data as ActionSession;
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
    if (error || !created) throw new Error(`Failed to create action session: ${error?.message}`);
    return created as ActionSession;
  }

  async updateStatus(id: string, status: ActionSession["status"], completedAt?: string): Promise<ActionSession> {
    const updatePayload: Record<string, unknown> = { status };
    if (completedAt) updatePayload.completed_at = completedAt;

    const { data, error } = await this.client
      .from("action_sessions")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) throw new Error(`Failed to update session status: ${error?.message}`);
    return data as ActionSession;
  }

  async updateMetadata(id: string, metadata: Record<string, unknown>): Promise<ActionSession> {
    // Read existing metadata then merge
    const existing = await this.findById(id);
    const merged = { ...(existing?.metadata || {}), ...metadata };

    const { data, error } = await this.client
      .from("action_sessions")
      .update({ metadata: merged })
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) throw new Error(`Failed to update session metadata: ${error?.message}`);
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
        risk_level: data.risk_level ?? "low",
        confidence: data.confidence ?? 1.0,
        status: data.status ?? "pending",
      })
      .select("*")
      .single();
    if (error || !created) throw new Error(`Failed to create action plan: ${error?.message}`);
    return created as ActionPlan;
  }

  async findBySessionId(sessionId: string): Promise<ActionPlan | null> {
    const { data, error } = await this.client
      .from("action_plans")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (error || !data) return null;
    return data as ActionPlan;
  }

  async updateStatus(id: string, status: ActionPlan["status"]): Promise<ActionPlan> {
    const updatePayload: Record<string, unknown> = { status };
    if (status === "completed" || status === "failed") {
      updatePayload.completed_at = new Date().toISOString();
    }

    const { data, error } = await this.client
      .from("action_plans")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) throw new Error(`Failed to update action plan status: ${error?.message}`);
    return data as ActionPlan;
  }
}

export class SupabaseActionStepRepository implements IActionStepRepository {
  private client = getSupabaseClient();

  async createMany(
    stepsData: Array<Partial<ActionStep> & { action_plan_id: string; sequence: number; action_type: string; description: string; tool_name: string }>
  ): Promise<ActionStep[]> {
    const inserts = stepsData.map((s) => ({
      action_plan_id: s.action_plan_id,
      sequence: s.sequence,
      action_type: s.action_type,
      description: s.description,
      tool_name: s.tool_name,
      input: s.input ?? {},
      status: s.status ?? "pending",
      requires_confirmation: s.requires_confirmation ?? false,
    }));

    const { data, error } = await this.client
      .from("action_steps")
      .insert(inserts)
      .select("*");
    if (error || !data) throw new Error(`Failed to create action steps: ${error?.message}`);
    return data as ActionStep[];
  }

  async findByPlanId(planId: string): Promise<ActionStep[]> {
    const { data, error } = await this.client
      .from("action_steps")
      .select("*")
      .eq("action_plan_id", planId)
      .order("sequence", { ascending: true });
    if (error || !data) return [];
    return data as ActionStep[];
  }

  async updateStep(id: string, update: Partial<ActionStep>): Promise<ActionStep> {
    const { data, error } = await this.client
      .from("action_steps")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) throw new Error(`Failed to update step: ${error?.message}`);
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
        provider: data.provider ?? "mock_paystack",
        reference: data.reference,
        status: data.status ?? "pending",
        transaction_type: data.transaction_type ?? "renewal_premium",
        metadata: data.metadata ?? {},
      })
      .select("*")
      .single();
    if (error || !created) throw new Error(`Failed to create transaction: ${error?.message}`);
    return created as Transaction;
  }

  async findByReference(reference: string): Promise<Transaction | null> {
    const { data, error } = await this.client
      .from("transactions")
      .select("*")
      .eq("reference", reference)
      .maybeSingle();
    if (error || !data) return null;
    return data as Transaction;
  }

  async updateStatus(id: string, status: Transaction["status"]): Promise<Transaction> {
    const { data, error } = await this.client
      .from("transactions")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .or(`id.eq.${id},reference.eq.${id}`)
      .select("*")
      .single();
    if (error || !data) throw new Error(`Failed to update transaction status: ${error?.message}`);
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
    if (error || !created) throw new Error(`Failed to create document: ${error?.message}`);
    return created as Document;
  }

  async findByCustomerId(customerId: string): Promise<Document[]> {
    const { data, error } = await this.client
      .from("documents")
      .select("*")
      .eq("customer_id", customerId);
    if (error || !data) return [];
    return data as Document[];
  }

  async findByRenewalId(renewalId: string): Promise<Document[]> {
    const { data, error } = await this.client
      .from("documents")
      .select("*")
      .eq("renewal_id", renewalId);
    if (error || !data) return [];
    return data as Document[];
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
        sent_at: data.sent_at ?? null,
        status: data.status ?? "pending",
        metadata: data.metadata ?? {},
      })
      .select("*")
      .single();
    if (error || !created) throw new Error(`Failed to create notification: ${error?.message}`);
    return created as NotificationRecord;
  }

  async findByCustomerId(customerId: string): Promise<NotificationRecord[]> {
    const { data, error } = await this.client
      .from("notifications")
      .select("*")
      .eq("customer_id", customerId);
    if (error || !data) return [];
    return data as NotificationRecord[];
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
    if (error || !created) throw new Error(`Failed to log audit event: ${error?.message}`);
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
      // In case of any schema mismatch on table during initial bootstrapping, log and return event
      console.warn("Supabase ledger insert warning:", error.message);
    }
    return event;
  }

  async getEventsBySessionId(sessionId: string): Promise<ActionLedgerEvent[]> {
    const { data, error } = await this.client
      .from("action_ledger_events")
      .select("*")
      .eq("session_id", sessionId)
      .order("sequence_number", { ascending: true });
    if (error || !data) return [];
    return data.map((row) => ({
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
