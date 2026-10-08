import type { WorkflowStepResult, StartWorkflowInput } from "@/lib/actionos/orchestrator";

export interface ActionOSConfig {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class ActionOSClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: ActionOSConfig = {}) {
    this.baseUrl = config.baseUrl || "http://localhost:3000";
    this.apiKey = config.apiKey;
  }

  /**
   * Start a natural language or voice action workflow
   */
  async startAction(input: {
    text: string;
    channel?: StartWorkflowInput["channel"];
    language?: string;
    customerId?: string;
  }): Promise<WorkflowStepResult> {
    const res = await fetch(`${this.baseUrl}/api/actions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        inputText: input.text,
        channel: input.channel || "api",
        language: input.language || "en-NG",
        customerId: input.customerId,
      }),
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "ActionOS execution failed");
    }
    return data.data;
  }

  /**
   * Submit cryptographic user authorization for an in-flight workflow
   */
  async authorize(sessionId: string, approved: boolean): Promise<WorkflowStepResult> {
    const res = await fetch(`${this.baseUrl}/api/actions/${sessionId}/authorize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({ authorized: approved }),
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "Authorization failed");
    }
    return data.data;
  }

  /**
   * Fetch live cryptographic Action Ledger audit stream for a session
   */
  async getLedger(sessionId: string) {
    const res = await fetch(`${this.baseUrl}/api/actions/${sessionId}`);
    const data = await res.json();
    return data.data?.events || [];
  }
}
