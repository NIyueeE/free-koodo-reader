/**
 * Preload security-boundary smoke test.
 *
 * Loads the real `preload.js` with a mocked Electron bridge and exercises the
 * exposed `window.electronAPI`: channel allowlist enforcement (invoke/send/sendSync/
 * on), the fs / path / crypto / os / clipboard adapters and error propagation.
 */
const mockIpc = {
  invoke: jest.fn(),
  send: jest.fn(),
  sendSync: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
};

const mockExposeInMainWorld = jest.fn();

jest.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: mockExposeInMainWorld },
  ipcRenderer: mockIpc,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const preloadPath = require("path").join(__dirname, "..", "..", "preload.js");
// eslint-disable-next-line @typescript-eslint/no-var-requires
require(preloadPath);

const exposedName = mockExposeInMainWorld.mock.calls[0]?.[0];
const api =
  (mockExposeInMainWorld.mock.calls[0] &&
    mockExposeInMainWorld.mock.calls[0][1]) ||
  {};

describe("preload window.electronAPI", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("was exposed with the full API surface", () => {
    expect(exposedName).toBe("electronAPI");
    expect(api.invoke).toBeDefined();
    expect(api.send).toBeDefined();
    expect(api.sendSync).toBeDefined();
    expect(api.on).toBeDefined();
    expect(api.fs).toBeDefined();
    expect(api.path).toBeDefined();
    expect(api.os).toBeDefined();
    expect(api.crypto).toBeDefined();
    expect(api.shell).toBeDefined();
    expect(api.clipboard).toBeDefined();
  });

  it("invoke only forwards allowlisted channels", async () => {
    mockIpc.invoke.mockResolvedValue("ok");
    await expect(api.invoke("database-command", { statement: "x" })).resolves.toBe("ok");
    expect(mockIpc.invoke).toHaveBeenCalledWith("database-command", {
      statement: "x",
    });

    // Anything not in the allowlist must be rejected (white-screen class bug).
    expect(() => api.invoke("chat-message", {})).toThrow(
      "IPC channel is not allowed: chat-message"
    );
    expect(() => api.invoke("open-url-no-such-channel", {})).toThrow(
      "IPC channel is not allowed"
    );
    expect(() => api.send("not-allowed")).toThrow("IPC channel is not allowed");
    expect(() => api.sendSync("not-allowed")).toThrow(
      "IPC channel is not allowed"
    );
    expect(() => api.on("not-allowed", () => {})).toThrow(
      "IPC channel is not allowed"
    );
    expect(() => api.once("not-allowed", () => {})).toThrow(
      "IPC channel is not allowed"
    );
    expect(() => api.removeListener("not-allowed", () => {})).toThrow(
      "IPC channel is not allowed"
    );
  });

  it("allows real send/sendSync/on channels", () => {
    api.send("reader-close-ready");
    expect(mockIpc.send).toHaveBeenCalledWith("reader-close-ready");

    api.sendSync("storage-location", "ping");
    expect(mockIpc.sendSync).toHaveBeenCalledWith("storage-location", "ping");

    const listener = jest.fn();
    api.on("before-reader-close", listener);
    expect(mockIpc.on).toHaveBeenCalledWith(
      "before-reader-close",
      expect.any(Function)
    );

    api.once("reading-finished", listener);
    expect(mockIpc.once).toHaveBeenCalledWith("reading-finished", expect.any(Function));
  });

  it("fs wrappers return values and propagate file errors with codes", () => {
    mockIpc.sendSync.mockReturnValueOnce({ ok: true, value: Buffer.from("lib") });
    expect(
      Buffer.from(api.fs.readFileSync("/book.epub")).toString()
    ).toBe("lib");
    expect(mockIpc.sendSync).toHaveBeenCalledWith("file-command-sync", {
      operation: "read",
      path: "/book.epub",
    });

    mockIpc.sendSync.mockReturnValueOnce({
      ok: false,
      error: { message: "ENOENT", code: "ENOENT" },
    });
    let caught: any;
    try {
      api.fs.readFileSync("/missing.epub");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toBe("ENOENT");
    expect(caught.code).toBe("ENOENT");
  });

  it("path / os / crypto adapters delegate to node-command-sync / invoke", () => {
    mockIpc.sendSync.mockReturnValueOnce({ ok: true, value: "/a/b" });
    expect(api.path.join("/a", "b")).toBe("/a/b");
    expect(mockIpc.sendSync).toHaveBeenCalledWith("node-command-sync", {
      operation: "path-join",
      values: ["/a", "b"],
    });

    expect(api.os.platform()).toBe(process.platform);

    mockIpc.invoke.mockResolvedValue({ ok: true });
    api.crypto.partialMd5("/book.epub");
    expect(mockIpc.invoke).toHaveBeenCalledWith("partial-md5", "/book.epub");

    mockIpc.invoke.mockResolvedValue({ ok: true });
    api.crypto.fileMd5("/book.epub");
    expect(mockIpc.invoke).toHaveBeenCalledWith("crypto-file-md5", "/book.epub");

    mockIpc.sendSync.mockReturnValueOnce("clip");
    expect(api.clipboard.readText()).toBe("clip");
    expect(mockIpc.sendSync).toHaveBeenCalledWith("clipboard-read-text-sync");
  });
});
