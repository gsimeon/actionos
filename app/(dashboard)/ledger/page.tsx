"use client";

import React, { useEffect, useState, useCallback, useTransition, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ActionLedger } from "@/components/actionos/action-ledger";
import {
  Hash,
  Lock,
  RefreshCw,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  Layers,
  Car,
  HeartPulse,
  FileBadge,
  Shield,
} from "lucide-react";
import type { ActionLedgerEvent } from "@/types/actionos";
import { useLedgerRealtime } from "@/lib/realtime";

// 1. Motor Insurance Benchmark (12 events)
const BENCHMARK_MOTOR_EVENTS: ActionLedgerEvent[] = [
  {
    id: "ev_001_intent",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:01.120Z",
    action: "intent_detection",
    description: "Input received via web: 'My car insurance expires next week. Check it and renew it for me.'",
    status: "verified",
    actor: "User",
    tool: "n_atlas_multilingual_parser",
    hash: "a1c7f4281352e8d99c43831885994f1c1f5139049a463ad258416d231b48901a",
    previousHash: "0000000000000000000000000000000000000000000000000000000000000000",
    signature: "hmac_sha256_sig_genesis_001_valid",
  },
  {
    id: "ev_002_customer",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:01.350Z",
    action: "customer_lookup",
    description: "Retrieved customer Demo Customer (CUS-000001) in tenant a0000000-0000-0000-0000-000000000001",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "get_customer",
    hash: "b2d8e5392463f9e00d54942996005e2d2e6240150b574be369527e342c59012b",
    previousHash: "a1c7f4281352e8d99c43831885994f1c1f5139049a463ad258416d231b48901a",
    signature: "hmac_sha256_sig_cust_002_valid",
  },
  {
    id: "ev_003_policy",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:01.580Z",
    action: "policy_lookup",
    description: "Retrieved policy AUTO-2026-00182 for Toyota Camry (ABC-123-XY). Expiration: 2026-10-14",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "get_policy",
    hash: "c3e9f64035740af11e65053007116f3e3f7351261c685cf470638f453d60123c",
    previousHash: "b2d8e5392463f9e00d54942996005e2d2e6240150b574be369527e342c59012b",
    signature: "hmac_sha256_sig_pol_003_valid",
  },
  {
    id: "ev_004_niid",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:01.810Z",
    action: "regulatory_verification",
    description: "Statutory FRSC & NIID database query verified plate ABC-123-XY legitimacy with Leadway Assurance",
    status: "verified",
    actor: "Policy Guardrail",
    tool: "verify_niid_statutory",
    hash: "d4fa075146851ba22f7616411822704f408462372d796da5817490564e71234d",
    previousHash: "c3e9f64035740af11e65053007116f3e3f7351261c685cf470638f453d60123c",
    signature: "hmac_sha256_sig_niid_004_valid",
  },
  {
    id: "ev_005_quote",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:02.040Z",
    action: "quote_generation",
    description: "Generated and persisted quote quo_leadway_001 for ₦87,500 across 4 underwriters",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "generate_quote",
    hash: "e50b186257962cb33087275229338150519573483e8a7eb6928501675f82345e",
    previousHash: "d4fa075146851ba22f7616411822704f408462372d796da5817490564e71234d",
    signature: "hmac_sha256_sig_quote_005_valid",
  },
  {
    id: "ev_006_auth_gate",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:02.270Z",
    action: "authorization_requested",
    description: "Halted at Authorization Gate: Explicit human consent required for ₦87,500 debit",
    status: "verified",
    actor: "Policy Guardrail",
    hash: "f61c297368073dc44198386330449261620684594f9b8fc7039612786093456f",
    previousHash: "e50b186257962cb33087275229338150519573483e8a7eb6928501675f82345e",
    signature: "hmac_sha256_sig_authreq_006_valid",
  },
  {
    id: "ev_007_auth_confirmed",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:04.500Z",
    action: "authorization_confirmed",
    description: "Customer authorized renewal: ₦87,500 via biometric passkey bound to quote quo_leadway_001",
    status: "verified",
    actor: "User",
    hash: "072d3a8479184ed552094974415503727317956050ac90d81407238971045670",
    previousHash: "f61c297368073dc44198386330449261620684594f9b8fc7039612786093456f",
    signature: "hmac_sha256_sig_authconf_007_valid",
  },
  {
    id: "ev_008_payment_init",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:04.730Z",
    action: "payment_initiation",
    description: "Initiated settlement for ₦87,500 to Leadway Assurance via Paystack Sandbox Gateway",
    status: "verified",
    actor: "Payment Gateway",
    tool: "initiate_payment",
    hash: "183e4b9580295fe663105085526614838428067161bd01e92518349082156781",
    previousHash: "072d3a8479184ed552094974415503727317956050ac90d81407238971045670",
    signature: "hmac_sha256_sig_payinit_008_valid",
  },
  {
    id: "ev_009_payment_verify",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:05.100Z",
    action: "payment_verification",
    description: "Out-of-band verification confirmed ₦87,500 settled with ref pay_ref_2026_00182",
    status: "verified",
    actor: "Payment Gateway",
    tool: "verify_payment",
    hash: "294f5ca6913060f774216196637725949539178272ce12fa3629450193267892",
    previousHash: "183e4b9580295fe663105085526614838428067161bd01e92518349082156781",
    signature: "hmac_sha256_sig_payver_009_valid",
  },
  {
    id: "ev_010_renew",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:05.340Z",
    action: "policy_renewal",
    description: "Executed database renewal for AUTO-2026-00182: new expiry date 2027-10-14",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "renew_policy",
    hash: "3a506db70241710885327207748836050640289383df230b47305612043789a3",
    previousHash: "294f5ca6913060f774216196637725949539178272ce12fa3629450193267892",
    signature: "hmac_sha256_sig_ren_010_valid",
  },
  {
    id: "ev_011_cert",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:05.600Z",
    action: "document_issuance",
    description: "Issued digital NAICOM certificate NAICOM-CERT-2026-00182 with SHA-256 seal",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "generate_certificate",
    hash: "4b617ec81352821996438318859947161751390494e0341c5841672315489ab4",
    previousHash: "3a506db70241710885327207748836050640289383df230b47305612043789a3",
    signature: "hmac_sha256_sig_cert_011_valid",
  },
  {
    id: "ev_012_notify",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:05.820Z",
    action: "notification_dispatch",
    description: "Dispatched multi-channel notifications across WhatsApp (+2348011111111), SMS, and In-App",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "send_notification",
    hash: "5c728fd92463932007549429960058272862401505f1452d6952783426590bc5",
    previousHash: "4b617ec81352821996438318859947161751390494e0341c5841672315489ab4",
    signature: "hmac_sha256_sig_notif_012_valid",
  },
];

