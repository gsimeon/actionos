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
import { getStore } from "@/lib/actionos/mock-store";

let demoEntitySequence = 0;
function generateDemoId(prefix: string): string {
  demoEntitySequence += 1;
  const rand = Math.random().toString(36).substring(2, 7);
  return `${prefix}_${Date.now()}_${demoEntitySequence}_${rand}`;
}

export class DemoCustomerRepository implements ICustomerRepository {
  async findAll(tenant?: TenantContext): Promise<Customer[]> {
    const store = getStore();
    return store.customers.filter((c) => {
      if (tenant?.organizationId && c.organization_id !== tenant.organizationId) return false;
      if (tenant?.customerId && c.id !== tenant.customerId) return false;
      return true;
    });
  }

  async findById(id: string, tenant?: TenantContext): Promise<Customer | null> {
    const store = getStore();
    const customer = store.customers.find((c) => c.id === id);
    if (!customer) return null;
    if (tenant?.organizationId && customer.organization_id !== tenant.organizationId) return null;
    if (tenant?.customerId && customer.id !== tenant.customerId) return null;
    return customer;
  }

  async findByNumber(customerNumber: string, tenant?: TenantContext): Promise<Customer | null> {
    const store = getStore();
    const customer = store.customers.find(
      (c) => c.customer_number.toLowerCase() === customerNumber.toLowerCase()
    );
    if (!customer) return null;
    if (tenant?.organizationId && customer.organization_id !== tenant.organizationId) return null;
    if (tenant?.customerId && customer.id !== tenant.customerId) return null;
    return customer;
  }

  async findByOrganization(orgId: string): Promise<Customer[]> {
    const store = getStore();
    return store.customers.filter((c) => c.organization_id === orgId);
  }

  async create(data: Partial<Customer> & { customer_number: string; full_name: string; phone: string; email: string; organization_id: string }): Promise<Customer> {
    const store = getStore();
    const customer: Customer = {
      id: data.id || generateDemoId("demo_cus"),
      organization_id: data.organization_id,
      profile_id: data.profile_id || null,
      customer_number: data.customer_number,
      full_name: data.full_name,
      phone: data.phone,
      email: data.email,
      address: data.address || null,
      state: data.state || "Lagos",
      country: data.country || "Nigeria",
      status: data.status || "active",
      metadata: data.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.customers.unshift(customer);
    return customer;
  }
}

export class DemoPolicyRepository implements IPolicyRepository {
  async findAll(options?: { status?: string; tenant?: TenantContext }): Promise<Policy[]> {
    const store = getStore();
    return store.policies.filter((p) => {
      if (options?.status && options.status !== "all" && p.status !== options.status) return false;
      if (options?.tenant?.customerId && p.customer_id !== options.tenant.customerId) return false;
      if (options?.tenant?.organizationId) {
        const cust = store.customers.find((c) => c.id === p.customer_id);
        if (!cust || cust.organization_id !== options.tenant.organizationId) return false;
      }
      return true;
    });
  }

  async findById(id: string, tenant?: TenantContext): Promise<Policy | null> {
    const store = getStore();
    const policy = store.policies.find((p) => p.id === id);
    if (!policy) return null;
    if (tenant?.customerId && policy.customer_id !== tenant.customerId) return null;
    if (tenant?.organizationId) {
      const cust = store.customers.find((c) => c.id === policy.customer_id);
      if (!cust || cust.organization_id !== tenant.organizationId) return null;
    }
    return policy;
  }

  async findByNumber(policyNumber: string, tenant?: TenantContext): Promise<Policy | null> {
    const store = getStore();
    const policy = store.policies.find(
      (p) => p.policy_number.toLowerCase() === policyNumber.toLowerCase()
    );
    if (!policy) return null;
    if (tenant?.customerId && policy.customer_id !== tenant.customerId) return null;
    if (tenant?.organizationId) {
      const cust = store.customers.find((c) => c.id === policy.customer_id);
      if (!cust || cust.organization_id !== tenant.organizationId) return null;
    }
    return policy;
  }

