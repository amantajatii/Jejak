export type DependencyStatus = "healthy" | "unhealthy" | "not_configured";

export type ReadinessResult = {
  message?: string;
  status: DependencyStatus;
};

export type ReadinessProbe = {
  check: () => Promise<ReadinessResult>;
  name: string;
  required: boolean;
};

export type ReadinessReport = ReadinessResult & {
  latencyMs: number;
  name: string;
  required: boolean;
};
