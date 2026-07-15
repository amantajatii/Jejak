import { spawnSync } from "node:child_process";

const image = "jejak-api-smoke:local";
const run = (args, options = {}) =>
  spawnSync("docker", args, { encoding: "utf8", stdio: "pipe", ...options });

const build = run(["build", "-f", "infrastructure/docker/api.Dockerfile", "-t", image, "."]);
if (build.status !== 0) {
  process.stderr.write(build.stderr || build.stdout);
  process.exit(build.status ?? 1);
}

const started = run(["run", "--detach", "--rm", "--publish", "127.0.0.1::4000", image]);
if (started.status !== 0) {
  process.stderr.write(started.stderr || started.stdout);
  process.exit(started.status ?? 1);
}
const containerId = started.stdout.trim();

try {
  const portResult = run(["port", containerId, "4000/tcp"]);
  if (portResult.status !== 0) throw new Error(portResult.stderr || "Unable to find mapped port.");
  const port = portResult.stdout.trim().split(":").at(-1);
  if (port === undefined) throw new Error("Docker did not publish the API port.");

  let response;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) break;
    } catch {
      // Container startup is expected to take a few polling attempts.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (response === undefined || !response.ok) throw new Error("API container never became healthy.");
  const body = await response.json();
  if (body?.data?.status !== "ok" || body?.meta?.sandbox !== true) {
    throw new Error(`Unexpected health envelope: ${JSON.stringify(body)}`);
  }
  process.stdout.write("API container health smoke passed.\n");
} finally {
  run(["rm", "--force", containerId]);
}