  async findByCustomerId(customerId: string, tenant?: TenantContext): Promise<Policy[]> {
    const store = getStore();
    if (tenant?.customerId && customerId !== tenant.customerId) return [];
    if (tenant?.organizationId) {
      const cust = store.customers.find((c) => c.id === customerId);
      if (!cust || cust.organization_id !== tenant.organizationId) return [];
    }
    return store.policies.filter((p) => p.customer_id === customerId);
  }

  async create(data: Partial<Policy> & { customer_id: string; provider_id: string; policy_type_id: string; policy_number: string; start_date: string; expiry_date: string; premium: number }, tenant?: TenantContext): Promise<Policy> {
    const store = getStore();
    if (tenant?.customerId && data.customer_id !== tenant.customerId) {
      throw new Error(`Tenant authorization violation: customer mismatch on policy create`);
    }
    if (tenant?.organizationId) {
      const cust = store.customers.find((c) => c.id === data.customer_id);
      if (!cust || cust.organization_id !== tenant.organizationId) {
        throw new Error(`Tenant authorization violation: organization mismatch on policy create`);
      }
    }
    const policy: Policy = {
      id: data.id || generateDemoId("demo_pol"),
      customer_id: data.customer_id,
      asset_id: data.asset_id || null,
      provider_id: data.provider_id,
      policy_type_id: data.policy_type_id,
      policy_number: data.policy_number,
      start_date: data.start_date,
      expiry_date: data.expiry_date,
      premium: data.premium,
      currency: data.currency || "NGN",
      status: data.status || "active",
      metadata: data.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.policies.unshift(policy);
    return policy;
  }

  async updateStatusAndExpiry(id: string, status: Policy["status"], newExpiryDate: string, tenant?: TenantContext): Promise<Policy> {
    const store = getStore();
    const policy = store.policies.find((p) => p.id === id);
    if (!policy) {
      throw new Error(`Policy not found: ${id}`);
    }
    if (tenant?.customerId && policy.customer_id !== tenant.customerId) {
      throw new Error(`Tenant authorization violation for policy ${id}`);
    }
    if (tenant?.organizationId) {
      const cust = store.customers.find((c) => c.id === policy.customer_id);
      if (!cust || cust.organization_id !== tenant.organizationId) {
        throw new Error(`Tenant authorization violation for policy ${id}`);
      }
    }
    policy.status = status;
    policy.expiry_date = newExpiryDate;
    policy.updated_at = new Date().toISOString();
    return policy;
  }
}

export class DemoRenewalRepository implements IRenewalRepository {
  async findAll(options?: { status?: string; tenant?: TenantContext }): Promise<Renewal[]> {
    const store = getStore();
    return store.renewals.filter((r) => {
      if (options?.status && options.status !== "all" && r.status !== options.status) return false;
      if (options?.tenant?.customerId && r.customer_id !== options.tenant.customerId) return false;
      if (options?.tenant?.organizationId) {
        const cust = store.customers.find((c) => c.id === r.customer_id);
        if (!cust || cust.organization_id !== options.tenant.organizationId) return false;
      }
      return true;
    });
  }

  async findById(id: string, tenant?: TenantContext): Promise<Renewal | null> {
    const store = getStore();
    const renewal = store.renewals.find((r) => r.id === id);
    if (!renewal) return null;
    if (tenant?.customerId && renewal.customer_id !== tenant.customerId) return null;
    if (tenant?.organizationId) {
      const cust = store.customers.find((c) => c.id === renewal.customer_id);
      if (!cust || cust.organization_id !== tenant.organizationId) return null;
    }
    return renewal;
  }

