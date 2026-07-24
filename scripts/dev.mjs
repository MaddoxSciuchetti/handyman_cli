import { spawn } from "node:child_process";

const children = [
  spawn(process.execPath, ["--env-file-if-exists=.env", "local-server.mjs"], {
    stdio: "inherit",
    detached: process.platform !== "win32",
  }),
  spawn("vinext", ["dev"], {
    stdio: "inherit",
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
    },
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
  }),
];

function shutdown(signal) {
  for (const child of children) {
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch {
      // The child may already have stopped.
    }
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

for (const child of children) {
  child.on("exit", (code) => {
    if (code && code !== 0) {
      shutdown("SIGTERM");
      process.exitCode = code;
    }
  });
}
