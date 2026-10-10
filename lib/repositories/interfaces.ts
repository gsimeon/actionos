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

/**
 * TenantContext enables defense-in-depth tenant boundary enforcement
 * even when queries are executed with elevated service-role credentials.
 */
export interface TenantContext {
  organizationId?: string;
  customerId?: string;
  role?: string;
}

export interface ICustomerRepository {
  findAll(tenant?: TenantContext): Promise<Customer[]>;
  findById(id: string, tenant?: TenantContext): Promise<Customer | null>;
  findByNumber(customerNumber: string, tenant?: TenantContext): Promise<Customer | null>;
  findByOrganization(orgId: string, tenant?: TenantContext): Promise<Customer[]>;
  create(data: Partial<Customer> & { customer_number: string; full_name: string; phone: string; email: string; organization_id: string }, tenant?: TenantContext): Promise<Customer>;
}

export interface IPolicyRepository {
  findAll(options?: { status?: string; tenant?: TenantContext }): Promise<Policy[]>;
  findById(id: string, tenant?: TenantContext): Promise<Policy | null>;
  findByNumber(policyNumber: string, tenant?: TenantContext): Promise<Policy | null>;
  findByCustomerId(customerId: string, tenant?: TenantContext): Promise<Policy[]>;
  create(data: Partial<Policy> & { customer_id: string; provider_id: string; policy_type_id: string; policy_number: string; start_date: string; expiry_date: string; premium: number }, tenant?: TenantContext): Promise<Policy>;
  updateStatusAndExpiry(id: string, status: Policy["status"], newExpiryDate: string, tenant?: TenantContext): Promise<Policy>;
}

export interface IRenewalRepository {
  findAll(options?: { status?: string; tenant?: TenantContext }): Promise<Renewal[]>;
  findById(id: string, tenant?: TenantContext): Promise<Renewal | null>;
  findByPolicyId(policyId: string, tenant?: TenantContext): Promise<Renewal | null>;
  create(data: Partial<Renewal> & { policy_id: string; customer_id: string; scheduled_for: string }, tenant?: TenantContext): Promise<Renewal>;
  updateStatus(id: string, status: Renewal["status"], renewedAt?: string, tenant?: TenantContext): Promise<Renewal>;
  updatePaymentStatus(id: string, paymentStatus: Renewal["payment_status"], tenant?: TenantContext): Promise<Renewal>;
}

export interface IActionSessionRepository {
  findById(id: string, tenant?: TenantContext): Promise<ActionSession | null>;
  create(data: Partial<ActionSession> & { organization_id: string; channel: ActionSession["channel"] }, tenant?: TenantContext): Promise<ActionSession>;
  updateStatus(id: string, status: ActionSession["status"], completedAt?: string, tenant?: TenantContext): Promise<ActionSession>;
  updateMetadata(id: string, metadata: Record<string, unknown>, tenant?: TenantContext): Promise<ActionSession>;
  claimAuthorization(sessionId: string, tenant?: TenantContext): Promise<ActionSession | null>;
  claimAuthorizationAndAcceptQuote(
    sessionId: string,
    quoteId: string,
    tenant?: TenantContext
  ): Promise<{ session: ActionSession; quote: Quote } | null>;
  findPendingReconciliation(
    options?: { organizationId?: string; limit?: number },
    tenant?: TenantContext
  ): Promise<ActionSession[]>;
}

export interface IActionPlanRepository {
  create(data: Partial<ActionPlan> & { session_id: string; intent: string; goal: string }, tenant?: TenantContext): Promise<ActionPlan>;
  findBySessionId(sessionId: string, tenant?: TenantContext): Promise<ActionPlan | null>;
  updateStatus(id: string, status: ActionPlan["status"], tenant?: TenantContext): Promise<ActionPlan>;
}

export interface IActionStepRepository {
  createMany(steps: Array<Partial<ActionStep> & { action_plan_id: string; sequence: number; action_type: string; description: string; tool_name: string }>, tenant?: TenantContext): Promise<ActionStep[]>;
  findByPlanId(planId: string, tenant?: TenantContext): Promise<ActionStep[]>;
  updateStep(id: string, update: Partial<ActionStep>, tenant?: TenantContext): Promise<ActionStep>;
}

export interface ITransactionRepository {
  create(data: Partial<Transaction> & { customer_id: string; amount: number; reference: string }, tenant?: TenantContext): Promise<Transaction>;
  findByReference(reference: string, tenant?: TenantContext): Promise<Transaction | null>;
  updateStatus(
    id: string,
    status: Transaction["status"],
    tenant?: TenantContext,
    extra?: { metadata?: Record<string, unknown> }
  ): Promise<Transaction>;
  settleWithWebhookEvent?(
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
  ): Promise<{ transaction: Transaction; webhookEvent: WebhookEventRecord; isDuplicate?: boolean }>;
}

export interface IDocumentRepository {
  create(data: Partial<Document> & { customer_id: string; document_type: Document["document_type"]; file_path: string; file_name: string }, tenant?: TenantContext): Promise<Document>;
  findByCustomerId(customerId: string, tenant?: TenantContext): Promise<Document[]>;
  findByRenewalId(renewalId: string, tenant?: TenantContext): Promise<Document[]>;
}

export interface INotificationRepository {
  create(data: Partial<NotificationRecord> & { customer_id: string; type: NotificationRecord["type"]; channel: NotificationRecord["channel"]; title: string; message: string; scheduled_for: string }, tenant?: TenantContext): Promise<NotificationRecord>;
  findByCustomerId(customerId: string, tenant?: TenantContext): Promise<NotificationRecord[]>;
}

export interface IAuditRepository {
  log(data: Partial<AuditLog> & { organization_id: string; action: string; resource_type: string }, tenant?: TenantContext): Promise<AuditLog>;
}

export interface ILedgerRepository {
  appendEvent(event: ActionLedgerEvent, tenant?: TenantContext): Promise<ActionLedgerEvent>;
  getEventsBySessionId(sessionId: string, tenant?: TenantContext): Promise<ActionLedgerEvent[]>;
}

export interface IQuoteRepository {
  create(
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
  ): Promise<Quote>;
  findById(id: string, tenant?: TenantContext): Promise<Quote | null>;
  findBySessionId(sessionId: string, tenant?: TenantContext): Promise<Quote[]>;
  updateStatus(id: string, status: Quote["status"], tenant?: TenantContext): Promise<Quote>;
  acceptQuote(id: string, sessionId: string, tenant?: TenantContext): Promise<Quote | null>;
}

export interface WebhookEventRecord {
  id: string;
  provider: string;
  event_id: string;
  event_type: string;
  reference: string;
  status: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface IWebhookEventRepository {
  recordEvent(event: {
    provider: string;
    eventId: string;
    eventType: string;
    reference: string;
    status: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ isDuplicate: boolean; event: WebhookEventRecord }>;
  findByEventId(provider: string, eventId: string): Promise<WebhookEventRecord | null>;
}

export interface RepositoryContainer {
  readonly isDemo: boolean;
  customers: ICustomerRepository;
  policies: IPolicyRepository;
  renewals: IRenewalRepository;
  quotes: IQuoteRepository;
  sessions: IActionSessionRepository;
  plans: IActionPlanRepository;
  steps: IActionStepRepository;
  transactions: ITransactionRepository;
  documents: IDocumentRepository;
  notifications: INotificationRepository;
  audit: IAuditRepository;
  ledger: ILedgerRepository;
  webhookEvents: IWebhookEventRepository;
}
