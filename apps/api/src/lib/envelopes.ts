type EnvelopeMetaInput = {
  requestId: string;
  sandbox: boolean;
  timestamp?: string;
};

export function successEnvelope<T>(data: T, meta: EnvelopeMetaInput) {
  return {
    data,
    meta: {
      requestId: meta.requestId,
      sandbox: meta.sandbox,
      timestamp: meta.timestamp ?? new Date().toISOString(),
    },
  };
}

export function errorEnvelope(
  input: {
    code: string;
    details?: Record<string, unknown>;
    message: string;
    requestId: string;
    retryable: boolean;
  },
) {
  return {
    error: {
      code: input.code,
      ...(input.details === undefined ? {} : { details: input.details }),
      message: input.message,
      requestId: input.requestId,
      retryable: input.retryable,
    },
  };
}
