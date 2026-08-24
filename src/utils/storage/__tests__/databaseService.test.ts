/**
 * Database service (browser mode) smoke test.
 *
 * With `isElectron === false` the service persists records via localforage
 * (and optionally LocalFileManager/sql.js when `isUseLocal === yes`). These
 * tests exercise the complete CRUD flow used by the library / notes / bookmarks
 * storage, including sync-record bookkeeping.
 */
// In-memory localforage replacement shared by the Service under test.
// (DatabaseService is required lazily in beforeAll: the jest.mock factories
// below execute at the first require of the module chain, after the mock
// objects below are fully initialized.)
const mockLocalStore = new Map<string, any>();
const mockLocalforage = {
  getItem: jest.fn(async (key: string) => mockLocalStore.get(key)),
  setItem: jest.fn(async (key: string, value: any) => {
    mockLocalStore.set(key, value);
    return value;
  }),
  removeItem: jest.fn(async (key: string) => {
    mockLocalStore.delete(key);
  }),
};

const mockConfigService = {
  getItem: jest.fn((key: string): string | null =>
    key === "isUseLocal" ? "no" : null
  ),
  setSyncRecord: jest.fn(),
};

const mockLocalFileManager = {
  getPermissionStatus: jest.fn(async () => ({ hasAccess: false })),
  saveFile: jest.fn(async () => {}),
  readFile: jest.fn(async () => null),
  deleteFile: jest.fn(async () => {}),
  isSupported: jest.fn(() => false),
};

jest.mock("react-device-detect", () => ({ isElectron: false }));
jest.mock("localforage", () => ({ __esModule: true, default: mockLocalforage }));
jest.mock("../../../assets/lib/kookit-extra-browser.min", () => ({
  ConfigService: mockConfigService,
}));
jest.mock("../../common", () => ({ getStorageLocation: () => "/tmp/storage" }));
jest.mock("../../file/sqlUtil", () => ({
  __esModule: true,
  default: class SqlUtil {
    async JsonToDbBuffer() {
      return Buffer.from("sqlite-data");
    }
    async dbBufferToJson() {
      return [];
    }
  },
}));
jest.mock("../../file/localFile", () => ({
  LocalFileManager: mockLocalFileManager,
}));

let DatabaseService: typeof import("../databaseService").default;

describe("DatabaseService (browser mode, isElectron=false)", () => {
  beforeEach(() => {
    // Lazy require: the jest.mock factories above run at the first require of
    // the module chain, after the mock objects are fully initialized.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    DatabaseService = require("../databaseService").default;
    jest.clearAllMocks();
    // react-scripts enables resetMocks, which also wipes the implementations
    // set at module scope - restore them for every test.
    mockLocalforage.getItem.mockImplementation(async (key: string) =>
      mockLocalStore.get(key)
    );
    mockLocalforage.setItem.mockImplementation(
      async (key: string, value: any) => {
        mockLocalStore.set(key, value);
        return value;
      }
    );
    mockLocalforage.removeItem.mockImplementation(async (key: string) => {
      mockLocalStore.delete(key);
    });
    mockLocalFileManager.saveFile.mockImplementation(async () => {});
    mockLocalFileManager.readFile.mockImplementation(async () => null);
    mockLocalFileManager.deleteFile.mockImplementation(async () => {});
    mockLocalStore.clear();
    mockConfigService.getItem.mockImplementation((key: string) =>
      key === "isUseLocal" ? "no" : null
    );
  });

  it("returns an empty list for an empty database", async () => {
    expect(await DatabaseService.getAllRecords("books")).toEqual([]);
    expect(mockLocalforage.getItem).toHaveBeenCalledWith("books");
  });

  it("saves records and tracks sync records", async () => {
    await DatabaseService.saveAllRecords(
      [{ key: "book-1" }, { key: "book-2" }],
      "books"
    );
    expect(mockLocalforage.setItem).toHaveBeenCalledWith("books", [
      { key: "book-1" },
      { key: "book-2" },
    ]);
    expect(await DatabaseService.getAllRecords("books")).toEqual([
      { key: "book-1" },
      { key: "book-2" },
    ]);
    expect(mockConfigService.setSyncRecord).toHaveBeenCalledTimes(2);
  });

  it("appends one record with saveRecord", async () => {
    await DatabaseService.saveRecord({ key: "book-1" }, "books");
    await DatabaseService.saveRecord({ key: "book-2" }, "books");
    const records = await DatabaseService.getAllRecords("books");
    expect(records.map((r: any) => r.key)).toEqual(["book-1", "book-2"]);
  });

  it("finds a record by key", async () => {
    await DatabaseService.saveRecord({ key: "book-1", title: "A" }, "books");
    expect(await DatabaseService.getRecord("book-1", "books")).toEqual({
      key: "book-1",
      title: "A",
    });
    expect(await DatabaseService.getRecord("nope", "books")).toBeNull();
  });

  it("updates a record by key", async () => {
    await DatabaseService.saveRecord({ key: "book-1", title: "A" }, "books");
    await DatabaseService.saveRecord({ key: "book-2", title: "B" }, "books");
    await DatabaseService.updateRecord(
      { key: "book-1", title: "A-updated" },
      "books"
    );
    const records = await DatabaseService.getAllRecords("books");
    expect(records.map((r: any) => r.title)).toEqual(["A-updated", "B"]);
  });

  it("deletes a record and clears the database when empty", async () => {
    await DatabaseService.saveRecord({ key: "book-1" }, "notes");
    await DatabaseService.deleteRecord("book-1", "notes");
    expect(await DatabaseService.getAllRecords("notes")).toEqual([]);
    expect(mockLocalforage.removeItem).toHaveBeenCalledWith("notes");
  });

  it("returns all record keys", async () => {
    await DatabaseService.saveAllRecords([{ key: "a" }, { key: "b" }], "books");
    expect(await DatabaseService.getAllRecordKeys("books")).toEqual([
      "a",
      "b",
    ]);
  });

  it("uses LocalFileManager + sql.js when isUseLocal is yes", async () => {
    mockConfigService.getItem.mockImplementation((key: string) =>
      key === "isUseLocal" ? "yes" : null
    );
    await DatabaseService.saveAllRecords([{ key: "book-1" }], "books");
    expect(mockLocalFileManager.saveFile).toHaveBeenCalledWith(
      "books.db",
      expect.any(Buffer),
      "config"
    );
    expect(mockLocalforage.setItem).not.toHaveBeenCalled();
  });
});
