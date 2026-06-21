import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

const PROJECT_ROOT = resolve(process.cwd());
const RESTORE_TEMP_PREFIX_NAME = "clinova-restore-test-";
const RESTORE_TEMP_PREFIX = join(tmpdir(), RESTORE_TEMP_PREFIX_NAME);

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(address.port);
      });
    });
  });
}

function captureOutput(child) {
  const output = [];
  child.stdout?.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr?.on("data", (chunk) => output.push(chunk.toString()));
  return output;
}

function pathIsInside(parent, child) {
  const relativePath = relative(resolve(parent), resolve(child));
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function assertSafeTempRoot(root) {
  const resolvedRoot = resolve(root);
  if (!pathIsInside(tmpdir(), resolvedRoot) || !basename(resolvedRoot).startsWith(RESTORE_TEMP_PREFIX_NAME)) {
    throw new Error(`Unsafe restore test temp root: ${resolvedRoot}`);
  }
  return resolvedRoot;
}

function assertPathInsideRoot(root, value, label) {
  const resolvedRoot = assertSafeTempRoot(root);
  const resolvedValue = resolve(String(value || ""));
  if (!pathIsInside(resolvedRoot, resolvedValue)) {
    throw new Error(`${label} must be inside restore test temp root: ${resolvedValue}`);
  }
  return resolvedValue;
}

export function assertSafeRestoreEnvironment(environment) {
  const root = assertSafeTempRoot(environment.root);
  if (environment.env.DATABASE_URL) {
    throw new Error("Restore test helper requires SQLite: DATABASE_URL must be empty.");
  }
  assertPathInsideRoot(root, environment.env.DATABASE_PATH, "DATABASE_PATH");
  assertPathInsideRoot(root, environment.env.UPLOAD_DIR, "UPLOAD_DIR");
  assertPathInsideRoot(root, environment.env.BACKUP_DIR, "BACKUP_DIR");
  return true;
}

function runNode(args, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: PROJECT_ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output = captureOutput(child);

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`Node process failed (${code ?? signal}):\n${output.join("")}`));
    });
  });
}

export async function createRestoreTestEnvironment() {
  const root = await mkdtemp(RESTORE_TEMP_PREFIX);
  const databasePath = join(root, "data", "clinic.sqlite");
  const uploadsDir = join(root, "uploads");
  const backupsDir = join(root, "backups");
  const port = await getFreePort();

  await Promise.all([
    mkdir(join(root, "data"), { recursive: true }),
    mkdir(uploadsDir, { recursive: true }),
    mkdir(backupsDir, { recursive: true }),
  ]);

  const env = {
    ...process.env,
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: String(port),
    DATABASE_URL: "",
    DATABASE_PATH: databasePath,
    UPLOAD_DIR: uploadsDir,
    BACKUP_DIR: backupsDir,
    BACKUP_ENABLED: "false",
    BACKUP_RUN_ON_START: "false",
    WHATSAPP_ENABLED: "false",
    WHATSAPP_DRY_RUN: "true",
    COOKIE_SECURE: "false",
    SESSION_SECRET: "clinova-restore-test-secret-only",
  };

  const environment = {
    backupsDir,
    baseUrl: `http://127.0.0.1:${port}`,
    databasePath,
    env,
    port,
    root,
    uploadsDir,
  };
  assertSafeRestoreEnvironment(environment);
  return environment;
}

export async function initializeRestoreDatabase(environment, { runs = 1 } = {}) {
  assertSafeRestoreEnvironment(environment);
  for (let run = 0; run < runs; run += 1) {
    await runNode([
      "--input-type=module",
      "-e",
      "const { initDatabase } = await import('./server/db.js'); await initDatabase();",
    ], environment.env);
  }
}

async function waitForHealth(baseUrl, child, output) {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Restore test server exited before becoming healthy:\n${output.join("")}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.status === 200) return;
    } catch {
      // The server may still be binding the test port.
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }

  throw new Error(`Timed out waiting for restore test server:\n${output.join("")}`);
}

export async function startRestoreServer(environment) {
  assertSafeRestoreEnvironment(environment);
  const child = spawn(process.execPath, ["server/app.js"], {
    cwd: PROJECT_ROOT,
    env: environment.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = captureOutput(child);

  try {
    await waitForHealth(environment.baseUrl, child, output);
  } catch (error) {
    await stopRestoreServer({ child });
    throw error;
  }

  return {
    ...environment,
    child,
    output,
    async expectRestoreExit(options) {
      return expectRestoreExit({ child, output }, options);
    },
    async stop() {
      await stopRestoreServer({ child });
    },
  };
}

export async function startInitializedRestoreServer({ initializationRuns = 1 } = {}) {
  const environment = await createRestoreTestEnvironment();
  await initializeRestoreDatabase(environment, { runs: initializationRuns });
  return await startRestoreServer(environment);
}

export async function expectRestoreExit(server, { timeoutMs = 5_000 } = {}) {
  const { child, output = [] } = server;
  await waitForChildExit(child, timeoutMs);
  if (child.exitCode !== 0) {
    throw new Error(`Restore test server exited unexpectedly (${child.exitCode ?? child.signalCode}):\n${output.join("")}`);
  }
}

export async function stopRestoreServer(server) {
  const child = server?.child;
  if (!child || child.exitCode !== null) return;
  child.kill();
  try {
    await waitForChildExit(child, 5_000);
  } catch {
    if (child.exitCode === null) child.kill("SIGKILL");
    await waitForChildExit(child, 5_000);
  }
}

export async function cleanupRestoreEnvironment(environment) {
  assertSafeRestoreEnvironment(environment);
  const resolvedRoot = assertSafeTempRoot(environment.root);
  await rm(resolvedRoot, { recursive: true, force: true });
}

async function waitForChildExit(child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error("Timed out waiting for restore test server process to exit.");
}
