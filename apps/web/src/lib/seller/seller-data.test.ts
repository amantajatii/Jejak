import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptOffer,
  getClaimTimeline,
  getOffer,
  getSellerSnapshot,
} from "./seller-data.ts";

test("seller snapshot keeps gross, eligible value, advance, fees, and residual distinct", async () => {
  const snapshot = await getSellerSnapshot("happy");

  assert.equal(snapshot.gross.amount, 128_400_000);
  assert.equal(snapshot.esv.amount, 102_720_000);
  assert.equal(snapshot.advance.amount, 77_040_000);
  assert.equal(snapshot.fee.amount, 3_852_000);
  assert.equal(snapshot.residual.amount, 21_828_000);
});

test("expired and stale offers cannot be accepted", async () => {
  const expired = await getOffer("expired");
  const stale = await getOffer("stale");

  assert.equal((await acceptOffer(expired, true)).ok, false);
  assert.equal((await acceptOffer(stale, true)).ok, false);
});

test("offer acceptance requires confirmation and is idempotent", async () => {
  const offer = await getOffer("active");

  assert.equal((await acceptOffer(offer, false)).ok, false);
  assert.equal((await acceptOffer(offer, true)).ok, true);
  assert.equal((await acceptOffer(offer, true)).code, "ALREADY_ACCEPTED");
});

test("shortfall timeline terminates with loss and no fake transaction hash", async () => {
  const timeline = await getClaimTimeline("shortfall");
  const terminal = timeline.at(-1);

  assert.equal(terminal?.status, "CLOSED_WITH_LOSS");
  assert.equal(terminal?.transactionHash, undefined);
  assert.equal(terminal?.isTerminal, true);
});

test("seller fixtures expose English-only user-facing copy", async () => {
  const copy = JSON.stringify({
    snapshot: await getSellerSnapshot("shortfall"),
    offerResult: await acceptOffer(await getOffer("expired"), true),
    timeline: await getClaimTimeline("shortfall"),
  });

  assert.doesNotMatch(copy, /\b(Riwayat|Penawaran|Dana|Klaim|Kewajiban|Menunggu|Kasus|Tidak)\b/);
});