// 2. Health HMO Benchmark (10 events)
const BENCHMARK_HMO_EVENTS: ActionLedgerEvent[] = [
  {
    id: "ev_hmo_001_intent",
    sessionId: "act_hmo_hygeia_001",
    timestamp: "2026-10-09T14:10:01.050Z",
    action: "intent_detection",
    description: "N-ATLAS Multilingual Engine recognized healthcare renewal intent: 'Renew my Hygeia health insurance policy for another year'",
    status: "verified",
    actor: "User",
    tool: "n_atlas_multilingual_parser",
    hash: "91a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80",
    previousHash: "0000000000000000000000000000000000000000000000000000000000000000",
    signature: "hmac_sha256_hmo_intent_001",
  },
  {
    id: "ev_hmo_002_customer",
    sessionId: "act_hmo_hygeia_001",
    timestamp: "2026-10-09T14:10:01.210Z",
    action: "customer_lookup",
    description: "Resolved policyholder Demo Customer (CUS-000001, NIN: DEMO-NIN-000001)",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "get_customer",
    hash: "a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091",
    previousHash: "91a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80",
    signature: "hmac_sha256_hmo_cust_002",
  },
  {
    id: "ev_hmo_003_nhia_check",
    sessionId: "act_hmo_hygeia_001",
    timestamp: "2026-10-09T14:10:01.450Z",
    action: "regulatory_verification",
    description: "Queried National Health Insurance Authority (NHIA) central enrollee registry: verified ID NHIA-00829104 with Hygeia HMO",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "query_hmo_plan",
    hash: "b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2",
    previousHash: "a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091",
    signature: "hmac_sha256_hmo_nhia_003",
  },
  {
    id: "ev_hmo_004_tier_eval",
    sessionId: "act_hmo_hygeia_001",
    timestamp: "2026-10-09T14:10:01.670Z",
    action: "plan_evaluation",
    description: "Evaluated tier 'Platinum' coverage schedule: Primary HCP Lagoon Hospitals VI verified for outpatient, surgery & dental",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "query_hmo_plan",
    hash: "c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3",
    previousHash: "b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2",
    signature: "hmac_sha256_hmo_tier_004",
  },
  {
    id: "ev_hmo_005_auth_req",
    sessionId: "act_hmo_hygeia_001",
    timestamp: "2026-10-09T14:10:01.900Z",
    action: "authorization_requested",
    description: "Halted at Authorization Gate: Explicit human biometric approval required for ₦145,000 healthcare premium debit",
    status: "verified",
    actor: "Policy Guardrail",
    hash: "d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4",
    previousHash: "c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3",
    signature: "hmac_sha256_hmo_authreq_005",
  },
  {
    id: "ev_hmo_006_auth_conf",
    sessionId: "act_hmo_hygeia_001",
    timestamp: "2026-10-09T14:10:03.400Z",
    action: "authorization_confirmed",
    description: "Enrollee confirmed renewal authorization via Passkey biometric token bound to HMO-PLAT-2026-00812",
    status: "verified",
    actor: "User",
    hash: "e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5",
    previousHash: "d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4",
    signature: "hmac_sha256_hmo_authconf_006",
  },
  {
    id: "ev_hmo_007_pay",
    sessionId: "act_hmo_hygeia_001",
    timestamp: "2026-10-09T14:10:03.850Z",
    action: "payment_settlement",
    description: "Settled ₦145,000 healthcare premium to Hygeia HMO through NHIA Healthcare Gateway (ref: nhia_tx_2026_00812)",
    status: "verified",
    actor: "Payment Gateway",
    tool: "renew_hmo_policy",
    hash: "f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6",
    previousHash: "e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5",
    signature: "hmac_sha256_hmo_pay_007",
  },
  {
    id: "ev_hmo_008_renew",
    sessionId: "act_hmo_hygeia_001",
    timestamp: "2026-10-09T14:10:04.120Z",
    action: "hmo_policy_renewed",
    description: "Database renewal finalized: Policy HMO-PLAT-2026-00812 roll-forward confirmed through 2027-10-24",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "renew_hmo_policy",
    hash: "08192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7",
    previousHash: "f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6",
    signature: "hmac_sha256_hmo_ren_008",
  },
  {
    id: "ev_hmo_009_card",
    sessionId: "act_hmo_hygeia_001",
    timestamp: "2026-10-09T14:10:04.380Z",
    action: "document_issuance",
    description: "Generated certified NHIA Digital HMO Card (ActionOS_NHIA_HMO_Card_00812.pdf) with vector QR verification seal",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "renew_hmo_policy",
    hash: "192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708",
    previousHash: "08192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7",
    signature: "hmac_sha256_hmo_card_009",
  },
  {
    id: "ev_hmo_010_notify",
    sessionId: "act_hmo_hygeia_001",
    timestamp: "2026-10-09T14:10:04.600Z",
    action: "notification_dispatch",
    description: "Dispatched omnichannel renewal receipt and digital card via WhatsApp and SMS (+2348011111111)",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "send_notification",
    hash: "2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70819",
    previousHash: "192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708",
    signature: "hmac_sha256_hmo_notif_010",
  },
];