  async findByPolicyId(policyId: string, tenant?: TenantContext): Promise<Renewal | null> {
    const store = getStore();
    const renewal = store.renewals.find((r) => r.policy_id === policyId);
    if (!renewal) return null;
    if (tenant?.customerId && renewal.customer_id !== tenant.customerId) return null;
    if (tenant?.organizationId) {
      const cust = store.customers.find((c) => c.id === renewal.customer_id);
      if (!cust || cust.organization_id !== tenant.organizationId) return null;
    }
    return renewal;
  }

  async create(data: Partial<Renewal> & { policy_id: string; customer_id: string; scheduled_for: string }, tenant?: TenantContext): Promise<Renewal> {
    const store = getStore();
    if (tenant?.customerId && data.customer_id !== tenant.customerId) {
      throw new Error(`Tenant authorization violation: customer mismatch on renewal create`);
    }
    if (tenant?.organizationId) {
      const cust = store.customers.find((c) => c.id === data.customer_id);
      if (!cust || cust.organization_id !== tenant.organizationId) {
        throw new Error(`Tenant authorization violation: organization mismatch on renewal create`);
      }
    }
    const renewal: Renewal = {
      id: data.id || generateDemoId("demo_ren"),
      policy_id: data.policy_id,
      customer_id: data.customer_id,
      scheduled_for: data.scheduled_for,
      days_before_expiry: data.days_before_expiry ?? 7,
      status: data.status || "scheduled",
      quote_amount: data.quote_amount ?? null,
      currency: data.currency || "NGN",
      payment_status: data.payment_status || "pending",
      renewed_at: data.renewed_at || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.renewals.unshift(renewal);
    return renewal;
  }

  async updateStatus(id: string, status: Renewal["status"], renewedAt?: string, tenant?: TenantContext): Promise<Renewal> {
    const store = getStore();
    const renewal = store.renewals.find((r) => r.id === id);
    if (!renewal) {
      throw new Error(`Renewal not found: ${id}`);
    }
    if (tenant?.customerId && renewal.customer_id !== tenant.customerId) {
      throw new Error(`Tenant authorization violation for renewal ${id}`);
    }
    if (tenant?.organizationId) {
      const cust = store.customers.find((c) => c.id === renewal.customer_id);
      if (!cust || cust.organization_id !== tenant.organizationId) {
        throw new Error(`Tenant authorization violation for renewal ${id}`);
      }
    }
    renewal.status = status;
    if (renewedAt) renewal.renewed_at = renewedAt;
    renewal.updated_at = new Date().toISOString();
    return renewal;
  }

  async updatePaymentStatus(id: string, paymentStatus: Renewal["payment_status"], tenant?: TenantContext): Promise<Renewal> {
    const store = getStore();
    const renewal = store.renewals.find((r) => r.id === id);
    if (!renewal) {
      throw new Error(`Renewal not found: ${id}`);
    }
    if (tenant?.customerId && renewal.customer_id !== tenant.customerId) {
      throw new Error(`Tenant authorization violation for renewal ${id}`);
    }
    if (tenant?.organizationId) {
      const cust = store.customers.find((c) => c.id === renewal.customer_id);
      if (!cust || cust.organization_id !== tenant.organizationId) {
        throw new Error(`Tenant authorization violation for renewal ${id}`);
      }
    }
    renewal.payment_status = paymentStatus;
    renewal.updated_at = new Date().toISOString();
    return renewal;
  }
}

export class DemoActionSessionRepository implements IActionSessionRepository {
  async findById(id: string, tenant?: TenantContext): Promise<ActionSession | null> {
    const store = getStore();
    const session = store.sessions.find((s) => s.id === id);
    if (!session) return null;
    if (tenant?.organizationId && session.organization_id !== tenant.organizationId) return null;
    if (tenant?.customerId && session.customer_id && session.customer_id !== tenant.customerId) return null;
    return session;
  }

