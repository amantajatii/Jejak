import { rpc, scValToNative } from "@stellar/stellar-sdk";

import type { EventPage, StellarRpcPort } from "../ports/stellar-rpc.js";
import { ChainTransportError } from "../ports/stellar-rpc.js";

export class StellarRpcAdapter implements StellarRpcPort {
  readonly #server: rpc.Server;

  constructor(options: { rpcUrl: string; timeoutMs: number }) {
    this.#server = new rpc.Server(options.rpcUrl, {
      allowHttp: options.rpcUrl.startsWith("http://"),
      timeout: options.timeoutMs,
    });
  }

  async getLatestLedger(): Promise<number> {
    try {
      return (await this.#server.getLatestLedger()).sequence;
    } catch (error) {
      throw transport(error);
    }
  }

  async getEvents(input: {
    contractId: string;
    cursor?: string;
    endLedger: number;
    limit: number;
    startLedger: number;
  }): Promise<EventPage> {
    try {
      const filters = [{ contractIds: [input.contractId], type: "contract" as const }];
      const response = input.cursor === undefined
        ? await this.#server.getEvents({
            endLedger: input.endLedger,
            filters,
            limit: input.limit,
            startLedger: input.startLedger,
          })
        : await this.#server.getEvents({ cursor: input.cursor, filters, limit: input.limit });
      return {
        events: response.events.map((event) => ({
          contractId: event.contractId?.contractId() ?? "",
          eventId: event.id,
          inSuccessfulContractCall: event.inSuccessfulContractCall,
          ledgerClosedAt: event.ledgerClosedAt,
          ledgerSequence: event.ledger,
          operationIndex: event.operationIndex,
          rpcCursor: event.id,
          topics: event.topic.map((topic) => scValToNative(topic) as unknown),
          transactionHash: event.txHash,
          transactionIndex: event.transactionIndex,
          value: scValToNative(event.value) as unknown,
        })),
        latestLedger: response.latestLedger,
        ...(response.cursor.length > 0 ? { nextCursor: response.cursor } : {}),
        oldestLedger: response.oldestLedger,
      };
    } catch (error) {
      throw transport(error);
    }
  }
}

function transport(error: unknown): ChainTransportError {
  const message = error instanceof Error ? error.message : "Stellar RPC request failed.";
  const timedOut = /timeout|timed out|abort/i.test(message);
  return new ChainTransportError(timedOut ? "RPC_TIMEOUT" : "RPC_UNAVAILABLE", timedOut ? "Stellar RPC timed out." : "Stellar RPC is unavailable.", {
    cause: error,
  });
}