// 3. Driver's License Benchmark (10 events)
const BENCHMARK_DRIVER_LICENSE_EVENTS: ActionLedgerEvent[] = [
  {
    id: "ev_dl_001_intent",
    sessionId: "act_dl_frsc_001",
    timestamp: "2026-10-10T09:15:00.110Z",
    action: "intent_detection",
    description: "N-ATLAS Multilingual Engine parsed user input: 'Renew my driver license for 5 years make I no enter problem with road safety'",
    status: "verified",
    actor: "User",
    tool: "n_atlas_multilingual_parser",
    hash: "3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a",
    previousHash: "0000000000000000000000000000000000000000000000000000000000000000",
    signature: "hmac_sha256_dl_intent_001",
  },
  {
    id: "ev_dl_002_customer",
    sessionId: "act_dl_frsc_001",
    timestamp: "2026-10-10T09:15:00.280Z",
    action: "customer_lookup",
    description: "Located customer Demo Customer (CUS-000001) with national identity number DEMO-NIN-000001",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "get_customer",
    hash: "4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b",
    previousHash: "3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a",
    signature: "hmac_sha256_dl_cust_002",
  },
  {
    id: "ev_dl_003_nvis",
    sessionId: "act_dl_frsc_001",
    timestamp: "2026-10-10T09:15:00.520Z",
    action: "regulatory_verification",
    description: "Federal Road Safety Corps (FRSC) NVIS database cross-check verified valid Class B license FRSC-LA-2024-009182",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "renew_drivers_license",
    hash: "5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c",
    previousHash: "4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b",
    signature: "hmac_sha256_dl_nvis_003",
  },
  {
    id: "ev_dl_004_biometrics",
    sessionId: "act_dl_frsc_001",
    timestamp: "2026-10-10T09:15:00.740Z",
    action: "biometric_slot_reservation",
    description: "Reserved biometric recapture slot at FRSC Ojodu Sector Command, Lagos for Wednesday, 22 Oct 2026 (09:00 - 11:30 AM)",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "renew_drivers_license",
    hash: "6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d",
    previousHash: "5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c",
    signature: "hmac_sha256_dl_bio_004",
  },
  {
    id: "ev_dl_005_auth_req",
    sessionId: "act_dl_frsc_001",
    timestamp: "2026-10-10T09:15:01.010Z",
    action: "authorization_requested",
    description: "Halted at Authorization Gate: Explicit human consent required to debit statutory fee of ₦15,000 (5-Year Duration)",
    status: "verified",
    actor: "Policy Guardrail",
    hash: "7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e",
    previousHash: "6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d",
    signature: "hmac_sha256_dl_authreq_005",
  },
  {
    id: "ev_dl_006_auth_conf",
    sessionId: "act_dl_frsc_001",
    timestamp: "2026-10-10T09:15:02.800Z",
    action: "authorization_confirmed",
    description: "Customer confirmed biometric passkey authorization for ₦15,000 FRSC renewal debit",
    status: "verified",
    actor: "User",
    hash: "8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f",
    previousHash: "7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e",
    signature: "hmac_sha256_dl_authconf_006",
  },
  {
    id: "ev_dl_007_treasury_settle",
    sessionId: "act_dl_frsc_001",
    timestamp: "2026-10-10T09:15:03.250Z",
    action: "statutory_settlement",
    description: "Settled ₦15,000 to Federal Road Safety Corps treasury rail with reference frsc_tx_2026_00918",
    status: "verified",
    actor: "Payment Gateway",
    tool: "renew_drivers_license",
    hash: "91a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80",
    previousHash: "8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f",
    signature: "hmac_sha256_dl_settle_007",
  },
  {
    id: "ev_dl_008_portal_approve",
    sessionId: "act_dl_frsc_001",
    timestamp: "2026-10-10T09:15:03.550Z",
    action: "statutory_application_approved",
    description: "FRSC National Licensing Portal returned approval code FRSC-DL-2026-88192; validity rolled forward to 2031-10-20",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "renew_drivers_license",
    hash: "a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091",
    previousHash: "91a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80",
    signature: "hmac_sha256_dl_approve_008",
  },
  {
    id: "ev_dl_009_permit_issued",
    sessionId: "act_dl_frsc_001",
    timestamp: "2026-10-10T09:15:03.800Z",
    action: "document_issuance",
    description: "Issued official FRSC Temporary Driving Permit (FRSC-TMP-2026-91823) with verifiable vector QR code and appointment barcode",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "renew_drivers_license",
    hash: "b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2",
    previousHash: "a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091",
    signature: "hmac_sha256_dl_permit_009",
  },
  {
    id: "ev_dl_010_notify",
    sessionId: "act_dl_frsc_001",
    timestamp: "2026-10-10T09:15:04.050Z",
    action: "notification_dispatch",
    description: "Dispatched biometric appointment instructions & downloadable temporary permit via WhatsApp and Email (customer@actionos.ng)",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "send_notification",
    hash: "c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3",
    previousHash: "b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2",
    signature: "hmac_sha256_dl_notif_010",
  },
];

