import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveQueryToRecord,
  PRESET_QUERIES,
} from "@/app/verify/page";

describe("ActionOS Public Statutory Verification Portal (/verify) Test Suite", () => {
  describe("1. Preset Quick-Verification Query Sanity", () => {
    it("should provide exactly 5 authoritative presets covering all statutory verticals and security alert", () => {
      assert.equal(PRESET_QUERIES.length, 5);
      const types = PRESET_QUERIES.map((q) => q.type);
      assert.ok(types.includes("motor"));
      assert.ok(types.includes("vehicle_license"));
      assert.ok(types.includes("hmo"));
      assert.ok(types.includes("driver_license"));
    });

    it("should resolve each preset query to a valid or security-flagged record", () => {
      for (const preset of PRESET_QUERIES) {
        const record = resolveQueryToRecord(preset.id);
        assert.ok(record, `Record should resolve for preset ${preset.id}`);
        assert.equal(record.found, true);
        assert.ok(record.merkleHash.length === 64, "Merkle hash must be 64-char SHA-256");
        assert.ok(record.downloadUrl.startsWith("/api/documents/"));
        assert.ok(record.downloadUrl.endsWith("/download"));
      }
    });
  });

  describe("2. Statutory Vertical Resolution & Legal Act Mapping", () => {
    it("should resolve NAICOM/NIID motor insurance policy with statutory Act reference", () => {
      const record = resolveQueryToRecord("ABC-123-XY");
      assert.ok(record);
      assert.equal(record.vertical, "motor");
      assert.equal(record.valid, true);
      assert.ok(record.authority.includes("NAICOM"));
      assert.ok(record.statutoryAct.includes("Insurance Act 2003"));
      assert.equal(record.assetIdentifier, "ABC-123-XY");
      assert.ok(record.underwriterOrAgency.includes("Leadway Assurance"));
      assert.equal(record.theftFlag, undefined);
    });

    it("should resolve LACVIS & MVAA roadworthiness inspection with statutory Act reference", () => {
      const record = resolveQueryToRecord("LND-452-AA");
      assert.ok(record);
      assert.equal(record.vertical, "vehicle_license");
      assert.equal(record.valid, true);
      assert.ok(record.authority.includes("LACVIS") || record.authority.includes("MVAA"));
      assert.ok(record.statutoryAct.includes("Lagos State Road Traffic Law"));
      assert.ok(record.assetDescription.includes("Brake 88%"));
    });

    it("should resolve NHIA Health HMO plan with statutory Act reference", () => {
      const record = resolveQueryToRecord("NHIA-2026-00812");
      assert.ok(record);
      assert.equal(record.vertical, "hmo");
      assert.equal(record.valid, true);
      assert.ok(record.authority.includes("National Health Insurance Authority"));
      assert.ok(record.statutoryAct.includes("National Health Insurance Authority Act 2022"));
      assert.ok(record.underwriterOrAgency.includes("AXA Mansard"));
      assert.equal(record.status, "active");
    });

    it("should resolve FRSC Driver's License registry record with statutory Act reference", () => {
      const record = resolveQueryToRecord("ABC12345678");
      assert.ok(record);
      assert.equal(record.vertical, "driver_license");
      assert.equal(record.valid, true);
      assert.ok(record.authority.includes("FRSC") || record.authority.includes("Federal Road Safety Corps"));
      assert.ok(record.statutoryAct.includes("National Road Traffic Regulations"));
      assert.ok(record.assetDescription.includes("Class E"));
      assert.equal(record.status, "active");
    });
  });

  describe("3. Security Alerts & Stolen Vehicle Flag Detection", () => {
    it("should deterministically flag STOLEN-999-XX with theft alert and invalid statutory status", () => {
      const record = resolveQueryToRecord("STOLEN-999-XX");
      assert.ok(record);
      assert.equal(record.found, true);
      assert.equal(record.valid, false, "Stolen vehicle certificate must NOT be marked valid");
      assert.equal(record.status, "stolen");
      assert.equal(record.theftFlag, true);
      assert.ok(record.certificateNumber.includes("DENIED-THEFT-FLAG"));
      assert.ok(record.preclearanceToken.includes("THEFT_FLAG_ACTIVE_POLICE_ALERT"));
      assert.ok(record.authority.includes("FRSC"));
    });

    it("should detect theft flag query with lower-case or mixed-case 'stolen'", () => {
      const record = resolveQueryToRecord("stolen-car-plate");
      assert.ok(record);
      assert.equal(record.theftFlag, true);
      assert.equal(record.valid, false);
      assert.equal(record.status, "stolen");
    });
  });

  describe("4. Cryptographic Merkle Hash & Verification Uniformity", () => {
    it("should ensure every record contains a valid 64-character SHA-256 Merkle hash", () => {
      const testQueries = ["ABC-123-XY", "LND-452-AA", "NHIA-2026-00812", "ABC12345678", "STOLEN-999-XX", "XYZ-789-BC"];
      const sha256HexRegex = /^[a-f0-9]{64}$/;

      for (const query of testQueries) {
        const record = resolveQueryToRecord(query);
        assert.ok(record);
        assert.ok(
          sha256HexRegex.test(record.merkleHash),
          `Merkle hash ${record.merkleHash} for ${query} must be a valid 64-char lowercase hex string`
        );
      }
    });

    it("should provide consistent fallback behavior for unknown plate queries", () => {
      const record = resolveQueryToRecord("KJA-888-ZZ");
      assert.ok(record);
      assert.equal(record.found, true);
      assert.equal(record.vertical, "motor");
      assert.equal(record.assetIdentifier, "KJA-888-ZZ");
      assert.equal(record.valid, true);
    });
  });
});
