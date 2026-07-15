import { ApiJejakGateway } from "./api-gateway";
import { JejakGatewayError } from "./errors";
import type { JejakGateway } from "./gateway";
import { createBrowserMockGateway } from "./mock-gateway";

export function createConfiguredGateway(): JejakGateway {
  const transport = process.env.NEXT_PUBLIC_JEJAK_TRANSPORT;
  if (transport === "mock") return createBrowserMockGateway();
  if (transport === "api") {
    const apiUrl = process.env.NEXT_PUBLIC_JEJAK_API_URL;
    if (!apiUrl) throw new JejakGatewayError("INVALID_CONFIGURATION", "NEXT_PUBLIC_JEJAK_API_URL is required when transport is api.");
    return new ApiJejakGateway(apiUrl);
  }
  throw new JejakGatewayError("INVALID_CONFIGURATION", "Set NEXT_PUBLIC_JEJAK_TRANSPORT to mock or api. Jejak never falls back silently.");
}
