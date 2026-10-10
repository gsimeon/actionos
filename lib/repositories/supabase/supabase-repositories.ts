import type {
  ICustomerRepository,
  IAssetRepository,
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
  IWebhookEventRepository,
  WebhookEventRecord,
  RepositoryContainer,
  TenantContext,
} from "../interfaces";
import type {
  Customer,
  Asset,
  AssetType,
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
import { isProductionMode, isDemoMode } from "@/lib/runtime/mode";
import { getActiveLedgerKeyVersion } from "@/lib/actionos/crypto-ledger";

export function assertSupabaseProductionConfig(): void {
  if (isProductionMode()) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !url.trim() || url.includes("demo.supabase.co")) {
      throw new Error(
        "Supabase production configuration error: A valid NEXT_PUBLIC_SUPABASE_URL is strictly required in production mode. Fallback to demo URL is prohibited."
      );
    }
    if (!serviceRoleKey || !serviceRoleKey.trim() || serviceRoleKey === "demo-key" || serviceRoleKey === "demo-anon-key" || serviceRoleKey === "demo-service-key") {
      throw new Error(
        "Supabase production configuration error: SUPABASE_SERVICE_ROLE_KEY is strictly required for repository operations in production mode. Fallback to demo keys is prohibited."
      );
    }
  }
}

