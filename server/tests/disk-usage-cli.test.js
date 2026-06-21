import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const cliPath = join(repoRoot, "server/scripts/check-disk-usage.js");
const tempRoots = new Set();

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "clinova-disk-usage-cli-test-"));
  tempRoots.add(root);
  return root;
}

function config(entries) {
  return JSON.stringify(entries);
}

function runCli(env = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [cliPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        DISK_MONITOR_PATHS_JSON: "",
        DISK_MONITOR_SHOW_PATHS: "",
        ...env,
      },
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      const trimmed = stdout.trim();
      resolveRun({
        code,
        stdout,
        stderr,
        json: trimmed ? JSON.parse(trimmed) : null,
      });
    });
  });
}

afterEach(async () => {
  await Promise.all([...tempRoots].map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.clear();
});

test("disk usage CLI exits 2 when path configuration is missing", async () => {
  const result = await runCli();

  assert.equal(result.code, 2);
  assert.equal(result.json.status, "configuration_error");
  assert.match(result.json.message, /is required/);
  assert.equal(result.stderr, "");
});

test("disk usage CLI exits 2 for invalid JSON", async () => {
  const result = await runCli({ DISK_MONITOR_PATHS_JSON: "{not json" });

  assert.equal(result.code, 2);
  assert.equal(result.json.status, "configuration_error");
  assert.match(result.json.message, /valid JSON/);
});

test("disk usage CLI exits 2 for invalid path entry", async () => {
  const result = await runCli({
    DISK_MONITOR_PATHS_JSON: config([{ label: "uploads" }]),
  });

  assert.equal(result.code, 2);
  assert.equal(result.json.status, "configuration_error");
  assert.match(result.json.message, /include a path/);
});

test("disk usage CLI exits 0 for healthy temporary directory", async () => {
  const root = await tempRoot();
  const uploads = join(root, "uploads");
  await mkdir(uploads);

  const result = await runCli({
    DISK_MONITOR_PATHS_JSON: config([
      { label: "uploads", path: uploads, warningBytes: 10, criticalBytes: 20 },
    ]),
  });

  assert.equal(result.code, 0);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.status, "healthy");
  assert.equal(result.json.paths[0].sizeBytes, 0);
});

test("disk usage CLI exits 1 for warning path", async () => {
  const root = await tempRoot();
  const uploads = join(root, "uploads");
  await mkdir(uploads);
  await writeFile(join(uploads, "upload.bin"), Buffer.alloc(10));

  const result = await runCli({
    DISK_MONITOR_PATHS_JSON: config([
      { label: "uploads", path: uploads, warningBytes: 10, criticalBytes: 20 },
    ]),
  });

  assert.equal(result.code, 1);
  assert.equal(result.json.status, "warning");
  assert.equal(result.json.paths[0].status, "warning");
});

test("disk usage CLI exits 1 for critical path", async () => {
  const root = await tempRoot();
  const backups = join(root, "backups");
  await mkdir(backups);
  await writeFile(join(backups, "backup.bin"), Buffer.alloc(20));

  const result = await runCli({
    DISK_MONITOR_PATHS_JSON: config([
      { label: "backups", path: backups, warningBytes: 10, criticalBytes: 20 },
    ]),
  });

  assert.equal(result.code, 1);
  assert.equal(result.json.status, "critical");
  assert.equal(result.json.paths[0].status, "critical");
});

test("disk usage CLI exits 1 for missing monitored path", async () => {
  const root = await tempRoot();
  const missing = join(root, "missing");

  const result = await runCli({
    DISK_MONITOR_PATHS_JSON: config([{ label: "missing", path: missing }]),
  });

  assert.equal(result.code, 1);
  assert.equal(result.json.status, "missing");
  assert.equal(result.json.paths[0].exists, false);
});

test("disk usage CLI hides paths by default", async () => {
  const root = await tempRoot();
  const result = await runCli({
    DISK_MONITOR_PATHS_JSON: config([{ label: "temp", path: root }]),
  });

  assert.equal(result.code, 0);
  assert.equal(result.json.paths[0].path, undefined);
  assert.equal(result.stdout.includes(resolve(root)), false);
});

test("disk usage CLI shows paths only when explicitly enabled", async () => {
  const root = await tempRoot();
  const result = await runCli({
    DISK_MONITOR_PATHS_JSON: config([{ label: "temp", path: root }]),
    DISK_MONITOR_SHOW_PATHS: "true",
  });

  assert.equal(result.code, 0);
  assert.equal(result.json.paths[0].path, resolve(root));
});

test("disk usage CLI writes one JSON payload and no stderr", async () => {
  const root = await tempRoot();
  const result = await runCli({
    DISK_MONITOR_PATHS_JSON: config([{ label: "temp", path: root }]),
  });

  assert.equal(result.stderr, "");
  assert.equal(result.stdout.trim().split(/\r?\n/).length, 1);
  assert.deepEqual(JSON.parse(result.stdout), result.json);
});
