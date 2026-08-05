import { spawn } from "node:child_process";
import { resolveInsideFixture } from "./path.mjs";

const MAX_STREAM_BYTES = 1024 * 1024;
const DEFAULT_STEP_TIMEOUT_MS = 30_000;

function terminateProcessTree(child) {
  if (!Number.isInteger(child.pid) || child.pid <= 0 || child.pid === process.pid) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.on("error", () => child.kill("SIGKILL"));
    killer.on("close", (code) => {
      if (code !== 0) child.kill("SIGKILL");
    });
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    if (error?.code === "ESRCH") child.kill("SIGKILL");
  }
}

function expandCommand(command, cliEntry) {
  if (command[0] !== "$AKRCTX") return command;
  if (!cliEntry) throw new Error("A CLI entry path is required for $AKRCTX commands.");
  return [process.execPath, cliEntry, ...command.slice(1)];
}

export function evaluationEnvironment(home, overrides = {}) {
  const inheritedKeys = ["PATH", "LANG", "LC_ALL", "TMPDIR", "TEMP", "TMP", "SystemRoot", "ComSpec", "PATHEXT"];
  const env = {};
  for (const key of inheritedKeys) {
    if (typeof process.env[key] === "string") env[key] = process.env[key];
  }
  return {
    ...env,
    HOME: home,
    USERPROFILE: home,
    CI: "true",
    NO_COLOR: "1",
    npm_config_userconfig: process.platform === "win32" ? "NUL" : "/dev/null",
    NPM_CONFIG_USERCONFIG: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    ...overrides,
  };
}

export async function executeStep(step, options) {
  const command = expandCommand(step.command, options.cliEntry);
  const cwd = await resolveInsideFixture(options.fixtureRoot, step.cwd ?? ".");
  const started = performance.now();
  return new Promise((resolve) => {
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let outputLimitExceeded = false;
    let terminationRequested = false;
    const child = spawn(command[0], command.slice(1), {
      cwd,
      detached: process.platform !== "win32",
      shell: false,
      env: evaluationEnvironment(options.fixtureRoot, options.env),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const capture = (chunk, chunks, currentBytes) => {
      const remaining = MAX_STREAM_BYTES - currentBytes;
      if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
      if (chunk.length > remaining) {
        outputLimitExceeded = true;
        if (!terminationRequested) {
          terminationRequested = true;
          terminateProcessTree(child);
        }
      }
      return currentBytes + Math.min(chunk.length, Math.max(remaining, 0));
    };
    child.stdout.on("data", (chunk) => {
      stdoutBytes = capture(chunk, stdoutChunks, stdoutBytes);
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes = capture(chunk, stderrChunks, stderrBytes);
    });
    child.on("error", (error) => {
      stderrBytes = capture(Buffer.from(`${error.message}\n`), stderrChunks, stderrBytes);
    });
    child.stdin.on("error", (error) => {
      if (error?.code === "EPIPE" || error?.code === "ERR_STREAM_DESTROYED") return;
      stderrBytes = capture(Buffer.from(`${error.message}\n`), stderrChunks, stderrBytes);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      if (!terminationRequested) {
        terminationRequested = true;
        terminateProcessTree(child);
      }
    }, step.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        command,
        exitCode: outputLimitExceeded ? 125 : (code ?? (timedOut ? 124 : 1)),
        signal: signal ?? undefined,
        stdout: Buffer.concat(stdoutChunks, stdoutBytes).toString("utf8"),
        stderr: Buffer.concat(stderrChunks, stderrBytes).toString("utf8"),
        timedOut,
        outputLimitExceeded,
        durationMs: Math.round(performance.now() - started),
      });
    });
    child.stdin.end(step.stdin ?? "");
  });
}
