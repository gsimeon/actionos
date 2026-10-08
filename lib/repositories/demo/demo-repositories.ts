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
import { getStore } from "@/lib/actionos/mock-store";

export class DemoCustomerRepository implements ICustomerRepository {
  async findAll(): Promise<Customer[]> {
    const store = getStore();
    return [...store.customers];
  }

  async findById(id: string): Promise<Customer | null> {
    const store = getStore();
    return store.customers.find((c) => c.id === id) || null;
  }

  async findByNumber(customerNumber: string): Promise<Customer | null> {
    const store = getStore();
    return (
      store.customers.find(
        (c) => c.customer_number.toLowerCase() === customerNumber.toLowerCase()
      ) || null
    );
  }

  async findByOrganization(orgId: string): Promise<Customer[]> {
    const store = getStore();
    return store.customers.filter((c) => c.organization_id === orgId);
  }

  async create(data: Partial<Customer> & { customer_number: string; full_name: string; phone: string; email: string; organization_id: string }): Promise<Customer> {
    const store = getStore();
    const customer: Customer = {
      id: data.id || `demo_cus_${Date.now()}`,
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
  async findAll(options?: { status?: string }): Promise<Policy[]> {
    const store = getStore();
    if (options?.status && options.status !== "all") {
      return store.policies.filter((p) => p.status === options.status);
    }
    return [...store.policies];
  }

  async findById(id: string): Promise<Policy | null> {
    const store = getStore();
    return store.policies.find((p) => p.id === id) || null;
  }

  async findByNumber(policyNumber: string): Promise<Policy | null> {
    const store = getStore();
    return (
      store.policies.find(
        (p) => p.policy_number.toLowerCase() === policyNumber.toLowerCase()
      ) || null
    );
  }

  async findByCustomerId(customerId: string): Promise<Policy[]> {
    const store = getStore();
    return store.policies.filter((p) => p.customer_id === customerId);
  }

  async create(data: Partial<Policy> & { customer_id: string; provider_id: string; policy_type_id: string; policy_number: string; start_date: string; expiry_date: string; premium: number }): Promise<Policy> {
    const store = getStore();
    const policy: Policy = {
      id: data.id || `demo_pol_${Date.now()}`,
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

  async updateStatusAndExpiry(id: string, status: Policy["status"], newExpiryDate: string): Promise<Policy> {
    const store = getStore();
    const policy = store.policies.find((p) => p.id === id);
    if (!policy) {
      throw new Error(`Policy not found: ${id}`);
    }
    policy.status = status;
    policy.expiry_date = newExpiryDate;
    policy.updated_at = new Date().toISOString();
    return policy;
  }
}

export class DemoRenewalRepository implements IRenewalRepository {
  async findAll(options?: { status?: string }): Promise<Renewal[]> {
    const store = getStore();
    if (options?.status && options.status !== "all") {
      return store.renewals.filter((r) => r.status === options.status);
    }
    return [...store.renewals];
  }

  async findById(id: string): Promise<Renewal | null> {
    const store = getStore();
    return store.renewals.find((r) => r.id === id) || null;
  }

  async findByPolicyId(policyId: string): Promise<Renewal | null> {
    const store = getStore();
    return store.renewals.find((r) => r.policy_id === policyId) || null;
  }

  async create(data: Partial<Renewal> & { policy_id: string; customer_id: string; scheduled_for: string }): Promise<Renewal> {
    const store = getStore();
    const renewal: Renewal = {
      id: data.id || `demo_ren_${Date.now()}`,
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

  async updateStatus(id: string, status: Renewal["status"], renewedAt?: string): Promise<Renewal> {
    const store = getStore();
    const renewal = store.renewals.find((r) => r.id === id);
    if (!renewal) {
      throw new Error(`Renewal not found: ${id}`);
    }
    renewal.status = status;
    if (renewedAt) renewal.renewed_at = renewedAt;
    renewal.updated_at = new Date().toISOString();
    return renewal;
  }

  async updatePaymentStatus(id: string, paymentStatus: Renewal["payment_status"]): Promise<Renewal> {
    const store = getStore();
    const renewal = store.renewals.find((r) => r.id === id);
    if (!renewal) {
      throw new Error(`Renewal not found: ${id}`);
    }
    renewal.payment_status = paymentStatus;
    renewal.updated_at = new Date().toISOString();
    return renewal;
  }
}

export class DemoActionSessionRepository implements IActionSessionRepository {
  async findById(id: string): Promise<ActionSession | null> {
    const store = getStore();
    return store.sessions.find((s) => s.id === id) || null;
  }

  async create(data: Partial<ActionSession> & { organization_id: string; channel: ActionSession["channel"] }): Promise<ActionSession> {
    const store = getStore();
    const session: ActionSession = {
      id: data.id || `demo_ses_${Date.now()}`,
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

  async updateStatus(id: string, status: ActionSession["status"], completedAt?: string): Promise<ActionSession> {
    const store = getStore();
    const session = store.sessions.find((s) => s.id === id);
    if (!session) {
      throw new Error(`Action session not found: ${id}`);
    }
    session.status = status;
    if (completedAt) session.completed_at = completedAt;
    return session;
  }

  async updateMetadata(id: string, metadata: Record<string, unknown>): Promise<ActionSession> {
    const store = getStore();
    const session = store.sessions.find((s) => s.id === id);
    if (!session) {
      throw new Error(`Action session not found: ${id}`);
    }
    session.metadata = { ...session.metadata, ...metadata };
    return session;
  }
}

export class DemoActionPlanRepository implements IActionPlanRepository {
  async create(data: Partial<ActionPlan> & { session_id: string; intent: string; goal: string }): Promise<ActionPlan> {
    const store = getStore();
    const plan: ActionPlan = {
      id: data.id || `demo_plan_${Date.now()}`,
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

  async findBySessionId(sessionId: string): Promise<ActionPlan | null> {
    const store = getStore();
    return store.plans.find((p) => p.session_id === sessionId) || null;
  }

  async updateStatus(id: string, status: ActionPlan["status"]): Promise<ActionPlan> {
    const store = getStore();
    const plan = store.plans.find((p) => p.id === id);
    if (!plan) {
      throw new Error(`Action plan not found: ${id}`);
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
    stepsData: Array<Partial<ActionStep> & { action_plan_id: string; sequence: number; action_type: string; description: string; tool_name: string }>
  ): Promise<ActionStep[]> {
    const store = getStore();
    const created: ActionStep[] = stepsData.map((s) => ({
      id: s.id || `demo_step_${Date.now()}_${s.sequence}`,
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

  async findByPlanId(planId: string): Promise<ActionStep[]> {
    const store = getStore();
    return store.steps.filter((s) => s.action_plan_id === planId);
  }

  async updateStep(id: string, update: Partial<ActionStep>): Promise<ActionStep> {
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
  async create(data: Partial<Transaction> & { customer_id: string; amount: number; reference: string }): Promise<Transaction> {
    const store = getStore();
    const tx: Transaction = {
      id: data.id || `demo_tx_${Date.now()}`,
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

  async findByReference(reference: string): Promise<Transaction | null> {
    const store = getStore();
    return store.transactions.find((t) => t.reference === reference) || null;
  }

  async updateStatus(id: string, status: Transaction["status"]): Promise<Transaction> {
    const store = getStore();
    const tx = store.transactions.find((t) => t.id === id || t.reference === id);
    if (!tx) {
      throw new Error(`Transaction not found: ${id}`);
    }
    tx.status = status;
    tx.updated_at = new Date().toISOString();
    return tx;
  }
}

export class DemoDocumentRepository implements IDocumentRepository {
  async create(data: Partial<Document> & { customer_id: string; document_type: Document["document_type"]; file_path: string; file_name: string }): Promise<Document> {
    const store = getStore();
    const doc: Document = {
      id: data.id || `demo_doc_${Date.now()}`,
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

  async findByCustomerId(customerId: string): Promise<Document[]> {
    const store = getStore();
    return store.documents.filter((d) => d.customer_id === customerId);
  }

  async findByRenewalId(renewalId: string): Promise<Document[]> {
    const store = getStore();
    return store.documents.filter((d) => d.renewal_id === renewalId);
  }
}

export class DemoNotificationRepository implements INotificationRepository {
  async create(data: Partial<NotificationRecord> & { customer_id: string; type: NotificationRecord["type"]; channel: NotificationRecord["channel"]; title: string; message: string; scheduled_for: string }): Promise<NotificationRecord> {
    const store = getStore();
    const notif: NotificationRecord = {
      id: data.id || `demo_notif_${Date.now()}`,
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

  async findByCustomerId(customerId: string): Promise<NotificationRecord[]> {
    const store = getStore();
    return store.notifications.filter((n) => n.customer_id === customerId);
  }
}

export class DemoAuditRepository implements IAuditRepository {
  async log(data: Partial<AuditLog> & { organization_id: string; action: string; resource_type: string }): Promise<AuditLog> {
    const store = getStore();
    const entry: AuditLog = {
      id: data.id || `demo_aud_${Date.now()}`,
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
  async appendEvent(event: ActionLedgerEvent): Promise<ActionLedgerEvent> {
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

  async getEventsBySessionId(sessionId: string): Promise<ActionLedgerEvent[]> {
    const store = getStore();
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
