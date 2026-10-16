import type { Asset } from "@/types/database";
import { formatCurrency, formatDate } from "@/lib/utils";

export type SupportedNigerianLanguage = "en-NG" | "pcm" | "yo" | "ha" | "ig";

export interface VehicleMessageContext {
  plate?: string;
  vin?: string;
  makeModel?: string;
  year?: number;
  color?: string;
  engineNumber?: string;
  status?: string;
  ownerName?: string;
  preclearanceToken?: string;
  fee?: number;
  currency?: string;
}

/**
 * Normalizes input language string into one of the 5 canonical Nigerian language codes.
 */
export function normalizeNigerianLanguage(lang?: string): SupportedNigerianLanguage {
  if (!lang) return "en-NG";
  const cleaned = lang.toLowerCase().trim();

  if (cleaned.includes("pcm") || cleaned.includes("pidgin") || cleaned.includes("broken")) {
    return "pcm";
  }
  if (cleaned.startsWith("yo") || cleaned.includes("yoruba") || cleaned.includes("yorùbá")) {
    return "yo";
  }
  if (cleaned.startsWith("ha") || cleaned.includes("hausa")) {
    return "ha";
  }
  if (cleaned.startsWith("ig") || cleaned.includes("igbo") || cleaned.includes("asusu igbo")) {
    return "ig";
  }
  return "en-NG";
}

/**
 * Detect language from natural language text using distinct linguistic markers.
 */
export function detectNigerianLanguageFromText(text: string): SupportedNigerianLanguage {
  const raw = text.toLowerCase();

  // Hausa markers (checked with priority for indigenous language vocabulary)
  if (
    raw.includes("mota") ||
    raw.includes("motata") ||
    raw.includes("duba") ||
    raw.includes("sabunta") ||
    raw.includes("rijista") ||
    raw.includes("rajista") ||
    raw.includes("bincika") ||
    raw.includes("shigar") ||
    raw.includes("ina so") ||
    raw.includes("kudi") ||
    raw.includes("takarda") ||
    raw.includes("inshora") ||
    raw.includes("inshorar") ||
    raw.includes("ma'ajiya") ||
    raw.includes("ma'adanar")
  ) {
    return "ha";
  }

  // Yorùbá markers
  if (
    raw.includes("ọkọ") ||
    raw.includes("oko") ||
    raw.includes("iṣeduro") ||
    raw.includes("iseduro") ||
    raw.includes("sọ di ọtun") ||
    raw.includes("so di otun") ||
    raw.includes("di ọtun") ||
    raw.includes("di otun") ||
    raw.includes("ṣayẹwo") ||
    raw.includes("sayewo") ||
    raw.includes("forukọsilẹ") ||
    raw.includes("forukosile") ||
    raw.includes("atunto") ||
    raw.includes("ẹnjini") ||
    raw.includes("enjini") ||
    raw.includes("ayọkẹlẹ") ||
    raw.includes("ayokele") ||
    raw.includes("mo fẹ") ||
    raw.includes("mo fe") ||
    raw.includes("ba mi") ||
    raw.includes("eloo")
  ) {
    return "yo";
  }

  // Igbo markers
  if (
    raw.includes("ụgbọ ala") ||
    raw.includes("ugbo ala") ||
    raw.includes("mkpuchi") ||
    raw.includes("megharia") ||
    raw.includes("lelee") ||
    raw.includes("debanye") ||
    raw.includes("dị ọhụrụ") ||
    raw.includes("di ohuru") ||
    raw.includes("nyochaa") ||
    raw.includes("chọọ") ||
    raw.includes("chọpụta") ||
    raw.includes("achọrọ m") ||
    raw.includes("achoro m") ||
    raw.includes("moto m")
  ) {
    return "ig";
  }

  // Nigerian Pidgin markers (using word boundaries for short particles)
  if (
    raw.includes("wetin") ||
    raw.includes("sharp sharp") ||
    raw.includes("sharply") ||
    raw.includes("abeg") ||
    raw.includes("motor") ||
    raw.includes("oya") ||
    raw.includes("make we") ||
    raw.includes("no wahala") ||
    /\b(?:dey|wan|fit|na|don)\b/i.test(raw)
  ) {
    return "pcm";
  }

  return "en-NG";
}

