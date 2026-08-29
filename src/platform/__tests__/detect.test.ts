/**
 * Platform detection unit tests.
 */
import {
  isElectron,
  isCapacitor,
  isNativeApp,
  isAndroid,
  isNarrowScreen,
  isCompactScreen,
  isMobileDevice,
  installMobileBridge,
} from "../index";

const setWindowProp = (name: string, value: unknown) => {
  Object.defineProperty(window, name, {
    value,
    configurable: true,
    writable: true,
  });
};

describe("platform detection", () => {
  const originalInnerWidth = window.innerWidth;
  const originalElectronAPI = (window as any).electronAPI;
  const originalCapacitor = (window as any).Capacitor;
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    setWindowProp("innerWidth", originalInnerWidth);
    setWindowProp("electronAPI", originalElectronAPI);
    setWindowProp("Capacitor", originalCapacitor);
    Object.defineProperty(navigator, "userAgent", {
      value: originalUserAgent,
      configurable: true,
    });
  });

  it("detects Electron", () => {
    setWindowProp("electronAPI", { invoke: () => {} });
    expect(isElectron()).toBe(true);
    expect(isNativeApp()).toBe(true);
    expect(isCapacitor()).toBe(false);
    // no electronAPI
    setWindowProp("electronAPI", undefined);
    expect(isElectron()).toBe(false);
  });

  it("detects Capacitor (native mobile)", () => {
    setWindowProp("Capacitor", { isNativePlatform: () => true });
    expect(isCapacitor()).toBe(true);
    expect(isNativeApp()).toBe(true);
    expect(isAndroid()).toBe(false); // userAgent is not android in tests
    setWindowProp("Capacitor", undefined);
    expect(isCapacitor()).toBe(false);
  });

  it("detects Android via user agent", () => {
    setWindowProp("Capacitor", { isNativePlatform: () => true });
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36",
      configurable: true,
    });
    expect(isAndroid()).toBe(true);
  });

  it("detects narrow and compact screens", () => {
    setWindowProp("innerWidth", 412);
    expect(isNarrowScreen()).toBe(true);
    expect(isCompactScreen()).toBe(true);
    expect(isMobileDevice()).toBe(true);

    setWindowProp("innerWidth", 900);
    expect(isNarrowScreen()).toBe(false);
    expect(isCompactScreen()).toBe(true);

    setWindowProp("innerWidth", 1280);
    expect(isNarrowScreen()).toBe(false);
    expect(isCompactScreen()).toBe(false);
    expect(isMobileDevice()).toBe(false);
  });

  it("installs the mobile bridge shim only when missing", () => {
    delete (window as any).ReactNativeWebView;
    installMobileBridge();
    expect(
      typeof (window as any).ReactNativeWebView.postMessage
    ).toBe("function");
    expect(() =>
      (window as any).ReactNativeWebView.postMessage("hello")
    ).not.toThrow();
    // An existing bridge (e.g. provided by the native wrapper) is kept.
    const existing = { postMessage: jest.fn() };
    (window as any).ReactNativeWebView = existing;
    installMobileBridge();
    expect((window as any).ReactNativeWebView).toBe(existing);
    delete (window as any).ReactNativeWebView;
  });
});
