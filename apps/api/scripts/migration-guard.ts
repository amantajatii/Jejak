import type { AppConfig } from "../src/config/env.js";

function projectRefFromUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    const url = new URL(value);
    const hostMatch = /^([a-z0-9]{20})\./.exec(url.hostname);
    if (hostMatch?.[1] !== undefined) return hostMatch[1];
    const userMatch = /^postgres\.([a-z0-9]{20})$/.exec(decodeURIComponent(url.username));
    return userMatch?.[1];
  } catch {
    return undefined;
  }
}

export function assertDedicatedTestProject(config: AppConfig): string {
  if (config.nodeEnv !== "test" || !config.allowTestProjectMutation) {
    throw new Error("Cloud mutation guard rejected: test mode and explicit acknowledgement are required.");
  }
  const urlRef = projectRefFromUrl(config.supabaseUrl);
  const databaseRef = projectRefFromUrl(config.databaseDirectUrl);
  const expectedRef = config.supabaseTestProjectRef ?? urlRef;
  if (expectedRef === undefined || urlRef !== expectedRef || databaseRef !== expectedRef) {
    throw new Error("Cloud mutation guard rejected: Supabase and direct database project references differ.");
  }
  return expectedRef;
}
