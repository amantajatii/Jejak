import type { WaterfallSubmissionPort } from "../ports/settlement.js";
import {
  DeterministicWaterfallSubmitter,
  type WaterfallSandboxScenario,
} from "./deterministic-waterfall-submitter.js";
import {
  GeneratedWaterfallSubmitter,
  type GeneratedWaterfallSubmitterOptions,
} from "./generated-waterfall-submitter.js";

export type WaterfallSubmitterRuntimeConfig =
  | { mode: "SANDBOX"; scenario?: WaterfallSandboxScenario }
  | { mode: "PRODUCTION"; production?: GeneratedWaterfallSubmitterOptions };

/**
 * One runtime selection point: sandbox never reaches production configuration,
 * while production without its complete signer boundary returns a submitter
 * that fails closed at use rather than falling back to a sandbox success.
 */
export function createRuntimeWaterfallSubmitter(input: WaterfallSubmitterRuntimeConfig): WaterfallSubmissionPort {
  if (input.mode === "SANDBOX") return new DeterministicWaterfallSubmitter(input.scenario);
  return new GeneratedWaterfallSubmitter(input.production ?? {});
}
