/**
 * Regression test for the stuck "Testing connection..." toast.
 *
 * On Windows/Electron the "Test" button calls testConnection(), which awaits
 * the cloud-upload IPC. If that invoke rejected (network / auth / invalid
 * URL), the rejection was unhandled and the loading toast stayed forever.
 * These tests assert both outcomes terminate with a toast and a boolean:
 *   - success path:  success toast + cleanup + cloud-delete
 *   - failure path:  cloud-upload rejects -> error toast + false (no hang)
 */
const mockToast = {
  loading: jest.fn(),
  success: jest.fn(),
  error: jest.fn(),
};

const mockI18n = { t: (key: string) => key };

// fs + invoke surface used by testConnection's Electron branch.
const mockFs = {
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
};
const mockInvoke = jest.fn();
const mockSendSync = jest.fn(() => "/storage");
const mockElectronAPI = {
  fs: mockFs,
  invoke: mockInvoke,
  sendSync: mockSendSync,
};

jest.mock("react-device-detect", () => ({ isElectron: true }));
jest.mock("react-hot-toast", () => ({ __esModule: true, default: mockToast }));
jest.mock("../../i18n", () => ({ __esModule: true, default: mockI18n }));
jest.mock("crypto-js", () => ({}));
jest.mock("localforage", () => ({ __esModule: true, default: {} }));
jest.mock("../../assets/lib/kookit-extra-browser.min", () => ({
  CommonTool: class {},
  ConfigService: class {
    static getItem = jest.fn(() => null);
    static setItem = jest.fn();
  },
  KookitConfig: class {},
  SyncUtil: class {},
}));
jest.mock("../../assets/lib/kookit.min", () => ({
  BookHelper: class {},
}));
jest.mock("../../models/Book", () => ({ __esModule: true, default: class Book {} }));
jest.mock("../file/bookUtil", () => ({ __esModule: true, default: class BookUtil {} }));
jest.mock("../file/common", () => ({ getCloudConfig: jest.fn(async () => ({})) }));
jest.mock("../storage/databaseService", () => ({
  __esModule: true,
  default: class DatabaseService {},
}));
jest.mock("../storage/syncService", () => ({
  __esModule: true,
  default: class SyncService {},
}));
jest.mock("../../constants/driveList", () => ({ driveList: [] }));
jest.mock("../../constants/ttsList", () => ({
  languageCNMap: {},
  languageENMap: {},
}));
jest.mock("../../constants/dropdownList", () => ({
  getOcrPaddleLangList: () => [],
  ocrTesseractLangList: [],
}));

let testConnection: typeof import("../common").testConnection;

describe("testConnection (Electron branch)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    testConnection = require("../common").testConnection;
    (window as any).electronAPI = mockElectronAPI;
    // react-scripts enables resetMocks, which wipes the implementations set at
    // module scope - restore them for every test.
    mockFs.existsSync.mockReturnValue(true);
    mockInvoke.mockResolvedValue({ code: 200 });
    mockSendSync.mockImplementation(() => "/storage");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ConfigService } = require("../../assets/lib/kookit-extra-browser.min");
    ConfigService.getItem.mockImplementation(() => null);
    // testConnection writes and removes a local test.txt
    mockFs.existsSync.mockImplementationOnce(() => true);
  });

  const driveConfig = {
    url: "https://dav.example.com/remote.php/dav",
    username: "user",
    password: "pass",
  };

  it("shows success and deletes the remote test file on success", async () => {
    const result = await testConnection("webdav", driveConfig);
    expect(result).toEqual({ code: 200 });
    expect(mockToast.loading).toHaveBeenCalledWith("Testing connection...", {
      id: "testing-connection-id",
    });
    expect(mockToast.success).toHaveBeenCalledWith("Connection successful", {
      id: "testing-connection-id",
    });
    expect(mockInvoke).toHaveBeenCalledWith("cloud-upload", {
      ...driveConfig,
      fileName: "test.txt",
      service: "webdav",
      type: "config",
      storagePath: expect.any(String),
      isUseCache: false,
    });
    expect(mockInvoke).toHaveBeenCalledWith(
      "cloud-delete",
      expect.objectContaining({ fileName: "test.txt", service: "webdav" })
    );
    expect(mockFs.unlinkSync).toHaveBeenCalled();
  });

  it("shows failure (not a stuck loading toast) when cloud-upload rejects", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("ECONNREFUSED 401"));
    const result = await testConnection("webdav", driveConfig);
    // Resolves with false - the promise must NOT hang or reject.
    expect(result).toBe(false);
    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringContaining("Connection failed"),
      { id: "testing-connection-id" }
    );
    // The loading toast is replaced; success toast must not appear.
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it("shows failure WITH the recorded reason when the upload returns falsy", async () => {
    // cloud-upload fails (returns false), then the reason is fetched from the
    // main process via cloud-last-error.
    mockInvoke.mockResolvedValueOnce(false);
    mockInvoke.mockResolvedValueOnce("Server returned HTTP 409 (a parent folder is missing on the server)");
    const result = await testConnection("webdav", driveConfig);
    expect(result).toBe(false);
    expect(mockInvoke).toHaveBeenCalledWith("cloud-last-error");
    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringContaining(
        "Server returned HTTP 409 (a parent folder is missing on the server)"
      ),
      { id: "testing-connection-id" }
    );
  });
});
