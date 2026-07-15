export type AuditCursor = { createdAt: Date; id: string };

export type AuditFilters = {
  action?: string;
  cursor?: AuditCursor;
  from?: Date;
  limit: number;
  resourceType?: string;
  result?: "FAILURE" | "SUCCESS";
  to?: Date;
};

export type SafeAuditEvent = {
  action: string;
  actorId: string;
  afterVersion?: number;
  beforeVersion?: number;
  correlationId?: string;
  createdAt: Date;
  id: string;
  membershipId?: string;
  payloadHash?: string;
  reasonCode?: string;
  requestId: string;
  resourceId?: string;
  resourceType: string;
  result: string;
  roleGrantId?: string;
};

export type PortfolioMoneyRow = {
  approvedPrincipalBaseUnits: string;
  currency: string;
  financingFeePaidBaseUnits: string;
  firstLossConsumedBaseUnits: string;
  firstLossFundedBaseUnits: string;
  issuedBaseUnits: string;
  issuer?: string;
  outstandingPrincipalBaseUnits: string;
  principalBaseUnits: string;
  repaidBaseUnits: string;
  scale: number;
  seniorLossBaseUnits: string;
  servicingFeePaidBaseUnits: string;
  settlementBaseUnits: string;
};

export type PortfolioReadProjection = {
  checkpointUpdatedAt?: Date;
  mismatchedSubmissions: number;
  money: PortfolioMoneyRow[];
  pendingSubmissions: number;
  states: Array<{ count: number; state: string }>;
};

export interface ReadModelRepository {
  getPortfolio(input: { requestId: string; tenantId: string }): Promise<PortfolioReadProjection>;
  listAuditEvents(input: { filters: AuditFilters; requestId: string; tenantId: string }): Promise<SafeAuditEvent[]>;
}
