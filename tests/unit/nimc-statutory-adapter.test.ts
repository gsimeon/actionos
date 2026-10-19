import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NimcGatewayClient,
  nimcGatewayClient,
  NimcGatewayError,
} from "@/lib/integrations/nimc";

describe("NIMC Statutory National Identity Gateway Adapter Test Suite", () => {
  const client = new NimcGatewayClient();

  describe("1. Identifier Format Validation", () => {
    it("should accept valid 11-digit numeric raw NIN", () => {
      const res = client.validateIdentifierFormat("12345678901");
      assert.equal(res.isValid, true);
      assert.equal(res.type, "raw_nin");
    });

    it("should accept valid formatted 11-digit NIN with spaces or hyphens", () => {
      const res = client.validateIdentifierFormat("123-456-789-01");
      assert.equal(res.isValid, true);
      assert.equal(res.type, "raw_nin");
    });

    it("should accept valid 16-character alphanumeric vNIN", () => {
      const res = client.validateIdentifierFormat("AB1234CD56EF78GH");
      assert.equal(res.isValid, true);
      assert.equal(res.type, "vnin");
    });

    it("should reject invalid length or non-alphanumeric identifiers", () => {
      assert.equal(client.validateIdentifierFormat("12345").isValid, false);
      assert.equal(client.validateIdentifierFormat("1234567890123").isValid, false);
      assert.equal(client.validateIdentifierFormat("NIN-INVALID!").isValid, false);
    });
  });

  describe("2. Statutory Identity Resolution", () => {
    it("should resolve valid raw NIN and return masked identity with statutory reference", async () => {
      const result = await client.verifyIdentity("12345678901");

      assert.equal(result.found, true);
      assert.equal(result.verified, true);
      assert.equal(result.identityType, "raw_nin");
      assert.equal(result.maskedNin, "123*****901");
      assert.ok(result.authority.includes("National Identity Management Commission"));
      assert.ok(result.statutoryAct.includes("NIMC Act No. 23 of 2007"));
      assert.equal(result.verificationHash.length, 64);
      assert.equal(result.isSimulated, true);
      assert.equal(result.enrollee.firstname, "Aliko");
      assert.equal(result.enrollee.surname, "Bello");
    });

    it("should resolve 16-char vNIN token and mask appropriately", async () => {
      const result = await client.verifyIdentity("AB1234CD56EF78GH");

      assert.equal(result.found, true);
      assert.equal(result.identityType, "vnin");
      assert.equal(result.maskedNin, "AB12-****-****-78GH");
    });

    it("should export singleton instance nimcGatewayClient", () => {
      assert.ok(nimcGatewayClient instanceof NimcGatewayClient);
    });
  });

  describe("3. Demographic & Biometric Verification", () => {
    it("should verify matching demographics with high confidence score", async () => {
      const result = await client.verifyIdentity("12345678901", {
        demographics: {
          firstname: "Aliko",
          surname: "Bello",
          gender: "M",
          dateOfBirth: "1988-06-14",
        },
      });

      assert.equal(result.demographicMatch.matched, true);
      assert.equal(result.demographicMatch.confidenceScore, 100);
      assert.equal(result.demographicMatch.matchedFields.length, 4);
      assert.equal(result.demographicMatch.mismatchedFields.length, 0);
    });

    it("should flag mismatched demographics when queried fields do not match", async () => {
      const result = await client.verifyIdentity("12345678901", {
        demographics: {
          firstname: "Chinedu",
          surname: "Okonkwo",
          gender: "M",
        },
        minimumMatchScore: 80,
      });

      assert.equal(result.demographicMatch.matched, false);
      assert.ok(result.demographicMatch.confidenceScore < 80);
      assert.ok(result.demographicMatch.mismatchedFields.includes("firstname"));
      assert.ok(result.demographicMatch.mismatchedFields.includes("surname"));
    });

    it("should score facial biometric match when face image is provided", async () => {
      const result = await client.verifyIdentity("12345678901", {
        biometrics: {
          faceImageBase64: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        },
      });

      assert.ok(result.biometricMatch);
      assert.equal(result.biometricMatch.verified, true);
      assert.equal(result.biometricMatch.modality, "facial");
      assert.ok(result.biometricMatch.matchScore > 90);
    });
  });

  describe("4. Security & Edge Case Handling", () => {
    it("should throw NIMC_SUSPENDED_IDENTITY when querying flagged identity", async () => {
      await assert.rejects(
        async () => {
          await client.verifyIdentity("00000000000");
        },
        (err: Error) => {
          assert.ok(err instanceof NimcGatewayError);
          assert.equal((err as NimcGatewayError).code, "NIMC_SUSPENDED_IDENTITY");
          return true;
        }
      );
    });

    it("should throw NIMC_RECORD_NOT_FOUND when querying unregistered NIN", async () => {
      await assert.rejects(
        async () => {
          await client.verifyIdentity("99999999999");
        },
        (err: Error) => {
          assert.ok(err instanceof NimcGatewayError);
          assert.equal((err as NimcGatewayError).code, "NIMC_RECORD_NOT_FOUND");
          return true;
        }
      );
    });

    it("should throw NIMC_INVALID_FORMAT for invalid format string", async () => {
      await assert.rejects(
        async () => {
          await client.verifyIdentity("INVALID-NIN");
        },
        (err: Error) => {
          assert.ok(err instanceof NimcGatewayError);
          assert.equal((err as NimcGatewayError).code, "NIMC_INVALID_FORMAT");
          return true;
        }
      );
    });
  });
});
