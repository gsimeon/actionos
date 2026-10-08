/**
 * ActionOS Data Access & Repository Error Taxonomy
 * Explicitly distinguishes NOT_FOUND, DATABASE_ERROR, and AUTHORIZATION_ERROR
 * rather than silently swallowing database failures.
 */

export class DatabaseError extends Error {
  public readonly code: string;
  public readonly originalError?: unknown;

  constructor(message: string, code: string = "DATABASE_ERROR", originalError?: unknown) {
    super(message);
    this.name = "DatabaseError";
    this.code = code;
    this.originalError = originalError;
  }
}

export class RepositoryNotFoundError extends Error {
  public readonly resource: string;
  public readonly identifier: string;

  constructor(resource: string, identifier: string) {
    super(`${resource} '${identifier}' was not found.`);
    this.name = "RepositoryNotFoundError";
    this.resource = resource;
    this.identifier = identifier;
  }
}

export class TenantIsolationError extends Error {
  public readonly organizationId: string;
  public readonly resource: string;

  constructor(resource: string, organizationId: string) {
    super(`Tenant isolation violation: Access denied to ${resource} outside organization ${organizationId}`);
    this.name = "TenantIsolationError";
    this.resource = resource;
    this.organizationId = organizationId;
  }
}
