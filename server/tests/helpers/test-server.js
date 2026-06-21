import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PROJECT_ROOT = resolve(process.cwd());
const TEMP_PREFIX = join(tmpdir(), "clinova-api-test-");

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

async function waitForHealth(baseUrl, child, output) {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Test server exited before becoming healthy:\n${output.join("")}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.status === 200) return;
    } catch {
      // The server may still be binding the test port.
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }

  throw new Error(`Timed out waiting for test server:\n${output.join("")}`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;

  await new Promise((resolveStop) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 5_000);

    child.once("exit", () => {
      clearTimeout(timeout);
      resolveStop();
    });
    child.kill();
  });
}

export async function startTestServer({ envOverrides = {}, initializationRuns = 1 } = {}) {
  const root = await mkdtemp(TEMP_PREFIX);
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
    SESSION_SECRET: "clinova-api-test-secret-only",
    ...envOverrides,
  };

  for (let run = 0; run < initializationRuns; run += 1) {
    await runNode([
      "--input-type=module",
      "-e",
      "const { initDatabase } = await import('./server/db.js'); await initDatabase();",
    ], env);
  }

  const child = spawn(process.execPath, ["server/app.js"], {
    cwd: PROJECT_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = captureOutput(child);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForHealth(baseUrl, child, output);
  } catch (error) {
    await stopChild(child);
    await rm(root, { recursive: true, force: true });
    throw error;
  }

  return {
    backupsDir,
    baseUrl,
    databasePath,
    root,
    uploadsDir,
    async stop() {
      await stopChild(child);
      const resolvedRoot = resolve(root);
      if (!resolvedRoot.startsWith(resolve(TEMP_PREFIX))) {
        throw new Error(`Refusing to remove unexpected test directory: ${resolvedRoot}`);
      }
      await rm(resolvedRoot, { recursive: true, force: true });
    },
  };
}
