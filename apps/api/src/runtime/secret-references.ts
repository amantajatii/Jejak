import type { SecretReferenceResolver } from "../readiness/runtime-probes.js";

/**
 * Minimal local resolver for externally named environment capabilities.
 * secret:// references deliberately remain unresolved until a custody/vault
 * provider is supplied by deployment composition.
 */
export class EnvironmentSecretReferenceResolver implements SecretReferenceResolver {
  constructor(private readonly environment: NodeJS.ProcessEnv = process.env) {}

  async resolve(reference: string): Promise<string | undefined> {
    const match = /^env:\/\/([A-Z][A-Z0-9_]*)$/.exec(reference);
    if (match === null) return undefined;
    const value = this.environment[match[1]!];
    return value === undefined || value.length === 0 ? undefined : value;
  }
}
