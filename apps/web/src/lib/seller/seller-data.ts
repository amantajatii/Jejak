export type Scenario = "happy" | "shortfall";
export type OfferFixture = "active" | "expired" | "stale";

export type Money = {
  amount: number;
  currency: "IDR";
};

export type SellerSnapshot = {
  sellerName: string;
  marketplace: string;
  gross: Money;
  esv: Money;
  advance: Money;
  fee: Money;
  obligation: Money;
  residual: Money;
  payoutDate: string;
  freshness: string;
  status: "OFFER_READY" | "SHORTFALL";
  reason: string;
};

export type Offer = {
  id: string;
  status: "ACTIVE" | "EXPIRED" | "STALE";
  gross: Money;
  esv: Money;
  advance: Money;
  fee: Money;
  obligation: Money;
  residual: Money;
  advanceFactor: number;
  expiresAt: string;
  termsVersion: string;
};

export type OfferResult = {
  ok: boolean;
  code: "ACCEPTED" | "ALREADY_ACCEPTED" | "CONFIRMATION_REQUIRED" | "OFFER_UNAVAILABLE";
  message: string;
};

export type ClaimStatus =
  | "FUNDED"
  | "SETTLING"
  | "REPAID"
  | "CLOSED"
  | "SHORTFALL"
  | "RESOLUTION"
  | "CLOSED_WITH_LOSS";

export type TimelineEvent = {
  id: string;
  status: ClaimStatus;
  title: string;
  description: string;
  timestamp: string;
  actor: string;
  transactionHash?: string;
  isTerminal?: boolean;
};

const money = (amount: number): Money => ({ amount, currency: "IDR" });

const baseSnapshot = {
  sellerName: "Dinda Prameswari",
  marketplace: "Tokopedia Sandbox",
  gross: money(128_400_000),
  esv: money(102_720_000),
  advance: money(77_040_000),
  fee: money(3_852_000),
  obligation: money(80_892_000),
  residual: money(21_828_000),
  payoutDate: "22 Jul 2026",
  freshness: "Updated 8 minutes ago",
} satisfies Omit<SellerSnapshot, "status" | "reason">;

const acceptedOffers = new Set<string>();

export async function getSellerSnapshot(scenario: Scenario): Promise<SellerSnapshot> {
  return {
    ...baseSnapshot,
    status: scenario === "happy" ? "OFFER_READY" : "SHORTFALL",
    reason:
      scenario === "happy"
        ? "Your refund history and payout schedule meet the sandbox policy."
        : "A post-funding refund reduced the available settlement value.",
  };
}

export async function getOffer(fixture: OfferFixture = "active"): Promise<Offer> {
  return {
    id: `offer-${fixture}`,
    status: fixture === "expired" ? "EXPIRED" : fixture === "stale" ? "STALE" : "ACTIVE",
    gross: baseSnapshot.gross,
    esv: baseSnapshot.esv,
    advance: baseSnapshot.advance,
    fee: baseSnapshot.fee,
    obligation: baseSnapshot.obligation,
    residual: baseSnapshot.residual,
    advanceFactor: 75,
    expiresAt: fixture === "expired" ? "14 Jul 2026, 09.00 WIB" : "16 Jul 2026, 18.00 WIB",
    termsVersion: "JEJAK-SBX-2026.07",
  };
}

export async function acceptOffer(offer: Offer, confirmed: boolean): Promise<OfferResult> {
  if (offer.status !== "ACTIVE") {
    return { ok: false, code: "OFFER_UNAVAILABLE", message: "Refresh this offer before accepting it." };
  }
  if (!confirmed) {
    return { ok: false, code: "CONFIRMATION_REQUIRED", message: "Confirm that you understand the offer details." };
  }
  if (acceptedOffers.has(offer.id)) {
    return { ok: true, code: "ALREADY_ACCEPTED", message: "You already accepted this offer." };
  }
  acceptedOffers.add(offer.id);
  return { ok: true, code: "ACCEPTED", message: "Offer accepted. We are preparing your claim." };
}

export async function getClaimTimeline(scenario: Scenario): Promise<TimelineEvent[]> {
  const shared: TimelineEvent[] = [
    {
      id: "funded",
      status: "FUNDED",
      title: "Funds sent",
      description: "Sandbox funds were sent to your selected payout account.",
      timestamp: "15 Jul 2026 · 10.42 WIB",
      actor: "Jejak Facility",
      transactionHash: "4e11c9f8b7a2e5c9",
    },
    {
      id: "settling",
      status: "SETTLING",
      title: "Waiting for marketplace payout",
      description: "We will reconcile the controlled payout when it arrives.",
      timestamp: "22 Jul 2026 · 09.00 WIB",
      actor: "Marketplace Sandbox",
    },
  ];

  if (scenario === "shortfall") {
    return [
      ...shared,
      {
        id: "shortfall",
        status: "SHORTFALL",
        title: "Payout was lower than expected",
        description: "A Rp12,640,000 refund was recorded after funding.",
        timestamp: "22 Jul 2026 · 11.16 WIB",
        actor: "Jejak Servicer",
      },
      {
        id: "resolution",
        status: "RESOLUTION",
        title: "Resolution team reviewing the case",
        description: "The first-loss reserve was applied and the remaining shortfall was reconciled.",
        timestamp: "22 Jul 2026 · 14.08 WIB",
        actor: "Authorized Resolver",
      },
      {
        id: "closed-loss",
        status: "CLOSED_WITH_LOSS",
        title: "Claim closed with a loss",
        description: "No further action is required from the seller.",
        timestamp: "23 Jul 2026 · 16.20 WIB",
        actor: "Authorized Resolver",
        isTerminal: true,
      },
    ];
  }

  return [
    ...shared,
    {
      id: "repaid",
      status: "REPAID",
      title: "Obligation repaid",
      description: "The principal and financing fee were reconciled.",
      timestamp: "22 Jul 2026 · 11.18 WIB",
      actor: "Jejak Servicer",
      transactionHash: "a71b8e1d09f34ca0",
    },
    {
      id: "closed",
      status: "CLOSED",
      title: "Claim closed",
      description: "The remaining Rp21,828,000 payout was sent to the seller.",
      timestamp: "22 Jul 2026 · 11.22 WIB",
      actor: "Jejak Servicer",
      transactionHash: "5bb8c940c3fd8241",
      isTerminal: true,
    },
  ];
}
