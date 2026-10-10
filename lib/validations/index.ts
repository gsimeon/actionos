import { z } from "zod";

export const createActionSchema = z.object({
  channel: z.enum(["web", "voice", "whatsapp", "telegram", "api"]).default("web"),
  language: z.string().default("en-NG"),
  customerId: z.string().optional(),
  organizationId: z.string().optional(),
  inputText: z.string().min(1, "Input text or command is required").max(1000),
  inputAudioUrl: z.string().url().optional(),
});

export const authorizeActionSchema = z.object({
  authorized: z.boolean(),
  quoteId: z.string().optional(),
  authorizedQuoteId: z.string().optional(),
  reason: z.string().optional(),
  selectedUnderwriter: z.string().optional(),
  customAmount: z.number().positive().optional(),
  authMethod: z.enum(["pin", "biometric_webauthn", "passkey", "whatsapp_otp"]).optional(),
  simulateSagaFailure: z.boolean().optional(),
});

export const executeActionSchema = z.object({
  stepId: z.string().optional(),
});

export const createCustomerSchema = z.object({
  full_name: z.string().min(2, "Full name must be at least 2 characters"),
  phone: z.string().regex(/^\+?[0-9\s-]{10,16}$/, "Valid Nigerian or international phone number required"),
  email: z.string().email("Valid email address required"),
  address: z.string().optional(),
  state: z.string().default("Lagos"),
  country: z.string().default("Nigeria"),
});

export const createPolicySchema = z.object({
  customer_id: z.string().uuid(),
  asset_id: z.string().uuid().optional(),
  provider_id: z.string().uuid(),
  policy_type_id: z.string().uuid(),
  policy_number: z.string().min(3),
  start_date: z.string(),
  expiry_date: z.string(),
  premium: z.number().positive(),
  currency: z.string().default("NGN"),
});

export const csvRowSchema = z.object({
  customer_number: z.string().min(1, "Customer number required"),
  full_name: z.string().min(2, "Full name required"),
  phone: z.string().min(10, "Phone number required"),
  email: z.string().email("Valid email required"),
  vehicle_registration: z.string().min(3, "Vehicle registration plate required"),
  policy_number: z.string().min(3, "Policy number required"),
  provider: z.string().min(2, "Provider name required"),
  policy_type: z.string().min(2, "Policy type required"),
  start_date: z.string().min(4, "Start date required"),
  expiry_date: z.string().min(4, "Expiry date required"),
  premium: z.coerce.number().positive("Premium must be greater than 0"),
  currency: z.string().default("NGN"),
});

export const queryVehicleSchema = z.object({
  plate: z.string().optional(),
  vin: z.string().optional(),
  engine: z.string().optional(),
  query: z.string().optional(),
  customerId: z.string().optional(),
  language: z.string().default("en-NG"),
});

export const createVehicleSchema = z.object({
  customerId: z.string().optional(),
  make: z.string().min(1, "Make is required").default("Toyota"),
  model: z.string().min(1, "Model is required").default("Camry"),
  year: z.coerce.number().int().min(1980).max(2030).default(new Date().getFullYear()),
  color: z.string().default("Midnight Black"),
  vehiclePlate: z.string().min(3, "Plate number is required"),
  chassisNumber: z.string().optional(),
  vin: z.string().optional(),
  engineNumber: z.string().optional(),
  language: z.string().default("en-NG"),
});