  async create(data: Partial<ActionSession> & { organization_id: string; channel: ActionSession["channel"] }, tenant?: TenantContext): Promise<ActionSession> {
    const store = getStore();
    if (tenant?.organizationId && data.organization_id !== tenant.organizationId) {
      throw new Error(`Tenant authorization violation: organization mismatch on session create`);
    }
    if (tenant?.customerId && data.customer_id && data.customer_id !== tenant.customerId) {
      throw new Error(`Tenant authorization violation: customer mismatch on session create`);
    }
    const session: ActionSession = {
      id: data.id || generateDemoId("demo_ses"),
      customer_id: data.customer_id || null,
      organization_id: data.organization_id,
      channel: data.channel,
      language: data.language || "en-NG",
      input_text: data.input_text || null,
      input_audio_url: data.input_audio_url || null,
      intent: data.intent || null,
      status: data.status || "received",
      started_at: new Date().toISOString(),
      completed_at: null,
      metadata: data.metadata || {},
    };
    store.sessions.push(session);
    return session;
  }

  async updateStatus(id: string, status: ActionSession["status"], completedAt?: string, tenant?: TenantContext): Promise<ActionSession> {
    const store = getStore();
    const session = store.sessions.find((s) => s.id === id);
    if (!session) {
      throw new Error(`Action session not found: ${id}`);
    }
    if (tenant?.organizationId && session.organization_id !== tenant.organizationId) {
      throw new Error(`Tenant authorization violation for session ${id}`);
    }
    if (tenant?.customerId && session.customer_id && session.customer_id !== tenant.customerId) {
      throw new Error(`Tenant authorization violation for session ${id}`);
    }
    session.status = status;
    if (completedAt) session.completed_at = completedAt;
    return session;
  }

  async updateMetadata(id: string, metadata: Record<string, unknown>, tenant?: TenantContext): Promise<ActionSession> {
    const store = getStore();
    const session = store.sessions.find((s) => s.id === id);
    if (!session) {
      throw new Error(`Action session not found: ${id}`);
    }
    if (tenant?.organizationId && session.organization_id !== tenant.organizationId) {
      throw new Error(`Tenant authorization violation for session ${id}`);
    }
    if (tenant?.customerId && session.customer_id && session.customer_id !== tenant.customerId) {
      throw new Error(`Tenant authorization violation for session ${id}`);
    }
    session.metadata = { ...session.metadata, ...metadata };
    return session;
  }
}

export class DemoActionPlanRepository implements IActionPlanRepository {
  async create(data: Partial<ActionPlan> & { session_id: string; intent: string; goal: string }, tenant?: TenantContext): Promise<ActionPlan> {
    const store = getStore();
    if (tenant?.organizationId || tenant?.customerId) {
      const session = store.sessions.find((s) => s.id === data.session_id);
      if (session) {
        if (tenant.organizationId && session.organization_id !== tenant.organizationId) {
          throw new Error(`Tenant authorization violation on action plan create`);
        }
        if (tenant.customerId && session.customer_id && session.customer_id !== tenant.customerId) {
          throw new Error(`Tenant authorization violation on action plan create`);
        }
      }
    }
    const plan: ActionPlan = {
      id: data.id || generateDemoId("demo_plan"),
      session_id: data.session_id,
      intent: data.intent,
      goal: data.goal,
      risk_level: data.risk_level || "low",
      confidence: data.confidence ?? 1.0,
      status: data.status || "pending",
      created_at: new Date().toISOString(),
      completed_at: null,
    };
    store.plans.push(plan);
    return plan;
  }

  async findBySessionId(sessionId: string, tenant?: TenantContext): Promise<ActionPlan | null> {
    const store = getStore();
    if (tenant?.organizationId || tenant?.customerId) {
      const session = store.sessions.find((s) => s.id === sessionId);
      if (!session) return null;
      if (tenant.organizationId && session.organization_id !== tenant.organizationId) return null;
      if (tenant.customerId && session.customer_id && session.customer_id !== tenant.customerId) return null;
    }
    return store.plans.find((p) => p.session_id === sessionId) || null;
  }

