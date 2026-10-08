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
 * 2. NODE_ENV ("production" -> production)
 * 3. Safe default: "demo" (prevents accidental destructive calls in unconfigured dev)
 */
export function getRuntimeMode(): RuntimeMode {
  const envMode = process.env.ACTIONOS_RUNTIME_MODE;
  if (envMode && envMode !== "undefined") {
    const mode = envMode.toLowerCase().trim();
    if (mode !== "demo" && mode !== "production") {
      throw new Error(
        `Invalid ACTIONOS_RUNTIME_MODE '${envMode}'. Must be either 'demo' or 'production'.`
      );
    }
    return mode;
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
