const sensitiveKey = /(authorization|cookie|email|password|secret|token|credential|raw|document)/i;

export function safeAttributes(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => {
      if (sensitiveKey.test(key)) return [key, "[REDACTED]"];
      if (Array.isArray(value)) {
        return [key, value.map((item) => (typeof item === "object" && item !== null ? safeAttributes(item as Record<string, unknown>) : item))];
      }
      if (typeof value === "object" && value !== null) return [key, safeAttributes(value as Record<string, unknown>)];
      return [key, value];
    }),
  );
}