  async updateStatus(id: string, status: ActionPlan["status"], tenant?: TenantContext): Promise<ActionPlan> {
    const store = getStore();
    const plan = store.plans.find((p) => p.id === id);
    if (!plan) {
      throw new Error(`Action plan not found: ${id}`);
    }
    if (tenant?.organizationId || tenant?.customerId) {
      const session = store.sessions.find((s) => s.id === plan.session_id);
      if (session) {
        if (tenant.organizationId && session.organization_id !== tenant.organizationId) {
          throw new Error(`Tenant authorization violation for action plan ${id}`);
        }
        if (tenant.customerId && session.customer_id && session.customer_id !== tenant.customerId) {
          throw new Error(`Tenant authorization violation for action plan ${id}`);
        }
      }
    }
    plan.status = status;
    if (status === "completed" || status === "failed") {
      plan.completed_at = new Date().toISOString();
    }
    return plan;
  }
}

export class DemoActionStepRepository implements IActionStepRepository {
  async createMany(
    stepsData: Array<Partial<ActionStep> & { action_plan_id: string; sequence: number; action_type: string; description: string; tool_name: string }>,
    _tenant?: TenantContext
  ): Promise<ActionStep[]> {
    const store = getStore();
    const created: ActionStep[] = stepsData.map((s) => ({
      id: s.id || generateDemoId(`demo_step_${s.sequence}`),
      action_plan_id: s.action_plan_id,
      sequence: s.sequence,
      action_type: s.action_type,
      description: s.description,
      tool_name: s.tool_name,
      input: s.input || {},
      output: s.output || null,
      status: s.status || "pending",
      requires_confirmation: s.requires_confirmation ?? false,
      started_at: null,
      completed_at: null,
      error: null,
    }));
    store.steps.push(...created);
    return created;
  }

  async findByPlanId(planId: string, tenant?: TenantContext): Promise<ActionStep[]> {
    const store = getStore();
    if (tenant?.organizationId || tenant?.customerId) {
      const plan = store.plans.find((p) => p.id === planId);
      if (plan) {
        const session = store.sessions.find((s) => s.id === plan.session_id);
        if (!session) return [];
        if (tenant.organizationId && session.organization_id !== tenant.organizationId) return [];
        if (tenant.customerId && session.customer_id && session.customer_id !== tenant.customerId) return [];
      }
    }
    return store.steps.filter((s) => s.action_plan_id === planId);
  }

