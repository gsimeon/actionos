import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NhiaGatewayClient,
  NhiaGatewayError,
  normalizeNhiaNumber,
  validateNhiaNumber,
  TIER_ANNUAL_PREMIUMS,
  nhiaGateway,
} from "@/lib/integrations/nhia";

describe("Hardened NHIA Statutory Health Insurance Gateway Adapter Suite", () => {
  describe("1. Parameter Validation & Normalization", () => {
    it("should reject query when both NHIA Number and NIN are omitted", async () => {
      const client = new NhiaGatewayClient();
      await assert.rejects(
        () => client.verifyEnrollee({}),
        (err: unknown) => {
          assert.ok(err instanceof NhiaGatewayError);
          assert.equal(err.code, "NHIA_INVALID_INPUT");
          assert.ok(err.message.includes("Either NHIA Enrollee Number or National Identification Number"));
          return true;
        }
      );
    });

    it("should reject malformed NHIA number format", async () => {
      const client = new NhiaGatewayClient();
      await assert.rejects(
        () => client.verifyEnrollee({ nhiaNumber: "INVALID-XYZ" }),
        (err: unknown) => {
          assert.ok(err instanceof NhiaGatewayError);
          assert.equal(err.code, "NHIA_INVALID_INPUT");
          assert.ok(err.message.includes("Invalid NHIA Enrollee ID format"));
          return true;
        }
      );
    });

    it("should reject malformed NIN format", async () => {
      const client = new NhiaGatewayClient();
      await assert.rejects(
        () => client.verifyEnrollee({ nin: "12345" }), // less than 11 digits
        (err: unknown) => {
          assert.ok(err instanceof NhiaGatewayError);
          assert.equal(err.code, "NHIA_INVALID_INPUT");
          assert.ok(err.message.includes("Must be 11 numeric digits"));
          return true;
        }
      );
    });

    it("should normalize diverse NHIA string formats", () => {
      assert.equal(normalizeNhiaNumber("nhia 2026 00812"), "NHIA-2026-00812");
      assert.equal(normalizeNhiaNumber("  nhia_lag_2026_0412  "), "NHIA-LAG-2026-0412");
      assert.equal(normalizeNhiaNumber("NHIA.2026.00999"), "NHIA-2026-00999");
    });

    it("should validate legitimate NHIA IDs", () => {
      assert.equal(validateNhiaNumber("NHIA-2026-00812").valid, true);
      assert.equal(validateNhiaNumber("NHIA/LAG/2026/0412").valid, true);
      assert.equal(validateNhiaNumber("NHIA202600812").valid, true);
    });

    it("should reject invalid NHIA IDs", () => {
      assert.equal(validateNhiaNumber("").valid, false);
      assert.equal(validateNhiaNumber("   ").valid, false);
      assert.equal(validateNhiaNumber("XYZ-123").valid, false);
    });
  });

  describe("2. Production Security & Fail-Closed Guardrails", () => {
    it("should throw NHIA_CONFIGURATION_ERROR in production mode if API key is missing", async () => {
      const prevMode = process.env.ACTIONOS_RUNTIME_MODE;
      const prevKey = process.env.NHIA_API_KEY;

      try {
        process.env.ACTIONOS_RUNTIME_MODE = "production";
        delete process.env.NHIA_API_KEY;

        const prodClient = new NhiaGatewayClient();
        await assert.rejects(
          () => prodClient.verifyEnrollee({ nhiaNumber: "NHIA-2026-00812" }),
          (err: unknown) => {
            assert.ok(err instanceof NhiaGatewayError);
            assert.equal(err.code, "NHIA_CONFIGURATION_ERROR");
            assert.ok(err.message.includes("Production mode error: NHIA_API_KEY must be configured"));
            return true;
          }
        );
      } finally {
        process.env.ACTIONOS_RUNTIME_MODE = prevMode;
        if (prevKey) {
          process.env.NHIA_API_KEY = prevKey;
        } else {
          delete process.env.NHIA_API_KEY;
        }
      }
    });

    it("should throw NHIA_CONFIGURATION_ERROR in production mode for card issuance if API key is missing", async () => {
      const prevMode = process.env.ACTIONOS_RUNTIME_MODE;
      const prevKey = process.env.NHIA_API_KEY;

      try {
        process.env.ACTIONOS_RUNTIME_MODE = "production";
        delete process.env.NHIA_API_KEY;

        const prodClient = new NhiaGatewayClient();
        await assert.rejects(
          () =>
            prodClient.issueDigitalHmoCard({
              nhiaNumber: "NHIA-2026-00812",
              enrolleeName: "Chief Adeleke Olawale",
              hmoProviderId: "HMO-RELIANCE-01",
              hmoProviderName: "Reliance HMO",
              tier: "silver",
              primaryHcpName: "Lagoon Hospital Ikoyi",
              primaryHcpId: "HCP-LAG-001",
              coverageStartDate: "2026-10-17",
              coverageEndDate: "2027-10-17",
              premiumPaid: 95000,
            }),
          (err: unknown) => {
            assert.ok(err instanceof NhiaGatewayError);
            assert.equal(err.code, "NHIA_CONFIGURATION_ERROR");
            return true;
          }
        );
      } finally {
        process.env.ACTIONOS_RUNTIME_MODE = prevMode;
        if (prevKey) {
          process.env.NHIA_API_KEY = prevKey;
        } else {
          delete process.env.NHIA_API_KEY;
        }
      }
    });
  });

  describe("3. Enrollee Verification & Tier Actuarial Modeling", () => {
    it("should authoritatively verify enrollee by NHIA ID in demo mode", async () => {
      const client = new NhiaGatewayClient();
      const res = await client.verifyEnrollee({ nhiaNumber: "NHIA-2026-00812" });

      assert.equal(res.found, true);
      assert.equal(res.verified, true);
      assert.equal(res.enrolleeName, "Demo Enrollee (Emeka Adebayo)");
      assert.equal(res.tier, "silver");
      assert.equal(res.annualPremium, 95000);
      assert.equal(res.primaryHcpName, "Lagoon Hospital Ikoyi");
      assert.equal(res.activeStatus, "expiring_soon");
      assert.equal(res.eligibleForRenewal, true);
      assert.ok(res.preclearanceToken.length > 20);
      assert.ok(res.statutoryNotice.includes("Simulated verification"));
    });

    it("should authoritatively verify enrollee by Nigerian NIN", async () => {
      const client = new NhiaGatewayClient();
      const res = await client.verifyEnrollee({ nin: "12345678901" });

      assert.equal(res.found, true);
      assert.equal(res.verified, true);
      assert.equal(res.nhiaNumber, "NHIA-2026-00812");
      assert.equal(res.nin, "12345678901");
    });

    it("should generate simulated record deterministically for unseeded NHIA IDs", async () => {
      const client = new NhiaGatewayClient();
      const res = await client.verifyEnrollee({ nhiaNumber: "NHIA-2026-99999" });

      assert.equal(res.found, true);
      assert.equal(res.verified, true);
      assert.equal(res.isSimulated, true);
      assert.ok(res.annualPremium > 0);
      assert.ok(res.primaryHcpName.length > 0);
    });

    it("should evaluate tier annual premiums correctly across all tiers", () => {
      assert.equal(TIER_ANNUAL_PREMIUMS.bronze, 45000);
      assert.equal(TIER_ANNUAL_PREMIUMS.silver, 95000);
      assert.equal(TIER_ANNUAL_PREMIUMS.gold, 185000);
      assert.equal(TIER_ANNUAL_PREMIUMS.platinum, 350000);
    });
  });

  describe("4. Accredited Healthcare Provider (HCP) Directory", () => {
    it("should retrieve full list of accredited benchmark hospitals", () => {
      const client = new NhiaGatewayClient();
      const allHospitals = client.listAccreditedHospitals();
      assert.ok(allHospitals.length >= 5);
      assert.ok(allHospitals.some((h) => h.name.includes("Lagoon Hospital")));
      assert.ok(allHospitals.some((h) => h.name.includes("Reddington")));
      assert.ok(allHospitals.some((h) => h.name.includes("National Hospital Abuja")));
    });

    it("should filter accredited hospitals by state", () => {
      const client = new NhiaGatewayClient();
      const lagosHospitals = client.listAccreditedHospitals({ state: "Lagos" });
      assert.ok(lagosHospitals.length >= 3);
      assert.ok(lagosHospitals.every((h) => h.state === "Lagos"));

      const abujaHospitals = client.listAccreditedHospitals({ state: "FCT Abuja" });
      assert.ok(abujaHospitals.length >= 1);
      assert.equal(abujaHospitals[0].city, "Central Business District");
    });

    it("should filter accredited hospitals by tier eligibility", () => {
      const client = new NhiaGatewayClient();
      const bronzeHospitals = client.listAccreditedHospitals({ tier: "bronze" });
      // Reddington requires silver, gold, or platinum, so it should not appear in bronze
      assert.ok(!bronzeHospitals.some((h) => h.name.includes("Reddington")));
      assert.ok(bronzeHospitals.some((h) => h.name.includes("Lagoon")));
    });
  });

  describe("5. Digital HMO Card Issuance & Cryptographic Sealing", () => {
    it("should issue authenticated digital HMO card with cryptographic verification hash", async () => {
      const client = new NhiaGatewayClient();
      const res = await client.issueDigitalHmoCard({
        nhiaNumber: "NHIA-2026-00812",
        enrolleeName: "Chief Adeleke Olawale",
        hmoProviderId: "HMO-RELIANCE-01",
        hmoProviderName: "Reliance HMO",
        tier: "silver",
        primaryHcpName: "Lagoon Hospital Ikoyi",
        primaryHcpId: "HCP-LAG-001",
        coverageStartDate: "2026-10-17",
        coverageEndDate: "2027-10-17",
        premiumPaid: 95000,
        bloodGroup: "O+",
        genotype: "AA",
        dependentsCount: 3,
      });

      assert.equal(res.success, true);
      assert.ok(res.digitalCardNumber.startsWith("HMO-SILVER-2026-"));
      assert.ok(res.nhiaVerificationUid.startsWith("NHIA-CARD-"));
      assert.ok(res.qrVerificationUrl.includes(res.nhiaVerificationUid));
      assert.equal(res.verificationHash.length, 64); // SHA-256
      assert.ok(res.authority.includes("National Health Insurance Authority"));
      assert.ok(res.statutoryNotice.includes("Official electronic health insurance card"));
    });

    it("should reject card issuance when mandatory parameters are missing", async () => {
      const client = new NhiaGatewayClient();
      await assert.rejects(
        () =>
          client.issueDigitalHmoCard({
            nhiaNumber: "",
            enrolleeName: "Chief Adeleke",
            hmoProviderId: "HMO-01",
            hmoProviderName: "Reliance",
            tier: "silver",
            primaryHcpName: "Lagoon Hospital",
            primaryHcpId: "HCP-01",
            coverageStartDate: "2026-10-17",
            coverageEndDate: "2027-10-17",
            premiumPaid: 95000,
          }),
        (err: unknown) => {
          assert.ok(err instanceof NhiaGatewayError);
          assert.equal(err.code, "NHIA_INVALID_INPUT");
          return true;
        }
      );
    });

    it("should export singleton instance nhiaGateway", () => {
      assert.ok(nhiaGateway instanceof NhiaGatewayClient);
    });
  });
});
