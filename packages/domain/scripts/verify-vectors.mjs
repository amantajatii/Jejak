import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { canonicalize } from "json-canonicalize";

import { packageRoot } from "./schema-registry.mjs";

const vectorsRoot = path.join(packageRoot, "fixtures", "vectors");
const load = (name) => JSON.parse(readFileSync(path.join(vectorsRoot, name), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const assertEqual = (actual, expected, label) => {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
};
const assertBytes = (buffer, expected, label) => {
  assertEqual(JSON.stringify([...buffer]), JSON.stringify(expected), label);
};

function decimalToMinor(display, scale) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(display);
  if (match === null) throw new Error(`Invalid decimal: ${display}`);
  const fraction = match[3] ?? "";
  if (fraction.length > scale) throw new Error(`Too many decimal places: ${display}`);
  const unsigned = `${match[2]}${fraction.padEnd(scale, "0")}`.replace(/^0+(?=\d)/, "");
  const result = BigInt(unsigned || "0");
  return `${match[1] === "-" && result !== 0n ? "-" : ""}${result}`;
}

export function verifyVectors() {
  for (const name of ["claim-key-v1.json", "attestation-key-v1.json", "content-hash-v1.json"]) {
    const vector = load(name);
    const bytes = Buffer.from(vector.input.utf8Text, "utf8");
    assertBytes(bytes, vector.input.utf8Bytes, `${name} UTF-8 bytes`);
    assertEqual(sha256(bytes), vector.expected.sha256Hex, `${name} SHA-256`);
  }

  const seller = load("seller-subject-v1.json");
  const sellerBytes = Buffer.concat([
    Buffer.from(seller.input.tenantSaltHex, "hex"),
    Buffer.from(seller.input.sellerId, "utf8"),
  ]);
  assertBytes(sellerBytes, seller.input.concatenatedBytes, "seller subject bytes");
  assertEqual(sha256(sellerBytes), seller.expected.sha256Hex, "seller subject SHA-256");

  const money = load("money-base-units-v1.json");
  for (const entry of money.cases) {
    assertEqual(decimalToMinor(entry.display, entry.scale), entry.expectedAmountMinor, `Money ${entry.display}`);
  }

  const jcc = load("jcc-jcs-ed25519-v1.json");
  const canonical = canonicalize(jcc.payload);
  assertEqual(canonical, jcc.canonicalUtf8Text, "JCC canonical text");
  assertEqual(Buffer.from(canonical).toString("hex"), jcc.canonicalUtf8Hex, "JCC canonical bytes");
  const seed = Buffer.from(jcc.testKey.seedHex, "hex");
  const privateKey = createPrivateKey({
    key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]),
    format: "der",
    type: "pkcs8",
  });
  const publicKey = createPublicKey(privateKey);
  const publicDer = publicKey.export({ format: "der", type: "spki" });
  assertEqual(publicDer.subarray(-32).toString("hex"), jcc.testKey.publicKeyHex, "JCC public key");
  const signature = sign(null, Buffer.from(canonical), privateKey);
  assertEqual(signature.toString("hex"), jcc.expectedSignatureHex, "JCC signature");
  if (!verify(null, Buffer.from(canonical), publicKey, signature)) {
    throw new Error("JCC signature verification failed.");
  }

  return 6;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`Verified ${verifyVectors()} deterministic vector sets.\n`);
}
