export const jejakQueryKeys = { context: ["jejak", "context"] as const, portfolio: ["jejak", "portfolio"] as const, workspace: (claimId: string) => ["jejak", "workspace", claimId] as const };