/**
 * Generate localized response when a vehicle is successfully found in the database.
 */
export function formatVehicleFoundMessage(
  vehicle: Asset,
  ownerName?: string,
  lang?: string
): string {
  const language = normalizeNigerianLanguage(lang);
  const meta = (vehicle.metadata || {}) as Record<string, unknown>;
  const makeModel = vehicle.name || `${meta.make || ""} ${meta.model || ""}`.trim() || "Vehicle";
  const plate = vehicle.identifier;
  const vin = (meta.chassis_number as string) || (meta.vin as string) || "N/A";
  const engine = (meta.engine_number as string) || "N/A";
  const year = meta.year ? String(meta.year) : "";
  const color = (meta.color as string) || "";
  const owner = ownerName || "verified customer";

  const descParts = [year, color, makeModel].filter(Boolean).join(" ");

  switch (language) {
    case "pcm":
      return `We don see your motor ${descParts} (${plate}) for inside vehicle database! Chassis number: ${vin}, Engine: ${engine}. E dey registered to ${owner}. You fit proceed to check insurance or renew registration sharp sharp.`;

    case "yo":
      return `A ti rí ọkọ rẹ ${descParts} (${plate}) ninu ibi ipamọ data ọkọ! Nọmba chassis: ${vin}, Ẹnjini: ${engine}. O forukọsilẹ labẹ ${owner}. O ti ṣetan fun ayẹwo iṣeduro tabi iforukọsilẹ.`;

    case "ha":
      return `Mun sami motarka ${descParts} (${plate}) a cikin ma'ajiyar bayanan motoci! Lambar chassis: ${vin}, Injin: ${engine}. An yi mata rajista a ƙarƙashin ${owner}. Za ku iya ci gaba da duba inshora ko sabunta rajista.`;

    case "ig":
      return `Anyị ahụla ụgbọ ala gị ${descParts} (${plate}) n'ọdụ data ụgbọ ala! Nọmba chassis: ${vin}, Injin: ${engine}. E debanyere ya n'aha ${owner}. Ị nwere ike gaa n'ihu ịlele inshora ma ọ bụ mee ndebanye aha ọhụrụ.`;

    case "en-NG":
    default:
      return `Vehicle ${descParts} (${plate}) located in vehicle database. VIN/Chassis: ${vin}, Engine: ${engine}. Registered to ${owner}. Ready for verification or insurance renewal.`;
  }
}

/**
 * Generate localized response when a vehicle is NOT found in the database.
 */
export function formatVehicleNotFoundMessage(query: string, lang?: string): string {
  const language = normalizeNigerianLanguage(lang);

  switch (language) {
    case "pcm":
      return `We no see any motor record for "${query}" inside vehicle database. But no wahala, you fit register the motor now make e legit with FRSC and NIID.`;

    case "yo":
      return `A kò rí ọkọ kankan pẹlu alaye "${query}" ninu ibi ipamọ data wa. Ṣugbọn ko si wahala, o le bẹrẹ iforukọsilẹ ọkọ rẹ tuntun nisinsinyi pẹlu FRSC ati NIID.`;

    case "ha":
      return `Ba a sami bayanan mota don "${query}" a cikin ma'adanar bayanan ba. Amma babu damuwa, kuna iya yin sabuwar rijistar motar a yanzu don ta zama halastacciya tare da FRSC da NIID.`;

    case "ig":
      return `Ahụghị akwụkwọ ndekọ ụgbọ ala ọ bụla maka "${query}" n'ọdụ data anyị. Mana enweghị nsogbu, ị nwere ike ịdebanye aha ụgbọ ala ahụ ugbu a ka o wee dị mma na FRSC na NIID.`;

    case "en-NG":
    default:
      return `No existing vehicle record found for "${query}" in vehicle database. You can proceed with new vehicle registration and FRSC/NIID verification.`;
  }
}

