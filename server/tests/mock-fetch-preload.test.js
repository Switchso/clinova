import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const preloadUrl = pathToFileURL(fileURLToPath(new URL("./helpers/mock-fetch-preload.js", import.meta.url))).href;

function runWithMock(mode, script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
      env: {
        ...process.env,
        MOCK_FETCH_MODE: mode,
        NODE_OPTIONS: `--import=${preloadUrl}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`child failed (${code ?? signal}):\nstdout=${stdout}\nstderr=${stderr}`));
    });
  });
}

test("mock fetch preload returns deterministic provider HTTP failures", async () => {
  const script = `
    const response = await fetch("https://graph.facebook.com/test/messages");
    const body = await response.json();
    console.log(JSON.stringify({ ok: response.ok, status: response.status, message: body.error.message }));
  `;

  const provider400 = await runWithMock("provider_400", script);
  assert.deepEqual(JSON.parse(provider400.stdout), {
    ok: false,
    status: 400,
    message: "Mock WhatsApp provider 400",
  });

  const provider500 = await runWithMock("provider_500", script);
  assert.deepEqual(JSON.parse(provider500.stdout), {
    ok: false,
    status: 500,
    message: "Mock WhatsApp provider 500",
  });
});

test("mock fetch preload throws network and unexpected external failures", async () => {
  const network = await runWithMock("network_error", `
    try {
      await fetch("https://graph.facebook.com/test/messages");
    } catch (error) {
      console.log(error.message);
    }
  `);
  assert.equal(network.stdout.trim(), "Mock WhatsApp provider network error");

  const blocked = await runWithMock("provider_400", `
    try {
      await fetch("https://example.com/not-allowed");
    } catch (error) {
      console.log(error.message);
    }
  `);
  assert.match(blocked.stdout.trim(), /^Unexpected external fetch blocked by mock-fetch-preload:/);
});
