import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { frscGateway, FrscGatewayError } from "@/lib/integrations/frsc";
import { lacvisGateway, LacvisGatewayError } from "@/lib/integrations/lacvis";
import { niidGateway, NiidGatewayError } from "@/lib/integrations/niid";
import { POST as paymentWebhookHandler } from "@/app/api/webhooks/payment/route";
import { resolveExecutionContext, DEMO_CONTEXT } from "@/lib/security/auth-context";
import type { AuthenticatedExecutionContext } from "@/types/actionos";
import { getRepositoryContainer } from "@/lib/repositories";
import { VerifyNiidTool } from "@/lib/actionos/tools/verify-niid";
import { VerifyVehicleInspectionTool } from "@/lib/actionos/tools/verify-vehicle-inspection";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";

export async function POST(req: Request) {
  const start = performance.now();
  try {
    const body = await req.json();
    const action = body.action || body.type;

    if (!action) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_SIMULATOR_ACTION", message: "Action parameter is required." },
        },
        { status: 400 }
      );
    }

    const context: AuthenticatedExecutionContext = await resolveExecutionContext(req).catch(() => DEMO_CONTEXT);

    // 1. FRSC NVIS Gateway Probe
    if (action === "probe_frsc") {
      const plate = (body.plate || "ABC-123-XY").trim();
      const res = await frscGateway.verifyPlate(plate);
      return NextResponse.json({
        success: true,
        action,
        latencyMs: Math.round(performance.now() - start),
        data: res,
      });
    }

    // 2. LACVIS Roadworthiness Inspection Probe
    if (action === "probe_lacvis") {
      const plate = (body.plate || "ABC-123-XY").trim();
      const vin = body.vin || "DEMO-VIN-000001";
      const res = await lacvisGateway.verifyInspection(plate, vin);
      return NextResponse.json({
        success: true,
        action,
        latencyMs: Math.round(performance.now() - start),
        data: res,
      });
    }

    // 3. NIID / NAICOM Portal Probe
    if (action === "probe_niid") {
      const plate = (body.plate || "ABC-123-XY").trim();
      const chassis = body.chassis || "DEMO-VIN-000001";
      const policy = body.policy || undefined;
      const res = await niidGateway.verifyPolicy({
        plateNumber: plate,
        chassisNumber: chassis,
        policyNumber: policy,
      });
      return NextResponse.json({
        success: true,
        action,
        latencyMs: Math.round(performance.now() - start),
        data: res,
      });
    }

    // 4. Multi-Rail Payment Webhook Simulation
    if (action === "simulate_webhook") {
      const provider = (body.provider || "paystack") as "paystack" | "flutterwave";
      const eventType = body.eventType || (provider === "paystack" ? "charge.success" : "charge.completed");
      const reference = body.reference || `sim_tx_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const amount = typeof body.amount === "number" ? body.amount : 87500;
      const isTampered = Boolean(body.isTampered);

      // Pre-seed pending transaction in repository if testing settlement
      const repos = getRepositoryContainer();
      try {
        await repos.transactions.create(
          {
            customer_id: context.customerId || "c0000000-0000-0000-0000-000000000001",
            amount,
            currency: "NGN",
            reference,
            status: "pending",
            provider,
            transaction_type: "renewal_premium",
          },
          context
        );
      } catch {
        // Repo or duplicate reference handled gracefully
      }

      let payload: Record<string, unknown>;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (provider === "paystack") {
        payload = {
          event: eventType,
          data: {
            id: 998800 + Math.floor(Math.random() * 10000),
            reference,
            amount: amount * 100, // Paystack kobo
            currency: "NGN",
            status: eventType.includes("refund") ? "reversed" : "success",
            paid_at: new Date().toISOString(),
            customer: {
              email: "babatunde.adeleke@gmail.com",
            },
          },
        };

        const rawBody = JSON.stringify(payload);
        const secret = process.env.PAYSTACK_SECRET_KEY || "sim_paystack_secret_key";
        const signature = isTampered
          ? "tampered_invalid_signature_hex"
          : crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
        headers["x-paystack-signature"] = signature;
      } else {
        payload = {
          event: eventType,
          data: {
            id: 445566 + Math.floor(Math.random() * 10000),
            tx_ref: reference,
            flw_ref: `FLW-${reference}`,
            amount,
            currency: "NGN",
            status: "successful",
            created_at: new Date().toISOString(),
          },
        };

        const secretHash = process.env.FLUTTERWAVE_SECRET_HASH || "sim_flw_secret_hash";
        headers["verif-hash"] = isTampered ? "tampered_flw_hash" : secretHash;
      }

      const webhookReq = new Request("http://localhost:3000/api/webhooks/payment", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const webhookResponse = await paymentWebhookHandler(webhookReq);
      const responseJson = await webhookResponse.json().catch(() => ({}));

      return NextResponse.json({
        success: webhookResponse.status < 400,
        action,
        status: webhookResponse.status,
        provider,
        eventType,
        reference,
        isTampered,
        latencyMs: Math.round(performance.now() - start),
        rawPayload: payload,
        response: responseJson,
      });
    }

    // 5. 1-Click Competition Scenarios
    if (action === "run_scenario") {
      const scenarioId = body.scenarioId;

      if (scenarioId === "stolen_vehicle") {
        const niidTool = new VerifyNiidTool();
        const wfContext = createWorkflowExecutionContext(context, {
          sessionId: `sim_scen_stolen_${Date.now()}`,
          planId: "plan_sim_stolen",
          channel: "web",
          language: "en-NG",
          isSimulated: true,
        });

        const toolRes = await niidTool.execute({ vehiclePlate: "STOLEN-999-XX" }, wfContext);
        return NextResponse.json({
          success: true,
          action,
          scenarioId,
          title: "Stolen Vehicle Underwriting Rejection",
          description: "FRSC theft database actively flagged STOLEN-999-XX, halting insurance underwriting deterministically.",
          latencyMs: Math.round(performance.now() - start),
          outcome: toolRes.data?.theftFlag ? "HALTED_SAFETY_ALERT" : "UNEXPECTED_PASS",
          details: toolRes.data,
        });
      }

      if (scenarioId === "lacvis_brake_failure") {
        const inspTool = new VerifyVehicleInspectionTool();
        const wfContext = createWorkflowExecutionContext(context, {
          sessionId: `sim_scen_lacvis_${Date.now()}`,
          planId: "plan_sim_lacvis",
          channel: "web",
          language: "en-NG",
          isSimulated: true,
        });

        const toolRes = await inspTool.execute({ vehiclePlate: "FAIL-123-XX" }, wfContext);
        return NextResponse.json({
          success: true,
          action,
          scenarioId,
          title: "LACVIS Computerized Inspection Brake Failure",
          description: "Vehicle FAIL-123-XX failed statutory computerized inspection (brake efficiency 42% < statutory 70% threshold).",
          latencyMs: Math.round(performance.now() - start),
          outcome: toolRes.data?.overallResult === "REQUIRES_RETEST" ? "STATUTORY_DENIAL" : "PASSED",
          details: toolRes.data,
        });
      }

      if (scenarioId === "active_policy_conflict") {
        const niidTool = new VerifyNiidTool();
        const wfContext = createWorkflowExecutionContext(context, {
          sessionId: `sim_scen_active_${Date.now()}`,
          planId: "plan_sim_active",
          channel: "web",
          language: "en-NG",
          isSimulated: true,
        });

        const toolRes = await niidTool.execute({ vehiclePlate: "ACTIVE-999-OK" }, wfContext);
        return NextResponse.json({
          success: true,
          action,
          scenarioId,
          title: "Active Insurance Policy Conflict (Duplicate Prevention)",
          description: "NIID records indicate ACTIVE-999-OK has 240 days of valid coverage remaining; duplicate renewal blocked.",
          latencyMs: Math.round(performance.now() - start),
          outcome: toolRes.data?.activeExistingPolicy ? "DUPLICATE_RENEWAL_PREVENTED" : "CLEARED",
          details: toolRes.data,
        });
      }

      return NextResponse.json(
        {
          success: false,
          error: { code: "UNKNOWN_SCENARIO", message: `Scenario '${scenarioId}' is not recognized.` },
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: { code: "UNSUPPORTED_ACTION", message: `Action '${action}' is not supported.` },
      },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err instanceof FrscGatewayError
        ? err.code
        : err instanceof LacvisGatewayError
        ? err.code
        : err instanceof NiidGatewayError
        ? err.code
        : "SIMULATOR_INTERNAL_ERROR";

    return NextResponse.json(
      {
        success: false,
        error: { code, message },
        latencyMs: Math.round(performance.now() - start),
      },
      { status: 500 }
    );
  }
}
