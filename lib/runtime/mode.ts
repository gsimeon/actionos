/**
 * ActionOS Runtime Execution Mode
 * Explicit boundary between deterministic competition sandbox (demo)
 * and hardened production infrastructure.
 */

export type RuntimeMode = "demo" | "production";

/**
 * Resolves the active runtime execution mode.
 * Priority:
 * 1. ACTIONOS_RUNTIME_MODE environment variable ("demo" | "production")
 * 2. DEMO_MODE environment variable ("true" -> demo)
 * 3. NODE_ENV ("production" -> production)
 * 4. Safe default: "demo" (prevents accidental destructive calls in unconfigured dev)
 */
export function getRuntimeMode(): RuntimeMode {
  if (process.env.ACTIONOS_RUNTIME_MODE) {
    const mode = process.env.ACTIONOS_RUNTIME_MODE.toLowerCase().trim();
    return mode === "production" ? "production" : "demo";
  }

  if (process.env.DEMO_MODE === "true") {
    return "demo";
  }

  if (process.env.NODE_ENV === "production") {
    return "production";
  }

  return "demo";
}

export function isProductionMode(): boolean {
  return getRuntimeMode() === "production";
}

export function isDemoMode(): boolean {
  return getRuntimeMode() === "demo";
}