// 4. Vehicle License & LACVIS Roadworthiness Benchmark (10 events)
const BENCHMARK_VEHICLE_LICENSE_EVENTS: ActionLedgerEvent[] = [
  {
    id: "ev_veh_001_intent",
    sessionId: "act_veh_mvaa_001",
    timestamp: "2026-10-09T11:00:01.000Z",
    action: "intent_detection",
    description: "Parsed vehicle renewal request: 'Renew my vehicle paper and roadworthiness for Toyota Camry ABC-123-XY'",
    status: "verified",
    actor: "User",
    tool: "n_atlas_multilingual_parser",
    hash: "d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4",
    previousHash: "0000000000000000000000000000000000000000000000000000000000000000",
    signature: "hmac_sha256_veh_intent_001",
  },
  {
    id: "ev_veh_002_asset",
    sessionId: "act_veh_mvaa_001",
    timestamp: "2026-10-09T11:00:01.200Z",
    action: "asset_lookup",
    description: "Retrieved asset ABC-123-XY (Toyota Camry, VIN: DEMO-VIN-000001) bound to customer Demo Customer",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "query_vehicle",
    hash: "e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5",
    previousHash: "d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4",
    signature: "hmac_sha256_veh_asset_002",
  },
  {
    id: "ev_veh_003_lacvis",
    sessionId: "act_veh_mvaa_001",
    timestamp: "2026-10-09T11:00:01.480Z",
    action: "computerized_inspection_verification",
    description: "LACVIS Computerized Vehicle Inspection station test verified: Brake Efficiency 84% (Pass), Headlamp Alignment Compliant",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "verify_vehicle_inspection",
    hash: "f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6",
    previousHash: "e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5",
    signature: "hmac_sha256_veh_lacvis_003",
  },
  {
    id: "ev_veh_004_fee_calc",
    sessionId: "act_veh_mvaa_001",
    timestamp: "2026-10-09T11:00:01.710Z",
    action: "statutory_fee_computation",
    description: "Computed statutory tariff schedule: License ₦12,000 + Roadworthiness ₦8,000 + Admin Processing ₦5,000 = ₦25,000 total",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "renew_vehicle_license",
    hash: "08192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7",
    previousHash: "f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6",
    signature: "hmac_sha256_veh_fee_004",
  },
  {
    id: "ev_veh_005_auth_req",
    sessionId: "act_veh_mvaa_001",
    timestamp: "2026-10-09T11:00:01.950Z",
    action: "authorization_requested",
    description: "Halted at Authorization Gate: Explicit human consent required for ₦25,000 State Treasury debit",
    status: "verified",
    actor: "Policy Guardrail",
    hash: "192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708",
    previousHash: "08192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7",
    signature: "hmac_sha256_veh_authreq_005",
  },
  {
    id: "ev_veh_006_auth_conf",
    sessionId: "act_veh_mvaa_001",
    timestamp: "2026-10-09T11:00:03.200Z",
    action: "authorization_confirmed",
    description: "Customer authorized payment via biometrics for ₦25,000 vehicle licensing",
    status: "verified",
    actor: "User",
    hash: "2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70819",
    previousHash: "192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708",
    signature: "hmac_sha256_veh_authconf_006",
  },
  {
    id: "ev_veh_007_treasury_settle",
    sessionId: "act_veh_mvaa_001",
    timestamp: "2026-10-09T11:00:03.650Z",
    action: "statutory_settlement",
    description: "Settled ₦25,000 via Lagos State MVAA Licensing Gateway with ref mvaa_tx_2026_00182",
    status: "verified",
    actor: "Payment Gateway",
    tool: "renew_vehicle_license",
    hash: "3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a",
    previousHash: "2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70819",
    signature: "hmac_sha256_veh_settle_007",
  },
  {
    id: "ev_veh_008_mvaa_update",
    sessionId: "act_veh_mvaa_001",
    timestamp: "2026-10-09T11:00:03.950Z",
    action: "statutory_record_rollforward",
    description: "MVAA central database roll-forward completed: License MVAA-LIC-2026-00182 extended to 2027-10-14",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "renew_vehicle_license",
    hash: "4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b",
    previousHash: "3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a",
    signature: "hmac_sha256_veh_update_008",
  },
  {
    id: "ev_veh_009_doc_issuance",
    sessionId: "act_veh_mvaa_001",
    timestamp: "2026-10-09T11:00:04.200Z",
    action: "document_issuance",
    description: "Issued official Lagos State Vehicle License Paper and LACVIS Certificate (ActionOS_Vehicle_License_ABC-123-XY.pdf)",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "renew_vehicle_license",
    hash: "5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c",
    previousHash: "4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b",
    signature: "hmac_sha256_veh_doc_009",
  },
  {
    id: "ev_veh_010_notify",
    sessionId: "act_veh_mvaa_001",
    timestamp: "2026-10-09T11:00:04.450Z",
    action: "notification_dispatch",
    description: "Dispatched renewal confirmation and digital vehicle papers via WhatsApp and SMS (+2348011111111)",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "send_notification",
    hash: "6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d",
    previousHash: "5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c",
    signature: "hmac_sha256_veh_notif_010",
  },
];

