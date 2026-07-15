export type ResolutionStatus = "OPEN" | "IN_REVIEW" | "RECOVERED" | "CLOSED";

export type ResolutionCase = {
  claimId: string;
  seller: string;
  marketplace: string;
  status: ResolutionStatus;
  age: string;
  obligation: number;
  realizedSettlement: number;
  firstLossConsumed: number;
  recovered: number;
  currency: string;
  priority: "High" | "Medium" | "Low";
  assignedTo: string;
  canAct: boolean;
  freshness: string;
  shortfall: number;
  evidence: { name: string; type: string; hash?: string; added: string }[];
  recoveryHistory: { label: string; amount: number; date: string; note: string }[];
  timeline: { label: string; date: string; detail: string; tone?: "risk" | "success" | "neutral" }[];
  stellar: { label: string; value: string; href?: string }[];
};

export const cases: ResolutionCase[] = [
  {
    claimId: "JCL-2048",
    seller: "Dinda Prameswari",
    marketplace: "Pasar Lokal",
    status: "IN_REVIEW",
    age: "2d 4h",
    obligation: 12800000,
    realizedSettlement: 9600000,
    firstLossConsumed: 1600000,
    recovered: 400000,
    currency: "IDR",
    priority: "High",
    assignedTo: "Resolver Sandbox",
    canAct: true,
    freshness: "Updated 18 min ago",
    shortfall: 2800000,
    evidence: [
      { name: "Marketplace settlement snapshot", type: "Settlement", hash: "a91f…0c2d", added: "18 min ago" },
      { name: "Refund ledger · June 2026", type: "Adjustment", hash: "4bb2…8e10", added: "1h ago" },
      { name: "Payout control evidence", type: "Control", hash: "c08d…1f92", added: "2d ago" },
    ],
    recoveryHistory: [
      { label: "Initial settlement", amount: 9600000, date: "15 Jul 2026", note: "Controlled payout account" },
      { label: "Marketplace recovery", amount: 400000, date: "15 Jul 2026", note: "Refund reversal" },
    ],
    timeline: [
      { label: "Shortfall detected", date: "15 Jul · 09:14", detail: "Realized settlement fell below obligation.", tone: "risk" },
      { label: "Case assigned", date: "15 Jul · 09:22", detail: "Assigned to Resolver Sandbox." },
      { label: "Evidence refreshed", date: "15 Jul · 10:06", detail: "Settlement and refund snapshots reconciled." },
      { label: "Recovery recorded", date: "15 Jul · 10:18", detail: "IDR 400,000 recovery applied.", tone: "success" },
    ],
    stellar: [
      { label: "Claim reference", value: "claim:JCL-2048" },
      { label: "Settlement transaction", value: "a91f…0c2d", href: "#transaction-a91f" },
      { label: "Network", value: "Stellar Testnet · Sandbox" },
    ],
  },
  {
    claimId: "JCL-2039",
    seller: "Raka Studio",
    marketplace: "Pasar Lokal",
    status: "OPEN",
    age: "5d 1h",
    obligation: 8400000,
    realizedSettlement: 6200000,
    firstLossConsumed: 1200000,
    recovered: 0,
    currency: "IDR",
    priority: "High",
    assignedTo: "Resolver Sandbox",
    canAct: true,
    freshness: "Updated 2h ago",
    shortfall: 2200000,
    evidence: [],
    recoveryHistory: [],
    timeline: [{ label: "Resolution opened", date: "10 Jul · 13:40", detail: "Awaiting evidence review." }],
    stellar: [{ label: "Claim reference", value: "claim:JCL-2039" }, { label: "Network", value: "Stellar Testnet · Sandbox" }],
  },
  {
    claimId: "JCL-1988",
    seller: "Nusantara Goods",
    marketplace: "Pasar Lokal",
    status: "RECOVERED",
    age: "9d",
    obligation: 5600000,
    realizedSettlement: 5100000,
    firstLossConsumed: 500000,
    recovered: 500000,
    currency: "IDR",
    priority: "Medium",
    assignedTo: "Resolver Sandbox",
    canAct: false,
    freshness: "Updated yesterday",
    shortfall: 0,
    evidence: [{ name: "Recovery receipt", type: "Recovery", hash: "7dd1…c0a4", added: "Yesterday" }],
    recoveryHistory: [{ label: "Recovery received", amount: 500000, date: "14 Jul 2026", note: "Case fully recovered" }],
    timeline: [{ label: "Case recovered", date: "14 Jul · 16:12", detail: "Final loss is zero.", tone: "success" }],
    stellar: [{ label: "Claim reference", value: "claim:JCL-1988" }, { label: "Network", value: "Stellar Testnet · Sandbox" }],
  },
];

export const getCase = (claimId: string) => cases.find((item) => item.claimId === claimId);

export const finalLoss = (item: ResolutionCase) => Math.max(0, item.shortfall - item.recovered);
