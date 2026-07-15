import { canonicalHash } from "../../reliability/canonical-json.js";

import type { ControlCommandContext } from "../control/index.js";

export type RefundSpikeResult = {
  claimId: string;
  eventId: string;
  operationId: string;
  replayed: boolean;
  status: "QUEUED";
  version: number;
};

export interface RefundSpikeRepository {
  inject(input: {
    claimId: string;
    context: ControlCommandContext;
    expectedVersion: number;
    payloadHash: string;
  }): Promise<RefundSpikeResult>;
}

export class RefundSpikeService {
  constructor(private readonly repository: RefundSpikeRepository) {}
  inject(context: ControlCommandContext, input: { claimId: string; expectedVersion: number }) {
    return this.repository.inject({ ...input, context, payloadHash: canonicalHash({ operationId: "injectDemoRefundSpike", ...input }) });
  }
}