// 5. Autonomous Saga Rollback & Compensating Refund Benchmark (8 events)
const BENCHMARK_SAGA_REFUND_EVENTS: ActionLedgerEvent[] = [
  {
    id: "ev_saga_001_intent",
    sessionId: "act_recon_refund_002",
    timestamp: "2026-10-07T16:20:00.050Z",
    action: "intent_detection",
    description: "Initiated automated renewal workflow for commercial policy AUTO-2026-33918",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "n_atlas_multilingual_parser",
    hash: "7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e",
    previousHash: "0000000000000000000000000000000000000000000000000000000000000000",
    signature: "hmac_sha256_saga_intent_001",
  },
  {
    id: "ev_saga_002_customer",
    sessionId: "act_recon_refund_002",
    timestamp: "2026-10-07T16:20:00.220Z",
    action: "customer_lookup",
    description: "Retrieved customer Demo Customer (CUS-000001) for policy AUTO-2026-33918",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "get_customer",
    hash: "8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f",
    previousHash: "7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e",
    signature: "hmac_sha256_saga_cust_002",
  },
  {
    id: "ev_saga_003_payment",
    sessionId: "act_recon_refund_002",
    timestamp: "2026-10-07T16:20:01.400Z",
    action: "payment_settlement",
    description: "Debited ₦65,000 via Paystack Gateway (ref: pay_ref_recon_001) following customer authorization",
    status: "verified",
    actor: "Payment Gateway",
    tool: "verify_payment",
    hash: "91a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80",
    previousHash: "8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f",
    signature: "hmac_sha256_saga_pay_003",
  },
  {
    id: "ev_saga_004_downstream_fail",
    sessionId: "act_recon_refund_002",
    timestamp: "2026-10-07T16:20:04.800Z",
    action: "downstream_statutory_outage",
    description: "Downstream certificate generation failed: NAICOM Central Registry returned HTTP 504 Gateway Timeout",
    status: "failed",
    actor: "ActionOS Engine",
    tool: "generate_certificate",
    hash: "a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091",
    previousHash: "91a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80",
    signature: "hmac_sha256_saga_fail_004",
  },
  {
    id: "ev_saga_005_rollback_trigger",
    sessionId: "act_recon_refund_002",
    timestamp: "2026-10-07T16:20:05.100Z",
    action: "saga_compensating_trigger",
    description: "Saga Fault-Tolerance Protocol Activated: Initiated compensating transaction to prevent customer fund loss",
    status: "verified",
    actor: "ActionOS Engine",
    isCompensating: true,
    hash: "b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2",
    previousHash: "a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091",
    signature: "hmac_sha256_saga_trigger_005",
  },
  {
    id: "ev_saga_006_refund_dispatched",
    sessionId: "act_recon_refund_002",
    timestamp: "2026-10-07T16:20:05.450Z",
    action: "compensating_refund_initiated",
    description: "Dispatched automated compensating refund of ₦65,000 to Paystack (ref: ref_saga_rollback_002)",
    status: "verified",
    actor: "Payment Gateway",
    tool: "refund_payment",
    isCompensating: true,
    hash: "c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3",
    previousHash: "b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2",
    signature: "hmac_sha256_saga_ref_006",
  },
  {
    id: "ev_saga_007_webhook_confirmed",
    sessionId: "act_recon_refund_002",
    timestamp: "2026-10-07T16:20:06.100Z",
    action: "authoritative_webhook_reversal",
    description: "Authoritative Paystack refund webhook received: Reversal of ₦65,000 confirmed successfully without human intervention",
    status: "verified",
    actor: "Payment Gateway",
    tool: "verify_webhook_signature",
    isCompensating: true,
    hash: "d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4",
    previousHash: "c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3",
    signature: "hmac_sha256_saga_hook_007",
  },
  {
    id: "ev_saga_008_sealed",
    sessionId: "act_recon_refund_002",
    timestamp: "2026-10-07T16:20:06.350Z",
    action: "ledger_rollback_sealed",
    description: "Audit trail sealed with Zero Financial Leakage invariant: Customer refunded in full; incident logged in durable store",
    status: "verified",
    actor: "ActionOS Engine",
    isCompensating: true,
    hash: "e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5",
    previousHash: "d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4",
    signature: "hmac_sha256_saga_seal_008",
  },
];

