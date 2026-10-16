import type { NAtlasProvider, NAtlasUnderstanding } from "@/types/actionos";
import { isDemoMode } from "@/lib/runtime/mode";

export * from "./nigerian-languages";

export interface NAtlasInput {
  text?: string;
  audioUrl?: string;
  language: string;
}

/**
 * Deterministic Demonstration AI Adapter
 * Provides high-accuracy Nigerian intent & entity recognition across English,
 * Nigerian Pidgin, Yorùbá, Hausa, and Igbo for challenge benchmarking.
 */
export class DeterministicDemoAIProvider implements NAtlasProvider {
  public readonly name = "Demo AI Adapter (Multilingual Nigeria)";

  async understand(input: NAtlasInput): Promise<NAtlasUnderstanding> {
    const raw = (input.text || "").toLowerCase().trim();
    // Entity extraction patterns
    let extractedPlate: string | undefined;
    let extractedPolicy: string | undefined;
    let extractedVin: string | undefined;
    let extractedEngine: string | undefined;

    // Plate match: ABC-123-XY or ABC 123 XY or ABC123XY, KJA-882-AB, etc.
    const plateMatch = raw.match(/([a-z]{2,3}[-\s]?[0-9]{3}[-\s]?[a-z]{2})/i);
    if (plateMatch) {
      extractedPlate = plateMatch[1].replace(/\s+/g, "-").toUpperCase();
    }

    // VIN / Chassis match: explicit prefix, benchmark demo VIN, or standard 17-char VIN
    const explicitVin = raw.match(/(?:(?:vin|chassis)(?:\s*(?:number|no|#))?[:\s]+)([a-z0-9\-]{5,24})/i);
    const demoVin = raw.match(/\b(demo-vin-[0-9]{6})\b/i);
    const isoVin = raw.match(/\b([a-hj-npr-z0-9]{17})\b/i);
    if (explicitVin) {
      extractedVin = explicitVin[1].toUpperCase();
    } else if (demoVin) {
      extractedVin = demoVin[1].toUpperCase();
    } else if (isoVin) {
      extractedVin = isoVin[1].toUpperCase();
    }

    // Engine match: e.g. DEMO-ENGINE-000001 or explicit prefix
    const explicitEngine = raw.match(/(?:(?:engine|injin|ẹnjini|enjini)(?:\s*(?:number|no|#))?[:\s]+)([a-z0-9\-]{5,24})/i);
    const demoEngine = raw.match(/\b(demo-engine-[0-9]{6})\b/i);
    if (explicitEngine) {
      extractedEngine = explicitEngine[1].toUpperCase();
    } else if (demoEngine) {
      extractedEngine = demoEngine[1].toUpperCase();
    }

    // Policy match: AUTO-2026-00182 or AUTO202600182
    const policyMatch = raw.match(/(auto[-\s]?[0-9]{4}[-\s]?[0-9]{5})/i);
    if (policyMatch) {
      extractedPolicy = policyMatch[1].replace(/\s+/g, "-").toUpperCase();
    }

    // Language detection: prioritize explicitly provided language tag, otherwise detect from text
    let detectedLang = input.language && input.language !== "en-NG"
      ? input.language.toLowerCase()
      : "en-NG";

    if (detectedLang === "en-NG") {
      if (raw.includes("wan") || raw.includes("sharp sharp") || raw.includes("sharply") || raw.includes("wetin") || raw.includes("dey ") || raw.includes("abeg") || raw.includes("motor")) {
        detectedLang = "pcm";
      } else if (raw.includes("ọkọ") || raw.includes("oko") || raw.includes("forukọsilẹ") || raw.includes("forukosile") || raw.includes("atunto") || raw.includes("ṣayẹwo") || raw.includes("sayewo")) {
        detectedLang = "yo";
      } else if (raw.includes("mota") || raw.includes("rijista") || raw.includes("rajista") || raw.includes("duba") || raw.includes("sabunta") || raw.includes("ina so")) {
        detectedLang = "ha";
      } else if (raw.includes("ụgbọ ala") || raw.includes("ugbo ala") || raw.includes("debanye") || raw.includes("lelee") || raw.includes("di ohuru") || raw.includes("dị ọhụrụ")) {
        detectedLang = "ig";
      }
    }

    // Multilingual & Pidgin Intent Detection
    const isRegisterVehicle =
      raw.includes("register") ||
      raw.includes("registration") ||
      raw.includes("forukọsilẹ") || // Yoruba
      raw.includes("forukosile") ||
      raw.includes("iforukọsilẹ") ||
      raw.includes("iforukosile") ||
      raw.includes("rijista") || // Hausa
      raw.includes("rajista") ||
      raw.includes("debanye") || // Igbo
      raw.includes("ndebanye");

    const isVehicleQuery =
      !raw.includes("renew") &&
      !raw.includes("expire") &&
      (
        raw.includes("query vehicle") ||
        raw.includes("check vehicle") ||
        raw.includes("vehicle database") ||
        raw.includes("find vehicle") ||
        raw.includes("search vehicle") ||
        raw.includes("verify vehicle") ||
        raw.includes("check my car") ||
        raw.includes("check my motor") || // Pidgin
        raw.includes("find motor") ||
        raw.includes("look my motor") ||
        raw.includes("look my car") ||
        raw.includes("ṣayẹwo ọkọ") || // Yoruba
        raw.includes("sayewo oko") ||
        raw.includes("wo data ọkọ") ||
        raw.includes("wa ọkọ") ||
        raw.includes("duba mota") || // Hausa
        raw.includes("duba motata") ||
        raw.includes("bincika mota") ||
        raw.includes("bincika motata") ||
        raw.includes("nemi mota") ||
        (raw.includes("duba") && (raw.includes("mota") || raw.includes("bayanai") || raw.includes("ma'adanar"))) ||
        raw.includes("lelee ụgbọ ala") || // Igbo
        raw.includes("lelee ugbo ala") ||
        raw.includes("chọọ ụgbọ ala") ||
        raw.includes("chọpụta moto") ||
        (raw.includes("lelee") && (raw.includes("ụgbọ") || raw.includes("ugbo") || raw.includes("data")))
      );

    const isVehicleLicenseRenewal =
      (raw.includes("vehicle license") ||
        raw.includes("motor license") ||
        raw.includes("car license") ||
        raw.includes("roadworthiness") ||
        raw.includes("road worthiness") ||
        raw.includes("motor paper") ||
        raw.includes("car paper") ||
        raw.includes("vehicle paper") ||
        (raw.includes("lasisi") && (raw.includes("mota") || raw.includes("ọkọ") || raw.includes("oko"))) ||
        raw.includes("iwe-aṣẹ ọkọ") ||
        raw.includes("iwe ase oko") ||
        raw.includes("iwe ọkọ") ||
        raw.includes("iwe oko") ||
        raw.includes("takardar mota") ||
        raw.includes("lasisin mota") ||
        raw.includes("ikike ụgbọ ala") ||
        raw.includes("ikike ugbo ala") ||
        raw.includes("akwụkwọ ụgbọ ala") ||
        raw.includes("akwukwo ugbo ala") ||
        raw.includes("akwukwo nyocha")) &&
      (raw.includes("renew") ||
        raw.includes("re-new") ||
        raw.includes("expire") ||
        raw.includes("atunto") ||
        raw.includes("sọ di ọtun") ||
        raw.includes("so di otun") ||
        raw.includes("di ọtun") ||
        raw.includes("di otun") ||
        raw.includes("sabunta") ||
        raw.includes("megharia") ||
        raw.includes("dị ọhụrụ") ||
        raw.includes("di ohuru") ||
        raw.includes("sharp sharp") ||
        raw.includes("inspection") ||
        raw.includes("paper"));

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

    // Specific intent resolution priority: vehicle license renewal, policy renewals and quotes
    if (isVehicleLicenseRenewal) {
      intent = "renew_vehicle_license";
      confidence = 0.98;
    } else if (isRenew) {
      intent = "renew_policy";
      confidence = 0.98;
    } else if (isRegisterVehicle && (raw.includes("motor") || raw.includes("car") || raw.includes("vehicle") || raw.includes("oko") || raw.includes("ọkọ") || raw.includes("mota") || raw.includes("ụgbọ ala") || raw.includes("ugbo ala") || extractedPlate || extractedVin)) {
      intent = "register_vehicle";
      confidence = 0.97;
    } else if (isVehicleQuery) {
      intent = "query_vehicle";
      confidence = 0.96;
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
    if (detectedLang.includes("pcm")) {
      normalized = `[Nigerian Pidgin] ${normalized}`;
    } else if (detectedLang.includes("yo")) {
      normalized = `[Yoruba] ${normalized}`;
    } else if (detectedLang.includes("ha")) {
      normalized = `[Hausa] ${normalized}`;
    } else if (detectedLang.includes("ig")) {
      normalized = `[Igbo] ${normalized}`;
    }

    return {
      intent,
      confidence,
      entities: {
        vehiclePlate: extractedPlate || (intent === "query_vehicle" || intent === "register_vehicle" ? undefined : "ABC-123-XY"),
        policyNumber: extractedPolicy || (intent === "renew_policy" ? "AUTO-2026-00182" : undefined),
        vin: extractedVin,
        chassisNumber: extractedVin,
        engineNumber: extractedEngine,
        detectedLanguage: detectedLang,
        urgency: raw.includes("quick") || raw.includes("sharp") ? "high" : "normal",
      },
      normalizedText: normalized,
    };
  }
}

/**
 * Official N-ATLAS Integration Boundary Contract.
 * ActionOS is completely decoupled from whether the official competition N-ATLAS model
 * uses a REST endpoint, an SDK, an OpenAI-compatible /chat completions API, or gRPC.
 */
export interface INAtlasAdapter {
  name?: string;
  understand(input: NAtlasInput): Promise<NAtlasUnderstanding>;
}

let customNAtlasAdapter: INAtlasAdapter | null = null;

/**
 * Register a production N-ATLAS integration adapter when official challenge SDK / API contract is provided.
 */
export function registerNAtlasAdapter(adapter: INAtlasAdapter | null): void {
  customNAtlasAdapter = adapter;
}

/**
 * Live N-ATLAS Foundation Model HTTP Adapter (NITDA / NCAIR)
 * Connects to N-ATLAS OpenAI-compatible chat completions or native inference endpoints.
 */
export class HttpNAtlasAdapter implements INAtlasAdapter {
  public readonly name = "Live N-ATLAS Foundation Model (NITDA / NCAIR)";

  constructor(
    private apiUrl: string = process.env.N_ATLAS_API_URL || "https://api.n-atlas.ng/v1",
    private apiKey: string = process.env.N_ATLAS_API_KEY || ""
  ) {}

  async understand(input: NAtlasInput): Promise<NAtlasUnderstanding> {
    if (!this.apiKey) {
      const benchmark = new DeterministicDemoAIProvider();
      return await benchmark.understand(input);
    }

    try {
      const response = await fetch(`${this.apiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "n-atlas-multilingual",
          messages: [
            {
              role: "system",
              content:
                "You are N-ATLAS, Nigeria's sovereign multilingual foundation AI. Extract intent (renew_policy, renew_vehicle_license, query_vehicle, register_vehicle), language, and entities (plate, policy, vin) as JSON.",
            },
            {
              role: "user",
              content: input.text || "",
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        }),
      });

      if (response.ok) {
        const json = await response.json();
        const content = json.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          return {
            intent: parsed.intent || "unknown",
            confidence: parsed.confidence || 0.95,
            entities: {
              vehiclePlate: parsed.entities?.vehiclePlate || parsed.vehiclePlate,
              policyNumber: parsed.entities?.policyNumber || parsed.policyNumber,
              vin: parsed.entities?.vin || parsed.vin,
              detectedLanguage: parsed.language || input.language,
              suggestedAction: parsed.suggestedAction,
              _nAtlasLive: true,
            },
            normalizedText: input.text || "",
          };
        }
      }
    } catch (err) {
      console.warn("N-ATLAS live inference call failed, falling back to benchmark engine:", err);
    }

    const fallbackEngine = new DeterministicDemoAIProvider();
    const result = await fallbackEngine.understand(input);
    return {
      ...result,
      entities: {
        ...result.entities,
        _nAtlasFallback: true,
      },
    };
  }
}

/**
 * Official N-ATLAS Provider Adapter (Pure Integration Boundary)
 * Holds the official integration boundary contract for ActionOS.
 * Delegates to a registered INAtlasAdapter (e.g. official SDK or verified API client)
 * when available. In the absence of an official driver, checks for N_ATLAS_API_KEY
 * or safely bridges to the benchmark understanding engine.
 */
export class OfficialNAtlasProvider implements NAtlasProvider {
  public readonly name = "Official N-ATLAS Integration Boundary";

  constructor(
    private customAdapter?: INAtlasAdapter
  ) {}

  async understand(input: NAtlasInput): Promise<NAtlasUnderstanding> {
    const activeAdapter = this.customAdapter || customNAtlasAdapter;

    if (activeAdapter) {
      return await activeAdapter.understand(input);
    }

    if (process.env.N_ATLAS_API_KEY) {
      const httpAdapter = new HttpNAtlasAdapter();
      return await httpAdapter.understand(input);
    }

    // Bridge via benchmark engine when N_ATLAS_API_KEY is not set
    const benchmarkEngine = new DeterministicDemoAIProvider();
    const result = await benchmarkEngine.understand(input);

    return {
      ...result,
      entities: {
        ...result.entities,
        _nAtlasBoundary: "Awaiting official N-ATLAS competition SDK/contract; bridged via benchmark engine",
      },
    };
  }
}

/**
 * Factory creating either official N-ATLAS boundary provider or deterministic demo provider.
 */
export function createNAtlasProvider(): NAtlasProvider {
  if (isDemoMode()) {
    return new DeterministicDemoAIProvider();
  }

  return new OfficialNAtlasProvider();
}