/**
 * Generate localized response when a vehicle is registered successfully.
 */
export function formatVehicleRegisteredMessage(
  vehicle: Asset,
  preclearanceToken: string,
  lang?: string
): string {
  const language = normalizeNigerianLanguage(lang);
  const makeModel = vehicle.name || "Vehicle";
  const plate = vehicle.identifier;

  switch (language) {
    case "pcm":
      return `Oya! Vehicle registration don succeed well well for ${makeModel} (${plate})! Your pre-clearance token na ${preclearanceToken}. Motor record don save inside ActionOS database.`;

    case "yo":
      return `Iforukọsilẹ ọkọ ti pari ni aṣeyọri fun ${makeModel} (${plate})! Koodu ijẹrisi rẹ jẹ ${preclearanceToken}. A ti fi data ọkọ pamọ si ActionOS.`;

    case "ha":
      return `An kammala rijistar mota cikin nasara don ${makeModel} (${plate})! Lambar shaidar ku ita ce ${preclearanceToken}. An ajiye bayanan motar a cikin rumbun adana bayanan ActionOS.`;

    case "ig":
      return `Ndebanye aha ụgbọ ala gara nke ọma maka ${makeModel} (${plate})! Koodu nkwado gị bụ ${preclearanceToken}. Echekwala ozi ụgbọ ala gị n'ActionOS.`;

    case "en-NG":
    default:
      return `Vehicle registration completed successfully for ${makeModel} (${plate}). Pre-clearance token: ${preclearanceToken}. Record stored in ActionOS vehicle database.`;
  }
}

/**
 * Generate localized authorization prompt for vehicle registration or statutory fee gate.
 */
export function formatVehicleRegistrationGateMessage(
  params: {
    makeModel: string;
    plate: string;
    amount: number;
    currency?: string;
  },
  lang?: string
): string {
  const language = normalizeNigerianLanguage(lang);
  const formattedAmount = formatCurrency(params.amount, params.currency || "NGN");

  switch (language) {
    case "pcm":
      return `Motor ${params.makeModel} (${params.plate}) don pass NIID & FRSC pre-clearance check. Official registration fee na ${formattedAmount}. You authorize make we complete the registration and issue certificate?`;

    case "yo":
      return `Ọkọ ${params.makeModel} (${params.plate}) ti kọja ayẹwo ijẹrisi NIID & FRSC. Owo iforukọsilẹ osise jẹ ${formattedAmount}. Ṣe o fun wa ni aṣẹ lati pari iforukọsilẹ ati iwe-ẹri rẹ?`;

    case "ha":
      return `Mota ${params.makeModel} (${params.plate}) ta wuce binciken NIID & FRSC. Kuɗin rajista na hukuma shine ${formattedAmount}. Shin kun ba da izini don kammala rajistar da fitar da takardar shaida?`;

    case "ig":
      return `Ụgbọ ala ${params.makeModel} (${params.plate}) agafeela nyocha NIID & FRSC. Ego ndebanye aha bụ ${formattedAmount}. Ị nyere ikike ka anyị mechaa ndebanye aha ma wepụta akwụkwọ ikike?`;

    case "en-NG":
    default:
      return `Vehicle ${params.makeModel} (${params.plate}) passed NIID & FRSC statutory pre-clearance. Official registration fee is ${formattedAmount}. Do you authorize vehicle registration?`;
  }
}

/**
 * Generate localized confirmation message for autonomous vehicle license and roadworthiness renewal.
 */
