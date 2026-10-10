import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DeterministicDemoAIProvider } from "@/lib/ai/n-atlas";
import {
  detectNigerianLanguageFromText,
  formatVehicleFoundMessage,
  formatVehicleNotFoundMessage,
  formatVehicleRegisteredMessage,
} from "@/lib/ai/nigerian-languages";
import { QueryVehicleTool } from "@/lib/actionos/tools/query-vehicle";
import { RegisterVehicleTool } from "@/lib/actionos/tools/register-vehicle";
import { getRepositoryContainer, type TenantContext } from "@/lib/repositories";
import { resetStore } from "@/lib/actionos/mock-store";
import { DEMO_CONTEXT } from "@/lib/security/auth-context";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";
import type { Asset } from "@/types/database";

describe("Nigerian Multilingual Understanding & Vehicle Database Querying", () => {
  const nAtlas = new DeterministicDemoAIProvider();

  describe("N-ATLAS Multilingual Intent & Entity Recognition", () => {
    it("should detect vehicle query in English with plate extraction", async () => {
      const res = await nAtlas.understand({
        text: "Query vehicle database for car ABC-123-XY",
        language: "en-NG",
      });

      assert.equal(res.intent, "query_vehicle");
      assert.equal(res.entities.vehiclePlate, "ABC-123-XY");
      assert.ok(res.confidence >= 0.95);
    });

    it("should detect vehicle query in Nigerian Pidgin", async () => {
      const res = await nAtlas.understand({
        text: "Check my motor ABC-123-XY for inside vehicle database sharp sharp",
        language: "pcm",
      });

      assert.equal(res.intent, "query_vehicle");
      assert.equal(res.entities.vehiclePlate, "ABC-123-XY");
      assert.equal(res.entities.detectedLanguage, "pcm");
      assert.equal(res.entities.urgency, "high");
    });

    it("should detect vehicle query in Yorùbá", async () => {
      const res = await nAtlas.understand({
        text: "Ṣayẹwo ọkọ ABC-123-XY ninu data ọkọ ayọkẹlẹ",
        language: "yo",
      });

      assert.equal(res.intent, "query_vehicle");
      assert.equal(res.entities.vehiclePlate, "ABC-123-XY");
      assert.equal(res.entities.detectedLanguage, "yo");
    });

    it("should detect vehicle query in Hausa", async () => {
      const res = await nAtlas.understand({
        text: "Duba motata ABC-123-XY a cikin ma'adanar bayanan mota",
        language: "ha",
      });

      assert.equal(res.intent, "query_vehicle");
      assert.equal(res.entities.vehiclePlate, "ABC-123-XY");
      assert.equal(res.entities.detectedLanguage, "ha");
    });

    it("should detect vehicle query in Igbo", async () => {
      const res = await nAtlas.understand({
        text: "Lelee ụgbọ ala m ABC-123-XY n'ọdụ data",
        language: "ig",
      });

      assert.equal(res.intent, "query_vehicle");
      assert.equal(res.entities.vehiclePlate, "ABC-123-XY");
      assert.equal(res.entities.detectedLanguage, "ig");
    });

    it("should detect vehicle registration in Nigerian Pidgin", async () => {
      const res = await nAtlas.understand({
        text: "I wan register my motor KJA-882-AB sharp sharp",
        language: "pcm",
      });

      assert.equal(res.intent, "register_vehicle");
      assert.equal(res.entities.vehiclePlate, "KJA-882-AB");
      assert.equal(res.entities.detectedLanguage, "pcm");
    });

    it("should detect vehicle registration in Yorùbá", async () => {
      const res = await nAtlas.understand({
        text: "Mo fẹ forukọsilẹ ọkọ mi tuntun",
        language: "yo",
      });

      assert.equal(res.intent, "register_vehicle");
      assert.equal(res.entities.detectedLanguage, "yo");
    });

    it("should detect vehicle registration in Hausa", async () => {
      const res = await nAtlas.understand({
        text: "Ina so in yi rijistar motata",
        language: "ha",
      });

      assert.equal(res.intent, "register_vehicle");
      assert.equal(res.entities.detectedLanguage, "ha");
    });

    it("should detect vehicle registration in Igbo", async () => {
      const res = await nAtlas.understand({
        text: "Achọrọ m idebanye aha ụgbọ ala m",
        language: "ig",
      });

      assert.equal(res.intent, "register_vehicle");
      assert.equal(res.entities.detectedLanguage, "ig");
    });

    it("should auto-detect Nigerian Pidgin without explicit language code", async () => {
      const detected = detectNigerianLanguageFromText("Wetin be the status of my motor ABC-123-XY abeg");
      assert.equal(detected, "pcm");
    });

    it("should auto-detect Yorùbá without explicit language code", async () => {
      const detected = detectNigerianLanguageFromText("Ba mi ṣayẹwo ọkọ ayọkẹlẹ mi");
      assert.equal(detected, "yo");
    });

    it("should auto-detect Hausa without explicit language code", async () => {
      const detected = detectNigerianLanguageFromText("Ina so in duba motata a cikin ma'ajiya");
      assert.equal(detected, "ha");
    });

    it("should auto-detect Igbo without explicit language code", async () => {
      const detected = detectNigerianLanguageFromText("Biko lelee ụgbọ ala m ugbu a");
      assert.equal(detected, "ig");
    });
  });

  describe("Multilingual Response Formatting", () => {
    const sampleVehicle: Asset = {
      id: "10000000-0000-0000-0000-000000000001",
      customer_id: "f0000000-0000-0000-0000-000000000001",
      asset_type: "vehicle",
      name: "Toyota Camry",
      identifier: "ABC-123-XY",
      metadata: {
        year: 2022,
        color: "Midnight Black",
        chassis_number: "DEMO-VIN-000001",
        engine_number: "DEMO-ENGINE-000001",
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it("should format vehicle found message in all 5 Nigerian languages", () => {
      const en = formatVehicleFoundMessage(sampleVehicle, "Demo Customer", "en-NG");
      assert.ok(en.includes("Toyota Camry"));
      assert.ok(en.includes("ABC-123-XY"));
      assert.ok(en.includes("DEMO-VIN-000001"));

      const pcm = formatVehicleFoundMessage(sampleVehicle, "Demo Customer", "pcm");
      assert.ok(pcm.includes("We don see your motor"));
      assert.ok(pcm.includes("Chassis number: DEMO-VIN-000001"));

      const yo = formatVehicleFoundMessage(sampleVehicle, "Demo Customer", "yo");
      assert.ok(yo.includes("A ti rí ọkọ rẹ"));
      assert.ok(yo.includes("Nọmba chassis: DEMO-VIN-000001"));

      const ha = formatVehicleFoundMessage(sampleVehicle, "Demo Customer", "ha");
      assert.ok(ha.includes("Mun sami motarka"));
      assert.ok(ha.includes("Lambar chassis: DEMO-VIN-000001"));

      const ig = formatVehicleFoundMessage(sampleVehicle, "Demo Customer", "ig");
      assert.ok(ig.includes("Anyị ahụla ụgbọ ala gị"));
      assert.ok(ig.includes("Nọmba chassis: DEMO-VIN-000001"));
    });

    it("should format vehicle not found message in all 5 Nigerian languages", () => {
      const pcm = formatVehicleNotFoundMessage("XYZ-999-ZZ", "pcm");
      assert.ok(pcm.includes("We no see any motor record"));

      const yo = formatVehicleNotFoundMessage("XYZ-999-ZZ", "yo");
      assert.ok(yo.includes("A kò rí ọkọ kankan"));

      const ha = formatVehicleNotFoundMessage("XYZ-999-ZZ", "ha");
      assert.ok(ha.includes("Ba a sami bayanan mota"));

      const ig = formatVehicleNotFoundMessage("XYZ-999-ZZ", "ig");
      assert.ok(ig.includes("Ahụghị akwụkwọ ndekọ ụgbọ ala"));

      const en = formatVehicleNotFoundMessage("XYZ-999-ZZ", "en-NG");
      assert.ok(en.includes("No existing vehicle record found"));
    });

    it("should format vehicle registered message in all 5 Nigerian languages", () => {
      const token = "NIID-2026-VAL-123456";

      const pcm = formatVehicleRegisteredMessage(sampleVehicle, token, "pcm");
      assert.ok(pcm.includes("Oya! Vehicle registration don succeed"));
      assert.ok(pcm.includes(token));

      const yo = formatVehicleRegisteredMessage(sampleVehicle, token, "yo");
      assert.ok(yo.includes("Iforukọsilẹ ọkọ ti pari ni aṣeyọri"));
      assert.ok(yo.includes(token));

      const ha = formatVehicleRegisteredMessage(sampleVehicle, token, "ha");
      assert.ok(ha.includes("An kammala rijistar mota cikin nasara"));
      assert.ok(ha.includes(token));

      const ig = formatVehicleRegisteredMessage(sampleVehicle, token, "ig");
      assert.ok(ig.includes("Ndebanye aha ụgbọ ala gara nke ọma"));
      assert.ok(ig.includes(token));
    });
  });

  describe("Vehicle Repository & Tools Execution", () => {
    it("should query vehicle repository by plate and VIN with tenant isolation", async () => {
      resetStore();
      const repos = getRepositoryContainer();

      const tenant1: TenantContext = {
        organizationId: "a0000000-0000-0000-0000-000000000001",
        customerId: "f0000000-0000-0000-0000-000000000001",
      };

      const vehicle = await repos.assets.findByIdentifier("ABC-123-XY", tenant1);
      assert.ok(vehicle);
      assert.equal(vehicle.identifier, "ABC-123-XY");
      assert.equal(vehicle.name, "Toyota Camry");

      // Cross-tenant check: another customer should not see Customer 1's vehicle
      const tenant2: TenantContext = {
        organizationId: "a0000000-0000-0000-0000-000000000001",
        customerId: "f0000000-0000-0000-0000-000000000002",
      };

      const crossCheck = await repos.assets.findByIdentifier("ABC-123-XY", tenant2);
      assert.equal(crossCheck, null, "Customer 2 must not see Customer 1's vehicle");
    });

    it("should execute QueryVehicleTool and cross-verify with FRSC/NIID", async () => {
      resetStore();
      const queryTool = new QueryVehicleTool();

      const context = createWorkflowExecutionContext(DEMO_CONTEXT, {
        sessionId: "sess_query_test",
        planId: "plan_query_1",
        channel: "web",
        language: "pcm",
        isSimulated: true,
      });

      const res = await queryTool.execute({ vehiclePlate: "ABC-123-XY", language: "pcm" }, context);

      assert.equal(res.success, true);
      assert.equal(res.data?.found, true);
      assert.equal(res.data?.plate, "ABC-123-XY");
      assert.equal(res.data?.language, "pcm");
      assert.ok(res.data?.localizedMessage.includes("We don see your motor"));
      assert.ok(res.data?.niidVerification?.frscRegistered);
      assert.ok(res.data?.niidVerification?.preclearanceToken.startsWith("NIID-"));
    });

    it("should execute RegisterVehicleTool and issue statutory preclearance token", async () => {
      resetStore();
      const registerTool = new RegisterVehicleTool();

      const context = createWorkflowExecutionContext(DEMO_CONTEXT, {
        sessionId: "sess_reg_test",
        planId: "plan_reg_1",
        channel: "web",
        language: "yo",
        isSimulated: true,
      });

      const res = await registerTool.execute(
        {
          customerId: DEMO_CONTEXT.customerId,
          vehiclePlate: "LAG-889-YY",
          make: "Toyota",
          model: "Corolla",
          year: 2023,
          color: "Pearl White",
          language: "yo",
        },
        context
      );

      assert.equal(res.success, true);
      assert.equal(res.data?.registered, true);
      assert.equal(res.data?.language, "yo");
      assert.equal(res.data?.vehicle.identifier, "LAG-889-YY");
      assert.ok(res.data?.preclearanceToken.startsWith("NIID-"));
      assert.ok(res.data?.frscRegistrationNumber.includes("LAG-889-YY"));
      assert.ok(res.data?.localizedMessage.includes("Iforukọsilẹ ọkọ ti pari"));

      // Verify the new vehicle is now queryable in the repository
      const repos = getRepositoryContainer();
      const queried = await repos.assets.findByIdentifier("LAG-889-YY", {
        organizationId: DEMO_CONTEXT.organizationId,
        customerId: DEMO_CONTEXT.customerId,
      });
      assert.ok(queried);
      assert.equal(queried.identifier, "LAG-889-YY");
    });
  });
});