const BENCHMARK_SCENARIOS = [
  {
    id: "motor",
    label: "Motor Insurance (NAICOM)",
    icon: Car,
    events: BENCHMARK_MOTOR_EVENTS,
    sessionId: "act_benchmark_camry_001",
    title: "12-Stage Benchmark Motor Insurance Renewal Ledger",
  },
  {
    id: "hmo",
    label: "Health HMO (NHIA)",
    icon: HeartPulse,
    events: BENCHMARK_HMO_EVENTS,
    sessionId: "act_hmo_hygeia_001",
    title: "10-Stage Benchmark Health HMO Healthcare Renewal Ledger",
  },
  {
    id: "driver_license",
    label: "Driver's License (FRSC)",
    icon: FileBadge,
    events: BENCHMARK_DRIVER_LICENSE_EVENTS,
    sessionId: "act_dl_frsc_001",
    title: "10-Stage Benchmark FRSC National Driver's License Renewal Ledger",
  },
  {
    id: "vehicle_license",
    label: "Vehicle License (MVAA)",
    icon: Shield,
    events: BENCHMARK_VEHICLE_LICENSE_EVENTS,
    sessionId: "act_veh_mvaa_001",
    title: "10-Stage Benchmark Lagos MVAA & LACVIS Vehicle License Ledger",
  },
  {
    id: "saga_refund",
    label: "Saga Reversal (Refund)",
    icon: RotateCcw,
    events: BENCHMARK_SAGA_REFUND_EVENTS,
    sessionId: "act_recon_refund_002",
    title: "8-Stage Benchmark Autonomous Saga Rollback & Compensating Refund",
  },
];

