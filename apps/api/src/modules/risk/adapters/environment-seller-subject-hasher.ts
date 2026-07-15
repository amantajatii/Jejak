import { createHmac } from "node:crypto";

import type { SellerSubjectHasher } from "../ports/durable-operation.js";

export class EnvironmentSellerSubjectHasher implements SellerSubjectHasher {
  readonly #secret: Buffer;

  constructor(reference: string, source: NodeJS.ProcessEnv = process.env) {
    const match = /^env:\/\/([A-Z][A-Z0-9_]*)$/.exec(reference);
    if (match?.[1] === undefined) {
      throw new Error("RISK seller-subject salt must use an env:// external reference.");
    }
    const value = source[match[1]];
    if (value === undefined || value.length < 32) {
      throw new Error("The configured RISK seller-subject salt is unavailable or too short.");
    }
    this.#secret = Buffer.from(value, "utf8");
  }

  async hashSellerSubject(input: {
    sellerId: string;
    sellerSubject: string;
    tenantId: string;
  }): Promise<string> {
    return createHmac("sha256", this.#secret)
      .update("JEJAK:SELLER_SUBJECT:v1\0")
      .update(input.tenantId)
      .update("\0")
      .update(input.sellerId)
      .update("\0")
      .update(input.sellerSubject)
      .digest("hex");
  }
}