export function formatVehicleLicenseRenewedMessage(
  params: {
    makeModel: string;
    plate: string;
    expiryDate: string;
    mvaaLicenseNumber?: string;
    roadworthinessNumber?: string;
    amount?: number;
    currency?: string;
  },
  lang?: string
): string {
  const language = normalizeNigerianLanguage(lang);
  const formattedExpiry = formatDate(params.expiryDate);

  switch (language) {
    case "pcm":
      return `Sharp sharp! Your vehicle license and roadworthiness for ${params.makeModel} (${params.plate}) don renew successfully! New expiry date na ${formattedExpiry}. Valid MVAA paper and Roadworthiness certificate don drop inside your ActionOS documents.`;

    case "yo":
      return `Aṣeyọri nla! A ti sọ iwe-aṣẹ ọkọ ati iwe-ẹri ijẹrisi ọkọ di ọtun fun ${params.makeModel} (${params.plate})! Ọjọ ipari tuntun jẹ ${formattedExpiry}. A ti gbe iwe-ẹri osise si ActionOS rẹ.`;

    case "ha":
      return `Barka! An sabunta lasisin mota da takardar duba lafiyar mota cikin nasara don ${params.makeModel} (${params.plate})! Sabuwar ranar karewa ita ce ${formattedExpiry}. An ajiye takardun hukuma a cikin ActionOS.`;

    case "ig":
      return `Nnọọ! Emeghela akwụkwọ ikike na nyocha nchekwa ụgbọ ala ọhụrụ maka ${params.makeModel} (${params.plate})! Ụbọchị mmechi ọhụrụ bụ ${formattedExpiry}. Echekwala akwụkwọ ikike gị na ActionOS.`;

    case "en-NG":
    default:
      return `Vehicle license and roadworthiness inspection successfully renewed for ${params.makeModel} (${params.plate}). New validity expires on ${formattedExpiry}. Official MVAA license and Roadworthiness certificates generated in ActionOS.`;
  }
}

/**
 * Generate localized statutory inspection clearance message for computerized LACVIS/VIS inspection.
 */
export function formatRoadworthinessInspectionMessage(
  params: {
    plate: string;
    inspectionId: string;
    brakeEfficiency: string;
    emissionStatus: string;
    overallResult: string;
  },
  lang?: string
): string {
  const language = normalizeNigerianLanguage(lang);

  switch (language) {
    case "pcm":
      return `Motor ${params.plate} don pass computerized roadworthiness inspection (ID: ${params.inspectionId}). Break na ${params.brakeEfficiency}, emission dey ${params.emissionStatus}. Overall check: ${params.overallResult}.`;

    case "yo":
      return `Ọkọ ${params.plate} ti kọja ayẹwo ijẹrisi kọmputa LACVIS (ID: ${params.inspectionId}). Agbara idaduro jẹ ${params.brakeEfficiency}, èéfín jẹ ${params.emissionStatus}. Abajade gbogbogbo: ${params.overallResult}.`;

    case "ha":
      return `Mota ${params.plate} ta wuce binciken na'ura mai kwakwalwa na LACVIS (ID: ${params.inspectionId}). Karfin birki shine ${params.brakeEfficiency}, hayaki shine ${params.emissionStatus}. Sakamakon gaba daya: ${params.overallResult}.`;

    case "ig":
      return `Ụgbọ ala ${params.plate} agafeela nyocha LACVIS site na kọmputa (ID: ${params.inspectionId}). Ịrụ ọrụ breeki bụ ${params.brakeEfficiency}, anwụrụ ọkụ bụ ${params.emissionStatus}. Nsonaazụ n'ozuzu: ${params.overallResult}.`;

    case "en-NG":
    default:
      return `Vehicle ${params.plate} passed computerized roadworthiness inspection (ID: ${params.inspectionId}). Brake efficiency: ${params.brakeEfficiency}, emission status: ${params.emissionStatus}. Status: ${params.overallResult}.`;
  }
}

/**
 * Generate localized authorization prompt for statutory vehicle license and roadworthiness fee gate.
 */
