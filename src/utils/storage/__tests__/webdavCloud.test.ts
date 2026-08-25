/**
 * Smoke tests for the Electron-main WebDAV sync layer (webdavCloud.js).
 *
 * This module implements the cloud-upload / cloud-download IPC semantics:
 * local file <storage>/<type>/<file> <-> remote [dir]/<type>/<file>, with
 * automatic remote directory creation (strict servers like Seafile return
 * 409 for missing parent collections) and human-readable error mapping.
 */
import fs from "fs";
import os from "os";
import path from "path";

const webdavCloud = require("../webdavCloud");

const mockClient = {
  putFileContents: jest.fn(),
  getFileContents: jest.fn(),
  createDirectory: jest.fn(),
  deleteFile: jest.fn(),
  getDirectoryContents: jest.fn(),
  exists: jest.fn(),
};

jest.mock("webdav", () => ({
  createClient: jest.fn(() => mockClient),
}));

describe("webdavCloud (Electron main WebDAV layer)", () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    // react-scripts enables resetMocks, which wipes the factory
    // implementation - restore it for every test.
    require("webdav").createClient.mockImplementation(() => mockClient);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "webdav-cloud-"));
  });

  afterEach(() => {
    fs.rmdirSync(tmpDir, { recursive: true });
  });

  const baseConfig = (overrides: Record<string, unknown> = {}) => ({
    url: "https://dav.example.com",
    dir: "WebDAV/Free-Koodo-Reader",
    username: "user",
    password: "pass",
    ...overrides,
  });

  it("rejects non-HTTPS URLs", () => {
    expect(() => webdavCloud.createWebDavSyncUtil({ url: "http://x" })).toThrow(
      "WebDAV requires HTTPS"
    );
  });

  it("uploadFile auto-creates the remote collection before PUT", async () => {
    mockClient.createDirectory.mockResolvedValue(undefined);
    mockClient.putFileContents.mockResolvedValue(undefined);
    const util = webdavCloud.createWebDavSyncUtil(baseConfig());
    const result = await util.uploadFile("test.txt", "config", Buffer.from("hi"));
    expect(mockClient.createDirectory).toHaveBeenCalledWith(
      "WebDAV/Free-Koodo-Reader/config",
      expect.objectContaining({ recursive: true })
    );
    expect(mockClient.putFileContents).toHaveBeenCalledWith(
      "WebDAV/Free-Koodo-Reader/config/test.txt",
      Buffer.from("hi"),
      expect.objectContaining({ overwrite: true })
    );
    expect(result).toEqual({ code: 200 });
    expect(util.getStats().completed).toBe(1);
  });

  it("tolerates already-existing collections (405/409) and caches the result", async () => {
    const conflict = new Error("exists");
    (conflict as any).status = 405;
    mockClient.createDirectory.mockRejectedValueOnce(conflict);
    mockClient.putFileContents.mockResolvedValue(undefined);
    const util = webdavCloud.createWebDavSyncUtil(baseConfig());
    await util.uploadFile("a.txt", "config", Buffer.from("a"));
    await util.uploadFile("b.txt", "config", Buffer.from("b"));
    expect(mockClient.createDirectory).toHaveBeenCalledTimes(1);
    expect(mockClient.putFileContents).toHaveBeenCalledTimes(2);
  });

  it("uploadLocalFile reads <storage>/<type>/<file> and uploads it", async () => {
    mockClient.createDirectory.mockResolvedValue(undefined);
    mockClient.putFileContents.mockResolvedValue(undefined);
    fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "config", "test.txt"), "Hello world!");
    const result = await webdavCloud.uploadLocalFile(
      baseConfig(),
      "config",
      "test.txt",
      tmpDir
    );
    expect(result).toEqual({ code: 200 });
    expect(mockClient.putFileContents).toHaveBeenCalledWith(
      "WebDAV/Free-Koodo-Reader/config/test.txt",
      Buffer.from("Hello world!"),
      expect.objectContaining({ overwrite: true })
    );
  });

  it("downloadLocalFile writes the payload to <storage>/<type>/<file>", async () => {
    const payload = Buffer.from("downloaded");
    mockClient.getFileContents.mockResolvedValue(
      payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength)
    );
    const ok = await webdavCloud.downloadLocalFile(
      baseConfig(),
      "config",
      "config.json",
      tmpDir
    );
    expect(ok).toBe(true);
    expect(fs.readFileSync(path.join(tmpDir, "config", "config.json"), "utf8")).toBe(
      "downloaded"
    );
  });

  it("describes HTTP and network failures for the user", () => {
    const err401 = new Error("Invalid response: 401 Unauthorized") as any;
    err401.status = 401;
    expect(webdavCloud.describeError(err401)).toContain("401");
    const err404 = new Error("nope") as any;
    err404.status = 404;
    expect(webdavCloud.describeError(err404)).toContain("404");
    const err409 = new Error("conflict") as any;
    err409.status = 409;
    expect(webdavCloud.describeError(err409)).toContain("409");
    const refused = new Error("connect ECONNREFUSED") as any;
    refused.code = "ECONNREFUSED";
    expect(webdavCloud.describeError(refused)).toContain("Connection refused");
    expect(webdavCloud.describeError(new Error("WebDAV requires HTTPS"))).toContain(
      "HTTPS"
    );
    expect(webdavCloud.describeError(new Error("raw detail"))).toBe("raw detail");
  });

  it("bounds every request with an abort deadline (stalled servers must not hang)", async () => {
    mockClient.createDirectory.mockResolvedValue(undefined);
    mockClient.putFileContents.mockResolvedValue(undefined);
    mockClient.getDirectoryContents.mockResolvedValue([]);
    const util = webdavCloud.createWebDavSyncUtil(baseConfig());
    await util.uploadFile("a.txt", "config", Buffer.from("a"));
    await util.listFiles("config");
    const putOptions = mockClient.putFileContents.mock.calls[0][2];
    const listOptions = mockClient.getDirectoryContents.mock.calls[0][1];
    // jsdom (jest) lacks AbortSignal.timeout - the module falls back to a
    // manual controller; either way a signal must be present.
    expect(putOptions && putOptions.signal).toBeTruthy();
    expect(listOptions && listOptions.signal).toBeTruthy();
  });

  it("trims surrounding whitespace from the server URL", () => {
    expect(() =>
      webdavCloud.createWebDavSyncUtil(baseConfig({ url: "  https://dav.example.com  " }))
    ).not.toThrow();
    expect(() =>
      webdavCloud.createWebDavSyncUtil(baseConfig({ url: "https://dav.example.com " }))
    ).not.toThrow();
  });

  it("describes abort deadlines as timeouts for the user", () => {
    const abort = new Error("The operation was aborted") as any;
    abort.name = "AbortError";
    expect(webdavCloud.describeError(abort)).toContain("timed out");
  });
});
