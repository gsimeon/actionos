import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { orchestrator, sanitizeAudioUrl } from "@/lib/actionos/orchestrator";
import { verifyLedgerIntegrity } from "@/lib/actionos/crypto-ledger";
import { getRepositoryContainer, setRepositoryContainer } from "@/lib/repositories";
import { DemoRepositoryContainer } from "@/lib/repositories/demo/demo-repositories";
import { DEMO_CONTEXT } from "@/lib/security/auth-context";
import { resetStore } from "@/lib/actionos/mock-store";

describe("Action Ledger Persistence Integrity & Audio Privacy Alignment", () => {
  beforeEach(() => {
    resetStore();
    const repos = new DemoRepositoryContainer();
    setRepositoryContainer(repos);
  });

  describe("Audio Privacy Policy & Storage Alignment", () => {
    it("should sanitize signed query parameters and access tokens from audio URLs", () => {
      const rawSignedUrl = "https://storage.actionos.ng/audio/sample_voice.wav?X-Amz-Signature=secret123&token=jwt.tok.456#segment1";
      const sanitized = sanitizeAudioUrl(rawSignedUrl);

      assert.equal(sanitized, "https://storage.actionos.ng/audio/sample_voice.wav");
      assert.ok(!sanitized?.includes("secret123"));
      assert.ok(!sanitized?.includes("jwt.tok.456"));
    });

    it("should nullify input_audio_url in persisted session when rawInputRetained is false (default privacy policy)", async () => {
      const repos = getRepositoryContainer();
      const signedAudioUrl = "https://storage.actionos.ng/incoming/rec_001.wav?token=signed_access_token_12345";

      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew Toyota Camry AUTO-2026-00182",
        inputAudioUrl: signedAudioUrl,
        channel: "voice",
        executionContext: DEMO_CONTEXT,
      });

      const session = await repos.sessions.findById(startRes.sessionId);
      assert.ok(session);

      // Verify that database record strictly nullified the raw audio URL in accordance with declared policy
      assert.equal(
        session.input_audio_url,
        null,
        "input_audio_url must NOT be persisted in DB when rawInputRetained is false"
      );

      // Verify metadata explicitly describes the actual behavior
      const metadata = session.metadata as Record<string, unknown>;
      const retentionPolicy = metadata.retentionPolicy as Record<string, unknown>;
      assert.equal(retentionPolicy.rawInputRetained, false);
      assert.equal(retentionPolicy.rawAudioRetained, false);
      assert.equal(retentionPolicy.audioRetentionMode, "ephemeral_discarded_post_transcription");

      const audioHandling = metadata.audioHandling as Record<string, unknown>;
      assert.equal(audioHandling.audioProvided, true);
      assert.equal(audioHandling.rawInputRetained, false);
      assert.equal(audioHandling.storageBehavior, "ephemeral_discarded_post_transcription");
    });

    it("should sanitize audio URL when retention is explicitly opted into (retainAudio: true)", async () => {
      const repos = getRepositoryContainer();
      const signedAudioUrl = "https://storage.actionos.ng/incoming/rec_002.wav?token=signed_access_token_67890&sig=hmac";

      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew Toyota Camry AUTO-2026-00182",
        inputAudioUrl: signedAudioUrl,
        retainAudio: true,
        channel: "voice",
        executionContext: DEMO_CONTEXT,
      });

      const session = await repos.sessions.findById(startRes.sessionId);
      assert.ok(session);

      // Must be sanitized: access tokens and HMAC signatures stripped
      assert.equal(session.input_audio_url, "https://storage.actionos.ng/incoming/rec_002.wav");
      assert.ok(!session.input_audio_url?.includes("signed_access_token"));

      const metadata = session.metadata as Record<string, unknown>;
      const retentionPolicy = metadata.retentionPolicy as Record<string, unknown>;
      assert.equal(retentionPolicy.rawInputRetained, true);
      assert.equal(retentionPolicy.rawAudioRetained, true);
      assert.equal(retentionPolicy.audioRetentionMode, "sanitized_retained");
    });
  });

  describe("Action Ledger Integrity After Persistence & Retrieval", () => {
    it("should verify complete cryptographic integrity on persisted and reloaded ledger events", async () => {
      const repos = getRepositoryContainer();

      // 1. Run workflow through execution to create multiple chained events
      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew Toyota Camry AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      const quoteId = startRes.authorizationDetails!.quoteId;
      const authRes = await orchestrator.authorizeAndExecute(
        startRes.sessionId,
        true,
        DEMO_CONTEXT,
        { authorizedQuoteId: quoteId }
      );
      assert.equal(authRes.status, "completed");

      // 2. Read events back from persistent repository
      const persistedEvents = await repos.ledger.getEventsBySessionId(startRes.sessionId, DEMO_CONTEXT);
      assert.ok(persistedEvents.length >= 4, "Must have produced sequential ledger events");

      // 3. Verify clean baseline passes with signatures and key version check
      const baselineAudit = verifyLedgerIntegrity(persistedEvents, {
        verifySignatures: true,
        requireKeyVersion: "v1-2026",
      });
      assert.equal(baselineAudit.valid, true, "Persisted ledger must verify with 100% cryptographic integrity");

      // 4. Tamper Test A: Attacker alters eventClass on persisted event
      const tamperedClassEvents = JSON.parse(JSON.stringify(persistedEvents));
      tamperedClassEvents[1].eventClass =
        persistedEvents[1].eventClass === "critical" ? "informational" : "critical";
      const classAudit = verifyLedgerIntegrity(tamperedClassEvents);
      assert.equal(classAudit.valid, false, "Altering eventClass must fail verification");
      assert.equal(classAudit.tamperedIndex, 1);
      assert.match(classAudit.reason || "", /Invalid event hash at index 1/);

      // 5. Tamper Test B: Attacker alters signingKeyVersion
      const tamperedKeyEvents = JSON.parse(JSON.stringify(persistedEvents));
      tamperedKeyEvents[2].signingKeyVersion = "v2-forged";
      const keyAudit = verifyLedgerIntegrity(tamperedKeyEvents);
      assert.equal(keyAudit.valid, false, "Altering signingKeyVersion must fail verification");
      assert.equal(keyAudit.tamperedIndex, 2);
      assert.match(keyAudit.reason || "", /Invalid event hash at index 2/);

      // 6. Tamper Test C: Attacker removes sequenceNumber
      const tamperedSeqEvents = JSON.parse(JSON.stringify(persistedEvents));
      delete tamperedSeqEvents[1].sequenceNumber;
      const seqAudit = verifyLedgerIntegrity(tamperedSeqEvents);
      assert.equal(seqAudit.valid, false, "Missing sequenceNumber must fail verification");
      assert.equal(seqAudit.tamperedIndex, 1);
      assert.match(seqAudit.reason || "", /Broken sequence continuity/);

      // 7. Tamper Test D: Attacker removes previousHash
      const tamperedPrevEvents = JSON.parse(JSON.stringify(persistedEvents));
      tamperedPrevEvents[2].previousHash = "";
      const prevAudit = verifyLedgerIntegrity(tamperedPrevEvents);
      assert.equal(prevAudit.valid, false, "Missing previousHash must fail verification");
      assert.equal(prevAudit.tamperedIndex, 2);
      assert.match(prevAudit.reason || "", /Missing previousHash/);

      // 8. Tamper Test E: Attacker reorders events
      const reorderedEvents = JSON.parse(JSON.stringify(persistedEvents));
      const swap = reorderedEvents[1];
      reorderedEvents[1] = reorderedEvents[2];
      reorderedEvents[2] = swap;
      const reorderAudit = verifyLedgerIntegrity(reorderedEvents);
      assert.equal(reorderAudit.valid, false, "Reordered events must fail verification");
    });
  });
});
