/**
 * Smoke/unit tests for the WebDAV sync service.
 *
 * These verify the service logic against a mocked `webdav` client:
 * HTTPS-only policy, path construction, upload/list/download/delete flow,
 * counters, agent passthrough and error handling. A live end-to-end wire
 * test lives in src/utils/storage/__tests__/webdavLive.test.ts (real HTTPS
 * WebDAV server).
 */
import WebDavService from "../webdavService";
import { createClient } from "webdav";

const mockClient = {
  putFileContents: jest.fn(),
  getFileContents: jest.fn(),
  deleteFile: jest.fn(),
  createDirectory: jest.fn(),
  getDirectoryContents: jest.fn(),
  exists: jest.fn(),
};

// jest.mock is hoisted above the imports by babel-plugin-jest-hoist, so the
// real webdav client is never loaded in this suite.
jest.mock("webdav", () => ({
  createClient: jest.fn(() => mockClient),
}));

const mockedCreateClient = createClient as jest.Mock;

describe("WebDavService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCreateClient.mockImplementation(() => mockClient);
  });

  it("rejects non-HTTPS URLs (policy: HTTPS only)", () => {
    expect(() => new WebDavService({ url: "http://example.com/dav" })).toThrow(
      "WebDAV requires HTTPS"
    );
    expect(() => new WebDavService({ url: "  http://example.com  " })).toThrow(
      "WebDAV requires HTTPS"
    );
    expect(
      () => new WebDavService({ url: "webdav://example.com" })
    ).toThrow("WebDAV requires HTTPS");
  });

  it("requires a url and trims input; passes credentials and agents to the client", () => {
    const agent = { name: "test-agent" };
    expect(() => new WebDavService({})).toThrow("WebDAV config missing url");

    const service = new WebDavService({
      url: "  https://example.com/dav  ",
      username: "user",
      password: "pass",
      httpsAgent: agent,
    });
    expect(service).toBeInstanceOf(WebDavService);
    expect(mockedCreateClient).toHaveBeenCalledWith("https://example.com/dav", {
      username: "user",
      password: "pass",
      httpAgent: undefined,
      httpsAgent: agent,
    });
  });

  it("uploads a file to dir/category/file with overwrite and updates counters", async () => {
    mockClient.putFileContents.mockResolvedValue(undefined);
    const service = new WebDavService({
      url: "https://example.com/dav",
      dir: "books",
    });
    const result = await service.uploadFile("book.epub", "library", Buffer.from("DATA"));
    expect(mockClient.putFileContents).toHaveBeenCalledWith(
      "books/library/book.epub",
      Buffer.from("DATA"),
      expect.objectContaining({ overwrite: true })
    );
    expect(result).toEqual({ code: 200 });
    expect(service.getStats().completed).toBe(1);
    expect(service.getStats().total).toBe(1);
  });

  it("downloads a file as binary and tracks downloaded size", async () => {
    const payload = new ArrayBuffer(42);
    mockClient.getFileContents.mockResolvedValue(payload);
    const service = new WebDavService({ url: "https://example.com/dav" });
    const data = await service.downloadFile("book.epub", "library");
    expect(mockClient.getFileContents).toHaveBeenCalledWith(
      "library/book.epub",
      expect.objectContaining({ format: "binary" })
    );
    expect(data).toBe(payload);
    expect(service.getDownloadedSize()).toBe(42);
  });

  it("lists only files and maps basenames", async () => {
    mockClient.getDirectoryContents.mockResolvedValue([
      { type: "directory", basename: "sub", filename: "/lib/sub" },
      { type: "file", basename: "a.epub", filename: "/lib/a.epub" },
      { type: "file", filename: "/lib/legacy.pdf" },
    ]);
    const service = new WebDavService({ url: "https://example.com/dav" });
    const files = await service.listFiles("library");
    expect(files).toEqual(["a.epub", "legacy.pdf"]);
  });

  it("deletes files and checks existence with prefixed paths", async () => {
    mockClient.deleteFile.mockResolvedValue(true);
    mockClient.exists.mockResolvedValue(true);
    const service = new WebDavService({
      url: "https://example.com/dav",
      dir: "sync",
    });
    expect(await service.isExist("note.md", "notes")).toBe(true);
    expect(await service.deleteFile("note.md", "notes")).toBe(true);
    expect(mockClient.exists).toHaveBeenCalledWith(
      "sync/notes/note.md",
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(mockClient.deleteFile).toHaveBeenCalledWith(
      "sync/notes/note.md",
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it("creates category directories (MKCOL) and tolerates existing ones", async () => {
    mockClient.createDirectory.mockResolvedValue(undefined);
    const service = new WebDavService({ url: "https://example.com/dav" });
    expect(await service.createDirectory("library")).toBe(true);
    expect(mockClient.createDirectory).toHaveBeenCalledWith(
      "library",
      expect.objectContaining({ recursive: true })
    );

    const conflict = new Error("already exists");
    (conflict as any).status = 405;
    mockClient.createDirectory.mockRejectedValueOnce(conflict);
    expect(await service.createDirectory("library")).toBe(false);

    const fatal = new Error("boom");
    (fatal as any).status = 500;
    mockClient.createDirectory.mockRejectedValueOnce(fatal);
    await expect(service.createDirectory("library")).rejects.toThrow("boom");
  });

  it("maps listFileInfos to folder/file entries", async () => {
    mockClient.getDirectoryContents.mockResolvedValue([
      { type: "directory", basename: "dav-dir", size: 0 },
      { type: "file", basename: "file.txt", size: 100 },
    ]);
    const service = new WebDavService({
      url: "https://example.com/dav",
      dir: "root",
    });
    const info = await service.listFileInfos("now");
    expect(mockClient.getDirectoryContents).toHaveBeenCalledWith(
      "root/now",
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(info).toEqual([
      { name: "dav-dir", type: "folder", size: 0, path: "now" },
      { name: "file.txt", type: "file", size: 100, path: "now" },
    ]);
  });

  it("remote.downloadFile strips leading slashes from source paths", async () => {
    const payload = new ArrayBuffer(8);
    mockClient.getFileContents.mockResolvedValue(payload);
    const service = new WebDavService({
      url: "https://example.com/dav",
      dir: "remote",
    });
    const data = await service.remote.downloadFile("/backup.zip");
    expect(mockClient.getFileContents).toHaveBeenCalledWith(
      "remote/backup.zip",
      expect.objectContaining({ format: "binary" })
    );
    expect(data).toBe(payload);
  });
});
