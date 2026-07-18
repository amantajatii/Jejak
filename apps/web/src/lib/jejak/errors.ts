export class JejakGatewayError extends Error {
  readonly code: string; readonly retryable: boolean; readonly status?: number;
  constructor(code: string, message: string, retryable = false, status?: number) { super(message); this.name = "JejakGatewayError"; this.code = code; this.retryable = retryable; this.status = status; }
}

export function explainError(error: unknown) {
  if (!(error instanceof JejakGatewayError)) return { title: "The workspace could not be updated", detail: "Check your connection and try again.", retryable: true };
  const known: Record<string, [string, string]> = {
    UNAUTHORIZED: ["Choose an eligible demo role", "Your session is missing or expired."],
    FORBIDDEN: ["This role cannot perform that action", "Switch to the role shown beside the next action."],
    INVALID_STATE_TRANSITION: ["The claim has already moved", "We refreshed the authoritative workspace state."],
    VERSION_CONFLICT: ["The financial state changed", "Review the refreshed amounts and confirm again."],
    TRANSPORT_FAILURE: ["The API connection was interrupted", "Check that the local API is running, then refresh and retry."],
    INTERFACE_NOT_READY: ["API integration is waiting for its generated contract", "Use mock transport until the Person 1 ClaimWorkspace handoff is published."],
  };
  const [title, detail] = known[error.code] ?? ["The action could not be completed", error.message];
  return { title, detail, retryable: error.retryable };
}
