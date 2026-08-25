/**
 * Packaged-app GUI smoke test (release CI).
 *
 * Launches the electron-builder output (dist/linux-unpacked) — the exact
 * artifact layout that gets published — under Xvfb and waits for
 * KOODO_SMOKE_RESULT: PASS/FAIL emitted by main.js. Catches packaging
 * regressions (files missing from app.asar, broken native modules) that
 * source-tree smoke tests cannot see: the source tree always has every
 * file, the asar only has what build.files matched.
 *
 * Exit code 0 = packaged app launched and renderer mounted, 1 = failure.
 * A renderer screenshot is saved to build/packaged-smoke-screenshot.png.
 *
 * Prerequisites: `npx electron-builder --dir` ran successfully, Xvfb
 * available (run under xvfb-run in CI).
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const binary = path.join(root, "dist", "linux-unpacked", "free-koodo-reader");

if (!fs.existsSync(binary)) {
  console.error("[packaged-smoke] binary not found: " + binary);
  console.error("[packaged-smoke] run `npx electron-builder --dir` first");
  process.exit(1);
}

const env = {
  ...process.env,
  ELECTRON_IS_DEV: "0",
  KOODO_SMOKE_TEST: "1",
  KOODO_SMOKE_SCREENSHOT: path.join(root, "build", "packaged-smoke-screenshot.png"),
  ELECTRON_ENABLE_LOGGING: "1",
  ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
};

console.log("[packaged-smoke] launching packaged app:", binary);
const child = spawn(binary, ["--no-sandbox", "--disable-gpu"], {
  cwd: root,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let settled = false;

const finish = (code, message) => {
  if (settled) return;
  settled = true;
  try {
    child.kill("SIGKILL");
  } catch (error) {
    // already exited
  }
  if (message) console.log(message);
  console.log("[packaged-smoke] exit code:", code);
  process.exit(code);
};

const timer = setTimeout(() => {
  finish(1, "[packaged-smoke] TIMEOUT: packaged app did not report a result in 120s");
}, 120000);

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  stdout += text;
  process.stdout.write(text);
  if (stdout.includes("KOODO_SMOKE_RESULT: PASS")) {
    clearTimeout(timer);
    finish(0);
  } else if (stdout.includes("KOODO_SMOKE_RESULT: FAIL")) {
    clearTimeout(timer);
    finish(1);
  }
});

// Startup crashes surface on stderr as "A JavaScript error occurred in the
// main process" (the dialog text the user would see); fail fast on it.
child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  process.stderr.write(text);
  if (text.includes("A JavaScript error occurred in the main process")) {
    clearTimeout(timer);
    finish(1, "[packaged-smoke] main process crashed at startup");
  }
});

child.on("exit", (code) => {
  if (settled) return;
  clearTimeout(timer);
  finish(1, "[packaged-smoke] packaged app exited early with code " + code);
});
