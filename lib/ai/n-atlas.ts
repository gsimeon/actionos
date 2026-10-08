import type { NAtlasProvider, NAtlasUnderstanding } from "@/types/actionos";

export class DeterministicDemoAIProvider implements NAtlasProvider {
  public readonly name = "Demo AI Adapter";

  async understand(input: {
    text?: string;
    audioUrl?: string;
    language: string;
  }): Promise<NAtlasUnderstanding> {
    const raw = (input.text || "").toLowerCase().trim();
    const lang = (input.language || "en-NG").toLowerCase();

    // Entity extraction patterns
    let extractedPlate: string | undefined;
    let extractedPolicy: string | undefined;

    // Plate match: ABC-123-XY or ABC 123 XY or ABC123XY
    const plateMatch = raw.match(/([a-z]{3}[-\s]?[0-9]{3}[-\s]?[a-z]{2})/i);
    if (plateMatch) {
      extractedPlate = plateMatch[1].replace(/\s+/g, "-").toUpperCase();
    }

    // Policy match: AUTO-2026-00182 or AUTO202600182
    const policyMatch = raw.match(/(auto[-\s]?[0-9]{4}[-\s]?[0-9]{5})/i);
    if (policyMatch) {
      extractedPolicy = policyMatch[1].replace(/\s+/g, "-").toUpperCase();
    }

    // Multilingual & Pidgin Intent Detection
    const isRenew =
      raw.includes("renew") ||
      raw.includes("re-new") ||
      raw.includes("expire") ||
      raw.includes("wan expire") ||
      raw.includes("atunto") || // Yoruba
      raw.includes("sabunta") || // Hausa
      raw.includes("dị ọhụrụ") || // Igbo
      raw.includes("di ohuru");

    const isQuote =
      raw.includes("how much") ||
      raw.includes("quote") ||
      raw.includes("price") ||
      raw.includes("cost") ||
      raw.includes("eloo") || // Yoruba
      raw.includes("nawa");

    const isCheck =
      raw.includes("check") ||
      raw.includes("status") ||
      raw.includes("view") ||
      raw.includes("duba") || // Hausa
      raw.includes("lelee"); // Igbo

    const isCert =
      raw.includes("certificate") ||
      raw.includes("document") ||
      raw.includes("paper") ||
      raw.includes("takarda"); // Hausa

    const isPayment =
      raw.includes("pay") ||
      raw.includes("paid") ||
      raw.includes("transfer") ||
      raw.includes("kudi"); // Hausa

    let intent = "unknown";
    let confidence = 0.5;

    if (isRenew) {
      intent = "renew_policy";
      confidence = 0.98;
    } else if (isQuote) {
      intent = "get_quote";
      confidence = 0.95;
    } else if (isCert) {
      intent = "generate_certificate";
      confidence = 0.94;
    } else if (isPayment) {
      intent = "make_payment";
      confidence = 0.93;
    } else if (isCheck) {
      intent = "check_policy";
      confidence = 0.92;
    } else if (raw.includes("cancel") || raw.includes("stop")) {
      intent = "cancel_action";
      confidence = 0.96;
    }

    // Build human-readable normalized text preserving Nigerian context
    let normalized = input.text || "Voice audio input received";
    if (lang.includes("pcm") || raw.includes("wan") || raw.includes("sharp sharp")) {
      normalized = `[Nigerian Pidgin] ${normalized}`;
    } else if (lang.includes("yo") || raw.includes("atunto")) {
      normalized = `[Yoruba] ${normalized}`;
    } else if (lang.includes("ha") || raw.includes("sabunta")) {
      normalized = `[Hausa] ${normalized}`;
    } else if (lang.includes("ig") || raw.includes("di ohuru")) {
      normalized = `[Igbo] ${normalized}`;
    }

    return {
      intent,
      confidence,
      entities: {
        vehiclePlate: extractedPlate || "ABC-123-XY",
        policyNumber: extractedPolicy || "AUTO-2026-00182",
        detectedLanguage: input.language,
        urgency: raw.includes("quick") || raw.includes("sharp") ? "high" : "normal",
      },
      normalizedText: normalized,
    };
  }
}

export class ProductionNAtlasProvider implements NAtlasProvider {
  public readonly name = "N-ATLAS";

  constructor(
    private apiUrl: string,
    private apiKey: string
  ) {}

  async understand(input: {
    text?: string;
    audioUrl?: string;
    language: string;
  }): Promise<NAtlasUnderstanding> {
    try {
      const response = await fetch(`${this.apiUrl}/v1/understand`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error(`N-ATLAS API returned HTTP ${response.status}`);
      }

      const data = await response.json();
      return {
        intent: data.intent || "unknown",
        confidence: data.confidence ?? 0.9,
        entities: data.entities || {},
        normalizedText: data.normalizedText || input.text || "",
      };
    } catch {
      // Graceful fallback to deterministic engine on network failure
      const fallback = new DeterministicDemoAIProvider();
      return await fallback.understand(input);
    }
  }
}

/**
 * Factory creating either official N-ATLAS provider or deterministic demo provider.
 */
export function createNAtlasProvider(): NAtlasProvider {
  const apiUrl = process.env.N_ATLAS_API_URL;
  const apiKey = process.env.N_ATLAS_API_KEY;

  if (apiUrl && apiKey && process.env.DEMO_MODE !== "true") {
    return new ProductionNAtlasProvider(apiUrl, apiKey);
  }

  return new DeterministicDemoAIProvider();
}