export function formatVehicleLicenseGateMessage(
  params: {
    makeModel: string;
    plate: string;
    amount: number;
    currency?: string;
  },
  lang?: string
): string {
  const language = normalizeNigerianLanguage(lang);
  const formattedAmount = formatCurrency(params.amount, params.currency || "NGN");

  switch (language) {
    case "pcm":
      return `Vehicle license and roadworthiness renewal for ${params.makeModel} (${params.plate}) don ready. Statutory fee plus inspection na ${formattedAmount}. You authorize make we complete renewal?`;

    case "yo":
      return `Isọdọtun iwe-aṣẹ ọkọ ati iwe-ẹri ijẹrisi fun ${params.makeModel} (${params.plate}) ti ṣetan. Owo osise ati ayẹwo jẹ ${formattedAmount}. Ṣe o fun wa ni aṣẹ lati pari isọdọtun rẹ?`;

    case "ha":
      return `Sabunta lasisin mota da duba lafiyar mota don ${params.makeModel} (${params.plate}) ya shirya. Kudin hukuma da duba mota shine ${formattedAmount}. Shin kun ba da izini don kammala sabuntawar?`;

    case "ig":
      return `Mmeghari ikike ụgbọ ala na nyocha maka ${params.makeModel} (${params.plate}) adịla njikere. Ego iwu na nyocha bụ ${formattedAmount}. Ị nyere ikike ka anyị mechaa mmeghari ahụ?`;

    case "en-NG":
    default:
      return `Vehicle license and roadworthiness renewal ready for ${params.makeModel} (${params.plate}). Total statutory fees and inspection certification: ${formattedAmount}. Do you authorize renewal?`;
  }
}

/**
 * Generate localized authorization prompt for insurance policy renewal.
 */
export function formatRenewalGateMessage(
  params: {
    policyNumber: string;
    assetName: string;
    expiryDate: string;
    amount: number;
    currency?: string;
  },
  lang?: string
): string {
  const language = normalizeNigerianLanguage(lang);
  const formattedAmount = formatCurrency(params.amount, params.currency || "NGN");
  const formattedExpiry = formatDate(params.expiryDate);

  switch (language) {
    case "pcm":
      return `We don find your policy ${params.policyNumber} for ${params.assetName}. E dey expire on ${formattedExpiry}. Renewal quote na ${formattedAmount}. You authorize make we pay and renew am?`;

    case "yo":
      return `A rí eto iṣeduro rẹ ${params.policyNumber} fun ${params.assetName}. O n pari ni ọjọ ${formattedExpiry}. Iye isọdọtun jẹ ${formattedAmount}. Ṣe o fun wa ni aṣẹ lati sanwo ki a sọ ọ di ọtun?`;

    case "ha":
      return `Mun sami manufar inshorar ku ${params.policyNumber} don ${params.assetName}. Za ta ƙare a ranar ${formattedExpiry}. Kuɗin sabuntawa shine ${formattedAmount}. Shin kun ba da izinin biya da sabuntawa?`;

    case "ig":
      return `Anyị ahụla amụma inshora gị ${params.policyNumber} maka ${params.assetName}. Ọ ga-agwụ na ${formattedExpiry}. Ego mmeghari ọhụrụ bụ ${formattedAmount}. Ị nyere ikike ịkwụ ụgwọ ma mee ya nke ọhụrụ?`;

    case "en-NG":
    default:
      return `Found your policy ${params.policyNumber} for ${params.assetName}. It expires on ${formattedExpiry}. Renewal quote is ${formattedAmount}. Do you authorize payment and renewal?`;
  }
}

/**
 * Generate localized general success or error messages.
 */
export function formatLocalizedActionMessage(
  action: "completed" | "error" | "cancelled",
  detail?: string,
  lang?: string
): string {
  const language = normalizeNigerianLanguage(lang);

  if (action === "completed") {
    switch (language) {
      case "pcm":
        return detail || "Action don complete well well sharp sharp.";
      case "yo":
        return detail || "Iṣẹ naa ti pari ni aṣeyọri.";
      case "ha":
        return detail || "Ayyukan sun kammala cikin nasara.";
      case "ig":
        return detail || "Emela omume ahụ nke ọma.";
      case "en-NG":
      default:
        return detail || "Action completed successfully.";
    }
  }

  if (action === "cancelled") {
    switch (language) {
      case "pcm":
        return "Action don cancel as you talk.";
      case "yo":
        return "A ti fagilee iṣẹ naa.";
      case "ha":
        return "An soke aikin.";
      case "ig":
        return "Akagbuola omume ahụ.";
      case "en-NG":
      default:
        return "Action cancelled as requested.";
    }
  }

  // Error case
  switch (language) {
    case "pcm":
      return `Wahala dey: ${detail || "Action no fit complete"}.`;
    case "yo":
      return `Aṣiṣe waye: ${detail || "Iṣẹ ko le pari"}.`;
    case "ha":
      return `Kuskure ya faru: ${detail || "Ba a iya kammala aikin ba"}.`;
    case "ig":
      return `Nsogbu dị: ${detail || "Omume enweghị ike ịmecha"}.`;
    case "en-NG":
    default:
      return `Action error: ${detail || "Unable to complete action"}.`;
  }
}

