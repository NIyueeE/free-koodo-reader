/**
 * GUI smoke test for Free Koodo Reader (CI).
 *
 * Launches the Electron app the same way the packaged app does
 * (ELECTRON_IS_DEV=0 forces the production `file://` renderer path), then
 * waits for `KOODO_SMOKE_RESULT: PASS`/`FAIL` emitted by main.js.
 *
 * Exit code 0 = renderer mounted (no white screen), 1 = failure.
 * A screenshot is saved to build/smoke-screenshot.png when the renderer is up.
 */
const { spawn } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const electronBin = require("electron"); // path to the electron binary

const env = {
  ...process.env,
  ELECTRON_IS_DEV: "0",
  KOODO_SMOKE_TEST: "1",
  KOODO_SMOKE_SCREENSHOT: path.join(root, "build", "smoke-screenshot.png"),
  ELECTRON_ENABLE_LOGGING: "1",
  // Avoid unpackaged-app security warnings polluting the CI log.
  ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
};

console.log("[smoke] launching electron app from", root);
const child = spawn(
  electronBin,
  [".", "--no-sandbox", "--disable-gpu"],
  { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] }
);

let stdout = "";
let stderr = "";
let settled = false;

const finish = (code, message) => {
  if (settled) return;
  settled = true;
  if (message) console.log(message);
  console.log("[smoke] exit code:", code);
  process.exit(code);
};

const timer = setTimeout(() => {
  child.kill("SIGKILL");
  finish(1, "[smoke] TIMEOUT: app did not report a result in 120s");
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

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
  process.stderr.write(chunk);
});

child.on("close", (code) => {
  clearTimeout(timer);
  if (settled) return;
  console.error("[smoke] electron exited unexpectedly with code", code);
  console.error(stderr.split("\n").slice(-40).join("\n"));
  finish(1);
});

child.on("error", (error) => {
  clearTimeout(timer);
  finish(1, "[smoke] failed to spawn electron: " + String(error));
});
