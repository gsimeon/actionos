import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as realtime from "@/lib/realtime";

describe("ActionOS Supabase Realtime Suite", () => {
  it("should export all core realtime hooks", () => {
    assert.equal(typeof realtime.useActionSessionRealtime, "function");
    assert.equal(typeof realtime.useLedgerRealtime, "function");
    assert.equal(typeof realtime.useRenewalsRealtime, "function");
    assert.equal(typeof realtime.useNotificationsRealtime, "function");
    assert.equal(typeof realtime.useTransactionsRealtime, "function");
  });
});