  async updateStep(id: string, update: Partial<ActionStep>, _tenant?: TenantContext): Promise<ActionStep> {
    const store = getStore();
    const step = store.steps.find((s) => s.id === id);
    if (!step) {
      throw new Error(`Action step not found: ${id}`);
    }
    Object.assign(step, update);
    return step;
  }
}

export class DemoTransactionRepository implements ITransactionRepository {
  async create(data: Partial<Transaction> & { customer_id: string; amount: number; reference: string }, tenant?: TenantContext): Promise<Transaction> {
    const store = getStore();
    if (tenant?.customerId && data.customer_id !== tenant.customerId) {
      throw new Error(`Tenant authorization violation: customer mismatch on transaction create`);
    }
    if (tenant?.organizationId) {
      const cust = store.customers.find((c) => c.id === data.customer_id);
      if (!cust || cust.organization_id !== tenant.organizationId) {
        throw new Error(`Tenant authorization violation: organization mismatch on transaction create`);
      }
    }
    const tx: Transaction = {
      id: data.id || generateDemoId("demo_tx"),
      customer_id: data.customer_id,
      renewal_id: data.renewal_id || null,
      amount: data.amount,
      currency: data.currency || "NGN",
      provider: data.provider || "mock_paystack",
      reference: data.reference,
      status: data.status || "pending",
      transaction_type: data.transaction_type || "renewal_premium",
      metadata: data.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.transactions.unshift(tx);
    return tx;
  }

  async findByReference(reference: string, tenant?: TenantContext): Promise<Transaction | null> {
    const store = getStore();
    const tx = store.transactions.find((t) => t.reference === reference);
    if (!tx) return null;
    if (tenant?.customerId && tx.customer_id !== tenant.customerId) return null;
    if (tenant?.organizationId) {
      const cust = store.customers.find((c) => c.id === tx.customer_id);
      if (!cust || cust.organization_id !== tenant.organizationId) return null;
    }
    return tx;
  }

  async updateStatus(id: string, status: Transaction["status"], tenant?: TenantContext): Promise<Transaction> {
    const store = getStore();
    const tx = store.transactions.find((t) => t.id === id || t.reference === id);
    if (!tx) {
      throw new Error(`Transaction not found: ${id}`);
    }
    if (tenant?.customerId && tx.customer_id !== tenant.customerId) {
      throw new Error(`Tenant authorization violation for transaction ${id}`);
    }
    if (tenant?.organizationId) {
      const cust = store.customers.find((c) => c.id === tx.customer_id);
      if (!cust || cust.organization_id !== tenant.organizationId) {
        throw new Error(`Tenant authorization violation for transaction ${id}`);
      }
    }
    tx.status = status;
    tx.updated_at = new Date().toISOString();
    return tx;
  }
}

export class DemoDocumentRepository implements IDocumentRepository {
  async create(data: Partial<Document> & { customer_id: string; document_type: Document["document_type"]; file_path: string; file_name: string }, tenant?: TenantContext): Promise<Document> {
    const store = getStore();
    if (tenant?.customerId && data.customer_id !== tenant.customerId) {
      throw new Error(`Tenant authorization violation: customer mismatch on document create`);
    }
    if (tenant?.organizationId) {
      const cust = store.customers.find((c) => c.id === data.customer_id);
      if (!cust || cust.organization_id !== tenant.organizationId) {
        throw new Error(`Tenant authorization violation: organization mismatch on document create`);
      }
    }
    const doc: Document = {
      id: data.id || generateDemoId("demo_doc"),
      customer_id: data.customer_id,
      renewal_id: data.renewal_id || null,
      document_type: data.document_type,
      file_path: data.file_path,
      file_name: data.file_name,
      mime_type: data.mime_type || "application/pdf",
      status: data.status || "generated",
      created_at: new Date().toISOString(),
    };
    store.documents.unshift(doc);
    return doc;
  }

  async findByCustomerId(customerId: string, tenant?: TenantContext): Promise<Document[]> {
    const store = getStore();
    if (tenant?.customerId && customerId !== tenant.customerId) return [];
    if (tenant?.organizationId) {
      const cust = store.customers.find((c) => c.id === customerId);
      if (!cust || cust.organization_id !== tenant.organizationId) return [];
    }
    return store.documents.filter((d) => d.customer_id === customerId);
  }

  async findByRenewalId(renewalId: string, tenant?: TenantContext): Promise<Document[]> {
    const store = getStore();
    return store.documents.filter((d) => {
      if (d.renewal_id !== renewalId) return false;
      if (tenant?.customerId && d.customer_id !== tenant.customerId) return false;
      if (tenant?.organizationId) {
        const cust = store.customers.find((c) => c.id === d.customer_id);
        if (!cust || cust.organization_id !== tenant.organizationId) return false;
      }
      return true;
    });
  }
}

export class DemoNotificationRepository implements INotificationRepository {
  async create(data: Partial<NotificationRecord> & { customer_id: string; type: NotificationRecord["type"]; channel: NotificationRecord["channel"]; title: string; message: string; scheduled_for: string }, tenant?: TenantContext): Promise<NotificationRecord> {
    const store = getStore();
    if (tenant?.customerId && data.customer_id !== tenant.customerId) {
      throw new Error(`Tenant authorization violation: customer mismatch on notification create`);
    }
    if (tenant?.organizationId) {
      const cust = store.customers.find((c) => c.id === data.customer_id);
      if (!cust || cust.organization_id !== tenant.organizationId) {
        throw new Error(`Tenant authorization violation: organization mismatch on notification create`);
      }
    }
    const notif: NotificationRecord = {
      id: data.id || generateDemoId("demo_notif"),
      customer_id: data.customer_id,
      type: data.type,
      channel: data.channel,
      title: data.title,
      message: data.message,
      scheduled_for: data.scheduled_for,
      sent_at: data.sent_at || null,
      status: data.status || "pending",
      metadata: data.metadata || {},
    };
    store.notifications.unshift(notif);
    return notif;
  }

