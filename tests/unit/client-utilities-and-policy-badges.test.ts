import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getExpiryBadge } from "@/app/(dashboard)/policies/page";
import { createClient as createBrowserClient } from "@/utils/supabase/client";
import { createClient as createServerClient } from "@/utils/supabase/server";

describe("Client Utilities, Policy Badges & Supabase Client Safety", () => {
  describe("getExpiryBadge Dynamic Reference Dates", () => {
    const referenceDate = new Date("2026-10-16T12:00:00Z");

    it("should classify overdue policies when expiry is in the past", () => {
      const pastDate = "2026-10-10";
      const badge = getExpiryBadge(pastDate, referenceDate);
      assert.ok(badge !== null, "Badge should not be null for overdue");
      // Badge element props
      assert.equal(badge.props.className.includes("text-rose-700"), true);
    });

    it("should classify critical expiry when expiry is within 7 days", () => {
      const dueSoonDate = "2026-10-20";
      const badge = getExpiryBadge(dueSoonDate, referenceDate);
      assert.ok(badge !== null);
      assert.equal(badge.props.className.includes("text-amber-800"), true);
    });

    it("should classify warning expiry when expiry is within 14 days", () => {
      const dueFortnight = "2026-10-28";
      const badge = getExpiryBadge(dueFortnight, referenceDate);
      assert.ok(badge !== null);
      assert.equal(badge.props.className.includes("text-yellow-800"), true);
    });

    it("should classify upcoming expiry when expiry is within 30 days", () => {
      const dueMonth = "2026-11-10";
      const badge = getExpiryBadge(dueMonth, referenceDate);
      assert.ok(badge !== null);
      assert.equal(badge.props.className.includes("text-blue-800"), true);
    });

    it("should return null for policies with distant future expiry", () => {
      const distantFuture = "2027-06-01";
      const badge = getExpiryBadge(distantFuture, referenceDate);
      assert.equal(badge, null);
    });

    it("should use current system date when referenceDate is omitted", () => {
      // Very past date is always overdue
      const past = "2020-01-01";
      const badge = getExpiryBadge(past);
      assert.ok(badge !== null);
      assert.equal(badge.props.className.includes("text-rose-700"), true);
    });
  });

  describe("utils/supabase Client Consistency", () => {
    it("should create browser client using fail-safe demo credentials in test environment", () => {
      const client = createBrowserClient();
      assert.ok(client, "Browser client must be created");
      assert.ok(typeof client.from === "function", "Browser client must have .from method");
    });

    it("should create server client using fail-safe demo credentials in test environment", () => {
      const mockCookieStore = {
        getAll: () => [],
        set: () => {},
      } as unknown as Parameters<typeof createServerClient>[0];
      const client = createServerClient(mockCookieStore);
      assert.ok(client, "Server client must be created");
      assert.ok(typeof client.from === "function", "Server client must have .from method");
    });
  });
});