export function getSupabaseClient(): SupabaseClient {
  assertSupabaseProductionConfig();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceRoleKey || publishableKey;

  if (isProductionMode()) {
    return createSupabaseClient(url!, serviceRoleKey!, {
      auth: { persistSession: false },
    });
  }

  // Non-production: demo credentials strictly isolated to explicit demo mode
  if (!url || !key || url.includes("demo.supabase.co") || key === "demo-key" || key === "demo-anon-key") {
    if (!isDemoMode()) {
      throw new Error(
        "Supabase configuration error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined. Fallback to demo credentials is only permitted when ACTIONOS_RUNTIME_MODE is explicitly set to 'demo'."
      );
    }
  }

  return createSupabaseClient(
    url || "https://demo.supabase.co",
    key || "demo-key",
    {
      auth: { persistSession: false },
    }
  );
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

export class SupabaseAssetRepository implements IAssetRepository {
  private client = getSupabaseClient();

  async findById(id: string, tenant?: TenantContext): Promise<Asset | null> {
    let query = this.client.from("assets").select("*, customers!inner(id, organization_id)").eq("id", id);

    if (tenant?.organizationId) {
      query = query.eq("customers.organization_id", tenant.organizationId);
    }
    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new DatabaseError(`Asset lookup by ID failed: ${error.message}`, error.code, error);
    }
    return (data || null) as Asset | null;
  }

  async findByIdentifier(identifier: string, tenant?: TenantContext): Promise<Asset | null> {
    const raw = identifier.trim();
    const clean = raw.replace(/[-\s]/g, "");

    let query = this.client
      .from("assets")
      .select("*, customers!inner(id, organization_id)");

    if (tenant?.organizationId) {
      query = query.eq("customers.organization_id", tenant.organizationId);
    }
    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    query = query.or(
      `identifier.ilike.${raw},identifier.ilike.${clean},metadata->>chassis_number.ilike.${raw},metadata->>chassis.ilike.${raw},metadata->>vin.ilike.${raw},metadata->>engine_number.ilike.${raw},metadata->>engine.ilike.${raw}`
    );

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new DatabaseError(`Asset lookup by identifier failed: ${error.message}`, error.code, error);
    }
    return (data || null) as Asset | null;
  }

  async findByCustomerId(customerId: string, tenant?: TenantContext): Promise<Asset[]> {
    if (tenant?.customerId && tenant.customerId !== customerId) {
      return [];
    }

    let query = this.client
      .from("assets")
      .select("*, customers!inner(id, organization_id)")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (tenant?.organizationId) {
      query = query.eq("customers.organization_id", tenant.organizationId);
    }

    const { data, error } = await query;
    if (error) {
      throw new DatabaseError(`Asset lookup by customer ID failed: ${error.message}`, error.code, error);
    }
    return (data || []) as Asset[];
  }

  async findByVinOrPlate(query: string, tenant?: TenantContext): Promise<Asset | null> {
    return this.findByIdentifier(query, tenant);
  }

  async queryVehicles(options: {
    query?: string;
    customerId?: string;
    plate?: string;
    vin?: string;
    engineNumber?: string;
    tenant?: TenantContext;
  }): Promise<Asset[]> {
    let query = this.client
      .from("assets")
      .select("*, customers!inner(id, organization_id)")
      .order("created_at", { ascending: false });

    if (options.tenant?.organizationId) {
      query = query.eq("customers.organization_id", options.tenant.organizationId);
    }
    if (options.tenant?.customerId) {
      query = query.eq("customer_id", options.tenant.customerId);
    }
    if (options.customerId) {
      query = query.eq("customer_id", options.customerId);
    }
    if (options.plate) {
      query = query.ilike("identifier", options.plate.trim());
    }
    if (options.vin) {
      query = query.or(`metadata->>chassis_number.ilike.${options.vin.trim()},metadata->>chassis.ilike.${options.vin.trim()},metadata->>vin.ilike.${options.vin.trim()}`);
    }
    if (options.engineNumber) {
      query = query.or(`metadata->>engine_number.ilike.${options.engineNumber.trim()},metadata->>engine.ilike.${options.engineNumber.trim()}`);
    }
    if (options.query) {
      const q = options.query.trim();
      query = query.or(
        `identifier.ilike.%${q}%,name.ilike.%${q}%,metadata->>chassis_number.ilike.%${q}%,metadata->>vin.ilike.%${q}%,metadata->>engine_number.ilike.%${q}%`
      );
    }

    const { data, error } = await query;
    if (error) {
      throw new DatabaseError(`Vehicle query failed: ${error.message}`, error.code, error);
    }
    return (data || []) as Asset[];
  }

  async create(
    data: Partial<Asset> & {
      customer_id: string;
      name: string;
      identifier: string;
      asset_type?: AssetType;
      metadata?: Record<string, unknown>;
    },
    tenant?: TenantContext
  ): Promise<Asset> {
    if (tenant?.customerId && tenant.customerId !== data.customer_id) {
      throw new DatabaseError("Unauthorized: cannot create asset for another customer", "403");
    }

    const { data: created, error } = await this.client
      .from("assets")
      .insert({
        customer_id: data.customer_id,
        asset_type: data.asset_type || "vehicle",
        name: data.name,
        identifier: data.identifier,
        metadata: data.metadata || {},
      })
      .select()
      .single();

    if (error) {
      throw new DatabaseError(`Asset creation failed: ${error.message}`, error.code, error);
    }
    return created as Asset;
  }

  async update(id: string, updateData: Partial<Asset>, tenant?: TenantContext): Promise<Asset> {
    const existing = await this.findById(id, tenant);
    if (!existing) {
      throw new DatabaseError(`Asset ${id} not found or inaccessible for tenant`, "404");
    }

    const { data: updated, error } = await this.client
      .from("assets")
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw new DatabaseError(`Asset update failed: ${error.message}`, error.code, error);
    }
    return updated as Asset;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: SupabaseClient<any>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(client: SupabaseClient<any> = getSupabaseClient()) {
    this.client = client;
  }

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
    const isProduction = isProductionMode();

    // PostgreSQL RPC for single-transaction atomic execution
    const { data: rpcResult, error: rpcError } = await this.client.rpc("claim_and_accept_quote", {
      p_session_id: sessionId,
      p_quote_id: quoteId,
      p_organization_id: tenant?.organizationId ?? null,
      p_customer_id: tenant?.customerId ?? null,
    });

    if (!rpcError && rpcResult && rpcResult.success) {
      return {
        session: rpcResult.session as ActionSession,
        quote: rpcResult.quote as Quote,
      };
    }

    if (rpcError) {
      const msg = rpcError.message || "";
      const code = rpcError.code || "";
      // If the error was a deliberate validation failure in status, lock, expiry, or tenant check:
      if (
        msg.includes("QUOTE_ACCEPTANCE_FAILED") ||
        msg.includes("SESSION_CLAIM_FAILED") ||
        msg.includes("QUOTE_EXPIRED") ||
        msg.includes("TENANT_MISMATCH") ||
        msg.includes("SESSION_NOT_FOUND") ||
        msg.includes("QUOTE_NOT_FOUND")
      ) {
        return null;
      }

      // Strictly fail closed! Non-atomic fallbacks are prohibited.
      throw new DatabaseError(
        isProduction
          ? `Atomic authorization claim RPC 'claim_and_accept_quote' failed in production: ${msg}`
          : `Atomic authorization claim RPC 'claim_and_accept_quote' failed: ${msg}`,
        code || "RPC_ERROR",
        rpcError
      );
    }

    if (rpcResult && !rpcResult.success) {
      return null;
    }

    return null;
  }

  async findPendingReconciliation(
    options?: { organizationId?: string; limit?: number },
    tenant?: TenantContext
  ): Promise<ActionSession[]> {
    let query = this.client
      .from("action_sessions")
      .select("*")
      .in("status", ["executing", "escalated"])
      .order("created_at", { ascending: true })
      .limit(options?.limit || 50);

    const orgId = tenant?.organizationId || options?.organizationId;
    if (orgId) {
      query = query.eq("organization_id", orgId);
    }
    if (tenant?.customerId) {
      query = query.eq("customer_id", tenant.customerId);
    }

    const { data, error } = await query;
    if (error) {
      throw new DatabaseError(`Failed to fetch pending reconciliation sessions: ${error.message}`, error.code, error);
    }

    const sessions = (data || []) as ActionSession[];
    return sessions.filter((s) => {
      const meta = (s.metadata || {}) as Record<string, unknown>;
      return Boolean(
        meta.reconciliation_required === true ||
        meta.requiresDeferredReconciliation === true ||
        meta.requiresManualRefund === true ||
        meta.refundState === "refund_pending" ||
        meta.refundState === "refund_unknown"
      );
    });
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

  async updateStatus(
    id: string,
    status: Transaction["status"],
    tenant?: TenantContext,
    extra?: { metadata?: Record<string, unknown> }
  ): Promise<Transaction> {
    if (tenant?.organizationId || tenant?.customerId) {
      let checkQuery = this.client.from("transactions").select("*, customer:customers!inner(*)").eq("id", id);
      if (tenant?.organizationId) checkQuery = checkQuery.eq("customer.organization_id", tenant.organizationId);
      if (tenant?.customerId) checkQuery = checkQuery.eq("customer_id", tenant.customerId);
      const { data: check } = await checkQuery.maybeSingle();
      if (!check) {
        throw new DatabaseError(`Transaction ${id} not found or tenant authorization mismatch`, "UNAUTHORIZED");
      }
    }

    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (extra?.metadata) {
      updatePayload.metadata = extra.metadata;
    }

    let query = this.client
      .from("transactions")
      .update(updatePayload)
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

  async settleWithWebhookEvent(
    id: string,
    status: Transaction["status"],
    event: {
      provider: string;
      eventId: string;
      eventType: string;
      reference: string;
      status: string;
      metadata?: Record<string, unknown>;
    },
    tenant?: TenantContext,
    extra?: { metadata?: Record<string, unknown> }
  ): Promise<{ transaction: Transaction; webhookEvent: WebhookEventRecord; isDuplicate?: boolean }> {
    // 1. Attempt atomic settlement via Postgres RPC
    try {
      const { data, error } = await this.client.rpc("settle_payment_webhook", {
        p_transaction_id: id,
        p_status: status,
        p_metadata: extra?.metadata ?? {},
        p_provider: event.provider,
        p_event_id: event.eventId,
        p_event_type: event.eventType,
        p_reference: event.reference,
        p_event_metadata: event.metadata ?? {},
      });

      if (!error && data) {
        if (data.duplicate) {
          return {
            transaction: (data.transaction || {}) as Transaction,
            webhookEvent: (data.webhook_event || {}) as WebhookEventRecord,
            isDuplicate: true,
          };
        }
        return {
          transaction: data.transaction as Transaction,
          webhookEvent: data.webhook_event as WebhookEventRecord,
          isDuplicate: false,
        };
      }
    } catch {
      // Fall through to atomic insert + update below
    }

    // 2. Coordinated atomic write: insert event record first, then update status
    const { data: eventData, error: eventErr } = await this.client
      .from("payment_webhook_events")
      .insert({
        provider: event.provider,
        event_id: event.eventId,
        event_type: event.eventType,
        reference: event.reference,
        status: event.status,
        metadata: event.metadata ?? {},
      })
      .select("*")
      .single();

    if (eventErr) {
      if (eventErr.code === "23505" || eventErr.message?.includes("duplicate key")) {
        const existingTx = await this.findByReference(event.reference, tenant);
        return {
          transaction: existingTx || ({} as Transaction),
          webhookEvent: {} as WebhookEventRecord,
          isDuplicate: true,
        };
      }
      throw new DatabaseError(`Failed to record webhook event: ${eventErr.message}`, eventErr.code, eventErr);
    }

    try {
      const updated = await this.updateStatus(id, status, tenant, extra);
      return {
        transaction: updated,
        webhookEvent: eventData as WebhookEventRecord,
        isDuplicate: false,
      };
    } catch (statusErr) {
      // Rollback inserted webhook event so subsequent provider retries can re-attempt cleanly
      try {
        await this.client
          .from("payment_webhook_events")
          .delete()
          .eq("id", (eventData as { id: string }).id);
      } catch {
        // Ignore rollback cleanup errors and propagate original statusErr
      }
      throw statusErr;
    }
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
        signing_key_version: event.signingKeyVersion ?? getActiveLedgerKeyVersion(),
        event_class: event.eventClass ?? "informational",
        is_compensating: Boolean(event.isCompensating),
        metadata: event.metadata ?? {},
      });
    if (error) {
      throw new DatabaseError(`Ledger append failed: ${error.message}`, error.code, error);
    }
    return event;
  }

  async getEventsBySessionId(sessionId: string, tenant?: TenantContext): Promise<ActionLedgerEvent[]> {
    if (tenant?.organizationId || tenant?.customerId) {
      const { data: session, error: sessionError } = await this.client
        .from("action_sessions")
        .select("organization_id, customer_id")
        .eq("id", sessionId)
        .maybeSingle();

      if (sessionError || !session) {
        return [];
      }

      if (tenant.organizationId && session.organization_id !== tenant.organizationId) {
        return [];
      }
      if (tenant.customerId && session.customer_id !== tenant.customerId) {
        return [];
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
      eventClass: (row.event_class as ActionLedgerEvent["eventClass"]) || undefined,
      isCompensating: typeof row.is_compensating === "boolean" ? row.is_compensating : undefined,
      metadata: (row.metadata as Record<string, unknown>) || {},
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
    if (data.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)) {
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

export class SupabaseWebhookEventRepository implements IWebhookEventRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: SupabaseClient<any>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(client: SupabaseClient<any> = getSupabaseClient()) {
    this.client = client;
  }

  async recordEvent(event: {
    provider: string;
    eventId: string;
    eventType: string;
    reference: string;
    status: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ isDuplicate: boolean; event: WebhookEventRecord }> {
    // Attempt atomic insertion utilizing PostgreSQL UNIQUE constraint (provider, event_id)
    const { data, error } = await this.client
      .from("payment_webhook_events")
      .insert({
        provider: event.provider,
        event_id: event.eventId,
        event_type: event.eventType,
        reference: event.reference,
        status: event.status,
        metadata: event.metadata ?? {},
      })
      .select("*")
      .single();

    if (error) {
      // 23505 is PostgreSQL unique_violation code
      if (error.code === "23505" || error.message?.includes("duplicate key")) {
        const existing = await this.findByEventId(event.provider, event.eventId);
        if (existing) {
          return { isDuplicate: true, event: existing };
        }
      }
      throw new DatabaseError(`Failed to record webhook event: ${error.message}`, error.code, error);
    }

    return { isDuplicate: false, event: data as WebhookEventRecord };
  }

  async findByEventId(provider: string, eventId: string): Promise<WebhookEventRecord | null> {
    const { data, error } = await this.client
      .from("payment_webhook_events")
      .select("*")
      .eq("provider", provider)
      .eq("event_id", eventId)
      .maybeSingle();

    if (error) {
      throw new DatabaseError(`Webhook event lookup failed: ${error.message}`, error.code, error);
    }
    return (data || null) as WebhookEventRecord | null;
  }
}

export class SupabaseRepositoryContainer implements RepositoryContainer {
  public readonly isDemo = false;
  public readonly customers = new SupabaseCustomerRepository();
  public readonly assets = new SupabaseAssetRepository();
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
  public readonly webhookEvents = new SupabaseWebhookEventRepository();
}