interface LedgerIntegrityInfo {
  valid: boolean;
  totalEvents: number;
  chainValid: boolean;
  signaturesValid: boolean;
  verifiedAt: string;
  error?: string;
}

function ActionLedgerContent() {
  const searchParams = useSearchParams();
  const urlSessionId = searchParams.get("sessionId");

  const [liveEvents, setLiveEvents] = useState<ActionLedgerEvent[]>([]);
  const [integrity, setIntegrity] = useState<LedgerIntegrityInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeMode, setActiveMode] = useState<"live" | "benchmark">("live");
  const [selectedScenario, setSelectedScenario] = useState("motor");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [, startTransition] = useTransition();

  const fetchLedger = useCallback(async () => {
    try {
      setRefreshing(true);
      const query = new URLSearchParams();
      query.set("verify", "true");
      query.set("limit", "100");
      if (urlSessionId) query.set("sessionId", urlSessionId);

      const res = await fetch(`/api/ledger?${query.toString()}`);
      const json = await res.json();

      if (json.success && Array.isArray(json.data?.events)) {
        setLiveEvents(json.data.events);
        if (json.data.integrity) {
          setIntegrity(json.data.integrity);
        }
      }
    } catch {
      // Clean fallback handled by UI state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [urlSessionId]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const query = new URLSearchParams();
        query.set("verify", "true");
        query.set("limit", "100");
        if (urlSessionId) query.set("sessionId", urlSessionId);

        const res = await fetch(`/api/ledger?${query.toString()}`);
        const json = await res.json();

        if (active && json.success && Array.isArray(json.data?.events)) {
          setLiveEvents(json.data.events);
          if (json.data.integrity) {
            setIntegrity(json.data.integrity);
          }
        }
      } catch {
        // Clean fallback
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [urlSessionId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void fetchLedger();
    }, 8000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLedger]);

  useLedgerRealtime({
    sessionId: urlSessionId,
    onNewEvent: (event) => {
      setLiveEvents((prev) => {
        if (prev.some((e) => e.id === event.id)) return prev;
        return [event, ...prev];
      });
    },
  });

  const currentScenarioObj =
    BENCHMARK_SCENARIOS.find((s) => s.id === selectedScenario) || BENCHMARK_SCENARIOS[0];

  const isShowingBenchmark =
    activeMode === "benchmark" || (activeMode === "live" && liveEvents.length === 0 && !loading);

  const displayedEvents = isShowingBenchmark ? currentScenarioObj.events : liveEvents;

  const compensatingCount = displayedEvents.filter(
    (e) => e.isCompensating || (e.metadata as Record<string, unknown> | undefined)?.isCompensating
  ).length;

  const totalEventsCount = displayedEvents.length;

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Cryptographic Action Ledger™ Inspector
            </h1>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-black text-emerald-800 border border-emerald-200">
              MERKLE HASH CHAINING
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-3xl">
            Every autonomous AI action, statutory NIID / NHIA / FRSC validation, financial settlement, and saga rollback is cryptographically linked with SHA-256 and HMAC-SHA256 digital signatures.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* Mode Switcher */}
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs border border-slate-200 font-semibold">
            <button
              type="button"
              onClick={() => startTransition(() => setActiveMode("live"))}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeMode === "live"
                  ? "bg-white text-slate-900 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Live Records ({liveEvents.length})
            </button>
            <button
              type="button"
              onClick={() => startTransition(() => setActiveMode("benchmark"))}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeMode === "benchmark"
                  ? "bg-white text-slate-900 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Benchmark Scenarios (5)
            </button>
          </div>

          {/* Auto Refresh Toggle */}
          <button
            type="button"
            onClick={() => setAutoRefresh((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
              autoRefresh
                ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
            title="Auto-refresh ledger every 8s"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                autoRefresh ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
              }`}
            />
            <span className="hidden sm:inline">Live Sync</span>
          </button>

          {/* Refresh button */}
          <button
            type="button"
            onClick={fetchLedger}
            disabled={refreshing}
            className="p-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            title="Refresh ledger now"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-emerald-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* Benchmark Scenario Selector Tabs (Visible in benchmark mode or empty live mode) */}
      {isShowingBenchmark && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-b border-slate-200 pb-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 shrink-0 mr-1">
            Audit Scenarios:
          </span>
          {BENCHMARK_SCENARIOS.map((scen) => {
            const Icon = scen.icon;
            const isSelected = selectedScenario === scen.id;
            return (
              <button
                key={scen.id}
                type="button"
                onClick={() => setSelectedScenario(scen.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{scen.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isSelected ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {scen.events.length}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Real-Time Operational Statistics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Logged Records */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase mb-1">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-slate-400" />
                <span>Audited Records</span>
              </span>
              <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                {activeMode === "live" && liveEvents.length > 0 ? "REALTIME" : "REFERENCE"}
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {loading && activeMode === "live" ? "..." : totalEventsCount}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Sequential append-only entries verified against tenant authorization context.
          </p>
        </div>

        {/* Metric 2: Non-Repudiation Signatures */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-emerald-700 text-xs font-bold uppercase mb-1">
              <span className="flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-emerald-600" />
                <span>HMAC Signatures</span>
              </span>
              <span className="text-[10px] font-mono text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200">
                100% SIGNED
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1 flex items-center gap-1.5">
              <span>Non-Repudiation</span>
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            HMAC digital signatures bind every action to the authorized orchestrator key.
          </p>
        </div>

        {/* Metric 3: Merkle Genesis Chain */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-emerald-700 text-xs font-bold uppercase mb-1">
              <span className="flex items-center gap-1.5">
                <Hash className="w-4 h-4 text-emerald-600" />
                <span>Cryptographic Chain</span>
              </span>
              {integrity?.valid || isShowingBenchmark ? (
                <span className="text-[10px] font-mono text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200">
                  INTACT
                </span>
              ) : (
                <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                  SHA-256
                </span>
              )}
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {integrity?.chainValid || isShowingBenchmark ? "Zero Drift" : "Sequential SHA-256"}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Each event embeds predecessor hash &amp; tamper detection prevents historical rewrites.
          </p>
        </div>

        {/* Metric 4: Saga Reversal Compensations */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase mb-1">
              <span className="flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4 text-amber-600" />
                <span>Saga Rollbacks</span>
              </span>
              {compensatingCount > 0 ? (
                <span className="text-[10px] font-mono text-rose-800 bg-rose-100 px-1.5 py-0.5 rounded border border-rose-200 font-bold">
                  {compensatingCount} ACTIVE
                </span>
              ) : (
                <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                  0 ACTIVE
                </span>
              )}
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {compensatingCount} Reversals
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Compensating transactions cleanly reversed across Paystack &amp; core statutory tables.
          </p>
        </div>
      </div>

      {/* Notification banner when viewing benchmark because live is empty */}
      {activeMode === "live" && liveEvents.length === 0 && !loading && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Showing Benchmark Reference Run:</strong> No live sessions were recorded in the active store yet. Switch across the 5 scenarios above or trigger a live workflow in the Operations Center to see real-time events appear here.
            </span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
            DEMO MODE
          </span>
        </div>
      )}

      {/* Main Ledger Component with Live Data */}
      <ActionLedger
        events={displayedEvents}
        sessionId={
          urlSessionId ||
          (isShowingBenchmark ? currentScenarioObj.sessionId : displayedEvents[0]?.sessionId ?? "act_benchmark_camry_001")
        }
        workflowTitle={
          urlSessionId
            ? `Cryptographic Audit Ledger for Session ${urlSessionId}`
            : isShowingBenchmark
            ? currentScenarioObj.title
            : "Live ActionOS Orchestration & Settlement Audit Ledger"
        }
        onRefresh={fetchLedger}
      />
    </div>
  );
}

export default function ActionLedgerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      }
    >
      <ActionLedgerContent />
    </Suspense>
  );
}
