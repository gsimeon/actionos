import type {
  ICustomerRepository,
  IPolicyRepository,
  IRenewalRepository,
  IQuoteRepository,
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
  Quote,
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
    if (tenant?.customerId) {
      query = query.eq("id", tenant.customerId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new DatabaseError(`Customer lookup by number failed: ${error.message}`, error.code, error);
    }
    return (data || null) as Customer | null;
  }

  async findByOrganization(orgId: string, tenant?: TenantContext): Promise<Customer[]> {
    if (tenant?.organizationId && orgId !== tenant.organizationId) {
      return [];
    }
    let query = this.client
      .from("customers")
      .select("*")
      .eq("organization_id", orgId);
    if (tenant?.customerId) {
      query = query.eq("id", tenant.customerId);
    }
    const { data, error } = await query;
    if (error) {
      throw new DatabaseError(`Customer lookup by organization failed: ${error.message}`, error.code, error);
    }
    return (data || []) as Customer[];
  }

  async create(data: Partial<Customer> & { customer_number: string; full_name: string; phone: string; email: string; organization_id: string }, tenant?: TenantContext): Promise<Customer> {
    if (tenant?.organizationId && data.organization_id !== tenant.organizationId) {
      throw new DatabaseError(`Tenant authorization violation: organization mismatch on customer create`, "UNAUTHORIZED");
    }
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
    let query = this.client.from("policies").select("*, customer:customers!inner(*)");
    if (options?.status && options.status !== "all") {
      query = query.eq("status", options.status);
    }
    if (options?.tenant?.organizationId) {
      query = query.eq("customer.organization_id", options.tenant.organizationId);
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
      .select("*, customer:customers!inner(*)")
      .eq("id", id);

    if (tenant?.organizationId) {
      query = query.eq("customer.organization_id", tenant.organizationId);
    }
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
      .select("*, customer:customers!inner(*)")
      .ilike("policy_number", policyNumber);

    if (tenant?.organizationId) {
      query = query.eq("customer.organization_id", tenant.organizationId);
    }
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

    let query = this.client
      .from("policies")
      .select("*, customer:customers!inner(*)")
      .eq("customer_id", customerId);

    if (tenant?.organizationId) {
      query = query.eq("customer.organization_id", tenant.organizationId);
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) {
      throw new DatabaseError(`Policy query by customer ID failed: ${error.message}`, error.code, error);
    }
    return (data || []) as Policy[];
  }

  async create(data: Partial<Policy> & { customer_id: string; provider_id: string; policy_type_id: string; policy_number: string; start_date: string; expiry_date: string; premium: number }, tenant?: TenantContext): Promise<Policy> {
    if (tenant?.customerId && data.customer_id !== tenant.customerId) {
      throw new DatabaseError(`Tenant authorization violation: customer mismatch on policy create`, "UNAUTHORIZED");
    }
    if (tenant?.organizationId) {
      const { data: cust } = await this.client
        .from("customers")
        .select("id, organization_id")
        .eq("id", data.customer_id)
        .eq("organization_id", tenant.organizationId)
        .maybeSingle();
      if (!cust) {
        throw new DatabaseError(`Tenant authorization violation: customer does not belong to organization`, "UNAUTHORIZED");
      }
    }
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
    if (tenant?.organizationId || tenant?.customerId) {
      const existing = await this.findById(id, tenant);
      if (!existing) {
        throw new DatabaseError(`Policy ${id} not found or tenant authorization mismatch`, "UNAUTHORIZED");
      }
    }
    let query = this.client
      .from("policies")
      .update({
        status,
        expiry_date: newExpiryDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (tenant?.organizationId) {
      query = query.eq("organization_id", tenant.organizationId);
    }
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
      .select("*, policy:policies(*), customer:customers!inner(*)");

    if (options?.status && options.status !== "all") {
      query = query.eq("status", options.status);
    }
    if (options?.tenant?.organizationId) {
      query = query.eq("customer.organization_id", options.tenant.organizationId);
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
      .select("*, policy:policies(*), customer:customers!inner(*)")
      .eq("id", id);

    if (tenant?.organizationId) {
      query = query.eq("customer.organization_id", tenant.organizationId);
    }
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
      .select("*, policy:policies(*), customer:customers!inner(*)")
      .eq("policy_id", policyId);

    if (tenant?.organizationId) {
      query = query.eq("customer.organization_id", tenant.organizationId);
    }
    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new DatabaseError(`Renewal lookup by policy ID failed: ${error.message}`, error.code, error);
    }
    return (data || null) as Renewal | null;
  }

  async create(data: Partial<Renewal> & { policy_id: string; customer_id: string; scheduled_for: string }, tenant?: TenantContext): Promise<Renewal> {
    if (tenant?.customerId && data.customer_id !== tenant.customerId) {
      throw new DatabaseError(`Tenant authorization violation: customer mismatch on renewal create`, "UNAUTHORIZED");
    }
    if (tenant?.organizationId) {
      const { data: cust } = await this.client
        .from("customers")
        .select("id, organization_id")
        .eq("id", data.customer_id)
        .eq("organization_id", tenant.organizationId)
        .maybeSingle();
      if (!cust) {
        throw new DatabaseError(`Tenant authorization violation: customer does not belong to organization`, "UNAUTHORIZED");
      }
    }
    const { data: created, error } = await this.client
      .from("renewals")
      .insert({
        policy_id: data.policy_id,
        customer_id: data.customer_id,
        organization_id: tenant?.organizationId || data.organization_id || undefined,
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
    if (tenant?.organizationId || tenant?.customerId) {
      const existing = await this.findById(id, tenant);
      if (!existing) {
        throw new DatabaseError(`Renewal ${id} not found or tenant authorization mismatch`, "UNAUTHORIZED");
      }
    }
    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (renewedAt) updatePayload.renewed_at = renewedAt;

    let query = this.client
      .from("renewals")
      .update(updatePayload)
      .eq("id", id);

    if (tenant?.organizationId) {
      query = query.eq("organization_id", tenant.organizationId);
    }
    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query.select("*").single();
    if (error || !data) throw new DatabaseError(`Failed to update renewal status: ${error?.message}`, error?.code, error);
    return data as Renewal;
  }

  async updatePaymentStatus(id: string, paymentStatus: Renewal["payment_status"], tenant?: TenantContext): Promise<Renewal> {
    if (tenant?.organizationId || tenant?.customerId) {
      const existing = await this.findById(id, tenant);
      if (!existing) {
        throw new DatabaseError(`Renewal ${id} not found or tenant authorization mismatch`, "UNAUTHORIZED");
      }
    }
    let query = this.client
      .from("renewals")
      .update({
        payment_status: paymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (tenant?.organizationId) {
      query = query.eq("organization_id", tenant.organizationId);
    }
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

  async create(data: Partial<ActionSession> & { organization_id: string; channel: ActionSession["channel"] }, tenant?: TenantContext): Promise<ActionSession> {
    if (tenant?.organizationId && data.organization_id !== tenant.organizationId) {
      throw new DatabaseError(`Tenant authorization violation: organization mismatch on session create`, "UNAUTHORIZED");
    }
    if (tenant?.customerId && data.customer_id && data.customer_id !== tenant.customerId) {
      throw new DatabaseError(`Tenant authorization violation: customer mismatch on session create`, "UNAUTHORIZED");
    }
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
    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
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
    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query.select("*").single();
    if (error || !data) throw new DatabaseError(`Failed to update session metadata: ${error?.message}`, error?.code, error);
    return data as ActionSession;
  }

  async claimAuthorization(sessionId: string, tenant?: TenantContext): Promise<ActionSession | null> {
    let query = this.client
      .from("action_sessions")
      .update({
        status: "executing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .eq("status", "awaiting_authorization");

    if (tenant?.organizationId) {
      query = query.eq("organization_id", tenant.organizationId);
    }
    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query.select("*").maybeSingle();
    if (error) {
      throw new DatabaseError(`Failed to atomically claim session authorization: ${error.message}`, error.code, error);
    }
    return (data || null) as ActionSession | null;
  }

  async claimAuthorizationAndAcceptQuote(
    sessionId: string,
    quoteId: string,
    tenant?: TenantContext
  ): Promise<{ session: ActionSession; quote: Quote } | null> {
    // Attempt Postgres RPC first for single-transaction atomic execution
    try {
      const { data: rpcResult, error: rpcError } = await this.client.rpc("claim_and_accept_quote", {
        p_session_id: sessionId,
        p_quote_id: quoteId,
        p_organization_id: tenant?.organizationId,
        p_customer_id: tenant?.customerId ?? null,
      });

      if (!rpcError && rpcResult && rpcResult.success) {
        return {
          session: rpcResult.session as ActionSession,
          quote: rpcResult.quote as Quote,
        };
      }
    } catch {
      // Fallback to application-level transactional CAS if RPC is not available in environment
    }

    // Step 1: Conditionally claim session awaiting_authorization -> executing
    const claimedSession = await this.claimAuthorization(sessionId, tenant);
    if (!claimedSession) {
      return null;
    }

    // Step 2: Conditionally accept quote issued -> accepted
    let quoteQuery = this.client
      .from("quotes")
      .update({
        status: "accepted",
        updated_at: new Date().toISOString(),
      })
      .eq("id", quoteId)
      .eq("session_id", sessionId)
      .eq("status", "issued");

    if (tenant?.organizationId) {
      quoteQuery = quoteQuery.eq("organization_id", tenant.organizationId);
    }
    if (tenant?.customerId) {
      quoteQuery = quoteQuery.eq("customer_id", tenant.customerId);
    }

    const { data: quoteData, error: quoteError } = await quoteQuery.select("*").maybeSingle();

    if (quoteError || !quoteData) {
      // ROLLBACK: Revert session claim back to awaiting_authorization so it is never left in executing!
      await this.client
        .from("action_sessions")
        .update({
          status: "awaiting_authorization",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId)
        .eq("status", "executing");

      return null;
    }

    return {
      session: claimedSession,
      quote: quoteData as Quote,
    };
  }
}

export class SupabaseActionPlanRepository implements IActionPlanRepository {
  private client = getSupabaseClient();

  async create(data: Partial<ActionPlan> & { session_id: string; intent: string; goal: string }, _tenant?: TenantContext): Promise<ActionPlan> {
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

  async findBySessionId(sessionId: string, tenant?: TenantContext): Promise<ActionPlan | null> {
    if (tenant?.organizationId || tenant?.customerId) {
      let sessionQuery = this.client
        .from("action_sessions")
        .select("id")
        .eq("id", sessionId);

      if (tenant.organizationId) {
        sessionQuery = sessionQuery.eq("organization_id", tenant.organizationId);
      }
      if (tenant.customerId) {
        sessionQuery = sessionQuery.eq("customer_id", tenant.customerId);
      }

      const { data: sessionData } = await sessionQuery.maybeSingle();
      if (!sessionData) {
        return null;
      }
    }

    const { data, error } = await this.client
      .from("action_plans")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (error) throw new DatabaseError(`Plan lookup failed: ${error.message}`, error.code, error);
    return (data || null) as ActionPlan | null;
  }

  async updateStatus(id: string, status: ActionPlan["status"], tenant?: TenantContext): Promise<ActionPlan> {
    if (tenant?.organizationId || tenant?.customerId) {
      const { data: planData } = await this.client
        .from("action_plans")
        .select("session_id")
        .eq("id", id)
        .maybeSingle();
      if (!planData) {
        throw new DatabaseError(`Action plan ${id} not found`, "NOT_FOUND");
      }
      let sessionQuery = this.client
        .from("action_sessions")
        .select("id")
        .eq("id", planData.session_id);
      if (tenant.organizationId) sessionQuery = sessionQuery.eq("organization_id", tenant.organizationId);
      if (tenant.customerId) sessionQuery = sessionQuery.eq("customer_id", tenant.customerId);
      const { data: sessionData } = await sessionQuery.maybeSingle();
      if (!sessionData) {
        throw new DatabaseError(`Tenant authorization violation for action plan ${id}`, "UNAUTHORIZED");
      }
    }

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

  async createMany(steps: Array<Partial<ActionStep> & { action_plan_id: string; sequence: number; action_type: string; description: string; tool_name: string }>, _tenant?: TenantContext): Promise<ActionStep[]> {
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

  async findByPlanId(planId: string, tenant?: TenantContext): Promise<ActionStep[]> {
    if (tenant?.organizationId || tenant?.customerId) {
      const { data: planData } = await this.client
        .from("action_plans")
        .select("session_id")
        .eq("id", planId)
        .maybeSingle();
      if (!planData) {
        return [];
      }
      let sessionQuery = this.client
        .from("action_sessions")
        .select("id")
        .eq("id", planData.session_id);
      if (tenant.organizationId) {
        sessionQuery = sessionQuery.eq("organization_id", tenant.organizationId);
      }
      if (tenant.customerId) {
        sessionQuery = sessionQuery.eq("customer_id", tenant.customerId);
      }
      const { data: sessionData } = await sessionQuery.maybeSingle();
      if (!sessionData) {
        return [];
      }
    }

    const { data, error } = await this.client
      .from("action_steps")
      .select("*")
      .eq("action_plan_id", planId)
      .order("sequence", { ascending: true });
    if (error) throw new DatabaseError(`Action steps lookup failed: ${error.message}`, error.code, error);
    return (data || []) as ActionStep[];
  }

  async updateStep(id: string, update: Partial<ActionStep>, tenant?: TenantContext): Promise<ActionStep> {
    if (tenant?.organizationId || tenant?.customerId) {
      const { data: stepData } = await this.client
        .from("action_steps")
        .select("action_plan_id")
        .eq("id", id)
        .maybeSingle();
      if (!stepData) {
        throw new DatabaseError(`Action step ${id} not found`, "NOT_FOUND");
      }
      const { data: planData } = await this.client
        .from("action_plans")
        .select("session_id")
        .eq("id", stepData.action_plan_id)
        .maybeSingle();
      if (!planData) {
        throw new DatabaseError(`Action plan not found for step ${id}`, "NOT_FOUND");
      }
      let sessionQuery = this.client
        .from("action_sessions")
        .select("id")
        .eq("id", planData.session_id);
      if (tenant.organizationId) sessionQuery = sessionQuery.eq("organization_id", tenant.organizationId);
      if (tenant.customerId) sessionQuery = sessionQuery.eq("customer_id", tenant.customerId);
      const { data: sessionData } = await sessionQuery.maybeSingle();
      if (!sessionData) {
        throw new DatabaseError(`Tenant authorization violation for action step ${id}`, "UNAUTHORIZED");
      }
    }

    let query = this.client
      .from("action_steps")
      .update({
        ...update,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (tenant?.organizationId) {
      query = query.eq("organization_id", tenant.organizationId);
    }

    const { data, error } = await query.select("*").single();
    if (error || !data) throw new DatabaseError(`Failed to update step: ${error?.message}`, error?.code, error);
    return data as ActionStep;
  }
}

export class SupabaseTransactionRepository implements ITransactionRepository {
  private client = getSupabaseClient();

  async create(data: Partial<Transaction> & { customer_id: string; amount: number; reference: string }, tenant?: TenantContext): Promise<Transaction> {
    if (tenant?.customerId && data.customer_id !== tenant.customerId) {
      throw new DatabaseError(`Tenant authorization violation: customer mismatch on transaction create`, "UNAUTHORIZED");
    }
    if (tenant?.organizationId) {
      const { data: cust } = await this.client
        .from("customers")
        .select("id, organization_id")
        .eq("id", data.customer_id)
        .eq("organization_id", tenant.organizationId)
        .maybeSingle();
      if (!cust) {
        throw new DatabaseError(`Tenant authorization violation: customer does not belong to organization`, "UNAUTHORIZED");
      }
    }
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
      .select("*, customer:customers!inner(*)")
      .eq("reference", reference);

    if (tenant?.organizationId) {
      query = query.eq("customer.organization_id", tenant.organizationId);
    }
    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw new DatabaseError(`Transaction lookup by reference failed: ${error.message}`, error.code, error);
    return (data || null) as Transaction | null;
  }

  async updateStatus(id: string, status: Transaction["status"], tenant?: TenantContext): Promise<Transaction> {
    if (tenant?.organizationId || tenant?.customerId) {
      let checkQuery = this.client.from("transactions").select("*, customer:customers!inner(*)").eq("id", id);
      if (tenant?.organizationId) checkQuery = checkQuery.eq("customer.organization_id", tenant.organizationId);
      if (tenant?.customerId) checkQuery = checkQuery.eq("customer_id", tenant.customerId);
      const { data: check } = await checkQuery.maybeSingle();
      if (!check) {
        throw new DatabaseError(`Transaction ${id} not found or tenant authorization mismatch`, "UNAUTHORIZED");
      }
    }

    let query = this.client
      .from("transactions")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (tenant?.organizationId) {
      query = query.eq("organization_id", tenant.organizationId);
    }
    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query.select("*").single();
    if (error || !data) throw new DatabaseError(`Failed to update transaction status: ${error?.message}`, error?.code, error);
    return data as Transaction;
  }
}

export class SupabaseDocumentRepository implements IDocumentRepository {
  private client = getSupabaseClient();

  async create(data: Partial<Document> & { customer_id: string; document_type: Document["document_type"]; file_path: string; file_name: string }, tenant?: TenantContext): Promise<Document> {
    if (tenant?.customerId && data.customer_id !== tenant.customerId) {
      throw new DatabaseError(`Tenant authorization violation: customer mismatch on document create`, "UNAUTHORIZED");
    }
    if (tenant?.organizationId) {
      const { data: cust } = await this.client
        .from("customers")
        .select("id, organization_id")
        .eq("id", data.customer_id)
        .eq("organization_id", tenant.organizationId)
        .maybeSingle();
      if (!cust) {
        throw new DatabaseError(`Tenant authorization violation: customer does not belong to organization`, "UNAUTHORIZED");
      }
    }
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

    let query = this.client
      .from("documents")
      .select("*, customer:customers!inner(*)")
      .eq("customer_id", customerId);

    if (tenant?.organizationId) {
      query = query.eq("customer.organization_id", tenant.organizationId);
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw new DatabaseError(`Document query failed: ${error.message}`, error.code, error);
    return (data || []) as Document[];
  }

  async findByRenewalId(renewalId: string, tenant?: TenantContext): Promise<Document[]> {
    let query = this.client
      .from("documents")
      .select("*, customer:customers!inner(*)")
      .eq("renewal_id", renewalId);

    if (tenant?.organizationId) {
      query = query.eq("customer.organization_id", tenant.organizationId);
    }
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

  async create(data: Partial<NotificationRecord> & { customer_id: string; type: NotificationRecord["type"]; channel: NotificationRecord["channel"]; title: string; message: string; scheduled_for: string }, tenant?: TenantContext): Promise<NotificationRecord> {
    if (tenant?.customerId && data.customer_id !== tenant.customerId) {
      throw new DatabaseError(`Tenant authorization violation: customer mismatch on notification create`, "UNAUTHORIZED");
    }
    if (tenant?.organizationId) {
      const { data: cust } = await this.client
        .from("customers")
        .select("id, organization_id")
        .eq("id", data.customer_id)
        .eq("organization_id", tenant.organizationId)
        .maybeSingle();
      if (!cust) {
        throw new DatabaseError(`Tenant authorization violation: customer does not belong to organization`, "UNAUTHORIZED");
      }
    }
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

    let query = this.client
      .from("notifications")
      .select("*, customer:customers!inner(*)")
      .eq("customer_id", customerId);

    if (tenant?.organizationId) {
      query = query.eq("customer.organization_id", tenant.organizationId);
    }

    const { data, error } = await query.order("created_at", { ascending: false });
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
    if (tenant?.organizationId || tenant?.customerId) {
      const { data: session } = await this.client
        .from("action_sessions")
        .select("organization_id, customer_id")
        .eq("id", sessionId)
        .maybeSingle();

      if (session) {
        if (tenant.organizationId && session.organization_id !== tenant.organizationId) {
          return [];
        }
        if (tenant.customerId && session.customer_id !== tenant.customerId) {
          return [];
        }
      }
    }

    const { data, error } = await this.client
      .from("action_ledger_events")
      .select("*")
      .eq("session_id", sessionId)
      .order("sequence_number", { ascending: true });

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

export class SupabaseQuoteRepository implements IQuoteRepository {
  private client = getSupabaseClient();

  async create(
    data: Partial<Quote> & {
      session_id: string;
      organization_id: string;
      customer_id: string;
      policy_id: string;
      provider_name: string;
      amount: number;
      currency?: string;
      expires_at: string;
      quote_hash?: string;
    },
    tenant?: TenantContext
  ): Promise<Quote> {
    if (tenant?.organizationId && data.organization_id !== tenant.organizationId) {
      throw new DatabaseError("Tenant authorization violation: organization mismatch on quote create", "UNAUTHORIZED");
    }
    if (tenant?.customerId && data.customer_id !== tenant.customerId) {
      throw new DatabaseError("Tenant authorization violation: customer mismatch on quote create", "UNAUTHORIZED");
    }

    const insertPayload: Record<string, unknown> = {
      session_id: data.session_id,
      organization_id: data.organization_id,
      customer_id: data.customer_id,
      policy_id: data.policy_id,
      underwriter_id: data.underwriter_id ?? null,
      provider_name: data.provider_name,
      amount: data.amount,
      currency: data.currency ?? "NGN",
      status: data.status ?? "issued",
      expires_at: data.expires_at,
      quote_hash: data.quote_hash ?? "sha256_unhashed",
      provider_reference: data.provider_reference ?? null,
      metadata: data.metadata ?? {},
    };
    if (data.id) {
      insertPayload.id = data.id;
    }

    const { data: created, error } = await this.client
      .from("quotes")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error || !created) {
      throw new DatabaseError(`Failed to persist quote: ${error?.message}`, error?.code, error);
    }
    return created as Quote;
  }

  async findById(id: string, tenant?: TenantContext): Promise<Quote | null> {
    let query = this.client
      .from("quotes")
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
      throw new DatabaseError(`Quote lookup failed: ${error.message}`, error.code, error);
    }
    return (data || null) as Quote | null;
  }

  async findBySessionId(sessionId: string, tenant?: TenantContext): Promise<Quote[]> {
    let query = this.client
      .from("quotes")
      .select("*")
      .eq("session_id", sessionId);

    if (tenant?.organizationId) {
      query = query.eq("organization_id", tenant.organizationId);
    }
    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) {
      throw new DatabaseError(`Quotes query by session ID failed: ${error.message}`, error.code, error);
    }
    return (data || []) as Quote[];
  }

  async updateStatus(id: string, status: Quote["status"], tenant?: TenantContext): Promise<Quote> {
    let query = this.client
      .from("quotes")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (tenant?.organizationId) {
      query = query.eq("organization_id", tenant.organizationId);
    }
    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query.select("*").single();
    if (error || !data) {
      throw new DatabaseError(`Failed to update quote status: ${error?.message}`, error?.code, error);
    }
    return data as Quote;
  }

  async acceptQuote(id: string, sessionId: string, tenant?: TenantContext): Promise<Quote | null> {
    let query = this.client
      .from("quotes")
      .update({
        status: "accepted",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "issued")
      .eq("session_id", sessionId);

    if (tenant?.organizationId) {
      query = query.eq("organization_id", tenant.organizationId);
    }
    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query.select("*").maybeSingle();
    if (error) {
      throw new DatabaseError(`Failed to atomically accept quote: ${error.message}`, error.code, error);
    }
    return (data || null) as Quote | null;
  }
}

export class SupabaseRepositoryContainer implements RepositoryContainer {
  public readonly isDemo = false;
  public readonly customers = new SupabaseCustomerRepository();
  public readonly policies = new SupabasePolicyRepository();
  public readonly renewals = new SupabaseRenewalRepository();
  public readonly quotes = new SupabaseQuoteRepository();
  public readonly sessions = new SupabaseActionSessionRepository();
  public readonly plans = new SupabaseActionPlanRepository();
  public readonly steps = new SupabaseActionStepRepository();
  public readonly transactions = new SupabaseTransactionRepository();
  public readonly documents = new SupabaseDocumentRepository();
  public readonly notifications = new SupabaseNotificationRepository();
  public readonly audit = new SupabaseAuditRepository();
  public readonly ledger = new SupabaseLedgerRepository();
}
