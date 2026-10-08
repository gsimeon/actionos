import { NextResponse } from "next/server";
import { orchestrator } from "@/lib/actionos/orchestrator";

// WhatsApp Cloud API Webhook Verification (Meta standard)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "actionos_whatsapp_token_2026";

  if (mode === "subscribe" && token === verifyToken) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Invalid verification token" }, { status: 403 });
}

// WhatsApp Incoming Message / Voice / Interactive Button webhook
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Standard WhatsApp webhook payload structure or direct simplified payload
    let sender = "+2348031234567";
    let messageText = "I want to renew my Toyota Camry insurance";
    let isButtonReply = false;
    let buttonPayload = "";

    if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const msg = body.entry[0].changes[0].value.messages[0];
      sender = msg.from || sender;

      if (msg.type === "text") {
        messageText = msg.text?.body || messageText;
      } else if (msg.type === "interactive") {
        isButtonReply = true;
        buttonPayload = msg.interactive?.button_reply?.id || "";
      } else if (msg.type === "audio") {
        messageText = "Voice message: Please renew my car insurance";
      }
    } else if (body.text) {
      // Direct simulator payload
      messageText = body.text;
      sender = body.sender || sender;
      if (body.buttonPayload) {
        isButtonReply = true;
        buttonPayload = body.buttonPayload;
      }
    }

    // If customer clicked [Authorize] on WhatsApp interactive message
    if (isButtonReply && buttonPayload.startsWith("auth_approve_")) {
      const sessionId = buttonPayload.replace("auth_approve_", "");
      const execResult = await orchestrator.authorizeAndExecute(sessionId, true, "customer");

      return NextResponse.json({
        success: true,
        channel: "whatsapp",
        type: "interactive_reply",
        response: {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: sender,
          type: "text",
          text: {
            body: `✅ *Policy Renewed Successfully!*\nYour policy has been renewed to October 14, 2027. Your certified NAICOM certificate has been generated: http://localhost:3000/documents\n\n_ActionOS Trust Core_`,
          },
        },
        result: execResult,
      });
    }

    // Process new incoming workflow via Orchestrator
    const result = await orchestrator.startWorkflow({
      inputText: messageText,
      channel: "whatsapp",
      language: "en-NG",
    });

    if (result.authorizationRequired && result.authorizationDetails) {
      return NextResponse.json({
        success: true,
        channel: "whatsapp",
        sessionId: result.sessionId,
        response: {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: sender,
          type: "interactive",
          interactive: {
            type: "button",
            header: {
              type: "text",
              text: "🛡️ ActionOS Renew Authorization",
            },
            body: {
              text: `${result.message}\n\n*Amount:* ₦${result.amount?.toLocaleString()}\n*Vehicle:* ${result.authorizationDetails.assetName} (${result.authorizationDetails.assetIdentifier})`,
            },
            action: {
              buttons: [
                {
                  type: "reply",
                  reply: {
                    id: `auth_approve_${result.sessionId}`,
                    title: `Authorize ₦${result.amount?.toLocaleString()}`,
                  },
                },
                {
                  type: "reply",
                  reply: {
                    id: `auth_cancel_${result.sessionId}`,
                    title: "Cancel",
                  },
                },
              ],
            },
          },
        },
        workflow: result,
      });
    }

    return NextResponse.json({
      success: true,
      channel: "whatsapp",
      response: {
        messaging_product: "whatsapp",
        to: sender,
        type: "text",
        text: { body: result.message },
      },
      workflow: result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "WhatsApp webhook error" },
      { status: 500 }
    );
  }
}
