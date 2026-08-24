/**
 * IPC contract smoke test (static analysis).
 *
 * Reads `preload.js` and `main.js` as text and cross-checks the channel
 * allowlist against the main-process registrations in both directions:
 *   - every channel the renderer may use MUST have a main-process handler;
 *   - every main-process handler MUST be reachable through the allowlist
 *     (no back-door channels).
 *
 * This catches the class of regressions where the renderer calls a channel
 * that was removed from main.js (or vice versa), which surfaces as
 * "IPC channel is not allowed" / "No handler registered" at runtime.
 */
import fs from "fs";
import path from "path";

const root = path.join(__dirname, "..", "..");
const preloadSrc = fs.readFileSync(path.join(root, "preload.js"), "utf8");
const mainSrc = fs.readFileSync(path.join(root, "main.js"), "utf8");

const extractSet = (name: string): string[] => {
  const re = new RegExp(
    "const " + name + " = new Set\\(\\[([\\s\\S]*?)\\]\\);"
  );
  const match = preloadSrc.match(re);
  if (!match) throw new Error("preload.js does not declare Set " + name);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
};

const invokeChannels = extractSet("INVOKE_CHANNELS");
const sendChannels = extractSet("SEND_CHANNELS");
const sendSyncChannels = extractSet("SEND_SYNC_CHANNELS");
const eventChannels = extractSet("EVENT_CHANNELS");

const mainHandles = [...mainSrc.matchAll(/ipcMain\.handle\("([^"]+)"/g)].map(
  (m) => m[1]
);
const mainOnChannels = [
  ...mainSrc.matchAll(/ipcMain\.(?:on|once)\("([^"]+)"/g),
].map((m) => m[1]);
const mainSentChannels = [
  ...mainSrc.matchAll(/webContents\.send\("([^"]+)"/g),
].map((m) => m[1]);

// Preload-internal channel used by the un-guarded nodeSync() helper on the
// preload side (the operation name is the actual permission boundary there).
const INTERNAL_PRELOAD_CHANNELS = ["node-command-sync"];
// Legacy emits without renderer listeners (removed account/auth flows).
const LEGACY_MAIN_EMITS = ["oauth-callback", "picker-finished"];

describe("IPC contract (preload allowlist <-> main.js handlers)", () => {
  it("every invoke channel has an ipcMain.handle in main.js", () => {
    const missing = invokeChannels.filter((c) => !mainHandles.includes(c));
    expect(missing).toEqual([]);
  });

  it("every send/sendSync channel has an ipcMain on/once listener in main.js", () => {
    const missing = [...sendChannels, ...sendSyncChannels].filter(
      (c) => !mainOnChannels.includes(c)
    );
    expect(missing).toEqual([]);
  });

  it("every event channel the renderer listens on is emitted by main.js", () => {
    const missing = eventChannels.filter((c) => !mainSentChannels.includes(c));
    expect(missing).toEqual([]);
  });

  it("every ipcMain.handle channel is allowlisted in preload.js", () => {
    const unlisted = mainHandles.filter((c) => !invokeChannels.includes(c));
    expect(unlisted).toEqual([]);
  });

  it("every ipcMain on/once channel is allowed by preload.js (no back doors)", () => {
    const allowed = [
      ...invokeChannels,
      ...sendChannels,
      ...sendSyncChannels,
      ...eventChannels,
      ...INTERNAL_PRELOAD_CHANNELS,
    ];
    const unlisted = mainOnChannels.filter((c) => !allowed.includes(c));
    expect(unlisted).toEqual([]);
  });

  it("every main-process emit targets an allowed event channel", () => {
    const unlisted = mainSentChannels.filter(
      (c) => !eventChannels.includes(c) && !LEGACY_MAIN_EMITS.includes(c)
    );
    expect(unlisted).toEqual([]);
  });

  it("allowlist channel names are unique (no duplicate declarations)", () => {
    const all = [
      ...invokeChannels,
      ...sendChannels,
      ...sendSyncChannels,
      ...eventChannels,
    ];
    const duplicates = all.filter((c, i) => all.indexOf(c) !== i);
    expect(duplicates).toEqual([]);
  });
});