/**
 * Normalizes Nigerian text by removing tone marks/diacritics, collapsing whitespace,
 * and harmonizing informal speech transcription typos (e.g. "shrp shrp", "insurans", "reneww").
 */
export function normalizeNigerianText(text: string): string {
  if (!text) return "";
  let norm = text.toLowerCase().trim();

  // Normalize Unicode diacritics & Nigerian tone marks
  norm = norm
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Strip combining diacritical marks
    .replace(/[ọọ́ọ̀]/g, "o")
    .replace(/[ẹẹ́ẹ̀]/g, "e")
    .replace(/[ṣ]/g, "s")
    .replace(/[ụụ́ụ̀]/g, "u")
    .replace(/[ịị́ị̀]/g, "i")
    .replace(/[ƙ]/g, "k")
    .replace(/[ɓ]/g, "b")
    .replace(/[ɗ]/g, "d");

  // Harmonize common informal speech transcription typos
  norm = norm
    .replace(/\bshrp\s*shrp\b/g, "sharp sharp")
    .replace(/\bsharplyy?\b/g, "sharp sharp")
    .replace(/\b(reneww|renw|re-new)\b/g, "renew")
    .replace(/\b(expird|expiringg)\b/g, "expire")
    .replace(/\b(insurans|insrance|inshorance)\b/g, "insurance")
    .replace(/\b(motata|motar)\b/g, "mota")
    .replace(/\b(ugboala)\b/g, "ugbo ala")
    .replace(/\b(ayokele)\b/g, "ayokele");

  return norm;
}

/**
 * Generate localized clarification question when customer input is ambiguous
 * (e.g. general greeting, ambiguous intent, or missing vehicle/policy identifiers).
 */
export function formatClarificationMessage(lang?: string): string {
  const language = normalizeNigerianLanguage(lang);

  switch (language) {
    case "pcm":
      return "ActionOS: You wan renew your motor insurance, or you wan renew your vehicle license and roadworthiness paper? Abeg drop your motor plate number or policy number make we help you sharp sharp.";

    case "yo":
      return "ActionOS: Ṣe ẹ fẹ sọ iṣeduro ọkọ yín di ọtun, tabi lasisi ọkọ ati iwe ayẹwo? Ẹ jọ̀wọ́ sọ nọ́mbà pílẹ́ẹ̀tì ọkọ tàbí nọ́mbà iṣeduro yín lati bẹrẹ.";

    case "ha":
      return "ActionOS: Kuna so ku sabunta inshorar motar ku ne, ko kuma lasisin mota da takardar duba lafiyar mota? Da fatan za a ba da lambar motarku ko lambar inshora don ci gaba.";

    case "ig":
      return "ActionOS: Ị chọrọ imeghari mkpuchi ụgbọ ala gị, ka ị chọrọ imeghari akwụkwọ ikike ụgbọ ala na nyocha gị? Biko nye anyị nọmba ụgbọ ala gị ma ọ bụ nọmba mkpuchi gị ka anyị nwee ike ịga n'ihu.";

    case "en-NG":
    default:
      return "ActionOS: Would you like to renew your third-party motor insurance policy, or renew your vehicle license & roadworthiness certificate? Please provide your vehicle registration plate or policy number to proceed.";
  }
}

