export type StellarChainMode = "TESTNET" | "DETERMINISTIC";

export type StellarModeRuntime =
  | { evidenceLabel: "STELLAR TESTNET"; mode: "TESTNET"; sandbox: true }
  | { evidenceLabel: "DETERMINISTIC REHEARSAL"; mode: "DETERMINISTIC"; sandbox: true };

/** Selection is exhaustive by construction; an unavailable Testnet never becomes a rehearsal. */
export function selectStellarMode(input:
  | { mode: "TESTNET"; testnetConfigured: boolean }
  | { mode: "DETERMINISTIC" }
): StellarModeRuntime {
  if (input.mode === "DETERMINISTIC") {
    return { evidenceLabel: "DETERMINISTIC REHEARSAL", mode: "DETERMINISTIC", sandbox: true };
  }
  if (!input.testnetConfigured) throw new Error("Stellar TESTNET mode requires complete Testnet configuration; deterministic fallback is forbidden.");
  return { evidenceLabel: "STELLAR TESTNET", mode: "TESTNET", sandbox: true };
}