  async findByCustomerId(customerId: string, tenant?: TenantContext): Promise<NotificationRecord[]> {
    const store = getStore();
    if (tenant?.customerId && customerId !== tenant.customerId) return [];
    if (tenant?.organizationId) {
      const cust = store.customers.find((c) => c.id === customerId);
      if (!cust || cust.organization_id !== tenant.organizationId) return [];
    }
    return store.notifications.filter((n) => n.customer_id === customerId);
  }
}

export class DemoAuditRepository implements IAuditRepository {
  async log(data: Partial<AuditLog> & { organization_id: string; action: string; resource_type: string }, tenant?: TenantContext): Promise<AuditLog> {
    const store = getStore();
    if (tenant?.organizationId && data.organization_id !== tenant.organizationId) {
      throw new Error(`Tenant authorization violation: organization mismatch on audit log`);
    }
    const entry: AuditLog = {
      id: data.id || generateDemoId("demo_aud"),
      organization_id: data.organization_id,
      user_id: data.user_id || null,
      session_id: data.session_id || null,
      action: data.action,
      resource_type: data.resource_type,
      resource_id: data.resource_id || null,
      old_value: data.old_value || null,
      new_value: data.new_value || null,
      ip_address: data.ip_address || "127.0.0.1",
      user_agent: data.user_agent || "ActionOS Orchestrator",
      created_at: new Date().toISOString(),
    };
    store.auditLogs.unshift(entry);
    return entry;
  }
}

export class DemoLedgerRepository implements ILedgerRepository {
  async appendEvent(event: ActionLedgerEvent, _tenant?: TenantContext): Promise<ActionLedgerEvent> {
    const store = getStore();
    if (!store.ledgerEvents[event.sessionId]) {
      store.ledgerEvents[event.sessionId] = [];
    }
    const existingIndex = store.ledgerEvents[event.sessionId].findIndex((e) => e.id === event.id);
    if (existingIndex === -1) {
      store.ledgerEvents[event.sessionId].push(event);
    } else {
      store.ledgerEvents[event.sessionId][existingIndex] = event;
    }
    return event;
  }

  async getEventsBySessionId(sessionId: string, tenant?: TenantContext): Promise<ActionLedgerEvent[]> {
    const store = getStore();
    if (tenant?.organizationId || tenant?.customerId) {
      const session = store.sessions.find((s) => s.id === sessionId);
      if (!session) return [];
      if (tenant.organizationId && session.organization_id !== tenant.organizationId) return [];
      if (tenant.customerId && session.customer_id && session.customer_id !== tenant.customerId) return [];
    }
    return [...(store.ledgerEvents[sessionId] || [])];
  }
}

export class DemoRepositoryContainer implements RepositoryContainer {
  public readonly isDemo = true;
  public readonly customers = new DemoCustomerRepository();
  public readonly policies = new DemoPolicyRepository();
  public readonly renewals = new DemoRenewalRepository();
  public readonly sessions = new DemoActionSessionRepository();
  public readonly plans = new DemoActionPlanRepository();
  public readonly steps = new DemoActionStepRepository();
  public readonly transactions = new DemoTransactionRepository();
  public readonly documents = new DemoDocumentRepository();
  public readonly notifications = new DemoNotificationRepository();
  public readonly audit = new DemoAuditRepository();
  public readonly ledger = new DemoLedgerRepository();
}
