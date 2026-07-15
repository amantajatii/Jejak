import { v7 as uuidv7 } from "uuid";

export function createRequestId(): string {
  return uuidv7();
}
