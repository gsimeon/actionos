import type { MemberRole } from "@/types/database";

export interface PermissionCheckInput {
  role: MemberRole;
  toolName: string;
  amount?: number;
}

export interface PermissionResult {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
}

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  customer: 1,
  agent: 2,
  manager: 3,
  admin: 4,
  super_admin: 5,
};

const ROLE_LIMITS: Record<MemberRole, number> = {
  customer: 500_000,
  agent: 2_000_000,
  manager: 10_000_000,
  admin: Infinity,
  super_admin: Infinity,
};

export class ActionOSPermissions {
  /**
   * Verify if a role is permitted to run a given tool and if transaction limit is respected.
   */
  static checkPermission(input: PermissionCheckInput): PermissionResult {
    const { role, toolName, amount } = input;

    // Check financial limit if tool has a transaction amount
    if (amount !== undefined && amount > 0) {
      const maxAllowed = ROLE_LIMITS[role] || 0;
      if (amount > maxAllowed) {
        return {
          allowed: false,
          requiresApproval: true,
          reason: `Role '${role}' cannot authorize transactions exceeding ₦${maxAllowed.toLocaleString()}. Requires manager or admin override.`,
        };
      }
    }

    // Role-specific tool policies
    switch (toolName) {
      case "get_customer":
      case "get_policy":
      case "check_renewal_eligibility":
      case "get_quote":
      case "request_payment":
      case "verify_payment":
      case "renew_policy":
      case "generate_certificate":
      case "send_notification":
      case "schedule_reminder":
        return { allowed: true, requiresApproval: false };

      case "override_underwriting":
      case "cancel_policy":
        if (ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.manager) {
          return { allowed: true, requiresApproval: false };
        }
        return {
          allowed: false,
          requiresApproval: true,
          reason: `Tool '${toolName}' requires manager role or higher.`,
        };

      default:
        // Default permit for registered standard tools
        return { allowed: true, requiresApproval: false };
    }
  }
}
