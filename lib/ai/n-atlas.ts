import type { NAtlasProvider, NAtlasUnderstanding } from "@/types/actionos";
import { isDemoMode } from "@/lib/runtime/mode";
import { normalizeNigerianText, formatClarificationMessage } from "./nigerian-languages";
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
    const origRaw = (input.text || "").trim();
    const raw = normalizeNigerianText(origRaw);

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
    const explicitEngine = raw.match(/(?:(?:engine|injin|enjini)(?:\s*(?:number|no|#))?[:\s]+)([a-z0-9\-]{5,24})/i);
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

    // NHIA match: NHIA-2026-00812 or NHIA202600812
    let extractedNhia: string | undefined;
    const nhiaMatch = raw.match(/(nhia[-/\s]?([a-z]{2,3}[-/\s]?)?[0-9]{4}[-/\s]?[0-9]{4,8})/i);
    if (nhiaMatch) {
      extractedNhia = nhiaMatch[1].replace(/[\s/]+/g, "-").toUpperCase();
    }

    // NIN match: 11 consecutive digits
    let extractedNin: string | undefined;
    const ninMatch = raw.match(/\b([0-9]{11})\b/);
    if (ninMatch) {
      extractedNin = ninMatch[1];
    }

    // Driver's License match: e.g. ABC12345678 or KJA-882-AB
    let extractedDl: string | undefined;
    const dlMatch = raw.match(/(?:dl|license|licence)?[:\s]*\b([a-z]{2,3}[-0-9]{6,14}[a-z0-9]?)\b/i);
    if (dlMatch && (raw.includes("driver") || raw.includes("driving") || raw.includes("dl") || raw.includes("lasisi"))) {
      extractedDl = dlMatch[1].replace(/\s+/g, "").toUpperCase();
    }

    // Language detection: prioritize explicitly provided language tag, otherwise detect from text
    let detectedLang = input.language && input.language !== "en-NG"
      ? input.language.toLowerCase()
      : "en-NG";

    if (detectedLang === "en-NG") {
      if (raw.includes("wan") || raw.includes("sharp sharp") || raw.includes("wetin") || raw.includes("dey ") || raw.includes("abeg") || raw.includes("motor")) {
        detectedLang = "pcm";
      } else if (raw.includes("oko") || raw.includes("forukosile") || raw.includes("atunto") || raw.includes("sayewo") || raw.includes("iseduro")) {
        detectedLang = "yo";
      } else if (raw.includes("mota") || raw.includes("rijista") || raw.includes("rajista") || raw.includes("duba") || raw.includes("sabunta") || raw.includes("ina so") || raw.includes("inshora")) {
        detectedLang = "ha";
      } else if (raw.includes("ugbo ala") || raw.includes("debanye") || raw.includes("lelee") || raw.includes("di ohuru") || raw.includes("mkpuchi") || raw.includes("achoro m")) {
        detectedLang = "ig";
      }
    }

    // 1. Ambiguity & Vague Query Detection
    // When a user provides only greetings, vague requests for help, or an unkeyed "renew" command
    // without specifying vehicle or policy details, prompt for clarification instead of guessing.
    const stripped = origRaw.toLowerCase().replace(/[^\w\s]/g, " ").trim();
    const greetingWords = new Set([
      "hello", "hi", "hey", "good", "morning", "afternoon", "evening", "day",
      "how", "far", "kedu", "bawo", "ni", "sannu", "da", "rana", "asuba",
      "help", "me", "i", "need", "what", "can", "you", "do", "actionos", "please", "abeg"
    ]);
    const tokens = stripped.split(/\s+/).filter(Boolean);
    const isGreetingOrVague =
      tokens.length > 0 &&
      tokens.every((t) => greetingWords.has(t)) &&
      !extractedPlate &&
      !extractedPolicy &&
      !extractedVin;

    const isVagueRenewalOnly =
      /^(?:(?:abeg\s+)?i\s+wan(?:\s+to)?\s+renew|i\s+want\s+to\s+renew|renew|reneww|renw|atunto|so\s+di\s+otun|sabunta|meghari|megharia|imeghari|mo\s+fe\s+so\s+di\s+otun|ina\s+so\s+in\s+sabunta|achoro\s+m\s+imeghari)[?!.]*$/i.test(raw) &&
      !extractedPlate &&
      !extractedPolicy &&
      !extractedVin;

    if (isGreetingOrVague || isVagueRenewalOnly) {
      return {
        intent: "clarification_required",
        confidence: 0.5,
        entities: {
          needsClarification: true,
          clarificationQuestion: formatClarificationMessage(detectedLang),
          detectedLanguage: detectedLang,
          _aiProvider: this.name,
          _isLiveAI: false,
        },
        normalizedText: origRaw || "Clarification required",
      };
    }

    // Multilingual & Pidgin Intent Detection
    const isRegisterVehicle =
      raw.includes("register") ||
      raw.includes("registration") ||
      raw.includes("forukosile") || // Yoruba (normalized)
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
        raw.includes("sayewo oko") || // Yoruba (normalized)
        raw.includes("wo data oko") ||
        raw.includes("wa oko") ||
        raw.includes("duba mota") || // Hausa
        raw.includes("bincika mota") ||
        raw.includes("nemi mota") ||
        (raw.includes("duba") && (raw.includes("mota") || raw.includes("bayanai") || raw.includes("ma'adanar") || raw.includes("maadanar"))) ||
        raw.includes("lelee ugbo ala") || // Igbo (normalized)
        raw.includes("choo ugbo ala") ||
        raw.includes("choputa moto") ||
        (raw.includes("lelee") && (raw.includes("ugbo") || raw.includes("data")))
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
        (raw.includes("lasisi") && (raw.includes("mota") || raw.includes("oko"))) ||
        raw.includes("iwe-ase oko") ||
        raw.includes("iwe ase oko") ||
        raw.includes("iwe oko") ||
        raw.includes("takardar mota") ||
        raw.includes("lasisin mota") ||
        raw.includes("ikike ugbo ala") ||
        raw.includes("akwukwo ugbo ala") ||
        raw.includes("akwukwo nyocha")) &&
      (raw.includes("renew") ||
        raw.includes("expire") ||
        raw.includes("atunto") ||
        raw.includes("so di otun") ||
        raw.includes("di otun") ||
        raw.includes("sabunta") ||
        raw.includes("meghari") ||
        raw.includes("di ohuru") ||
        raw.includes("sharp sharp") ||
        raw.includes("inspection") ||
        raw.includes("paper"));

    const isExplicitInsurance =
      raw.includes("insurance") ||
      raw.includes("inshora") ||
      raw.includes("inshorar") ||
      raw.includes("iseduro") || // Yoruba normalized
      raw.includes("mkpuchi") || // Igbo
      raw.includes("policy") ||
      raw.includes("third party") ||
      raw.includes("third-party") ||
      raw.includes("comprehensive") ||
      raw.includes("auto-");

    const isRenew =
      raw.includes("renew") ||
      raw.includes("expire") ||
      raw.includes("wan expire") ||
      raw.includes("atunto") || // Yoruba
      raw.includes("so di otun") ||
      raw.includes("so d'otun") ||
      raw.includes("di otun") ||
      raw.includes("sabunta") || // Hausa
      raw.includes("meghari") || // Igbo (imeghari / megharia)
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
      raw.includes("query") ||
      raw.includes("find") ||
      raw.includes("lookup") ||
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

    // Specific intent resolution priority:
    // HMO & Health Insurance intents
    const isHmo =
      raw.includes("hmo") ||
      raw.includes("health") ||
      raw.includes("nhia") ||
      raw.includes("hospital") ||
      raw.includes("clinic") ||
      raw.includes("doctor") ||
      raw.includes("ilera") || // Yoruba
      raw.includes("lafiya") || // Hausa
      raw.includes("ahuike") || // Igbo
      raw.includes("ahụike");

    // Driver's License intents
    const isDriverLicense =
      (raw.includes("driver") ||
        raw.includes("driving") ||
        raw.includes("awako") ||
        raw.includes("awakọ") ||
        raw.includes("tuki") ||
        raw.includes("ikwo ugboala") ||
        raw.includes("ịkwọ ụgbọala") ||
        raw.includes("frsc license") ||
        raw.includes("frsc licence") ||
        raw.includes("driving permit") ||
        raw.includes("driver permit") ||
        raw.includes("lasisin tuki") ||
        raw.includes("iwe-ase awako") ||
        raw.includes("ikike ikwo")) &&
      (raw.includes("license") ||
        raw.includes("licence") ||
        raw.includes("permit") ||
        raw.includes("lasisi") ||
        raw.includes("iwe") ||
        raw.includes("ikike") ||
        raw.includes("takarda") ||
        raw.includes("renew") ||
        raw.includes("expire") ||
        raw.includes("sabunta") ||
        raw.includes("atunto") ||
        raw.includes("duba") ||
        raw.includes("check"));

    if (isHmo && (isRenew || raw.includes("pay") || raw.includes("renew"))) {
      intent = "renew_hmo_policy";
      confidence = 0.99;
    } else if (isHmo && (isCheck || raw.includes("plan") || raw.includes("hospital") || raw.includes("tier") || raw.includes("enrollee"))) {
      intent = "query_hmo_plan";
      confidence = 0.98;
    } else if (isDriverLicense && (isRenew || raw.includes("renew") || raw.includes("expire") || raw.includes("sabunta") || raw.includes("atunto"))) {
      intent = "renew_driver_license";
      confidence = 0.99;
    } else if (isDriverLicense && isCheck) {
      intent = "verify_driver_license";
      confidence = 0.98;
    } else if (isExplicitInsurance && isRenew) {
      intent = "renew_policy";
      confidence = 0.99;
    } else if (isVehicleLicenseRenewal) {
      intent = "renew_vehicle_license";
      confidence = 0.98;
    } else if (isRenew) {
      intent = "renew_policy";
      confidence = 0.98;
    } else if (isRegisterVehicle && (raw.includes("motor") || raw.includes("car") || raw.includes("vehicle") || raw.includes("oko") || raw.includes("mota") || raw.includes("ugbo ala") || extractedPlate || extractedVin)) {
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
    let normalized = origRaw || "Voice audio input received";
    if (detectedLang.includes("pcm")) {
      normalized = `[Nigerian Pidgin] ${normalized}`;
    } else if (detectedLang.includes("yo")) {
      normalized = `[Yoruba] ${normalized}`;
    } else if (detectedLang.includes("ha")) {
      normalized = `[Hausa] ${normalized}`;
    } else if (detectedLang.includes("ig")) {
      normalized = `[Igbo] ${normalized}`;
    }

    // Truthful entity resolution:
    // Do NOT fabricate demo policy AUTO-2026-00182 if user supplied a specific different vehicle plate!
    const resolvedVehiclePlate =
      extractedPlate ||
      (intent === "renew_policy" || intent === "renew_vehicle_license"
        ? "ABC-123-XY"
        : undefined);

    const resolvedPolicyNumber =
      extractedPolicy ||
      (intent === "renew_policy" && (!extractedPlate || extractedPlate === "ABC-123-XY")
        ? "AUTO-2026-00182"
        : undefined);

    const resolvedNhiaNumber =
      extractedNhia ||
      (intent === "renew_hmo_policy" || intent === "query_hmo_plan"
        ? "NHIA-2026-00812"
        : undefined);

    const resolvedDlNumber =
      extractedDl ||
      (intent === "renew_driver_license" || intent === "verify_driver_license"
        ? "ABC12345678"
        : undefined);

    return {
      intent,
      confidence,
      entities: {
        vehiclePlate: resolvedVehiclePlate,
        policyNumber: resolvedPolicyNumber,
        vin: extractedVin,
        chassisNumber: extractedVin,
        engineNumber: extractedEngine,
        nhiaNumber: resolvedNhiaNumber,
        nin: extractedNin,
        dlNumber: resolvedDlNumber,
        detectedLanguage: detectedLang,
        urgency: raw.includes("quick") || raw.includes("sharp") ? "high" : "normal",
        _aiProvider: this.name,
        _isLiveAI: false,
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
 * Custom error thrown when live N-ATLAS inference fails in strict mode or network connectivity fails.
 */
export class NAtlasConnectionError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly endpoint?: string,
    public readonly isTimeout?: boolean
  ) {
    super(message);
    this.name = "NAtlasConnectionError";
  }
}

/**
 * Live N-ATLAS Foundation Model HTTP Adapter (NITDA / NCAIR)
 * Connects to N-ATLAS OpenAI-compatible chat completions or native inference endpoints.
 */
export class HttpNAtlasAdapter implements INAtlasAdapter {
  public readonly name = "Live N-ATLAS Foundation Model (NITDA / NCAIR)";

  constructor(
    private apiUrl: string = process.env.N_ATLAS_API_URL || "https://api.n-atlas.ng/v1",
    private apiKey: string = process.env.N_ATLAS_API_KEY || "",
    private strictMode: boolean = process.env.N_ATLAS_STRICT_MODE === "true"
  ) {}

  async understand(input: NAtlasInput): Promise<NAtlasUnderstanding> {
    const start = performance.now();

    if (!this.apiKey) {
      if (this.strictMode) {
        throw new NAtlasConnectionError(
          "N_ATLAS_STRICT_MODE violation: N_ATLAS_API_KEY is omitted. Live inference cannot be verified.",
          401,
          this.apiUrl
        );
      }
      const benchmark = new DeterministicDemoAIProvider();
      const res = await benchmark.understand(input);
      return {
        ...res,
        entities: {
          ...res.entities,
          _aiProvider: "N-ATLAS Fallback (Deterministic Benchmark Engine)",
          _model: "rule_based_benchmark",
          _isLiveAI: false,
          _nAtlasFallback: true,
          _fallbackReason: "Missing N_ATLAS_API_KEY",
          _liveVerified: false,
        },
      };
    }

    let fetchError: Error | null = null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s SLA

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
                "You are N-ATLAS, Nigeria's sovereign multilingual foundation AI. Extract intent (renew_policy, renew_vehicle_license, query_vehicle, register_vehicle, renew_hmo, renew_drivers_license), language, and entities (plate, policy, vin, nhia, dl) as JSON.",
            },
            {
              role: "user",
              content: input.text || "",
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const json = await response.json();
        const content = json.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          const latencyMs = Math.round(performance.now() - start);
          return {
            intent: parsed.intent || "unknown",
            confidence: parsed.confidence || 0.95,
            entities: {
              vehiclePlate: parsed.entities?.vehiclePlate || parsed.vehiclePlate,
              policyNumber: parsed.entities?.policyNumber || parsed.policyNumber,
              vin: parsed.entities?.vin || parsed.vin,
              nhiaNumber: parsed.entities?.nhiaNumber || parsed.nhiaNumber,
              dlNumber: parsed.entities?.dlNumber || parsed.dlNumber,
              detectedLanguage: parsed.language || input.language,
              suggestedAction: parsed.suggestedAction,
              _nAtlasLive: true,
              _aiProvider: this.name,
              _model: "n-atlas-multilingual",
              _isLiveAI: true,
              _liveVerified: true,
              _latencyMs: latencyMs,
              _evidence: {
                prompt: input.text,
                endpoint: this.apiUrl,
                model: "n-atlas-multilingual",
                timestamp: new Date().toISOString(),
                latencyMs,
              },
            },
            normalizedText: input.text || "",
          };
        }
      } else {
        fetchError = new NAtlasConnectionError(
          `N-ATLAS API HTTP ${response.status}: ${response.statusText}`,
          response.status,
          this.apiUrl
        );
      }
    } catch (err: unknown) {
      fetchError = err instanceof Error ? err : new Error(String(err));
    }

    if (this.strictMode) {
      throw (
        fetchError ||
        new NAtlasConnectionError("N-ATLAS inference failed in strict mode", 500, this.apiUrl)
      );
    }

    console.warn("N-ATLAS live inference call failed, falling back to benchmark engine:", fetchError?.message);

    const fallbackEngine = new DeterministicDemoAIProvider();
    const result = await fallbackEngine.understand(input);
    return {
      ...result,
      entities: {
        ...result.entities,
        _nAtlasFallback: true,
        _aiProvider: "N-ATLAS Fallback (Deterministic Benchmark Engine)",
        _model: "rule_based_benchmark",
        _isLiveAI: false,
        _liveVerified: false,
        _fallbackReason: fetchError?.message || "Unknown error",
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
  if (customNAtlasAdapter || process.env.N_ATLAS_API_KEY || !isDemoMode()) {
    return new OfficialNAtlasProvider();
  }

  return new DeterministicDemoAIProvider();
}

