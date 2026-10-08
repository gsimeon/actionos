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

export interface ICustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findByNumber(customerNumber: string): Promise<Customer | null>;
  findByOrganization(orgId: string): Promise<Customer[]>;
  create(data: Partial<Customer> & { customer_number: string; full_name: string; phone: string; email: string; organization_id: string }): Promise<Customer>;
}

export interface IPolicyRepository {
  findById(id: string): Promise<Policy | null>;
  findByNumber(policyNumber: string): Promise<Policy | null>;
  findByCustomerId(customerId: string): Promise<Policy[]>;
  updateStatusAndExpiry(id: string, status: Policy["status"], newExpiryDate: string): Promise<Policy>;
}

export interface IRenewalRepository {
  findById(id: string): Promise<Renewal | null>;
  findByPolicyId(policyId: string): Promise<Renewal | null>;
  create(data: Partial<Renewal> & { policy_id: string; customer_id: string; scheduled_for: string }): Promise<Renewal>;
  updateStatus(id: string, status: Renewal["status"], renewedAt?: string): Promise<Renewal>;
  updatePaymentStatus(id: string, paymentStatus: Renewal["payment_status"]): Promise<Renewal>;
}

export interface IActionSessionRepository {
  findById(id: string): Promise<ActionSession | null>;
  create(data: Partial<ActionSession> & { organization_id: string; channel: ActionSession["channel"] }): Promise<ActionSession>;
  updateStatus(id: string, status: ActionSession["status"], completedAt?: string): Promise<ActionSession>;
  updateMetadata(id: string, metadata: Record<string, unknown>): Promise<ActionSession>;
}

export interface IActionPlanRepository {
  create(data: Partial<ActionPlan> & { session_id: string; intent: string; goal: string }): Promise<ActionPlan>;
  findBySessionId(sessionId: string): Promise<ActionPlan | null>;
  updateStatus(id: string, status: ActionPlan["status"]): Promise<ActionPlan>;
}

export interface IActionStepRepository {
  createMany(steps: Array<Partial<ActionStep> & { action_plan_id: string; sequence: number; action_type: string; description: string; tool_name: string }>): Promise<ActionStep[]>;
  findByPlanId(planId: string): Promise<ActionStep[]>;
  updateStep(id: string, update: Partial<ActionStep>): Promise<ActionStep>;
}

export interface ITransactionRepository {
  create(data: Partial<Transaction> & { customer_id: string; amount: number; reference: string }): Promise<Transaction>;
  findByReference(reference: string): Promise<Transaction | null>;
  updateStatus(id: string, status: Transaction["status"]): Promise<Transaction>;
}

export interface IDocumentRepository {
  create(data: Partial<Document> & { customer_id: string; document_type: Document["document_type"]; file_path: string; file_name: string }): Promise<Document>;
  findByCustomerId(customerId: string): Promise<Document[]>;
  findByRenewalId(renewalId: string): Promise<Document[]>;
}

export interface INotificationRepository {
  create(data: Partial<NotificationRecord> & { customer_id: string; type: NotificationRecord["type"]; channel: NotificationRecord["channel"]; title: string; message: string; scheduled_for: string }): Promise<NotificationRecord>;
  findByCustomerId(customerId: string): Promise<NotificationRecord[]>;
}

export interface IAuditRepository {
  log(data: Partial<AuditLog> & { organization_id: string; action: string; resource_type: string }): Promise<AuditLog>;
}

export interface ILedgerRepository {
  appendEvent(event: ActionLedgerEvent): Promise<ActionLedgerEvent>;
  getEventsBySessionId(sessionId: string): Promise<ActionLedgerEvent[]>;
}

export interface RepositoryContainer {
  readonly isDemo: boolean;
  customers: ICustomerRepository;
  policies: IPolicyRepository;
  renewals: IRenewalRepository;
  sessions: IActionSessionRepository;
  plans: IActionPlanRepository;
  steps: IActionStepRepository;
  transactions: ITransactionRepository;
  documents: IDocumentRepository;
  notifications: INotificationRepository;
  audit: IAuditRepository;
  ledger: ILedgerRepository;
}
